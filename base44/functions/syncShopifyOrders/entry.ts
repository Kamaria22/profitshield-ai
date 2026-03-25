// redeploy trigger: rewritten syncShopifyOrders runtime for Base44 republish
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { upsertProjectedCustomer } from '../helpers/customerProjection/entry.ts';

const VERSION = '2026-03-24.sync-orders-rewrite-v1';
const API_VERSION = '2024-10';

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
      return json({ error: 'internal_error', endpoint: name, message: error?.message || String(error), version: VERSION }, 500);
    }
  };
}

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  try {
    const combined = Uint8Array.from(atob(encryptedToken), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode((key || '').padEnd(32, '0').slice(0, 32));
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
  if (order?.refunds?.length > 0) return 'refunded';
  if (order?.fulfillment_status === 'fulfilled') return 'fulfilled';
  if (order?.financial_status === 'paid' || order?.financial_status === 'partially_paid') return 'paid';
  return 'pending';
}

const handler = withEndpointGuard('syncShopifyOrders', async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body?.tenant_id || '').trim();
  const integrationId = String(body?.integration_id || '').trim();
  const requestedShop = String(body?.shop || '').trim().toLowerCase();
  const days = Math.max(1, Math.min(365, Number(body?.days || 30) || 30));

  if (!tenantId) return json({ error: 'Missing tenant_id', version: VERSION }, 400);

  let requester = null;
  try { requester = await base44.auth.me(); } catch (_) {}
  const requesterRole = String(requester?.role || requester?.app_role || '').toLowerCase();
  const requesterTenant = String(requester?.tenant_id || '').trim();
  if (requester && requesterRole !== 'owner' && requesterRole !== 'admin' && requesterTenant && requesterTenant !== tenantId) {
    return json({ error: 'Forbidden tenant access', version: VERSION }, 403);
  }

  const tenant = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId }).then((rows) => rows?.[0] || null).catch(() => null);
  if (!tenant) return json({ error: 'Tenant not found', version: VERSION }, 404);

  const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' }).catch(() => []);
  const integration = integrations.find((row) => row.id === integrationId) || integrations[0] || null;
  if (!integration) return json({ error: 'Shopify integration not found', version: VERSION }, 404);

  const shopDomain = integration.store_key || tenant.shop_domain || null;
  if (!shopDomain) return json({ error: 'Missing Shopify shop domain', version: VERSION }, 400);
  if (requestedShop && requestedShop !== shopDomain.toLowerCase()) {
    return json({ error: 'Shop mismatch for tenant integration', version: VERSION }, 403);
  }

  let tokens = await base44.asServiceRole.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify', is_valid: true }).catch(() => []);
  if (!tokens.length) {
    tokens = await base44.asServiceRole.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify' }).catch(() => []);
  }
  if (!tokens.length) return json({ error: 'No Shopify token found. Please reconnect your store.', version: VERSION }, 400);

  const accessToken = await decryptToken(tokens[0]?.encrypted_access_token);
  if (!accessToken) return json({ error: 'Failed to decrypt access token. Please reconnect your store.', version: VERSION }, 500);

  const scopeCheck = await shopifyFetchWithRetry(`https://${shopDomain}/admin/oauth/access_scopes.json`, accessToken, {}, 3);
  if (!scopeCheck.ok) {
    await base44.asServiceRole.entities.OAuthToken.update(tokens[0].id, { is_valid: false }).catch(() => {});
    await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, { status: 'disconnected' }).catch(() => {});
    return json({ error: `Shopify API returned ${scopeCheck.status}. Please reconnect OAuth.`, version: VERSION }, 400);
  }

  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let pageUrl = `https://${shopDomain}/admin/api/${API_VERSION}/orders.json?status=any&limit=250&created_at_min=${sinceDate}&order=created_at+desc`;
  let pageCount = 0;
  let allOrders = [];

  while (pageUrl && pageCount < 10) {
    const response = await shopifyFetchWithRetry(pageUrl, accessToken, {}, 4);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return json({ error: `Shopify API error ${response.status}${text ? `: ${text}` : ''}`, version: VERSION }, response.status === 429 ? 429 : 500);
    }
    const payload = await response.json().catch(() => ({}));
    const pageOrders = Array.isArray(payload?.orders) ? payload.orders : [];
    allOrders = allOrders.concat(pageOrders);
    const linkHeader = response.headers.get('link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    pageUrl = nextMatch ? nextMatch[1] : null;
    pageCount++;
  }

  let created = 0;
  let updated = 0;
  for (const order of allOrders) {
    const platformOrderId = String(order?.id || '').trim();
    if (!platformOrderId) continue;
    const record = {
      tenant_id: tenantId,
      integration_id: integration.id,
      shop_domain: shopDomain,
      platform_order_id: platformOrderId,
      order_number: String(order?.order_number || order?.name || platformOrderId),
      customer_email: order?.email || order?.customer?.email || null,
      customer_name: order?.customer?.first_name ? `${order.customer.first_name} ${order?.customer?.last_name || ''}`.trim() : order?.shipping_address?.name || null,
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
      platform_data: order
    };
    const existing = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId, platform_order_id: platformOrderId }, '-created_date', 1).catch(() => []);
    if (existing[0]?.id) {
      const saved = await base44.asServiceRole.entities.Order.update(existing[0].id, record);
      await upsertProjectedCustomer(base44.asServiceRole, tenantId, { ...saved, ...record }).catch(() => {});
      updated++;
    } else {
      const saved = await base44.asServiceRole.entities.Order.create(record);
      await upsertProjectedCustomer(base44.asServiceRole, tenantId, { ...saved, ...record }).catch(() => {});
      created++;
    }
  }

  const syncedAt = new Date().toISOString();
  await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
    status: 'connected',
    last_sync_at: syncedAt,
    last_sync_status: 'success',
    last_sync_stats: {
      orders_synced: allOrders.length,
      orders_created: created,
      orders_updated: updated,
      errors_count: 0,
      version: VERSION
    }
  }).catch(() => {});

  return json({
    success: true,
    version: VERSION,
    tenantId,
    integrationId: integration.id,
    shopDomain,
    fetchedCount: allOrders.length,
    createdCount: created,
    updatedCount: updated,
    syncedAt,
    created,
    updated,
    total: allOrders.length
  });
});

Deno.serve(handler);
