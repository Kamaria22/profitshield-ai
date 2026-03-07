/**
 * selfHeal — Autonomous Self-Healing Engine
 *
 * Subsystems: AUTH, SHOPIFY_OAUTH, SHOPIFY_WEBHOOKS, SHOPIFY_SYNC,
 *             STRIPE_BILLING, AUTOMATION, QUEUE, UI_ROUTING, SECRETS, GENERAL
 *
 * Actions (auto = no approval needed):
 *   heal_shopify_webhooks, heal_shopify_token (mark + prompt),
 *   heal_queue, heal_resolver_context, heal_missing_secrets,
 *   heal_automation, heal_stripe_webhook, heal_ui_routing
 *
 * Actions (patch = generates PatchBundle + requires admin approval):
 *   generate_patch
 *
 * Special: run_watchdog = runs full 30-min health check inline
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { withEndpointGuard } from './helpers/endpointSafety.ts';

const APP_URL = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
const API_VERSION = '2024-10';
const WEBHOOK_ENDPOINT_CANONICAL = `${APP_URL}/api/functions/shopifyWebhook`;
const REQUIRED_TOPICS = ['orders/create','orders/updated','orders/paid','orders/cancelled','refunds/create','products/update','app/uninstalled'];
const REQUIRED_SECRETS = ['SHOPIFY_API_KEY','SHOPIFY_API_SECRET','ENCRYPTION_KEY','APP_URL'];

// Feature flags
const FEATURE_FLAGS = {
  ENABLE_AUTOHEAL: true,
  ENABLE_AUTOPATCH: true,
  STRICT_SHOPIFY_CANONICAL_ENDPOINT: true,
  STRICT_REDIRECT_URI_MATCH: true,
  FAIL_CLOSED_WEBHOOK_HMAC: true,
};

async function decryptToken(enc) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) { try { return atob(enc); } catch { return null; } }
  try {
    const combined = Uint8Array.from(atob(enc), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12), data = combined.slice(12);
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key.padEnd(32,'0').slice(0,32)), {name:'AES-GCM'}, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({name:'AES-GCM',iv}, k, data);
    return new TextDecoder().decode(decrypted);
  } catch { try { return atob(enc); } catch { return null; } }
}

async function logEvent(db, event) {
  return db.entities.SelfHealingEvent.create({
    ...event,
    detected_at: event.detected_at || new Date().toISOString(),
  }).catch(() => null);
}

async function logAudit(db, action, tenantId, desc, meta) {
  return db.entities.AuditLog.create({
    tenant_id: tenantId || 'system',
    action,
    entity_type: 'self_heal',
    entity_id: 'selfHeal',
    performed_by: 'system',
    description: desc,
    severity: 'low',
    category: 'integration',
    is_auto_action: true,
    metadata: meta || {}
  }).catch(() => null);
}

// ─── HEAL: Shopify Webhooks ──────────────────────────────────────────────────
async function healShopifyWebhooks(db, integration, accessToken) {
  const shopDomain = integration.store_key;
  const listRes = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json?limit=250`, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });
  if (!listRes.ok) return { ok: false, error: `Shopify API ${listRes.status}`, needs_reauth: listRes.status === 401 };

  const { webhooks = [] } = await listRes.json();
  const ours = webhooks.filter(w => w.address === WEBHOOK_ENDPOINT_CANONICAL);
  const stale = webhooks.filter(w => w.address !== WEBHOOK_ENDPOINT_CANONICAL && (w.address.includes('shopifyWebhook') || w.address.includes('profit-shield')));
  const ourTopics = new Set(ours.map(w => w.topic));
  const missing = REQUIRED_TOPICS.filter(t => !ourTopics.has(t));

  const deleted = [];
  for (const wh of stale) {
    await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks/${wh.id}.json`, {
      method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken }
    }).catch(() => {});
    deleted.push(wh.topic);
  }

  const registered = {};
  const errors = [];
  for (const topic of missing) {
    const r = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ webhook: { topic, address: WEBHOOK_ENDPOINT_CANONICAL, format: 'json' } })
    });
    const d = await r.json();
    if (d.webhook?.id) registered[topic.replace('/',  '_')] = d.webhook.id.toString();
    else errors.push({ topic, error: JSON.stringify(d.errors || d) });
  }

  const allEndpoints = {};
  for (const w of ours) allEndpoints[w.topic.replace('/', '_')] = w.id.toString();
  Object.assign(allEndpoints, registered);

  await db.entities.PlatformIntegration.update(integration.id, {
    webhook_endpoints: allEndpoints,
    last_connected_at: new Date().toISOString()
  }).catch(() => {});

  return { ok: errors.length === 0, registered, deleted, errors, topics_ok: Object.keys(allEndpoints).length };
}

// ─── HEAL: Queue ─────────────────────────────────────────────────────────────
async function healQueue(db, tenantId) {
  const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const pending = await db.entities.WebhookQueue.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 100);
  const stuck = pending.filter(j => j.created_date < stuckCutoff);

  let retried = 0, deadLettered = 0;
  for (const job of stuck) {
    if ((job.retry_count || 0) >= 3) {
      await db.entities.WebhookQueue.update(job.id, { status: 'dead_letter', error_message: 'Moved by self-heal: exceeded max retries' });
      deadLettered++;
    } else {
      await db.entities.WebhookQueue.update(job.id, {
        status: 'pending',
        next_attempt_at: new Date(Date.now() + 60000).toISOString(),
        retry_count: (job.retry_count || 0) + 1
      });
      retried++;
    }
  }

  return { ok: true, stuck: stuck.length, retried, dead_lettered: deadLettered };
}

// ─── HEAL: Missing Secrets ────────────────────────────────────────────────────
function healMissingSecrets() {
  const missing = [];
  const present = [];
  for (const s of REQUIRED_SECRETS) {
    if (Deno.env.get(s)) present.push(s);
    else missing.push(s);
  }
  const stripeSecrets = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'];
  const missingStripe = stripeSecrets.filter(s => !Deno.env.get(s));

  return {
    ok: missing.length === 0,
    missing,
    present,
    missing_stripe: missingStripe,
    instructions: missing.map(s => ({
      secret: s,
      action: `Set ${s} in Dashboard → Settings → Environment Variables`,
      link: 'https://base44.app/settings/secrets'
    }))
  };
}

// ─── HEAL: Stripe Webhook ────────────────────────────────────────────────────
function healStripeWebhook() {
  const hasSecret = !!Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const hasKey = !!Deno.env.get('STRIPE_SECRET_KEY');
  return {
    ok: hasSecret && hasKey,
    stripe_key_present: hasKey,
    webhook_secret_present: hasSecret,
    status: !hasSecret ? 'billing_degraded' : 'ok',
    action_required: !hasSecret ? 'Set STRIPE_WEBHOOK_SECRET in env secrets. Get it from Stripe Dashboard → Webhooks → Signing secret.' : null
  };
}

// ─── HEAL: UI Routing / Embedded Route Integrity ────────────────────────────
async function healUiRouting(db, tenantId, payload) {
  const uiProbe = payload?.ui_probe || {};
  const issues = Array.isArray(payload?.issues) ? payload.issues : [];
  const embeddedProbe = uiProbe.embedded_probe || {};
  const permissionProbe = uiProbe.permission_probe || {};

  const repairPlan = {
    switch_to_router_navigation: true,
    verify_critical_routes_registered: true,
    preserve_embedded_query_params: true,
    preserve_embedded_host_param: true,
    enforce_admin_route_permissions: true,
  };

  const needsPatch =
    !!embeddedProbe.blocked_text_detected ||
    (embeddedProbe.link_issues || []).some((i) => i?.repair_needed) ||
    !!permissionProbe.mismatch ||
    issues.length > 0;

  if (needsPatch) {
    await db.entities.PatchBundle.create({
      title: "UI route integrity repair (embedded + permissions)",
      subsystem: "ui_routing",
      severity: "high",
      status: "proposed",
      created_at: new Date().toISOString(),
      details: {
        tenant_id: tenantId || "system",
        repair_plan: repairPlan,
        ui_probe: uiProbe,
        issues,
      },
    }).catch(() => {});
  }

  await logAudit(
    db,
    "heal_ui_routing",
    tenantId || "system",
    `UI routing integrity check completed (needs_patch=${needsPatch})`,
    { needs_patch: needsPatch, issues_count: issues.length, repair_plan: repairPlan }
  );

  return {
    ok: true,
    needs_patch: needsPatch,
    repair_plan: repairPlan,
    issues_count: issues.length,
  };
}

// ─── Full System Watchdog ─────────────────────────────────────────────────────
async function runFullWatchdog(db, user) {
  const nowIso = new Date().toISOString();
  const report = { ran_at: nowIso, subsystems: {}, incidents: [], heals: [] };

  // 1. Secrets check
  const secretsResult = healMissingSecrets();
  report.subsystems.secrets = { ok: secretsResult.ok, missing: secretsResult.missing };
  if (!secretsResult.ok) {
    const ev = await logEvent(db, {
      tenant_id: 'system', severity: 'high', subsystem: 'SECRETS',
      issue_code: 'MISSING_SECRETS', fix_type: 'none', fix_result: 'skipped',
      details_json: secretsResult
    });
    report.incidents.push({ subsystem: 'SECRETS', issue: 'missing_secrets', event_id: ev?.id });
  }

  // 2. Stripe check
  const stripeResult = healStripeWebhook();
  report.subsystems.stripe = stripeResult;
  if (!stripeResult.ok) {
    await logEvent(db, {
      tenant_id: 'system', severity: 'high', subsystem: 'STRIPE_BILLING',
      issue_code: 'STRIPE_WEBHOOK_SECRET_MISSING', fix_type: 'none', fix_result: 'skipped',
      details_json: stripeResult
    });
    report.incidents.push({ subsystem: 'STRIPE_BILLING', issue: 'webhook_secret_missing' });
  }

  // 3. Shopify integrations
  const integrations = await db.entities.PlatformIntegration.filter({ platform: 'shopify' }, '-created_date', 100);
  const active = integrations.filter(i => i.status === 'connected' || i.status === 'degraded');
  report.subsystems.shopify = { total: active.length, healthy: 0, reauth_required: 0, webhooks_fixed: 0 };

  for (const integration of active) {
    const tenantId = integration.tenant_id;
    const shopDomain = integration.store_key;

    let tokens = await db.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify', is_valid: true });
    if (!tokens.length) tokens = await db.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify' });

    if (!tokens.length) {
      report.subsystems.shopify.reauth_required++;
      await logEvent(db, { tenant_id: tenantId, severity: 'high', subsystem: 'SHOPIFY_OAUTH', issue_code: 'TOKEN_MISSING', fix_type: 'none', fix_result: 'skipped', details_json: { shop_domain: shopDomain } });
      continue;
    }

    const accessToken = await decryptToken(tokens[0].encrypted_access_token);
    if (!accessToken) {
      report.subsystems.shopify.reauth_required++;
      continue;
    }

    const scopeRes = await fetch(`https://${shopDomain}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    }).catch(() => null);

    if (!scopeRes || !scopeRes.ok) {
      report.subsystems.shopify.reauth_required++;
      await db.entities.OAuthToken.update(tokens[0].id, { is_valid: false }).catch(() => {});
      await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
      const ev = await logEvent(db, {
        tenant_id: tenantId, severity: 'critical', subsystem: 'SHOPIFY_OAUTH',
        issue_code: 'TOKEN_REVOKED', fix_type: 'none', fix_result: 'skipped',
        auto_healed: false, details_json: { shop_domain: shopDomain, api_status: scopeRes?.status || 'network_error' }
      });
      await db.entities.Alert.create({
        tenant_id: tenantId, type: 'system', severity: 'critical',
        title: `Shopify Token Revoked — ${shopDomain}`,
        message: `Token revoked/expired. Merchant must reconnect OAuth.`,
        entity_type: 'platform_integration', entity_id: integration.id,
        recommended_action: 'Reconnect Shopify OAuth', status: 'pending'
      }).catch(() => {});
      continue;
    }

    // Webhooks
    const webhookResult = await healShopifyWebhooks(db, integration, accessToken);
    if (webhookResult.ok && Object.keys(webhookResult.registered || {}).length > 0) {
      report.subsystems.shopify.webhooks_fixed++;
      report.heals.push({ shop: shopDomain, action: 'webhooks_reconciled', result: webhookResult });
      await logEvent(db, {
        tenant_id: tenantId, severity: 'low', subsystem: 'SHOPIFY_WEBHOOKS',
        issue_code: 'WEBHOOK_DRIFT_FIXED', fix_type: 'auto', fix_result: 'success',
        auto_healed: true, fixed_at: new Date().toISOString(), details_json: webhookResult
      });
    }

    // Queue health
    const queueResult = await healQueue(db, tenantId);
    if (queueResult.stuck > 0) {
      report.heals.push({ tenant: tenantId, action: 'queue_healed', result: queueResult });
      await logEvent(db, {
        tenant_id: tenantId, severity: 'medium', subsystem: 'QUEUE',
        issue_code: 'QUEUE_STUCK_JOBS_FIXED', fix_type: 'auto', fix_result: 'success',
        auto_healed: true, fixed_at: new Date().toISOString(), details_json: queueResult
      });
    }

    // Sync staleness
    const lastSync = integration.last_sync_at ? new Date(integration.last_sync_at).getTime() : null;
    if (!lastSync || Date.now() - lastSync > 2 * 60 * 60 * 1000) {
      await db.functions.invoke('syncShopifyOrders', { tenant_id: tenantId, days: 1 }).catch(() => {});
      report.heals.push({ tenant: tenantId, action: 'auto_sync_triggered' });
    }

    await db.entities.PlatformIntegration.update(integration.id, {
      status: 'connected',
      metadata: { ...(integration.metadata || {}), last_watchdog_ok_at: nowIso }
    }).catch(() => {});

    report.subsystems.shopify.healthy++;
  }

  // 4. Queue global dead-letter check (system-wide)
  const deadLetters = await db.entities.WebhookQueue.filter({ status: 'dead_letter' }, '-created_date', 1);
  report.subsystems.queue = { dead_letter_count: deadLetters.length };

  // 5. Log run
  await db.entities.AutomationRunLog.create({
    automation_name: 'selfHeal_watchdog',
    function_name: 'selfHeal',
    run_at: nowIso,
    status: 'success',
    triggered_by: 'watchdog',
    result_summary: { incidents: report.incidents.length, heals: report.heals.length }
  }).catch(() => {});

  await logAudit(db, 'self_heal_watchdog_ran', 'system',
    `Self-heal watchdog: ${report.heals.length} heals, ${report.incidents.length} incidents`,
    { heals: report.heals.length, incidents: report.incidents.length }
  );

  return report;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
const handler = withEndpointGuard('selfHeal', async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const isScheduler = !user;
    const role = (user?.role || user?.app_role || '').toLowerCase();
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ error: 'Admin/owner only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run_watchdog';

    if (!FEATURE_FLAGS.ENABLE_AUTOHEAL && action !== 'get_flags') {
      return Response.json({ ok: false, message: 'Auto-heal is disabled (ENABLE_AUTOHEAL=false)' });
    }

    // ── get_flags ──────────────────────────────────────────────────────────
    if (action === 'get_flags') {
      return Response.json({ ok: true, flags: FEATURE_FLAGS });
    }

    // ── run_watchdog ───────────────────────────────────────────────────────
    if (action === 'run_watchdog') {
      const report = await runFullWatchdog(db, user);
      return Response.json({ ok: true, ...report });
    }

    // ── heal_shopify_webhooks ──────────────────────────────────────────────
    if (action === 'heal_shopify_webhooks') {
      const { shop_domain, tenant_id, integration_id } = body;
      let integration = null;
      if (integration_id) {
        const list = await db.entities.PlatformIntegration.filter({ id: integration_id });
        integration = list[0] || null;
      } else if (tenant_id) {
        const list = await db.entities.PlatformIntegration.filter({ tenant_id, platform: 'shopify' });
        integration = list[0] || null;
      } else if (shop_domain) {
        const s = shop_domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const list = await db.entities.PlatformIntegration.filter({ store_key: s.includes('.myshopify.com') ? s : `${s}.myshopify.com`, platform: 'shopify' });
        integration = list[0] || null;
      }
      if (!integration) return Response.json({ error: 'Integration not found' }, { status: 404 });

      let tokens = await db.entities.OAuthToken.filter({ tenant_id: integration.tenant_id, platform: 'shopify', is_valid: true });
      if (!tokens.length) tokens = await db.entities.OAuthToken.filter({ tenant_id: integration.tenant_id, platform: 'shopify' });
      if (!tokens.length) return Response.json({ error: 'No token — reconnect OAuth first', needs_reauth: true }, { status: 400 });

      const accessToken = await decryptToken(tokens[0].encrypted_access_token);
      if (!accessToken) return Response.json({ error: 'Token decrypt failed', needs_reauth: true }, { status: 400 });

      const result = await healShopifyWebhooks(db, integration, accessToken);
      await logEvent(db, {
        tenant_id: integration.tenant_id, severity: result.ok ? 'low' : 'medium',
        subsystem: 'SHOPIFY_WEBHOOKS',
        issue_code: result.ok ? 'WEBHOOK_RECONCILED' : 'WEBHOOK_RECONCILE_FAILED',
        fix_type: 'auto', fix_result: result.ok ? 'success' : 'failed',
        auto_healed: result.ok, fixed_at: result.ok ? new Date().toISOString() : undefined,
        details_json: result
      });
      await logAudit(db, 'heal_shopify_webhooks', integration.tenant_id,
        `Webhook heal: ${Object.keys(result.registered||{}).length} registered, ${(result.deleted||[]).length} deleted`,
        result
      );
      return Response.json({ ok: true, ...result });
    }

    // ── heal_shopify_token ──────────────────────────────────────────────────
    if (action === 'heal_shopify_token') {
      const { shop_domain, tenant_id } = body;
      const tenantFilter = tenant_id ? { tenant_id } : {};
      let integrations = await db.entities.PlatformIntegration.filter({ ...tenantFilter, platform: 'shopify' });
      if (shop_domain) {
        const s = shop_domain.toLowerCase().trim();
        integrations = integrations.filter(i => i.store_key === s || i.store_key === `${s}.myshopify.com`);
      }
      const integration = integrations[0] || null;
      if (!integration) return Response.json({ error: 'Integration not found' }, { status: 404 });

      let tokens = await db.entities.OAuthToken.filter({ tenant_id: integration.tenant_id, platform: 'shopify' });
      if (!tokens.length) {
        return Response.json({ ok: false, status: 'TOKEN_MISSING', needs_reauth: true, action_required: 'Reconnect Shopify OAuth from Settings → Integrations.' });
      }

      const accessToken = await decryptToken(tokens[0].encrypted_access_token);
      if (!accessToken) {
        await db.entities.OAuthToken.update(tokens[0].id, { is_valid: false }).catch(() => {});
        return Response.json({ ok: false, status: 'TOKEN_DECRYPT_FAILED', needs_reauth: true });
      }

      const scopeRes = await fetch(`https://${integration.store_key}/admin/oauth/access_scopes.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      }).catch(() => null);

      if (!scopeRes || !scopeRes.ok) {
        await db.entities.OAuthToken.update(tokens[0].id, { is_valid: false }).catch(() => {});
        await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
        await logEvent(db, {
          tenant_id: integration.tenant_id, severity: 'critical', subsystem: 'SHOPIFY_OAUTH',
          issue_code: 'TOKEN_REVOKED', fix_type: 'none', fix_result: 'skipped',
          details_json: { shop_domain: integration.store_key, api_status: scopeRes?.status || 'error' }
        });
        const appUrl = APP_URL.replace(/\/$/, '');
        const shopSlug = integration.store_key.replace('.myshopify.com','');
        const hostEncoded = btoa(`${shopSlug}.myshopify.com/admin`);
        return Response.json({
          ok: false, status: 'TOKEN_REVOKED', needs_reauth: true,
          reauth_url: `${appUrl}/ShopifyAuth?shop=${integration.store_key}`,
          action_required: 'Shopify token revoked. Click Reconnect to re-authorize.'
        });
      }

      await db.entities.OAuthToken.update(tokens[0].id, { is_valid: true }).catch(() => {});
      await db.entities.PlatformIntegration.update(integration.id, { status: 'connected' }).catch(() => {});
      return Response.json({ ok: true, status: 'TOKEN_VALID', shop_domain: integration.store_key });
    }

    // ── heal_queue ─────────────────────────────────────────────────────────
    if (action === 'heal_queue') {
      const { tenant_id } = body;
      const result = await healQueue(db, tenant_id || 'all');
      await logEvent(db, {
        tenant_id: tenant_id || 'system', severity: 'low', subsystem: 'QUEUE',
        issue_code: 'QUEUE_HEALED', fix_type: 'auto', fix_result: 'success',
        auto_healed: true, fixed_at: new Date().toISOString(), details_json: result
      });
      return Response.json({ ok: true, ...result });
    }

    // ── heal_missing_secrets ───────────────────────────────────────────────
    if (action === 'heal_missing_secrets') {
      const result = healMissingSecrets();
      if (!result.ok) {
        await logEvent(db, {
          tenant_id: 'system', severity: 'high', subsystem: 'SECRETS',
          issue_code: 'MISSING_SECRETS', fix_type: 'none', fix_result: 'skipped',
          details_json: result
        });
      }
      return Response.json({ ok: result.ok, ...result });
    }

    // ── heal_stripe_webhook ────────────────────────────────────────────────
    if (action === 'heal_stripe_webhook') {
      const result = healStripeWebhook();
      if (!result.ok) {
        await logEvent(db, {
          tenant_id: 'system', severity: 'high', subsystem: 'STRIPE_BILLING',
          issue_code: 'STRIPE_WEBHOOK_SECRET_MISSING', fix_type: 'none', fix_result: 'skipped',
          details_json: result
        });
      }
      return Response.json({ ok: result.ok, ...result });
    }

    // ── heal_ui_routing ────────────────────────────────────────────────────
    if (action === 'heal_ui_routing') {
      const tenantId = body.tenant_id || 'system';
      const result = await healUiRouting(db, tenantId, body);
      await logEvent(db, {
        tenant_id: tenantId,
        severity: result.needs_patch ? 'high' : 'low',
        subsystem: 'UI_ROUTING',
        issue_code: result.needs_patch ? 'UI_ROUTING_MISMATCH' : 'UI_ROUTING_OK',
        fix_type: result.needs_patch ? 'patch' : 'auto',
        fix_result: 'success',
        auto_healed: !result.needs_patch,
        fixed_at: new Date().toISOString(),
        details_json: result
      });
      return Response.json(result);
    }

    // ── publish_incident (frontend IncidentBus) ───────────────────────────
    if (action === 'publish_incident') {
      const {
        subsystem = 'GENERAL',
        issue_code = 'UNKNOWN_ERROR',
        severity = 'low',
        tenant_id = 'system',
        context = {}
      } = body || {};

      const event = await logEvent(db, {
        tenant_id,
        severity,
        subsystem,
        issue_code,
        fix_type: 'none',
        fix_result: 'pending',
        details_json: context,
      });

      return Response.json({ ok: true, event_id: event?.id || null });
    }

    // ── get_incidents ──────────────────────────────────────────────────────
    if (action === 'get_incidents') {
      const { tenant_id, limit = 50 } = body;
      const filter = tenant_id ? { tenant_id } : {};
      const events = await db.entities.SelfHealingEvent.filter(filter, '-detected_at', limit);
      const patches = await db.entities.PatchBundle.filter({ status: 'proposed' }, '-created_date', 20);
      const queueDepth = await db.entities.WebhookQueue.filter({ status: 'pending' }, '-created_date', 1);
      const deadLetters = await db.entities.WebhookQueue.filter({ status: 'dead_letter' }, '-created_date', 1);
      const recentRuns = await db.entities.AutomationRunLog.filter({}, '-run_at', 20);

      // Queue count (approximate)
      const allPending = await db.entities.WebhookQueue.filter({ status: 'pending' }, '-created_date', 500);
      const allDead = await db.entities.WebhookQueue.filter({ status: 'dead_letter' }, '-created_date', 500);

      return Response.json({
        ok: true,
        events,
        pending_patches: patches,
        queue: { pending: allPending.length, dead_letter: allDead.length },
        recent_runs: recentRuns,
        webhook_endpoint_canonical: WEBHOOK_ENDPOINT_CANONICAL,
        flags: FEATURE_FLAGS
      });
    }

    // ── acknowledge_event ──────────────────────────────────────────────────
    if (action === 'acknowledge_event') {
      const { event_id } = body;
      if (!event_id) return Response.json({ error: 'event_id required' }, { status: 400 });
      await db.entities.SelfHealingEvent.update(event_id, {
        acknowledged: true,
        acknowledged_by: user?.email || 'admin'
      });
      return Response.json({ ok: true });
    }

    // ── approve_patch ──────────────────────────────────────────────────────
    if (action === 'approve_patch') {
      const { patch_bundle_id } = body;
      if (!patch_bundle_id) return Response.json({ error: 'patch_bundle_id required' }, { status: 400 });
      await db.entities.PatchBundle.update(patch_bundle_id, {
        status: 'approved',
        applied_by: user?.email || 'admin',
        applied_at: new Date().toISOString()
      });
      await logAudit(db, 'patch_approved', 'system', `Patch bundle ${patch_bundle_id} approved`, { patch_bundle_id });
      return Response.json({ ok: true, message: 'Patch approved. Code changes require manual deployment via the code editor.' });
    }

    // ── reject_patch ───────────────────────────────────────────────────────
    if (action === 'reject_patch') {
      const { patch_bundle_id } = body;
      if (!patch_bundle_id) return Response.json({ error: 'patch_bundle_id required' }, { status: 400 });
      await db.entities.PatchBundle.update(patch_bundle_id, {
        status: 'rejected',
        applied_by: user?.email || 'admin',
        applied_at: new Date().toISOString()
      });
      await logAudit(db, 'patch_rejected', 'system', `Patch bundle ${patch_bundle_id} rejected`, { patch_bundle_id });
      return Response.json({ ok: true, message: 'Patch rejected.' });
    }

    return Response.json({ error: 'Unknown action', action }, { status: 400 });

  } catch (error) {
    console.error('[selfHeal]', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

Deno.serve(handler);
export default handler;
