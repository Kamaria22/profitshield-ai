// redeploy trigger: rewritten shopifyActivationBootstrap runtime for Base44 republish
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { rebuildProjectedCustomersFromOrders } from '../helpers/customerProjection/entry.ts';

const VERSION = '2026-03-24.bootstrap-v5';

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
      return res instanceof Response ? res : json({ error: `${name}_invalid_response`, version: VERSION }, 500);
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return json({ ok: false, error: error?.message || String(error), version: VERSION }, 500);
    }
  };
}

function isMissingFunctionDeployment(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('deployment does not exist') || message.includes('backend function') || message.includes('not found') || message.includes('404');
}

async function safeInvoke(base44, name, payload) {
  try {
    const result = await base44.asServiceRole.functions.invoke(name, payload);
    return { ok: true, data: result?.data || result || null, fallback_used: false };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      missing_deployment: isMissingFunctionDeployment(error),
      fallback_used: false,
    };
  }
}

async function repairProjectedCustomers(base44, tenantId, integrationId, shopDomain) {
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 5).catch(() => []);
  const customers = await base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 5).catch(() => []);
  if (!orders.length || customers.length > 0) {
    return { ok: true, skipped: true, reason: orders.length ? 'customers_present' : 'orders_missing' };
  }

  const repaired = await rebuildProjectedCustomersFromOrders(base44.asServiceRole, tenantId, 500);
  const refreshedCustomers = await base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 5).catch(() => []);
  const repairedOk = refreshedCustomers.length > 0;

  if (repairedOk && integrationId) {
    const alerts = await base44.asServiceRole.entities.Alert.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 25).catch(() => []);
    await Promise.all(alerts.filter((alert) => String(alert?.title || '').includes('Customer Data Projection Active')).map((alert) =>
      base44.asServiceRole.entities.Alert.update(alert.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: 'Resolved automatically by shopifyActivationBootstrap projection repair.'
      }).catch(() => {})
    ));
    await base44.asServiceRole.entities.PlatformIntegration.update(integrationId, {
      metadata: {
        customer_projection_gap_count: 0,
        customer_projection_repaired_at: new Date().toISOString(),
        customer_projection_repaired_by: 'shopifyActivationBootstrap',
        customer_projection_shop_domain: shopDomain || null
      }
    }).catch(() => {});
  }

  return {
    ok: repairedOk,
    repaired: repairedOk,
    projected: repaired?.projected || 0,
    created: repaired?.created || 0,
    updated: repaired?.updated || 0,
    customer_count: refreshedCustomers.length,
  };
}

const handler = withEndpointGuard('shopifyActivationBootstrap', async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body?.tenant_id || '').trim();
  const source = String(body?.source || 'unknown').trim();
  const syncDays = Math.max(1, Math.min(90, Number(body?.days || 30) || 30));
  const force = body?.force === true;

  if (!tenantId) return json({ ok: false, error: 'tenant_id required', version: VERSION }, 400);

  let requester = null;
  try { requester = await base44.auth.me(); } catch (_) {}
  const requesterRole = String(requester?.role || requester?.app_role || '').toLowerCase();
  const requesterTenant = String(requester?.tenant_id || '').trim();
  if (requester && requesterRole !== 'owner' && requesterRole !== 'admin' && requesterTenant && requesterTenant !== tenantId) {
    return json({ ok: false, error: 'Forbidden tenant access', version: VERSION }, 403);
  }

  const [tenant, integrations, orders, pendingQueue] = await Promise.all([
    base44.asServiceRole.entities.Tenant.filter({ id: tenantId }).then((rows) => rows?.[0] || null).catch(() => null),
    base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' }).catch(() => []),
    base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 3).catch(() => []),
    base44.asServiceRole.entities.WebhookQueue.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 5).catch(() => []),
  ]);

  if (!tenant) return json({ ok: false, error: 'Tenant not found', version: VERSION }, 404);
  if (!tenant.onboarding_completed) {
    return json({ ok: true, skipped: true, reason: 'onboarding_incomplete', version: VERSION, source, tenant_id: tenantId });
  }

  const integration = integrations.find((row) => row.status === 'connected' || row.status === 'degraded') || integrations[0] || null;
  if (!integration?.id) {
    return json({ ok: true, skipped: true, reason: 'shopify_integration_missing', version: VERSION, source, tenant_id: tenantId });
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

  results.actions.registerShopifyWebhooks = shouldRefreshWebhooks
    ? await safeInvoke(base44, 'registerShopifyWebhooks', { integration_id: integration.id })
    : { ok: true, skipped: true, reason: 'fresh_webhooks', fallback_used: false };

  results.actions.syncShopifyOrders = shouldRunFullSync
    ? await safeInvoke(base44, 'syncShopifyOrders', {
        tenant_id: tenantId,
        integration_id: integration.id,
        shop: integration.store_key || tenant.shop_domain || undefined,
        days: syncDays
      })
    : { ok: true, skipped: true, reason: 'fresh_sync', fallback_used: false };

  results.actions.processWebhookQueue = ((pendingQueue?.length || 0) > 0 || shouldRunFullSync || force)
    ? await safeInvoke(base44, 'processWebhookQueue', { action: 'process' })
    : { ok: true, skipped: true, reason: 'queue_empty', fallback_used: false };

  results.actions.processShopifyDeferredJobs = await safeInvoke(base44, 'processShopifyDeferredJobs', { limit: 25 });
  results.actions.customerProjectionRepair = await repairProjectedCustomers(base44, tenantId, integration.id, integration.store_key || tenant.shop_domain || null);

  const refreshed = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration.id }).then((rows) => rows?.[0] || integration).catch(() => integration);
  const latestOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 5).catch(() => orders || []);
  const customers = await base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 5).catch(() => []);

  return json({
    ok: true,
    ...results,
    deployment_hint: 'rewritten-bootstrap-runtime',
    summary: {
      order_count_preview: latestOrders.length,
      customer_count_preview: customers.length,
      last_sync_at: refreshed?.last_sync_at || integration?.last_sync_at || null,
      integration_status: refreshed?.status || integration?.status || null,
      webhook_count: Object.keys(refreshed?.webhook_endpoints || integration?.webhook_endpoints || {}).length
    }
  });
});

Deno.serve(handler);
