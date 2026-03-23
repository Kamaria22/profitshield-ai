import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { rebuildProjectedCustomersFromOrders } from './helpers/customerProjection.ts';

const VERSION = '2026-03-24.bootstrap-v2';
const API_VERSION = '2024-10';
const INLINE_QUEUE_LIMIT = 20;

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

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    try { return atob(encryptedToken); } catch { return null; }
  }
  try {
    const combined = Uint8Array.from(atob(encryptedToken), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    try { return atob(encryptedToken); } catch { return null; }
  }
}

async function shopifyFetchWithRetry(url, accessToken, init = {}, maxAttempts = 4) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    const res = await fetch(url, {
      ...init,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
        ...(init.headers || {})
      }
    });
    if (res.status !== 429 && res.status < 500) return res;
    const retryAfter = Number(res.headers.get('Retry-After') || '0');
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 400 * Math.pow(2, attempt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt++;
  }
  return fetch(url, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

function mapOrderStatus(order) {
  if (order?.cancelled_at) return 'cancelled';
  if (order?.refunds?.length > 0) {
    const refundTotal = order.refunds.reduce((sum, refund) =>
      sum + (refund.transactions || []).reduce((inner, txn) => inner + (parseFloat(txn.amount || 0) || 0), 0), 0);
    if (refundTotal >= (parseFloat(order.total_price || 0) || 0)) return 'refunded';
    return 'partially_refunded';
  }
  if (order?.fulfillment_status === 'fulfilled') return 'fulfilled';
  if (order?.financial_status === 'paid' || order?.financial_status === 'partially_paid') return 'paid';
  return 'pending';
}

function normalizeQueueJob(job) {
  const topic = String(job?.event_type || job?.topic || '').trim();
  let payload = job?.payload ?? null;
  if (typeof payload === 'string') {
    payload = JSON.parse(payload);
  }
  if (!topic || !payload || typeof payload !== 'object') {
    throw new Error('invalid webhook payload');
  }
  return {
    ...job,
    event_type: topic,
    payload,
    retry_count: Number(job?.retry_count ?? job?.attempts ?? 0) || 0,
  };
}

async function resolveShopifyAccess(base44, tenantId, integration, tenant) {
  let tokens = await base44.asServiceRole.entities.OAuthToken.filter({
    tenant_id: tenantId,
    platform: 'shopify',
    is_valid: true
  }).catch(() => []);
  if (!tokens.length) {
    tokens = await base44.asServiceRole.entities.OAuthToken.filter({
      tenant_id: tenantId,
      platform: 'shopify'
    }).catch(() => []);
  }
  if (!tokens.length) {
    return { ok: false, error: 'No Shopify token found. Please reconnect your store.' };
  }
  const accessToken = await decryptToken(tokens[0]?.encrypted_access_token);
  if (!accessToken) {
    return { ok: false, error: 'Failed to decrypt Shopify token. Please reconnect your store.' };
  }
  const shopDomain = integration?.store_key || tenant?.shop_domain || null;
  if (!shopDomain) {
    return { ok: false, error: 'Missing Shopify shop domain for tenant.' };
  }
  return { ok: true, accessToken, shopDomain, tokenId: tokens[0]?.id || null };
}

function buildOrderRecord(tenantId, integrationId, shopDomain, order) {
  return {
    tenant_id: tenantId,
    integration_id: integrationId,
    shop_domain: shopDomain,
    platform_order_id: String(order?.id || ''),
    order_number: String(order?.order_number || order?.name || order?.id || ''),
    customer_email: order?.email || order?.customer?.email || null,
    customer_name: order?.customer?.first_name
      ? `${order.customer.first_name} ${order?.customer?.last_name || ''}`.trim()
      : order?.shipping_address?.name || null,
    order_date: order?.created_at || new Date().toISOString(),
    processed_at: order?.processed_at || order?.created_at || new Date().toISOString(),
    financial_status: order?.financial_status || null,
    fulfillment_status: order?.fulfillment_status || 'unfulfilled',
    status: mapOrderStatus(order),
    billing_address: order?.billing_address || null,
    shipping_address: order?.shipping_address || null,
    discount_codes: Array.isArray(order?.discount_codes) ? order.discount_codes.map((item) => item?.code).filter(Boolean) : [],
    is_first_order: !order?.customer || Number(order?.customer?.orders_count || 0) <= 1,
    is_demo: false,
    total_revenue: Number(order?.total_price || 0) || 0,
    platform_data: order,
  };
}

async function upsertOrderRecord(base44, tenantId, integrationId, shopDomain, order) {
  const platformOrderId = String(order?.id || '').trim();
  if (!platformOrderId) return { created: 0, updated: 0 };
  const existing = await base44.asServiceRole.entities.Order.filter({
    tenant_id: tenantId,
    platform_order_id: platformOrderId
  }, '-created_date', 1).catch(() => []);
  const record = buildOrderRecord(tenantId, integrationId, shopDomain, order);
  if (existing[0]?.id) {
    await base44.asServiceRole.entities.Order.update(existing[0].id, record);
    return { created: 0, updated: 1 };
  }
  await base44.asServiceRole.entities.Order.create(record);
  return { created: 1, updated: 0 };
}

async function runInlineOrderSyncFallback(base44, tenant, integration, days) {
  const resolved = await resolveShopifyAccess(base44, tenant.id, integration, tenant);
  if (!resolved.ok) return { ok: false, error: resolved.error, fallback_used: true };

  const sinceDate = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://${resolved.shopDomain}/admin/api/${API_VERSION}/orders.json?status=any&limit=100&created_at_min=${sinceDate}&order=created_at+desc`;
  const scopeCheck = await shopifyFetchWithRetry(`https://${resolved.shopDomain}/admin/oauth/access_scopes.json`, resolved.accessToken, {}, 3);
  if (!scopeCheck.ok) {
    if (resolved.tokenId) {
      await base44.asServiceRole.entities.OAuthToken.update(resolved.tokenId, { is_valid: false }).catch(() => {});
    }
    await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
    return { ok: false, error: `Shopify API returned ${scopeCheck.status}. Please reconnect your store.`, fallback_used: true };
  }

  const response = await shopifyFetchWithRetry(url, resolved.accessToken, {}, 4);
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    return { ok: false, error: `Shopify API error ${response.status}${errorText ? `: ${errorText}` : ''}`, fallback_used: true };
  }

  const payload = await response.json().catch(() => ({}));
  const orders = Array.isArray(payload?.orders) ? payload.orders : [];
  let created = 0;
  let updated = 0;

  for (const order of orders) {
    const counts = await upsertOrderRecord(base44, tenant.id, integration.id, resolved.shopDomain, order);
    created += counts.created;
    updated += counts.updated;
  }

  const syncedAt = new Date().toISOString();
  await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
    status: 'connected',
    last_sync_at: syncedAt,
    last_sync_status: 'success',
    last_sync_stats: {
      orders_synced: orders.length,
      orders_created: created,
      orders_updated: updated,
      inline_fallback: true,
      errors_count: 0
    }
  }).catch(() => {});

  return {
    ok: true,
    fallback_used: true,
    data: {
      success: true,
      fetchedCount: orders.length,
      createdCount: created,
      updatedCount: updated,
      syncedAt,
      inline_fallback: true
    }
  };
}

