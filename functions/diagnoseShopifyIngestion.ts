/**
 * diagnoseShopifyIngestion
 * 
 * Full end-to-end health check for a Shopify integration:
 *   1) Tenant lookup
 *   2) Integration record
 *   3) OAuth token: present + decryptable
 *   4) Shopify API reachability (list webhooks)
 *   5) Webhooks registered vs expected
 *   6) Orders in DB
 *   7) WebhookQueue state
 *   8) Recommended fix actions
 *
 * Also supports action=fix_webhooks and action=fix_sync to auto-fix.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const REQUIRED_TOPICS = ['orders/create', 'orders/updated', 'orders/paid', 'refunds/create', 'app/uninstalled', 'products/update', 'orders/cancelled'];

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    // Try plain base64
    try { return atob(encryptedToken); } catch { return null; }
  }
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const enc = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, enc);
    return new TextDecoder().decode(decrypted);
  } catch {
    try { return atob(encryptedToken); } catch { return null; }
  }
}

async function registerWebhooks(shopDomain, accessToken, integrationId, db) {
  const appUrl = Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app';
  const webhookUrl = `${appUrl}/api/functions/shopifyWebhook`;

  // Delete existing webhooks pointing to our URL
  try {
    const listRes = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    if (listRes.ok) {
      const { webhooks } = await listRes.json();
      for (const wh of (webhooks || [])) {
        if (wh.address === webhookUrl) {
          await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks/${wh.id}.json`, {
            method: 'DELETE',
            headers: { 'X-Shopify-Access-Token': accessToken }
          });
        }
      }
    }
  } catch (e) {
    console.warn('[diagnoseShopifyIngestion] Cleanup error:', e.message);
  }

  const registered = {};
  const errors = [];
  for (const topic of REQUIRED_TOPICS) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
        body: JSON.stringify({ webhook: { topic, address: webhookUrl, format: 'json' } })
      });
      const data = await res.json();
      if (data.webhook?.id) {
        registered[topic.replace('/', '_')] = data.webhook.id.toString();
      } else {
        errors.push({ topic, error: JSON.stringify(data.errors || data) });
      }
    } catch (e) {
      errors.push({ topic, error: e.message });
    }
  }

  if (integrationId && db) {
    await db.entities.PlatformIntegration.update(integrationId, {
      webhook_endpoints: registered,
      last_connected_at: new Date().toISOString()
    }).catch(() => {});
  }

  return { registered, errors, webhookUrl };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin OR owner allowed
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const role = (user?.role || user?.app_role || '').toLowerCase();
    if (!user || (role !== 'admin' && role !== 'owner')) {
      return Response.json({ error: 'Admin/owner only' }, { status: 403 });
    }

    const body = await req.json();
    const { shop_domain, action, tenant_id: bodyTenantId, integration_id: bodyIntegrationId, days } = body;

    const db = base44.asServiceRole;

    // Resolve shop domain / tenant
    let normalized = null;
    let tenant = null;

    if (bodyTenantId) {
      const ts = await db.entities.Tenant.filter({ id: bodyTenantId });
      tenant = ts[0] || null;
      if (tenant) normalized = tenant.shop_domain;
    } else if (shop_domain) {
      normalized = shop_domain.includes('.myshopify.com')
        ? shop_domain.toLowerCase()
        : `${shop_domain.toLowerCase()}.myshopify.com`;
      const ts = await db.entities.Tenant.filter({ shop_domain: normalized });
      tenant = ts[0] || null;
    }

    if (!tenant) {
      return Response.json({ error: 'Tenant not found', shop_domain: normalized }, { status: 404 });
    }

    const tenantId = tenant.id;

    // Integration
    let integrations = await db.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' });
    let integration = integrations[0] || null;
    if (!integration && bodyIntegrationId) {
      const ints = await db.entities.PlatformIntegration.filter({ id: bodyIntegrationId });
      integration = ints[0] || null;
    }

    // OAuth token
    let tokens = await db.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify', is_valid: true });
    if (!tokens.length) tokens = await db.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify' });
    const token = tokens[0] || null;
    let accessToken = null;
    if (token?.encrypted_access_token) {
      accessToken = await decryptToken(token.encrypted_access_token);
    }

    // ── ACTION: fix_webhooks ──────────────────────────────────────────────────
    if (action === 'fix_webhooks') {
      if (!accessToken) return Response.json({ error: 'No valid access token — reconnect OAuth first' }, { status: 400 });
      if (!integration) return Response.json({ error: 'No integration record found' }, { status: 400 });
      const result = await registerWebhooks(normalized, accessToken, integration.id, db);
      await db.entities.AuditLog.create({
        tenant_id: tenantId,
        action: 'fix_webhooks_triggered',
        entity_type: 'platform_integration',
        entity_id: integration.id,
        performed_by: user.email,
        description: `Manual webhook re-registration: ${Object.keys(result.registered).length} registered, ${result.errors.length} failed`,
        severity: 'low',
        category: 'integration',
        metadata: { registered: result.registered, errors: result.errors }
      }).catch(() => {});
      return Response.json({
        action: 'fix_webhooks',
        success: result.errors.length === 0,
        registered_count: Object.keys(result.registered).length,
        error_count: result.errors.length,
        webhook_url: result.webhookUrl,
        registered: result.registered,
        errors: result.errors
      });
    }

    // ── ACTION: fix_sync (historical import) ─────────────────────────────────
    if (action === 'fix_sync') {
      if (!tenantId) return Response.json({ error: 'No tenant' }, { status: 400 });
      const syncDays = days || 365;
      const result = await base44.functions.invoke('syncShopifyOrders', {
        tenant_id: tenantId,
        days: syncDays
      });
      return Response.json({
        action: 'fix_sync',
        success: !result.data?.error,
        days: syncDays,
        ...result.data
      });
    }

    // ── DIAGNOSE ──────────────────────────────────────────────────────────────
    const appUrl = Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app';
    const expectedWebhookUrl = `${appUrl}/api/functions/shopifyWebhook`;

    // Shopify webhooks
    let shopifyWebhooks = [];
    let shopifyApiReachable = false;
    let shopifyWebhookError = null;
    if (accessToken) {
      try {
        const whRes = await fetch(`https://${normalized}/admin/api/2024-01/webhooks.json`, {
          headers: { 'X-Shopify-Access-Token': accessToken }
        });
        if (whRes.ok) {
          shopifyApiReachable = true;
          const whData = await whRes.json();
          shopifyWebhooks = (whData.webhooks || []).map(w => ({
            id: w.id, topic: w.topic, address: w.address
          }));
        } else {
          shopifyWebhookError = `HTTP ${whRes.status}: ${await whRes.text()}`;
        }
      } catch (e) {
        shopifyWebhookError = e.message;
      }
    }

    const ourWebhooks = shopifyWebhooks.filter(w => w.address === expectedWebhookUrl);
    const ourTopics = ourWebhooks.map(w => w.topic);
    const missingTopics = REQUIRED_TOPICS.filter(t => !ourTopics.includes(t));

    // Orders
    const allOrders = await db.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 500);
    const latestOrder = allOrders[0] || null;

    // SyncJobs
    const syncJobs = await db.entities.SyncJob.filter({ tenant_id: tenantId }, '-created_date', 5);
    const lastSyncJob = syncJobs[0] || null;

    // WebhookQueue
    const queueItems = await db.entities.WebhookQueue.filter({ tenant_id: tenantId }, '-created_date', 50);
    const queueDepth = {
      pending: queueItems.filter(j => j.status === 'pending').length,
      processing: queueItems.filter(j => j.status === 'processing').length,
      complete: queueItems.filter(j => j.status === 'complete').length,
      failed: queueItems.filter(j => j.status === 'failed').length,
      dead_letter: queueItems.filter(j => j.status === 'dead_letter').length
    };

    // Issues + recommended actions
    const issues = [];
    const recommendedActions = [];

    if (!token || !token.is_valid) {
      issues.push('OAuth token missing or invalid');
      recommendedActions.push({ action: 'reconnect_oauth', label: 'Reconnect OAuth', priority: 1 });
    } else if (!accessToken) {
      issues.push('OAuth token present but cannot be decrypted');
      recommendedActions.push({ action: 'reconnect_oauth', label: 'Reconnect OAuth', priority: 1 });
    }

    if (!shopifyApiReachable && accessToken) {
      issues.push(`Shopify API unreachable: ${shopifyWebhookError}`);
    }

    if (ourWebhooks.length === 0) {
      issues.push('No app webhooks registered in Shopify — orders will not trigger');
      recommendedActions.push({ action: 'fix_webhooks', label: 'Register Webhooks', priority: 2 });
    } else if (missingTopics.length > 0) {
      issues.push(`Missing webhook topics: ${missingTopics.join(', ')}`);
      recommendedActions.push({ action: 'fix_webhooks', label: 'Re-register Webhooks', priority: 2 });
    }

    if (integration?.webhook_endpoints && Object.keys(integration.webhook_endpoints).length === 0 && ourWebhooks.length > 0) {
      issues.push('Webhooks exist in Shopify but not saved in DB — run fix_webhooks to resync');
      recommendedActions.push({ action: 'fix_webhooks', label: 'Sync Webhook Records', priority: 2 });
    }

    if (allOrders.length === 0) {
      issues.push('No orders in DB — run historical sync');
      recommendedActions.push({ action: 'fix_sync', label: 'Sync Now (365 days)', priority: 3, days: 365 });
    }

    if (queueDepth.dead_letter > 0) {
      issues.push(`${queueDepth.dead_letter} dead-letter jobs — processing failures`);
    }

    return Response.json({
      checked_at: new Date().toISOString(),
      shop_domain: normalized,
      tenant_id: tenantId,
      integration_id: integration?.id || null,
      integration_status: integration?.status || 'not_found',
      integration_store_name: integration?.store_name || null,

      oauth_token_present: !!token,
      oauth_token_valid: token?.is_valid || false,
      access_token_decryptable: !!accessToken,

      shopify_api_reachable: shopifyApiReachable,
      shopify_api_secret_env_set: !!Deno.env.get('SHOPIFY_API_SECRET'),
      expected_webhook_url: expectedWebhookUrl,

      our_webhooks_registered_in_shopify: ourWebhooks,
      our_webhooks_count: ourWebhooks.length,
      our_webhook_topics: ourTopics,
      missing_topics: missingTopics,
      platformintegration_webhooks_saved: Object.keys(integration?.webhook_endpoints || {}).length,
      shopify_webhook_list_error: shopifyWebhookError,

      orders_in_db_count: allOrders.length,
      latest_order_in_db: latestOrder ? {
        order_number: latestOrder.order_number,
        order_date: latestOrder.order_date,
        status: latestOrder.status,
        total_revenue: latestOrder.total_revenue
      } : null,

      last_sync_job: lastSyncJob ? {
        status: lastSyncJob.status,
        started_at: lastSyncJob.started_at,
        completed_at: lastSyncJob.completed_at,
        orders_synced: lastSyncJob.orders_synced
      } : null,

      queue_depth: queueDepth,

      issues_found: issues,
      recommended_actions: recommendedActions,
      overall_health: issues.length === 0 ? 'healthy' : issues.length <= 1 ? 'degraded' : 'critical'
    });

  } catch (error) {
    console.error('[diagnoseShopifyIngestion]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});