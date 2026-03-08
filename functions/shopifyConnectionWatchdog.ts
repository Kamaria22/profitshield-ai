/**
 * shopifyConnectionWatchdog
 * 
 * Runs every 6 hours (scheduled automation).
 * For each active Shopify integration:
 *   1. access_scopes check → 401 = mark REAUTH_REQUIRED
 *   2. Reconcile webhooks (fixes drift automatically)
 *   3. Verify last_webhook_received_at (stale > 24h = raise Alert)
 *   4. Auto-run sync if last_sync_at stale (> 2h)
 *   5. Update health metrics
 * 
 * Can also be triggered manually by admin.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_VERSION = '2024-10';
const APP_URL = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
const WEBHOOK_ENDPOINT_CANONICAL = `${APP_URL}/api/functions/shopifyWebhook`;
const REQUIRED_TOPICS = ['orders/create','orders/updated','orders/paid','orders/cancelled','refunds/create','products/update','app/uninstalled'];

function isMissingFunctionDeployment(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('deployment does not exist') || msg.includes('not found') || msg.includes('404');
}

function mapOrderStatus(orderData) {
  if (orderData?.cancelled_at) return 'cancelled';
  const financial = String(orderData?.financial_status || '').toLowerCase();
  if (financial === 'paid' || financial === 'partially_paid') return 'paid';
  if (financial === 'refunded' || financial === 'partially_refunded') return 'refunded';
  return 'pending';
}

async function runInlineSyncFallback(db, tenantId, shopDomain, accessToken, days = 1) {
  const createdAtMin = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/orders.json?status=any&limit=100&created_at_min=${createdAtMin}`, {
    headers: { 'X-Shopify-Access-Token': accessToken }
  });
  if (!res.ok) throw new Error(`inline_sync_shopify_${res.status}`);
  const payload = await res.json().catch(() => ({}));
  const orders = Array.isArray(payload?.orders) ? payload.orders : [];

  let created = 0;
  let updated = 0;
  for (const order of orders) {
    const platformOrderId = order?.id ? String(order.id) : null;
    if (!platformOrderId) continue;
    const existing = await db.entities.Order.filter({ tenant_id: tenantId, platform_order_id: platformOrderId }, '-created_date', 1).catch(() => []);
    const record = {
      tenant_id: tenantId,
      platform_order_id: platformOrderId,
      order_number: String(order?.order_number || order?.name || platformOrderId),
      order_date: order?.created_at || new Date().toISOString(),
      status: mapOrderStatus(order),
      customer_email: order?.email || order?.customer?.email || null,
      customer_name: order?.customer?.first_name ? `${order.customer.first_name} ${order?.customer?.last_name || ''}`.trim() : null,
      total_revenue: Number(order?.total_price || 0) || 0,
      platform_data: order
    };
    if (existing[0]?.id) {
      await db.entities.Order.update(existing[0].id, record).catch(() => {});
      updated++;
    } else {
      await db.entities.Order.create(record).catch(() => {});
      created++;
    }
  }
  return { ok: true, fetched: orders.length, created, updated };
}

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) { try { return atob(encryptedToken); } catch { return null; } }
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const enc = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, enc);
    return new TextDecoder().decode(decrypted);
  } catch { try { return atob(encryptedToken); } catch { return null; } }
}

const WEBHOOK_STALE_HOURS = 24;
const SYNC_STALE_HOURS = 2;

async function reconcileWebhooks(shopDomain, accessToken, integrationId, db) {
  try {
    const listRes = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    if (!listRes.ok) return { ok: false, error: `List failed: ${listRes.status}` };

    const { webhooks = [] } = await listRes.json();
    const ours = webhooks.filter(w => w.address === WEBHOOK_ENDPOINT_CANONICAL);
    const ourTopics = new Set(ours.map(w => w.topic));
    const missingTopics = REQUIRED_TOPICS.filter(t => !ourTopics.has(t));

    // Delete stale
    const stale = webhooks.filter(w =>
      w.address !== WEBHOOK_ENDPOINT_CANONICAL &&
      (w.address.includes('shopifyWebhook') || w.address.includes('profit-shield'))
    );
    for (const wh of stale) {
      await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks/${wh.id}.json`, {
        method: 'DELETE', headers: { 'X-Shopify-Access-Token': accessToken }
      }).catch(() => {});
    }

    // Register missing
    const registered = {};
    for (const topic of missingTopics) {
      const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ webhook: { topic, address: WEBHOOK_ENDPOINT_CANONICAL, format: 'json' } })
      });
      const data = await res.json();
      if (data.webhook?.id) registered[topic.replace('/', '_')] = data.webhook.id.toString();
    }

    // Build final map
    const webhookEndpoints = {};
    for (const wh of ours) webhookEndpoints[wh.topic.replace('/', '_')] = wh.id.toString();
    Object.assign(webhookEndpoints, registered);

    if (integrationId) {
      await db.entities.PlatformIntegration.update(integrationId, {
        webhook_endpoints: webhookEndpoints,
        last_connected_at: new Date().toISOString()
      }).catch(() => {});
    }

    return {
      ok: true,
      topics_registered: REQUIRED_TOPICS.length,
      topics_ok: Object.keys(webhookEndpoints).length,
      fixed: missingTopics.length,
      stale_deleted: stale.length
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const observeOnly = body.observe_only === true || body.mode === 'observe';

    // Allow: scheduler (no auth) OR admin user
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const role = (user?.role || user?.app_role || '').toLowerCase();
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ error: 'Admin/owner only' }, { status: 403 });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Get all connected Shopify integrations
    const integrations = await db.entities.PlatformIntegration.filter({ platform: 'shopify' }, '-created_date', 100);
    const active = integrations.filter(i => i.status === 'connected' || i.status === 'degraded');

    console.log(`[shopifyConnectionWatchdog] Checking ${active.length} Shopify integrations`);

    const results = [];

    for (const integration of active) {
      const tenantId = integration.tenant_id;
      const shopDomain = integration.store_key;
      const result = {
        integration_id: integration.id,
        shop_domain: shopDomain,
        tenant_id: tenantId,
        observe_only: observeOnly,
        status: 'healthy',
        health_issues: []
      };

      // 1. Get token
      let tokens = await db.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify', is_valid: true });
      if (!tokens.length) tokens = await db.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify' });
      if (!tokens.length) {
        result.token_check = 'missing';
        result.status = 'reauth_required';
        if (!observeOnly) {
          await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
        }
        results.push(result);
        continue;
      }

      const accessToken = await decryptToken(tokens[0].encrypted_access_token);
      if (!accessToken) {
        result.token_check = 'decrypt_failed';
        result.status = 'reauth_required';
        if (!observeOnly) {
          await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
        }
        results.push(result);
        continue;
      }

      // 2. access_scopes check
      const scopeRes = await fetch(`https://${shopDomain}/admin/oauth/access_scopes.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });

      if (!scopeRes.ok) {
        result.api_reachable = false;
        result.api_status = scopeRes.status;
        result.status = 'reauth_required';

        if (!observeOnly) {
          await db.entities.OAuthToken.update(tokens[0].id, { is_valid: false }).catch(() => {});
          await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});

          // Create Alert for admin
          await db.entities.Alert.create({
            tenant_id: tenantId,
            type: 'system',
            severity: 'high',
            title: `Shopify Token Revoked — ${shopDomain}`,
            message: `Shopify API returned ${scopeRes.status} for ${shopDomain}. Token has been revoked or expired. The merchant must reconnect.`,
            entity_type: 'platform_integration',
            entity_id: integration.id,
            recommended_action: 'Reconnect Shopify OAuth',
            status: 'pending',
            metadata: { shop_domain: shopDomain, api_status: scopeRes.status }
          }).catch(() => {});
        }

        results.push(result);
        continue;
      }

      result.api_reachable = true;

      // 3. Reconcile webhooks
      if (observeOnly) {
        result.webhooks = { ok: true, observe_only: true, skipped_mutation: true };
      } else {
        const webhookResult = await reconcileWebhooks(shopDomain, accessToken, integration.id, db);
        result.webhooks = webhookResult;
      }

      // 4. Check for stale webhook events
      const webhookStaleMs = WEBHOOK_STALE_HOURS * 60 * 60 * 1000;
      const recentEvents = await db.entities.WebhookQueue.filter(
        { tenant_id: tenantId },
        '-created_date',
        1
      );
      const lastWebhookAt = recentEvents[0]?.created_date
        ? new Date(recentEvents[0].created_date).getTime()
        : null;
      const webhookStale = lastWebhookAt && (Date.now() - lastWebhookAt > webhookStaleMs);

      if (webhookStale) {
        result.webhook_stale = true;
        result.status = 'degraded';
        result.health_issues.push('webhook_stale');
        if (!observeOnly) {
          await db.entities.Alert.create({
            tenant_id: tenantId,
            type: 'system',
            severity: 'medium',
            title: `No Webhook Events in ${WEBHOOK_STALE_HOURS}h — ${shopDomain}`,
            message: `No webhook events received from ${shopDomain} in over ${WEBHOOK_STALE_HOURS} hours. Webhooks may be misconfigured.`,
            entity_type: 'platform_integration',
            entity_id: integration.id,
            recommended_action: 'Run Reconcile Webhooks',
            status: 'pending',
            metadata: { shop_domain: shopDomain, last_webhook_at: recentEvents[0]?.created_date || null }
          }).catch(() => {});
        }
      }

      // 5. Auto-sync if stale
      const syncStaleMs = SYNC_STALE_HOURS * 60 * 60 * 1000;
      const lastSyncAt = integration.last_sync_at ? new Date(integration.last_sync_at).getTime() : null;
      const syncStale = !lastSyncAt || (Date.now() - lastSyncAt > syncStaleMs);

      if (syncStale) {
        result.sync_stale = true;
        if (observeOnly) {
          result.auto_sync_triggered = false;
          result.auto_sync_skipped = true;
        } else {
          try {
            try {
              await db.functions.invoke('syncShopifyOrders', { tenant_id: tenantId, days: 1 });
            } catch (syncOrdersErr) {
              if (!isMissingFunctionDeployment(syncOrdersErr)) throw syncOrdersErr;
              try {
                await db.functions.invoke('syncShopifyData', { tenant_id: tenantId, days: 1 });
                result.auto_sync_fallback = 'syncShopifyData';
              } catch (syncDataErr) {
                if (!isMissingFunctionDeployment(syncDataErr)) throw syncDataErr;
                result.auto_sync_fallback = 'inline_watchdog_sync';
                result.auto_sync_inline = await runInlineSyncFallback(db, tenantId, shopDomain, accessToken, 1);
              }
            }
            result.auto_sync_triggered = true;
            console.log(`[watchdog] Auto-sync triggered for tenant ${tenantId}`);
          } catch (syncErr) {
            result.auto_sync_error = syncErr.message;
            result.status = 'degraded';
            result.health_issues.push('auto_sync_failed');
            console.warn(`[watchdog] Auto-sync failed for ${tenantId}:`, syncErr.message);

            await db.entities.Alert.create({
              tenant_id: tenantId,
              type: 'system',
              severity: 'high',
              title: `Dashboard Sync Failure — ${shopDomain}`,
              message: `Watchdog auto-sync failed: ${syncErr.message}`,
              entity_type: 'platform_integration',
              entity_id: integration.id,
              recommended_action: 'Run manual sync and verify OAuth token',
              status: 'pending',
              metadata: { shop_domain: shopDomain, sync_stale: true, auto_sync_error: syncErr.message }
            }).catch(() => {});
          }
        }
      }

      // 6. Update last_ok_at on integration
      if (!observeOnly) {
        await db.entities.PlatformIntegration.update(integration.id, {
          status: result.status === 'healthy' ? 'connected' : 'degraded',
          metadata: {
            ...(integration.metadata || {}),
            last_ok_at: nowIso,
            watchdog_last_ran: nowIso,
            watchdog_status: result.status,
            watchdog_health_issues: result.health_issues
          }
        }).catch(() => {});
      }
      results.push(result);
    }

    const summary = {
      checked: active.length,
      healthy: results.filter(r => r.status === 'healthy').length,
      reauth_required: results.filter(r => r.status === 'reauth_required').length,
      ran_at: nowIso
    };

    console.log('[shopifyConnectionWatchdog] Done:', summary);

    await db.entities.AuditLog.create({
      tenant_id: 'system',
      action: 'watchdog_ran',
      entity_type: 'system',
      entity_id: 'shopify_watchdog',
      performed_by: user?.email || 'system',
      description: `Shopify watchdog: ${summary.healthy} healthy, ${summary.reauth_required} need reauth`,
      severity: summary.reauth_required > 0 ? 'medium' : 'low',
      category: 'integration',
      is_auto_action: !user,
      metadata: { ...summary, observe_only: observeOnly }
    }).catch(() => {});

    return Response.json({ ok: true, observe_only: observeOnly, ...summary, results });

  } catch (error) {
    console.error('[shopifyConnectionWatchdog]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
