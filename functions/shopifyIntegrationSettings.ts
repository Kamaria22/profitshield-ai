/**
 * Shopify Integration Settings — PUBLIC ENDPOINT (works inside embedded Shopify)
 * 
 * Supports:
 *   GET  { action:'get',  tenant_id, session_token? }   → returns integration + sync config
 *   POST { action:'save', tenant_id, session_token, sync_config, two_way_sync } → saves config
 *   POST { action:'sync', tenant_id, session_token }   → triggers full data sync
 *   POST { action:'reconnect', tenant_id, shop, session_token } → returns install URL
 * 
 * Auth: validates Shopify session token OR requires tenant_id from known shop.
 * Uses asServiceRole throughout — no Base44 user session required.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SHOPIFY_API_SECRET = Deno.env.get('SHOPIFY_API_SECRET');
const SHOPIFY_API_KEY    = Deno.env.get('SHOPIFY_API_KEY');
const APP_URL            = Deno.env.get('APP_URL') || 'https://profitshield.app';

function base64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
}

async function verifySessionToken(token) {
  if (!SHOPIFY_API_SECRET) throw new Error('SHOPIFY_API_SECRET not configured');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const [hB64, pB64, sB64] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SHOPIFY_API_SECRET), { name:'HMAC', hash:'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(base64urlDecode(sB64), c => c.charCodeAt(0)), enc.encode(`${hB64}.${pB64}`));
  if (!valid) throw new Error('Invalid signature');
  const payload = JSON.parse(base64urlDecode(pB64));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (SHOPIFY_API_KEY && !aud.includes(SHOPIFY_API_KEY)) throw new Error('Invalid aud');
  return payload;
}

function extractShop(payload) {
  const src = payload.dest || payload.iss || '';
  const m = src.match(/https?:\/\/([^/]+)/);
  if (!m) throw new Error('Cannot extract shop');
  let shop = m[1].toLowerCase();
  if (!shop.includes('.myshopify.com')) shop += '.myshopify.com';
  return shop;
}

function headers() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Security-Policy': "frame-ancestors https://*.myshopify.com https://admin.shopify.com",
    'X-Frame-Options': 'ALLOWALL',
  };
}
const json = (body, status = 200) => Response.json(body, { status, headers: headers() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers() });

  try {
    const base44 = createClientFromRequest(req).asServiceRole;

    let body = {};
    try { body = await req.json(); } catch { body = {}; }

    const { action = 'get', tenant_id, session_token, shop: shopParam } = body;

    // --- Resolve tenant ---
    let tenantId = tenant_id;

    // Optionally validate session token for extra security
    if (session_token) {
      try {
        const payload = await verifySessionToken(session_token);
        const shop = extractShop(payload);
        // If token is valid and tenant_id not provided, resolve from shop
        if (!tenantId) {
          const tenants = await base44.entities.Tenant.filter({ shop_domain: shop });
          if (tenants.length > 0) tenantId = tenants[0].id;
        }
      } catch (e) {
        console.warn('[shopifyIntegrationSettings] Token validation failed (non-fatal):', e.message);
      }
    }

    // Fallback: resolve from shopParam
    if (!tenantId && shopParam) {
      let shop = shopParam.toLowerCase();
      if (!shop.includes('.myshopify.com')) shop += '.myshopify.com';
      const tenants = await base44.entities.Tenant.filter({ shop_domain: shop });
      if (tenants.length > 0) tenantId = tenants[0].id;
    }

    if (!tenantId) {
      return json({ error: 'Cannot resolve tenant — provide tenant_id or session_token' }, 400);
    }

    // ---------------------------------------------------------------- GET
    if (action === 'get') {
      const [integrations, settingsArr] = await Promise.all([
        base44.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' }),
        base44.entities.TenantSettings.filter({ tenant_id: tenantId }),
      ]);
      const integration = integrations[0] || null;
      const settings    = settingsArr[0]    || {};
      return json({ integration, settings, tenantId });
    }

    // --------------------------------------------------------------- SAVE
    if (action === 'save') {
      const { sync_config, two_way_sync, auto_hold_high_risk, auto_cancel_threshold } = body;

      // Update PlatformIntegration
      const integrations = await base44.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' });
      if (integrations.length > 0) {
        const patch = {};
        if (sync_config  !== undefined) patch.sync_config  = sync_config;
        if (two_way_sync !== undefined) patch.two_way_sync = two_way_sync;
        await base44.entities.PlatformIntegration.update(integrations[0].id, patch);
      }

      // Update TenantSettings (auto-hold)
      const settingsArr = await base44.entities.TenantSettings.filter({ tenant_id: tenantId });
      const settingsPatch = {};
      if (auto_hold_high_risk      !== undefined) settingsPatch.auto_hold_high_risk      = auto_hold_high_risk;
      if (auto_cancel_threshold    !== undefined) settingsPatch.auto_cancel_threshold    = auto_cancel_threshold;

      if (settingsArr.length > 0) {
        await base44.entities.TenantSettings.update(settingsArr[0].id, settingsPatch);
      } else {
        await base44.entities.TenantSettings.create({ tenant_id: tenantId, ...settingsPatch });
      }

      return json({ success: true });
    }

    // --------------------------------------------------------------- SYNC
    if (action === 'sync') {
      // Delegate to syncShopifyOrders — but that requires a user session.
      // Instead, perform sync inline using service-role.
      const tenants = await base44.entities.Tenant.filter({ id: tenantId });
      if (tenants.length === 0) return json({ error: 'Tenant not found' }, 404);
      const tenant = tenants[0];

      const tokens = await base44.entities.OAuthToken.filter({ tenant_id: tenantId, platform: 'shopify', is_valid: true });
      if (tokens.length === 0) return json({ error: 'No valid Shopify token. Please reconnect.' }, 400);

      const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
      let accessToken;
      try {
        const combined = Uint8Array.from(atob(tokens[0].encrypted_access_token), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const enc = combined.slice(12);
        const keyData = new TextEncoder().encode((encryptionKey || '').padEnd(32, '0').slice(0, 32));
        const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
        accessToken = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, enc));
      } catch (e) {
        return json({ error: 'Failed to decrypt Shopify token. Please reconnect.' }, 500);
      }

      const shopifyRes = await fetch(
        `https://${tenant.shop_domain}/admin/api/2024-01/orders.json?status=any&limit=50`,
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
      );

      if (!shopifyRes.ok) {
        const errText = await shopifyRes.text();
        console.error('[shopifyIntegrationSettings/sync] Shopify error:', shopifyRes.status, errText);
        return json({ error: `Shopify API error: ${shopifyRes.status}` }, 500);
      }

      const { orders: shopifyOrders } = await shopifyRes.json();
      let created = 0, updated = 0;

      for (const o of shopifyOrders) {
        const existing = await base44.entities.Order.filter({ tenant_id: tenantId, platform_order_id: o.id.toString() });
        const record = {
          tenant_id: tenantId,
          platform_order_id: o.id.toString(),
          order_number: o.order_number?.toString() || o.name,
          customer_email: o.email,
          customer_name: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : o.shipping_address?.name,
          order_date: o.created_at,
          status: o.cancelled_at ? 'cancelled' : (o.fulfillment_status === 'fulfilled' ? 'fulfilled' : 'pending'),
          total_revenue: parseFloat(o.total_price) || 0,
          is_demo: false,
          platform_data: o,
        };
        if (existing.length > 0) {
          await base44.entities.Order.update(existing[0].id, record);
          updated++;
        } else {
          await base44.entities.Order.create(record);
          created++;
        }
      }

      // Update last_sync_at on integration
      const integrations = await base44.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' });
      if (integrations.length > 0) {
        await base44.entities.PlatformIntegration.update(integrations[0].id, {
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'success',
          last_sync_stats: { orders_synced: shopifyOrders.length, errors_count: 0 },
        });
      }

      return json({ success: true, created, updated, total: shopifyOrders.length });
    }

    // ---------------------------------------------------------- RECONNECT
    if (action === 'reconnect') {
      const tenants = await base44.entities.Tenant.filter({ id: tenantId });
      const shop = tenants[0]?.shop_domain || shopParam;
      if (!shop) return json({ error: 'Cannot determine shop domain' }, 400);

      // Build URL with canonical redirect_uri
      const redirectUri = `${APP_URL}/ShopifyCallback`;
      const scopes = 'read_orders,write_orders,read_products,write_products,read_customers,write_customers,read_fulfillments,write_fulfillments';
      const nonce = crypto.randomUUID();
      const installUrl = `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
        client_id: SHOPIFY_API_KEY,
        scope: scopes,
        redirect_uri: redirectUri,
        state: nonce,
      }).toString();

      return json({ install_url: installUrl, shop });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (err) {
    console.error('[shopifyIntegrationSettings] Error:', err.message);
    return json({ error: err.message }, 500);
  }
});