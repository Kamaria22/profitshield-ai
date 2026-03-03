/**
 * diagnoseShopifyIngestion — real Shopify API health check + fix actions
 * Uses access_scopes as the authoritative API reachability test.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// CANONICAL CONFIG
const API_VERSION = '2024-10';
const REQUIRED_TOPICS = ['orders/create', 'orders/updated', 'orders/paid', 'refunds/create', 'app/uninstalled', 'products/update', 'orders/cancelled'];

function getCanonicalConfig() {
  const appUrl = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
  return {
    appUrl,
    apiVersion: API_VERSION,
    webhookEndpoint: `${appUrl}/api/functions/shopifyWebhook`
  };
}

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
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

async function registerWebhooks(shopDomain, accessToken, integrationId, webhookUrl, db) {
  // Delete existing webhooks pointing to any of our known endpoints to avoid duplicates
  const knownEndpoints = [
    webhookUrl,
    'https://profit-shield-ai.com/api/functions/shopifyWebhook',
    'https://profit-shield-ai.base44.app/api/functions/shopifyWebhook',
  ];
  try {
    const listRes = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    if (listRes.ok) {
      const { webhooks } = await listRes.json();
      for (const wh of (webhooks || [])) {
        if (knownEndpoints.some(ep => wh.address.startsWith(ep.split('/api/')[0]))) {
          await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks/${wh.id}.json`, {
            method: 'DELETE',
            headers: { 'X-Shopify-Access-Token': accessToken }
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.warn('[diagnose/registerWebhooks] Cleanup error:', e.message);
  }

  const registered = {};
  const errors = [];
  for (const topic of REQUIRED_TOPICS) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/webhooks.json`, {
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

    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const role = (user?.role || user?.app_role || '').toLowerCase();
    if (!user || (role !== 'admin' && role !== 'owner')) {
      return Response.json({ error: 'Admin/owner only' }, { status: 403 });
    }

    const body = await req.json();
    const { shop_domain, action, tenant_id: bodyTenantId, integration_id: bodyIntegrationId, days } = body;

    const db = base44.asServiceRole;

    // Resolve tenant
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

    // Canonical webhook URL derived from APP_URL
    const appUrl = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
    const expectedWebhookUrl = `${appUrl}/api/functions/shopifyWebhook`;

    // ── ACTION: fix_webhooks ──────────────────────────────────────────────────
    if (action === 'fix_webhooks') {
      if (!accessToken) return Response.json({ error: 'No valid access token — reconnect OAuth first' }, { status: 400 });
      if (!integration) return Response.json({ error: 'No integration record found' }, { status: 400 });

      // Verify API reachable before registering
      const scopeCheck = await fetch(`https://${normalized}/admin/oauth/access_scopes.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      if (!scopeCheck.ok) {
        // Invalidate token
        if (token?.id) {
          await db.entities.OAuthToken.update(token.id, { is_valid: false }).catch(() => {});
        }
        if (integration?.id) {
          await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
        }
        return Response.json({ error: `Shopify API returned ${scopeCheck.status} — token is invalid. Please reconnect OAuth.` }, { status: 400 });
      }

      const result = await registerWebhooks(normalized, accessToken, integration.id, expectedWebhookUrl, db);
      await db.entities.AuditLog.create({
        tenant_id: tenantId,
        action: 'fix_webhooks_triggered',
        entity_type: 'platform_integration',
        entity_id: integration.id,
        performed_by: user.email,
        description: `Manual webhook re-registration: ${Object.keys(result.registered).length} registered, ${result.errors.length} failed. URL: ${expectedWebhookUrl}`,
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

    // ── ACTION: fix_sync ─────────────────────────────────────────────────────
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

    // Use access_scopes as the REAL API reachability test (more reliable than webhooks list)
    let shopifyApiReachable = false;
    let shopifyApiStatusCode = null;
    let shopifyApiError = null;
    let grantedScopes = [];

    if (accessToken && normalized) {
      try {
        const scopeRes = await fetch(`https://${normalized}/admin/oauth/access_scopes.json`, {
          headers: { 'X-Shopify-Access-Token': accessToken }
        });
        shopifyApiStatusCode = scopeRes.status;
        if (scopeRes.ok) {
          shopifyApiReachable = true;
          const scopeData = await scopeRes.json();
          grantedScopes = (scopeData.access_scopes || []).map(s => s.handle);
        } else {
          shopifyApiError = `HTTP ${scopeRes.status}: ${await scopeRes.text()}`;
          // Auto-invalidate on 401
          if (scopeRes.status === 401) {
            if (token?.id) await db.entities.OAuthToken.update(token.id, { is_valid: false }).catch(() => {});
            if (integration?.id) await db.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
          }
        }
      } catch (e) {
        shopifyApiError = e.message;
      }
    }

    // Fetch webhooks from Shopify as source of truth (only if API reachable)
    let shopifyWebhooks = [];
    let shopifyWebhookFetchError = null;
    if (shopifyApiReachable) {
      try {
        const whRes = await fetch(`https://${normalized}/admin/api/${API_VERSION}/webhooks.json?limit=250`, {
          headers: { 'X-Shopify-Access-Token': accessToken }
        });
        if (whRes.ok) {
          const whData = await whRes.json();
          shopifyWebhooks = (whData.webhooks || []).map(w => ({ id: w.id, topic: w.topic, address: w.address }));
        } else {
          shopifyWebhookFetchError = `HTTP ${whRes.status}`;
        }
      } catch (e) {
        shopifyWebhookFetchError = e.message;
      }
    }

    const ourWebhooks = shopifyWebhooks.filter(w => w.address === expectedWebhookUrl);
    const ourTopics = ourWebhooks.map(w => w.topic);
    const missingTopics = REQUIRED_TOPICS.filter(t => !ourTopics.includes(t));

    // Orders + queue
    const allOrders = await db.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 500);
    const syncJobs = await db.entities.SyncJob.filter({ tenant_id: tenantId }, '-created_date', 5);
    const lastSyncJob = syncJobs[0] || null;
    const queueItems = await db.entities.WebhookQueue.filter({ tenant_id: tenantId }, '-created_date', 50);
    const queueDepth = {
      pending: queueItems.filter(j => j.status === 'pending').length,
      processing: queueItems.filter(j => j.status === 'processing').length,
      complete: queueItems.filter(j => j.status === 'complete').length,
      failed: queueItems.filter(j => j.status === 'failed').length,
      dead_letter: queueItems.filter(j => j.status === 'dead_letter').length
    };

    // Build issues list
    const issues = [];
    const recommendedActions = [];

    if (!token) {
      issues.push('OAuth token missing');
      recommendedActions.push({ action: 'reconnect_oauth', label: 'Reconnect OAuth', priority: 1 });
    } else if (!accessToken) {
      issues.push('OAuth token cannot be decrypted');
      recommendedActions.push({ action: 'reconnect_oauth', label: 'Reconnect OAuth', priority: 1 });
    } else if (!shopifyApiReachable) {
      issues.push(`Shopify API unreachable (${shopifyApiStatusCode || 'network error'}): token is invalid or revoked`);
      recommendedActions.push({ action: 'reconnect_oauth', label: 'Reconnect OAuth (token revoked)', priority: 1 });
    }

    if (shopifyApiReachable && ourWebhooks.length === 0) {
      issues.push('No app webhooks registered in Shopify — new orders will not trigger');
      recommendedActions.push({ action: 'fix_webhooks', label: 'Register Webhooks', priority: 2 });
    } else if (shopifyApiReachable && missingTopics.length > 0) {
      issues.push(`Missing webhook topics: ${missingTopics.join(', ')}`);
      recommendedActions.push({ action: 'fix_webhooks', label: 'Re-register Webhooks', priority: 2 });
    }

    if (allOrders.length === 0 && shopifyApiReachable) {
      issues.push('No orders in DB — run historical sync');
      recommendedActions.push({ action: 'fix_sync', label: 'Sync Now (365 days)', priority: 3, days: 365 });
    }

    if (queueDepth.dead_letter > 0) {
      issues.push(`${queueDepth.dead_letter} dead-letter jobs in queue`);
    }

    // Admin debug payload
    const apiKey = Deno.env.get('SHOPIFY_API_KEY') || '';
    const apiSecret = Deno.env.get('SHOPIFY_API_SECRET') || '';
    const tokenLastChars = accessToken ? `...${accessToken.slice(-6)}` : null;

    return Response.json({
      checked_at: new Date().toISOString(),
      shop_domain: normalized,
      tenant_id: tenantId,
      integration_id: integration?.id || null,
      integration_status: integration?.status || 'not_found',
      integration_store_name: integration?.store_name || null,

      oauth_token_present: !!token,
      oauth_token_valid: token?.is_valid !== false && !!token,
      access_token_decryptable: !!accessToken,

      // REAL API reachability via access_scopes — not webhooks list
      shopify_api_reachable: shopifyApiReachable,
      shopify_api_status_code: shopifyApiStatusCode,
      shopify_api_error: shopifyApiError,
      granted_scopes: grantedScopes,

      expected_webhook_url: expectedWebhookUrl,
      api_version: API_VERSION,

      // Webhooks from Shopify as source of truth
      our_webhooks_count: ourWebhooks.length,
      our_webhook_topics: ourTopics,
      missing_topics: missingTopics,
      shopify_webhooks_total: shopifyWebhooks.length,
      platformintegration_webhooks_saved: Object.keys(integration?.webhook_endpoints || {}).length,
      shopify_webhook_fetch_error: shopifyWebhookFetchError,

      orders_in_db_count: allOrders.length,
      latest_order_in_db: allOrders[0] ? {
        order_number: allOrders[0].order_number,
        order_date: allOrders[0].order_date,
        status: allOrders[0].status,
        total_revenue: allOrders[0].total_revenue
      } : null,

      last_sync_job: lastSyncJob ? {
        status: lastSyncJob.status,
        started_at: lastSyncJob.started_at,
        completed_at: lastSyncJob.completed_at,
        orders_synced: lastSyncJob.orders_synced
      } : null,

      queue_depth: queueDepth,

      // Admin-only debug info
      debug: {
        env_api_key_present: !!apiKey,
        env_api_secret_present: !!apiSecret,
        env_api_key_last6: apiKey ? `...${apiKey.slice(-6)}` : null,
        token_last6: tokenLastChars,
        app_url_env: Deno.env.get('APP_URL') || '(not set)',
        webhook_endpoint_in_use: expectedWebhookUrl,
        api_version: API_VERSION,
      },

      issues_found: issues,
      recommended_actions: recommendedActions,
      overall_health: issues.length === 0 ? 'healthy' : issues.length <= 1 ? 'degraded' : 'critical'
    });

  } catch (error) {
    console.error('[diagnoseShopifyIngestion]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});