async function processRefundRecord(base44, tenantId, payload) {
  const refundId = String(payload?.id || '').trim();
  const platformOrderId = String(payload?.order_id || '').trim();
  if (!refundId || !platformOrderId) return;

  const existingRefunds = await base44.asServiceRole.entities.Refund.filter({
    tenant_id: tenantId,
    platform_refund_id: refundId
  }, '-created_date', 1).catch(() => []);
  if (!existingRefunds.length) {
    const amount = (payload?.transactions || []).reduce((sum, txn) => sum + (parseFloat(txn?.amount || 0) || 0), 0);
    await base44.asServiceRole.entities.Refund.create({
      tenant_id: tenantId,
      order_id: platformOrderId,
      platform_refund_id: refundId,
      amount,
      reason: payload?.note || 'No reason provided',
      refunded_at: payload?.created_at || new Date().toISOString()
    }).catch(() => {});
  }

  const orders = await base44.asServiceRole.entities.Order.filter({
    tenant_id: tenantId,
    platform_order_id: platformOrderId
  }, '-created_date', 1).catch(() => []);
  if (orders[0]?.id) {
    const amount = (payload?.transactions || []).reduce((sum, txn) => sum + (parseFloat(txn?.amount || 0) || 0), 0);
    const refundAmount = (Number(orders[0]?.refund_amount || 0) || 0) + amount;
    await base44.asServiceRole.entities.Order.update(orders[0].id, {
      refund_amount: refundAmount,
      status: refundAmount >= (Number(orders[0]?.total_revenue || 0) || 0) ? 'refunded' : 'partially_refunded'
    }).catch(() => {});
  }
}

