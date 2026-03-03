/**
 * shopifyReconcileWebhooks
 * 
 * Idempotent webhook reconciliation:
 * 1. List all webhooks from Shopify (/webhooks.json)
 * 2. Delete stale webhooks pointing to wrong domain/path
 * 3. Register missing required topics to WEBHOOK_ENDPOINT_CANONICAL
 * 4. Persist webhook IDs to PlatformIntegration.webhook_endpoints
 * 
 * Callable:
 *  - By admin/owner via UI (manual reconcile)
 *  - By watchdog automation (every 6 hours)
 *  - Automatically on OAuth callback
 * 
 * Returns: { ok, registered, deleted, already_ok, errors, webhook_url }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import {
  APP_URL, API_VERSION, WEBHOOK_ENDPOINT_CANONICAL, REQUIRED_TOPICS,
  canonicalizeShopDomain, decryptToken
} from './shopifyConfig.js';

async function reconcile(shopDomain, accessToken, integrationId, db) {
  const now = new Date().toISOString();

  // 1. Fetch existing webhooks from Shopify
  const listRes = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json?limit=250`, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });

  if (!listRes.ok) {
    const body = await listRes.text();
    const err = `Shopify API ${listRes.status}: ${body.slice(0, 200)}`;
    console.error('[reconcile] Webhook list failed:', err);
    return { ok: false, error: err, needs_reauth: listRes.status === 401 };
  }

  const { webhooks = [] } = await listRes.json();
  console.log(`[reconcile] Found ${webhooks.length} webhooks in Shopify for ${shopDomain}`);

  // 2. Classify webhooks
  const ours = webhooks.filter(w => w.address === WEBHOOK_ENDPOINT_CANONICAL);
  const stale = webhooks.filter(w => {
    if (w.address === WEBHOOK_ENDPOINT_CANONICAL) return false;
    // Stale = points to any ProfitShield-looking endpoint on wrong domain
    return w.address.includes('shopifyWebhook') || w.address.includes('profit-shield');
  });

  const ourTopics = new Set(ours.map(w => w.topic));
  const missingTopics = REQUIRED_TOPICS.filter(t => !ourTopics.has(t));
  const alreadyOkTopics = REQUIRED_TOPICS.filter(t => ourTopics.has(t));

  const deleted = [];
  const registered = {};
  const errors = [];

  // 3. Delete stale webhooks
  for (const wh of stale) {
    try {
      const delRes = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks/${wh.id}.json`, {
        method: 'DELETE',
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      if (delRes.ok || delRes.status === 404) {
        deleted.push({ id: wh.id, topic: wh.topic, address: wh.address });
        console.log(`[reconcile] Deleted stale webhook ${wh.id} (${wh.topic} → ${wh.address})`);
      } else {
        console.warn(`[reconcile] Failed to delete webhook ${wh.id}: ${delRes.status}`);
      }
    } catch (e) {
      console.warn(`[reconcile] Delete exception for ${wh.id}:`, e.message);
    }
  }

  // 4. Register missing topics
  for (const topic of missingTopics) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ webhook: { topic, address: WEBHOOK_ENDPOINT_CANONICAL, format: 'json' } })
      });
      const data = await res.json();
      if (data.webhook?.id) {
        registered[topic.replace('/', '_')] = data.webhook.id.toString();
        console.log(`[reconcile] Registered ${topic} → id ${data.webhook.id}`);
      } else {
        const errMsg = JSON.stringify(data.errors || data);
        console.error(`[reconcile] Failed to register ${topic}:`, errMsg);
        errors.push({ topic, error: errMsg });
      }
    } catch (e) {
      errors.push({ topic, error: e.message });
    }
  }

  // 5. Build final webhook_endpoints map (existing + newly registered)
  const webhookEndpoints = {};
  for (const wh of ours) {
    if (!missingTopics.includes(wh.topic)) {
      webhookEndpoints[wh.topic.replace('/', '_')] = wh.id.toString();
    }
  }
  Object.assign(webhookEndpoints, registered);

  // 6. Persist to PlatformIntegration
  if (integrationId && db) {
    await db.entities.PlatformIntegration.update(integrationId, {
      webhook_endpoints: webhookEndpoints,
      last_connected_at: now,
      status: 'connected'
    }).catch(e => console.warn('[reconcile] Could not persist webhook IDs:', e.message));
  }

  const totalOk = alreadyOkTopics.length + Object.keys(registered).length;

  return {
    ok: errors.length === 0,
    webhook_url: WEBHOOK_ENDPOINT_CANONICAL,
    topics_required: REQUIRED_TOPICS.length,
    topics_ok: totalOk,
    already_ok: alreadyOkTopics,
    registered,
    registered_count: Object.keys(registered).length,
    deleted,
    deleted_count: deleted.length,
    errors,
    error_count: errors.length,
    webhook_endpoints: webhookEndpoints,
    needs_reauth: false
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Auth: admin/owner or service-role automated call
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const role = (user?.role || user?.app_role || '').toLowerCase();
    const isAutomated = !user; // no session = called from scheduler
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ error: 'Admin/owner only' }, { status: 403 });
    }

    const body = await req.json();
    const { tenant_id, integration_id, shop_domain } = body;

    // Resolve integration
    let integration = null;
    let shopDomain = null;

    if (integration_id) {
      const list = await db.entities.PlatformIntegration.filter({ id: integration_id });
      integration = list[0] || null;
    } else if (tenant_id) {
      const list = await db.entities.PlatformIntegration.filter({ tenant_id, platform: 'shopify' });
      integration = list.find(i => i.status === 'connected') || list[0] || null;
    } else if (shop_domain) {
      const normalized = canonicalizeShopDomain(shop_domain);
      const list = await db.entities.PlatformIntegration.filter({ store_key: normalized, platform: 'shopify' });
      integration = list.find(i => i.status === 'connected') || list[0] || null;
    }

    if (!integration) {
      return Response.json({ error: 'Integration not found' }, { status: 404 });
    }

    shopDomain = integration.store_key;

    // Get OAuth token
    let tokens = await db.entities.OAuthToken.filter({ tenant_id: integration.tenant_id, platform: 'shopify', is_valid: true });
    if (!tokens.length) tokens = await db.entities.OAuthToken.filter({ tenant_id: integration.tenant_id, platform: 'shopify' });
    if (!tokens.length) {
      return Response.json({ error: 'No OAuth token — reconnect OAuth first', needs_reauth: true }, { status: 400 });
    }

    const accessToken = await decryptToken(tokens[0].encrypted_access_token);
    if (!accessToken) {
      return Response.json({ error: 'Token decryption failed — reconnect OAuth', needs_reauth: true }, { status: 400 });
    }

    // Pre-flight: verify token valid
    const scopeCheck = await fetch(`https://${shopDomain}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    if (!scopeCheck.ok) {
      await db.entities.OAuthToken.update(tokens[0].id, { is_valid: false }).catch(() => {});
      await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
      return Response.json({ error: `Shopify API returned ${scopeCheck.status} — token invalid. Reconnect OAuth.`, needs_reauth: true }, { status: 400 });
    }

    const result = await reconcile(shopDomain, accessToken, integration.id, db);

    // Audit log
    await db.entities.AuditLog.create({
      tenant_id: integration.tenant_id,
      action: 'webhooks_reconciled',
      entity_type: 'platform_integration',
      entity_id: integration.id,
      performed_by: user?.email || 'system',
      description: `Webhook reconciliation: ${result.registered_count} registered, ${result.deleted_count} deleted, ${result.error_count} errors. Endpoint: ${WEBHOOK_ENDPOINT_CANONICAL}`,
      severity: result.error_count > 0 ? 'medium' : 'low',
      category: 'integration',
      is_auto_action: isAutomated,
      metadata: {
        registered: result.registered,
        deleted: result.deleted,
        errors: result.errors,
        topics_ok: result.topics_ok,
        topics_required: result.topics_required
      }
    }).catch(() => {});

    if (result.needs_reauth) {
      return Response.json({ ...result, error: 'Token invalid — reconnect OAuth' }, { status: 400 });
    }

    return Response.json(result);

  } catch (error) {
    console.error('[shopifyReconcileWebhooks]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});