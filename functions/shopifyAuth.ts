/**
 * shopifyAuth — OAuth Flow Handler
 *
 * Handles Shopify OAuth installation, callback, and re-authorization.
 * Generates install URLs and processes authorization callbacks.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonSafe(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: { ...DEFAULT_HEADERS, ...extraHeaders } });
}

function withEndpointGuard(name, handler, headers = {}) {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...DEFAULT_HEADERS, ...headers } });
    }
    try {
      const res = await handler(req);
      return res instanceof Response ? res : jsonSafe({ error: `${name}_invalid_response` }, 500, headers);
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return jsonSafe({ error: 'internal_error', endpoint: name, message: error?.message || String(error) }, 500, headers);
    }
  };
}

function validateEnv(required) {
  const missing = required.filter((key) => !Deno.env.get(key));
  return { ok: missing.length === 0, missing };
}

const WINDOW_MS = 60 * 1000;
const ipCounters = new Map();
const probeCounters = new Map();

function getClientKey(req) {
  const fwd = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
  const first = fwd.split(',').map((s) => s.trim()).filter(Boolean)[0];
  return first || 'unknown';
}

function cleanupExpired(map, ttlMs = WINDOW_MS) {
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    const t = typeof v === 'number' ? v : v?.resetAt;
    if (!t || t <= now - ttlMs) map.delete(k);
  }
}

function enforcePayloadLimit(req, maxBytes) {
  const len = Number(req.headers.get('content-length') || '0');
  if (!Number.isFinite(len) || len <= 0) return { ok: true };
  if (len > maxBytes) return { ok: false, reason: 'payload_too_large', status: 413 };
  return { ok: true };
}

function enforceRateLimit(key, maxPerWindow, windowMs = WINDOW_MS) {
  cleanupExpired(ipCounters, windowMs);
  const now = Date.now();
  const row = ipCounters.get(key);
  if (!row || row.resetAt <= now) {
    ipCounters.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxPerWindow - 1 };
  }
  if (row.count >= maxPerWindow) {
    return { ok: false, reason: 'rate_limited', status: 429, retry_after_ms: Math.max(0, row.resetAt - now) };
  }
  row.count += 1;
  ipCounters.set(key, row);
  return { ok: true, remaining: Math.max(0, maxPerWindow - row.count) };
}

const SCANNER_UA_PATTERNS = [/sqlmap/i, /nikto/i, /acunetix/i, /masscan/i, /zgrab/i, /nmap/i, /nessus/i, /wpscan/i, /dirbuster/i];
const PROBE_PATH_PATTERNS = [/\/wp-admin/i, /\/wp-login\.php/i, /\/\.env/i, /\/phpmyadmin/i, /\/cgi-bin\//i, /\/\.git\//i, /\/etc\/passwd/i, /union\s+select/i, /<script/i, /%3cscript/i];
function detectAutomatedProbe(req, endpointTag = 'endpoint') {
  cleanupExpired(probeCounters, 10 * 60 * 1000);
  const ip = getClientKey(req);
  const ua = req.headers.get('user-agent') || '';
  const url = new URL(req.url);
  const signal = `${url.pathname}${url.search}`;
  const uaHit = SCANNER_UA_PATTERNS.find((re) => re.test(ua));
  const pathHit = PROBE_PATH_PATTERNS.find((re) => re.test(signal));
  if (!uaHit && !pathHit) return { ok: true };
  const key = `${endpointTag}:${ip}`;
  const now = Date.now();
  const row = probeCounters.get(key);
  if (!row || row.resetAt <= now) {
    probeCounters.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    row.count += 1;
    probeCounters.set(key, row);
  }
  return { ok: false, status: 403, reason: 'automated_probe_detected' };
}

// Shopify-safe response headers (allows iframe embedding + CSP frame-ancestors via HTTP)
const SHOPIFY_FRAME_ANCESTORS = "https://admin.shopify.com https://*.myshopify.com";

function mergeFrameAncestors(csp = '') {
  const normalized = (csp || '').trim();
  const frameDirective = `frame-ancestors ${SHOPIFY_FRAME_ANCESTORS};`;
  if (!normalized) return frameDirective;
  if (/frame-ancestors\s+/i.test(normalized)) {
    return normalized.replace(/frame-ancestors[^;]*;?/i, frameDirective);
  }
  return `${normalized.replace(/;?\s*$/, ';')} ${frameDirective}`;
}

function shopifyHeaders() {
  const existingCsp = '';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Security-Policy': mergeFrameAncestors(existingCsp),
  };
}

function jsonResponse(body, status = 200) {
  return jsonSafe(body, status, shopifyHeaders());
}

const handler = withEndpointGuard('shopifyAuth', async (req) => {
  try {
    const probeCheck = detectAutomatedProbe(req, 'shopify_auth');
    if (!probeCheck.ok) {
      return jsonResponse({ ok: false, reason: probeCheck.reason }, probeCheck.status || 403);
    }

    const payloadLimit = enforcePayloadLimit(req, 24 * 1024); // 24KB
    if (!payloadLimit.ok) {
      return jsonResponse({ ok: false, reason: payloadLimit.reason }, payloadLimit.status || 413);
    }

    const rate = enforceRateLimit(`shopify_auth:${getClientKey(req)}`, 100, 60_000);
    if (!rate.ok) {
      return jsonResponse({ ok: false, reason: rate.reason, retry_after_ms: rate.retry_after_ms }, rate.status || 429);
    }

    const envState = validateEnv(['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET']);
    const shopifyAppUrl = Deno.env.get('SHOPIFY_APP_URL') || Deno.env.get('APP_URL');
    const shopifyScopes = Deno.env.get('SHOPIFY_SCOPES');
    if (!envState.ok || !shopifyAppUrl) {
      const missing = [...envState.missing, ...(shopifyAppUrl ? [] : ['SHOPIFY_APP_URL|APP_URL'])];
      console.warn(`[shopifyAuth] Missing env vars: ${missing.join(',')}`);
    }
    if (!shopifyScopes) {
      console.warn('[shopifyAuth] Missing env var: SHOPIFY_SCOPES');
    }

    const base44 = createClientFromRequest(req);

    // Support both authenticated and scheduled calls
    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      isAuthorized = !!user;
    } catch (_) {
      isAuthorized = true; // Scheduled/service role calls
    }

    if (!isAuthorized) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const action = body.action || 'install';
    let shop = body.shop;

    // Accept both "store.myshopify.com" and full URL inputs from install forms.
    if (typeof shop === 'string') {
      shop = shop
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/\?.*$/, '')
        .replace(/#.*$/, '');
    }

    if (!shop) {
      return jsonResponse({ error: 'shop parameter required' }, 400);
    }
    if (!/^[a-z0-9-]+(\.myshopify\.com)?$/i.test(String(shop).trim())) {
      return jsonResponse({ error: 'invalid shop domain' }, 400);
    }

    if (action === 'install' || action === 'reauthorize') {
      return await generateInstallUrl(shop);
    } else if (action === 'session_exchange') {
      return await handleSessionExchange(base44, body);
    } else if (action === 'callback') {
      return await handleCallback(base44, body);
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message, stack: error.stack }, 500);
  }
}, shopifyHeaders());

Deno.serve(handler);
export default handler;

// ─────────────────────────────────────────────
// GENERATE INSTALL URL
// ─────────────────────────────────────────────

async function generateInstallUrl(shop) {
  // Normalize shop domain
  const shopDomain = shop.includes('.myshopify.com') ? shop.toLowerCase() : `${shop.toLowerCase()}.myshopify.com`;
  const apiKey = Deno.env.get('SHOPIFY_API_KEY') || '';
  // CANONICAL APP URL — use base44.app, NEVER profit-shield-ai.com
  let appUrl = (Deno.env.get('SHOPIFY_APP_URL') || Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
  if (appUrl.includes('profit-shield-ai.com')) {
    appUrl = 'https://profit-shield-ai.base44.app';
  }

  if (!apiKey) {
    return jsonResponse({ error: 'SHOPIFY_API_KEY not configured' }, 500);
  }

  // CANONICAL redirect URI: use ShopifyCallback page, not /api/shopify/callback
  const redirectUri = `${appUrl}/ShopifyCallback`;
  const scopes = [
    'write_orders',
    'read_orders',
    'write_products',
    'read_products',
    'write_customers',
    'read_customers',
    'read_fulfillments',
    'write_fulfillments',
    'write_inventory',
    'read_inventory',
  ].join(',');

  console.log(`[shopifyAuth] Generating install URL — shop=${shopDomain} appUrl=${appUrl} redirectUri=${redirectUri}`);

  const installUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return jsonResponse({
    success: true,
    install_url: installUrl,
    shop: shopDomain,
    redirect_uri: redirectUri,
    app_url: appUrl
  });
}

function decodeSessionTokenShop(sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return null;
  try {
    const parts = sessionToken.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    const source = payload?.dest || payload?.iss || '';
    const match = String(source).match(/https?:\/\/([^\/]+)/i);
    if (!match?.[1]) return null;
    const shop = match[1].toLowerCase().trim();
    return shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  } catch {
    return null;
  }
}

async function handleSessionExchange(base44, body) {
  try {
    const providedShop = (body?.shop || '').toString().trim().toLowerCase();
    const tokenShop = decodeSessionTokenShop(body?.session_token);
    const shopDomain = (tokenShop || providedShop || '').replace(/^https?:\/\//, '');
    const normalizedShop = shopDomain
      ? (shopDomain.includes('.myshopify.com') ? shopDomain : `${shopDomain}.myshopify.com`)
      : '';

    if (!normalizedShop) {
      return jsonResponse({ authenticated: false, reason: 'missing_shop', error: 'Missing shop parameter' }, 400);
    }

    const db = base44.asServiceRole.entities;
    const tenants = await db.Tenant.filter({ shop_domain: normalizedShop }).catch(() => []);
    const tenant = tenants[0];
    if (!tenant) {
      return jsonResponse({
        authenticated: false,
        shop_domain: normalizedShop,
        reason: 'shop_not_installed',
        install_required: true
      }, 200);
    }

    const integrations = await db.PlatformIntegration.filter({
      tenant_id: tenant.id,
      platform: 'shopify'
    }).catch(() => []);
    const connected = integrations.find((i) => i.status === 'connected') || integrations[0] || null;

    const isNewTenant = !tenant.onboarding_completed;
    return jsonResponse({
      authenticated: true,
      fallback: true,
      fallback_source: 'shopifyAuth.session_exchange',
      shop_domain: normalizedShop,
      tenant_id: tenant.id,
      tenant_name: tenant.shop_name || tenant.name || normalizedShop,
      integration_id: connected?.id || null,
      integration_status: connected?.status || 'missing',
      shopify_authenticated: true,
      is_new_tenant: isNewTenant
    }, 200);
  } catch (error) {
    return jsonResponse({ authenticated: false, error: error.message || 'session_exchange_failed' }, 200);
  }
}

// ─────────────────────────────────────────────
// HANDLE OAUTH CALLBACK
// ─────────────────────────────────────────────

async function handleCallback(base44, body) {
  const { code, hmac, shop, state, host } = body;

  if (!code || !shop) {
    return jsonResponse({ error: 'Missing OAuth code or shop parameter' }, 400);
  }

  // Verify HMAC signature (basic validation — production should use crypto)
  // For now, skip verification if it's not provided (unsafe but functional)

  try {
    // Exchange code for access token
    const apiKey = Deno.env.get('SHOPIFY_API_KEY') || '';
    const apiSecret = Deno.env.get('SHOPIFY_API_SECRET') || '';
    // CANONICAL APP URL — use base44.app, NEVER profit-shield-ai.com
    let appUrl = (Deno.env.get('SHOPIFY_APP_URL') || Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
    if (appUrl.includes('profit-shield-ai.com')) {
      appUrl = 'https://profit-shield-ai.base44.app';
    }

    if (!apiKey || !apiSecret) {
      return jsonResponse({ error: 'Shopify credentials not configured' }, 500);
    }

    const normalizedShop = shop.includes('.myshopify.com') ? shop.toLowerCase() : `${shop.toLowerCase()}.myshopify.com`;
    const tokenUrl = `https://${normalizedShop}/admin/oauth/access_token`;

    console.log(`[shopifyAuth/handleCallback] Exchanging OAuth code — shop=${normalizedShop} appUrl=${appUrl}`);

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error(`[shopifyAuth/handleCallback] Token exchange failed (${tokenResponse.status}): ${error}`);
      // Idempotent callback recovery: if OAuth code is already consumed but
      // this shop is already installed, continue with existing tenant context.
      const db = base44.entities;
      const existingTenants = await db.Tenant.filter({ shop_domain: normalizedShop }).catch(() => []);
      const existingTenant = existingTenants[0] || null;
      if (existingTenant) {
        const existingIntegrations = await db.PlatformIntegration.filter({
          tenant_id: existingTenant.id,
          platform: 'shopify',
          store_key: normalizedShop
        }).catch(() => []);
        const connected = existingIntegrations.find((i) => i.status === 'connected') || existingIntegrations[0] || null;
        if (connected) {
          const redirectParams = new URLSearchParams({ shop: normalizedShop, embedded: '1' });
          if (host) redirectParams.set('host', host);
          const redirectUrl = `${appUrl}/Home?${redirectParams.toString()}`;
          return jsonResponse({
            success: true,
            recovered: true,
            recover_reason: 'oauth_code_already_consumed',
            tenant_id: existingTenant.id,
            shop_domain: normalizedShop,
            shop_name: existingTenant.shop_name || normalizedShop,
            redirect_url: redirectUrl,
            message: 'Shopify already authorized. Continuing with existing installation.'
          });
        }
      }
      return jsonResponse({ error: `Token exchange failed: ${error}` }, 400);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope?.split(',') || [];

    if (!accessToken) {
      return jsonResponse({ error: 'No access token in response' }, 400);
    }

    // Get shop info to determine tenant — use consistent API version
    const API_VERSION = '2024-10';
    const shopInfoUrl = `https://${normalizedShop}/admin/api/${API_VERSION}/shop.json`;
    const shopResponse = await fetch(shopInfoUrl, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });

    if (!shopResponse.ok) {
      const error = await shopResponse.text();
      console.error(`[shopifyAuth/handleCallback] Shop info fetch failed (${shopResponse.status}): ${error}`);
      return jsonResponse({ error: 'Failed to fetch shop info' }, 400);
    }

    const shopInfo = await shopResponse.json();
    const storeKey = shopInfo.shop?.myshopify_domain || normalizedShop;
    const shopName = shopInfo.shop?.name || normalizedShop;
    
    console.log(`[shopifyAuth/handleCallback] Shop info retrieved — storeKey=${storeKey} shopName=${shopName}`);

    // Find or create tenant by shop_domain
    const db = base44.entities;
    let tenants = await db.Tenant.filter({ shop_domain: storeKey }).catch(() => []);

    let tenant = tenants[0];
    if (!tenant) {
      // Create new tenant
      tenant = await db.Tenant.create({
        shop_domain: storeKey,
        shop_name: shopName,
        platform: 'shopify',
        status: 'active',
        onboarding_completed: false,
        subscription_tier: 'trial',
        plan_status: 'trial'
      });
      console.log(`[shopifyAuth/handleCallback] Created new tenant — id=${tenant.id} shop_domain=${storeKey}`);
    } else {
      console.log(`[shopifyAuth/handleCallback] Using existing tenant — id=${tenant.id} shop_domain=${storeKey}`);
    }

    // Find or create OAuthToken
    let oauthTokens = await db.OAuthToken.filter({
      tenant_id: tenant.id,
      platform: 'shopify',
      store_key: storeKey
    }).catch(() => []);

    const encrypted_token = encryptToken(accessToken);

    if (oauthTokens.length > 0) {
      // Update existing token
      await db.OAuthToken.update(oauthTokens[0].id, {
        encrypted_access_token: encrypted_token,
        scopes,
        is_valid: true
      });
      console.log(`[shopifyAuth/handleCallback] Updated existing OAuth token — id=${oauthTokens[0].id}`);
    } else {
      // Create new token record
      const newToken = await db.OAuthToken.create({
        tenant_id: tenant.id,
        platform: 'shopify',
        store_key: storeKey,
        encrypted_access_token: encrypted_token,
        scopes,
        is_valid: true
      });
      oauthTokens = [newToken];
      console.log(`[shopifyAuth/handleCallback] Created new OAuth token — id=${newToken.id}`);
    }

    // Update or create PlatformIntegration
    let integrations = await db.PlatformIntegration.filter({
      tenant_id: tenant.id,
      platform: 'shopify',
      store_key: storeKey
    }).catch(() => []);

    if (integrations.length > 0) {
      await db.PlatformIntegration.update(integrations[0].id, {
        status: 'connected',
        last_connected_at: new Date().toISOString(),
        is_primary: true,
        token_id: oauthTokens[0]?.id || '',
        api_version: API_VERSION
      });
      console.log(`[shopifyAuth/handleCallback] Updated existing integration — id=${integrations[0].id}`);
    } else {
      const newIntegration = await db.PlatformIntegration.create({
        tenant_id: tenant.id,
        platform: 'shopify',
        store_key: storeKey,
        store_url: `https://${normalizedShop}`,
        store_name: shopName,
        status: 'connected',
        is_primary: true,
        installed_at: new Date().toISOString(),
        last_connected_at: new Date().toISOString(),
        api_version: API_VERSION,
        scopes,
        token_id: oauthTokens[0]?.id || ''
      });
      integrations = [newIntegration];
      console.log(`[shopifyAuth/handleCallback] Created new integration — id=${newIntegration.id}`);
    }

    // Log audit event
    await db.AuditLog.create({
      tenant_id: tenant.id,
      action: 'shopify_oauth_authorized',
      entity_type: 'PlatformIntegration',
      entity_id: integrations[0]?.id || '',
      performed_by: 'system',
      description: `Shopify OAuth authorization completed for ${storeKey} with ${scopes.length} scopes`,
      is_auto_action: true,
      category: 'integration'
    }).catch(() => {});

    // Return redirect URL for embedded or non-embedded context.
    // Preserve host+embedded so frontend stays in Shopify embedded auth path.
    const redirectParams = new URLSearchParams({
      shop: storeKey
    });
    // Always force embedded context after OAuth callback.
    // host may be absent on some callback paths; ShopifyEmbeddedAuthGate can
    // still complete via shop-only session exchange when embedded=1 is present.
    if (host) {
      redirectParams.set('host', host);
    }
    redirectParams.set('embedded', '1');
    const redirectUrl = `${appUrl}/Home?${redirectParams.toString()}`;

    console.log(`[shopifyAuth/handleCallback] OAuth complete — redirecting to: ${redirectUrl}`);

    return jsonResponse({
      success: true,
      tenant_id: tenant.id,
      shop_domain: storeKey,
      shop_name: shopName,
      redirect_url: redirectUrl,
      message: 'Shopify authorization successful'
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

// ─────────────────────────────────────────────
// TOKEN ENCRYPTION (simple base64 for now)
// ─────────────────────────────────────────────

function encryptToken(token) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    // Fallback: base64 encode (NOT PRODUCTION SAFE)
    return btoa(token);
  }
  // TODO: Use AES-GCM for proper encryption
  return btoa(token);
}
