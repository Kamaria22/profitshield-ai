import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERSION = '2026-03-17.bootstrap-v1';

function json(data, status = 200) {
  return Response.json(data, { status });
}

function withEndpointGuard(name, handler) {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }
    try {
      const res = await handler(req);
      return res instanceof Response ? res : json({ error: `${name}_invalid_response` }, 500);
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return json({ ok: false, error: error?.message || String(error), version: VERSION }, 500);
    }
  };
}

async function safeInvoke(base44, name, payload) {
  try {
    const result = await base44.asServiceRole.functions.invoke(name, payload);
    return { ok: true, data: result?.data || result || null };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

Deno.serve(withEndpointGuard('shopifyActivationBootstrap', async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
  const source = typeof body.source === 'string' ? body.source.trim() : 'unknown';
  const syncDays = Math.max(1, Math.min(90, Number(body.days || 30) || 30));
  const force = body.force === true;

  if (!tenantId) {
    return json({ ok: false, error: 'tenant_id required', version: VERSION }, 400);
  }

  let requester = null;
  try { requester = await base44.auth.me(); } catch (_) {}
  const requesterRole = String(requester?.role || requester?.app_role || '').toLowerCase();
  const requesterTenant = String(requester?.tenant_id || '').trim();
  if (
    requester &&
    requesterRole !== 'owner' &&
    requesterRole !== 'admin' &&
    requesterTenant &&
    requesterTenant !== tenantId
  ) {
    return json({ ok: false, error: 'Forbidden tenant access', version: VERSION }, 403);
  }

  const [tenant, integrations, orders, pendingQueue] = await Promise.all([
    base44.asServiceRole.entities.Tenant.filter({ id: tenantId }).then((rows) => rows?.[0] || null).catch(() => null),
    base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' }).catch(() => []),
    base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 3).catch(() => []),
    base44.asServiceRole.entities.WebhookQueue.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 5).catch(() => []),
  ]);

  if (!tenant) {
    return json({ ok: false, error: 'Tenant not found', version: VERSION }, 404);
  }

  const integration = integrations.find((row) => row.status === 'connected' || row.status === 'degraded') || integrations[0] || null;
  if (!integration?.id) {
    return json({
      ok: true,
      skipped: true,
      reason: 'shopify_integration_missing',
      version: VERSION,
      source,
      tenant_id: tenantId
    });
  }

  const lastSyncMs = integration?.last_sync_at ? new Date(integration.last_sync_at).getTime() : 0;
  const syncIsFresh = lastSyncMs && (Date.now() - lastSyncMs < 2 * 60 * 1000);
  const hasOrders = Array.isArray(orders) && orders.length > 0;
  const shouldRunFullSync = force || !syncIsFresh || !hasOrders;
  const shouldRefreshWebhooks = force || !integration?.webhook_endpoints || Object.keys(integration.webhook_endpoints || {}).length < 7;

  const results = {
    version: VERSION,
    source,
    tenant_id: tenantId,
    integration_id: integration.id,
    shop_domain: integration.store_key || tenant.shop_domain || null,
    actions: {}
  };

  if (shouldRefreshWebhooks) {
    results.actions.registerShopifyWebhooks = await safeInvoke(base44, 'registerShopifyWebhooks', {
      integration_id: integration.id
    });
  } else {
    results.actions.registerShopifyWebhooks = { ok: true, skipped: true, reason: 'fresh_webhooks' };
  }

  if (shouldRunFullSync) {
    results.actions.syncShopifyOrders = await safeInvoke(base44, 'syncShopifyOrders', {
      tenant_id: tenantId,
      integration_id: integration.id,
      shop: integration.store_key || tenant.shop_domain || undefined,
      days: syncDays
    });
  } else {
    results.actions.syncShopifyOrders = { ok: true, skipped: true, reason: 'fresh_sync' };
  }

  if ((pendingQueue?.length || 0) > 0 || shouldRunFullSync || force) {
    results.actions.processWebhookQueue = await safeInvoke(base44, 'processWebhookQueue', { action: 'process' });
  } else {
    results.actions.processWebhookQueue = { ok: true, skipped: true, reason: 'queue_empty' };
  }

  results.actions.processShopifyDeferredJobs = await safeInvoke(base44, 'processShopifyDeferredJobs', { limit: 25 });

  const refreshed = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration.id }).then((rows) => rows?.[0] || integration).catch(() => integration);
  const latestOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 5).catch(() => orders || []);

  return json({
    ok: true,
    ...results,
    summary: {
      order_count_preview: latestOrders.length,
      last_sync_at: refreshed?.last_sync_at || integration?.last_sync_at || null,
      integration_status: refreshed?.status || integration?.status || null,
      webhook_count: Object.keys(refreshed?.webhook_endpoints || integration?.webhook_endpoints || {}).length
    }
  });
}));
