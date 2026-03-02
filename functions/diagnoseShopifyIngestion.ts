/**
 * ADMIN-ONLY: Diagnose Shopify order ingestion pipeline for a given shop.
 * Returns the full ingestion state: tenant, integration, token, webhooks, queue, orders.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) return null;
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { shop_domain } = await req.json();
    if (!shop_domain) {
      return Response.json({ error: 'shop_domain required' }, { status: 400 });
    }

    const db = base44.asServiceRole;
    const normalized = shop_domain.includes('.myshopify.com')
      ? shop_domain.toLowerCase()
      : `${shop_domain.toLowerCase()}.myshopify.com`;

    // ── 1. Tenant ──────────────────────────────────────────────────────────────
    const tenants = await db.entities.Tenant.filter({ shop_domain: normalized });
    const tenant = tenants[0] || null;
    const tenantId = tenant?.id || null;

    if (!tenant) {
      return Response.json({
        error: 'Tenant not found for this shop domain',
        shop_domain: normalized,
        checked_at: new Date().toISOString()
      }, { status: 404 });
    }

    // ── 2. Integration ─────────────────────────────────────────────────────────
    const integrations = await db.entities.PlatformIntegration.filter({
      tenant_id: tenantId,
      platform: 'shopify'
    });
    const integration = integrations[0] || null;

    // ── 3. OAuth Token ─────────────────────────────────────────────────────────
    const tokens = await db.entities.OAuthToken.filter({
      tenant_id: tenantId,
      platform: 'shopify'
    });
    const token = tokens[0] || null;
    let accessToken = null;
    if (token?.encrypted_access_token) {
      accessToken = await decryptToken(token.encrypted_access_token);
    }

    // ── 4. Shopify webhooks registered ─────────────────────────────────────────
    let shopifyWebhooks = [];
    let shopifyWebhookError = null;
    if (accessToken) {
      try {
        const whRes = await fetch(
          `https://${normalized}/admin/api/2024-01/webhooks.json`,
          { headers: { 'X-Shopify-Access-Token': accessToken } }
        );
        if (whRes.ok) {
          const whData = await whRes.json();
          shopifyWebhooks = (whData.webhooks || []).map(w => ({
            id: w.id,
            topic: w.topic,
            address: w.address,
            created_at: w.created_at,
            updated_at: w.updated_at,
            format: w.format
          }));
        } else {
          shopifyWebhookError = `HTTP ${whRes.status}: ${await whRes.text()}`;
        }
      } catch (e) {
        shopifyWebhookError = e.message;
      }
    }

    const appUrl = Deno.env.get('APP_URL') || '';
    const expectedWebhookUrl = `${appUrl}/api/functions/shopifyWebhook`;
    const ourWebhooks = shopifyWebhooks.filter(w => w.address === expectedWebhookUrl);
    const ourTopics = ourWebhooks.map(w => w.topic);

    // ── 5. WebhookQueue state ──────────────────────────────────────────────────
    const queueItems = await db.entities.WebhookQueue.filter({ tenant_id: tenantId }, '-created_date', 50);
    const queueDepth = {
      pending: queueItems.filter(j => j.status === 'pending').length,
      processing: queueItems.filter(j => j.status === 'processing').length,
      complete: queueItems.filter(j => j.status === 'complete').length,
      failed: queueItems.filter(j => j.status === 'failed').length,
      dead_letter: queueItems.filter(j => j.status === 'dead_letter').length
    };

    const failedJobs = queueItems.filter(j => j.status === 'failed' || j.status === 'dead_letter');
    const lastQueueError = failedJobs.length > 0 ? {
      job_id: failedJobs[0].id,
      event_type: failedJobs[0].event_type,
      status: failedJobs[0].status,
      retry_count: failedJobs[0].retry_count,
      error_message: failedJobs[0].error_message,
      last_attempt_at: failedJobs[0].last_attempt_at
    } : null;

    const lastWebhookReceived = queueItems.length > 0 ? queueItems[0].created_date : null;

    // ── 6. Orders in DB ────────────────────────────────────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const allOrders = await db.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 500);
    const recentOrders = allOrders.filter(o => o.order_date && new Date(o.order_date) >= new Date(thirtyDaysAgo));
    const latestOrder = allOrders[0] || null;

    // ── 7. SyncJob ─────────────────────────────────────────────────────────────
    const syncJobs = await db.entities.SyncJob.filter({ tenant_id: tenantId }, '-created_date', 1);
    const lastSyncJob = syncJobs[0] || null;

    // ── 8. Build diagnosis ─────────────────────────────────────────────────────
    const issues = [];

    if (integration?.status !== 'connected') issues.push('Integration status is not "connected"');
    if (!token || !token.is_valid) issues.push('OAuth token missing or invalid');
    if (!accessToken) issues.push('Failed to decrypt access token — store cannot be accessed');
    if (shopifyWebhookError) issues.push(`Cannot list Shopify webhooks: ${shopifyWebhookError}`);
    if (ourWebhooks.length === 0) issues.push('NO app-registered webhooks found in Shopify — orders/create will NOT trigger');
    else {
      const missing = ['orders/create', 'orders/updated', 'orders/paid'].filter(t => !ourTopics.includes(t));
      if (missing.length > 0) issues.push(`Missing critical webhook topics: ${missing.join(', ')}`);
    }
    if (recentOrders.length === 0 && allOrders.length === 0) issues.push('No orders in DB for this tenant at all — run Sync Now');
    if (queueDepth.dead_letter > 0) issues.push(`${queueDepth.dead_letter} dead-letter jobs in queue — processing failures`);

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
      webhook_secret_present: !!tenant.webhook_secret,
      shopify_api_secret_env_set: !!Deno.env.get('SHOPIFY_API_SECRET'),
      expected_webhook_url: expectedWebhookUrl,
      webhooks_registered_in_shopify: shopifyWebhooks,
      our_webhooks_count: ourWebhooks.length,
      our_webhook_topics: ourTopics,
      required_topics_covered: ['orders/create', 'orders/updated', 'orders/paid'].every(t => ourTopics.includes(t)),
      shopify_webhook_list_error: shopifyWebhookError,
      last_webhook_received_at: lastWebhookReceived,
      queue_depth: queueDepth,
      last_queue_error: lastQueueError,
      orders_in_db_count_all_time: allOrders.length,
      orders_in_db_count_last_30d: recentOrders.length,
      latest_order_in_db: latestOrder ? {
        id: latestOrder.id,
        platform_order_id: latestOrder.platform_order_id,
        order_number: latestOrder.order_number,
        order_date: latestOrder.order_date,
        status: latestOrder.status,
        total_revenue: latestOrder.total_revenue
      } : null,
      last_sync_job: lastSyncJob ? {
        id: lastSyncJob.id,
        status: lastSyncJob.status,
        started_at: lastSyncJob.started_at,
        completed_at: lastSyncJob.completed_at,
        orders_synced: lastSyncJob.orders_synced
      } : null,
      issues_found: issues,
      overall_health: issues.length === 0 ? 'healthy' : issues.length <= 1 ? 'degraded' : 'critical'
    });

  } catch (error) {
    console.error('[diagnoseShopifyIngestion]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});