async function processInlineQueueFallback(base44, tenantId) {
  const now = new Date();
  const pending = await base44.asServiceRole.entities.WebhookQueue.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', INLINE_QUEUE_LIMIT).catch(() => []);
  const retryable = await base44.asServiceRole.entities.WebhookQueue.filter({ tenant_id: tenantId, status: 'failed' }, 'next_attempt_at', INLINE_QUEUE_LIMIT).catch(() => []);
  const jobs = [
    ...pending,
    ...retryable.filter((job) => !job?.next_attempt_at || new Date(job.next_attempt_at) <= now),
  ].slice(0, INLINE_QUEUE_LIMIT);

  if (!jobs.length) {
    return { ok: true, fallback_used: true, data: { processed: 0, failed: 0, dead_lettered: 0, total_jobs: 0, inline_fallback: true } };
  }

  const stats = { processed: 0, failed: 0, dead_lettered: 0, total_jobs: jobs.length, inline_fallback: true };
  for (const job of jobs) {
    try {
      const normalized = normalizeQueueJob(job);
      const topic = normalized.event_type;
      const payload = normalized.payload;
      await base44.asServiceRole.entities.WebhookQueue.update(job.id, {
        status: 'processing',
        last_attempt_at: new Date().toISOString()
      }).catch(() => {});

      if (topic === 'orders/create' || topic === 'orders/updated' || topic === 'orders/paid') {
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: normalized.tenant_id }, '-created_date', 1).catch(() => []);
        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: normalized.tenant_id, platform: 'shopify' }, '-created_date', 1).catch(() => []);
        await upsertOrderRecord(base44, normalized.tenant_id, integrations[0]?.id || null, integrations[0]?.store_key || tenants[0]?.shop_domain || null, payload);
      } else if (topic === 'refunds/create') {
        await processRefundRecord(base44, normalized.tenant_id, payload);
      } else if (topic === 'orders/cancelled') {
        const existing = await base44.asServiceRole.entities.Order.filter({
          tenant_id: normalized.tenant_id,
          platform_order_id: String(payload?.id || '')
        }, '-created_date', 1).catch(() => []);
        if (existing[0]?.id) {
          await base44.asServiceRole.entities.Order.update(existing[0].id, {
            status: 'cancelled',
            fulfillment_status: payload?.fulfillment_status || existing[0]?.fulfillment_status || 'unfulfilled',
            cancelled_at: payload?.cancelled_at || new Date().toISOString(),
            cancel_reason: payload?.cancel_reason || null
          }).catch(() => {});
        }
      } else if (topic === 'products/update') {
        const productId = String(payload?.id || '').trim();
        if (productId) {
          const existingProducts = await base44.asServiceRole.entities.Product.filter({
            tenant_id: normalized.tenant_id,
            platform_product_id: productId
          }, '-created_date', 1).catch(() => []);
          const record = {
            tenant_id: normalized.tenant_id,
            platform_product_id: productId,
            title: payload?.title || null,
            handle: payload?.handle || null,
            product_type: payload?.product_type || null,
            vendor: payload?.vendor || null,
            status: payload?.status || 'active',
            tags: typeof payload?.tags === 'string' ? payload.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : (payload?.tags || []),
            variants: Array.isArray(payload?.variants) ? payload.variants.map((variant) => ({
              variant_id: variant?.id ? String(variant.id) : null,
              title: variant?.title || null,
              sku: variant?.sku || null,
              price: Number(variant?.price || 0) || 0,
              inventory_quantity: variant?.inventory_quantity ?? null,
            })) : [],
            images: Array.isArray(payload?.images) ? payload.images.map((image) => image?.src).filter(Boolean) : [],
            updated_at_platform: payload?.updated_at || null
          };
          if (existingProducts[0]?.id) {
            await base44.asServiceRole.entities.Product.update(existingProducts[0].id, record).catch(() => {});
          } else {
            await base44.asServiceRole.entities.Product.create(record).catch(() => {});
          }
        }
      }

      await base44.asServiceRole.entities.WebhookQueue.update(job.id, {
        status: 'complete',
        processed_at: new Date().toISOString()
      }).catch(() => {});
      stats.processed++;
    } catch (error) {
      const retries = (Number(job?.retry_count ?? job?.attempts ?? 0) || 0) + 1;
      const deadLetter = retries >= 5;
      await base44.asServiceRole.entities.WebhookQueue.update(job.id, {
        status: deadLetter ? 'dead_letter' : 'failed',
        retry_count: retries,
        attempts: retries,
        error_message: String(error?.message || error || 'inline_queue_fallback_failed'),
        last_attempt_at: new Date().toISOString(),
        next_attempt_at: deadLetter ? null : new Date(Date.now() + 30000 * Math.pow(2, retries - 1)).toISOString()
      }).catch(() => {});
      if (deadLetter) stats.dead_lettered++;
      else stats.failed++;
    }
  }

  return { ok: true, fallback_used: true, data: stats };
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
    const alerts = await base44.asServiceRole.entities.Alert.filter({
      tenant_id: tenantId,
      type: 'system',
      entity_type: 'platform_integration',
      entity_id: integrationId,
      status: 'pending'
    }, '-created_date', 25).catch(() => []);
    for (const alert of alerts) {
      if (String(alert?.title || '').includes('Customer Data Projection Active')) {
        await base44.asServiceRole.entities.Alert.update(alert.id, {
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Resolved automatically by shopifyActivationBootstrap projection repair.'
        }).catch(() => {});
      }
    }
    const integrationRows = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integrationId }, '-created_date', 1).catch(() => []);
    const current = integrationRows[0] || null;
    if (current) {
      await base44.asServiceRole.entities.PlatformIntegration.update(integrationId, {
        metadata: {
          ...(current.metadata || {}),
          customer_projection_gap_count: 0,
          customer_projection_gap_last_seen_at: null,
          customer_projection_repaired_at: new Date().toISOString(),
          customer_projection_repaired_by: 'shopifyActivationBootstrap',
          customer_projection_shop_domain: shopDomain || null
        }
      }).catch(() => {});
    }
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

  if (!tenant.onboarding_completed) {
    return json({
      ok: true,
      skipped: true,
      reason: 'onboarding_incomplete',
      version: VERSION,
      source,
      tenant_id: tenantId
    });
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

  const webhookResult = shouldRefreshWebhooks
    ? await safeInvoke(base44, 'registerShopifyWebhooks', { integration_id: integration.id })
    : { ok: true, skipped: true, reason: 'fresh_webhooks', fallback_used: false };
  results.actions.registerShopifyWebhooks = webhookResult;

  let syncResult = shouldRunFullSync
    ? await safeInvoke(base44, 'syncShopifyOrders', {
        tenant_id: tenantId,
        integration_id: integration.id,
        shop: integration.store_key || tenant.shop_domain || undefined,
        days: syncDays
      })
    : { ok: true, skipped: true, reason: 'fresh_sync', fallback_used: false };
  if (shouldRunFullSync && !syncResult.ok && syncResult.missing_deployment) {
    syncResult = await runInlineOrderSyncFallback(base44, tenant, integration, syncDays);
  }
  results.actions.syncShopifyOrders = syncResult;

  let queueResult = ((pendingQueue?.length || 0) > 0 || shouldRunFullSync || force)
    ? await safeInvoke(base44, 'processWebhookQueue', { action: 'process' })
    : { ok: true, skipped: true, reason: 'queue_empty', fallback_used: false };
  if (((pendingQueue?.length || 0) > 0 || shouldRunFullSync || force) && !queueResult.ok && queueResult.missing_deployment) {
    queueResult = await processInlineQueueFallback(base44, tenantId);
  }
  results.actions.processWebhookQueue = queueResult;

  results.actions.processShopifyDeferredJobs = await safeInvoke(base44, 'processShopifyDeferredJobs', { limit: 25 });
  results.actions.customerProjectionRepair = await repairProjectedCustomers(base44, tenantId, integration.id, integration.store_key || tenant.shop_domain || null);

  const refreshed = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration.id }).then((rows) => rows?.[0] || integration).catch(() => integration);
  const latestOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 5).catch(() => orders || []);
  const customers = await base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 5).catch(() => []);

  return json({
    ok: true,
    ...results,
    summary: {
      order_count_preview: latestOrders.length,
      customer_count_preview: customers.length,
      last_sync_at: refreshed?.last_sync_at || integration?.last_sync_at || null,
      integration_status: refreshed?.status || integration?.status || null,
      webhook_count: Object.keys(refreshed?.webhook_endpoints || integration?.webhook_endpoints || {}).length
    }
  });
}));
