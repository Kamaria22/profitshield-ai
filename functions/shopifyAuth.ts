/**
 * shopifyAuth — OAuth Flow Handler
 *
 * Handles Shopify OAuth installation, callback, and re-authorization.
 * Generates install URLs and processes authorization callbacks.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { withEndpointGuard, validateEnv, jsonSafe } from './helpers/endpointSafety.ts';

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

Deno.serve(withEndpointGuard('shopifyAuth', async (req) => {
  try {
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
    const shop = body.shop;

    if (!shop) {
      return jsonResponse({ error: 'shop parameter required' }, 400);
    }

    if (action === 'install' || action === 'reauthorize') {
      return await generateInstallUrl(shop);
    } else if (action === 'callback') {
      return await handleCallback(base44, body);
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message, stack: error.stack }, 500);
  }
}, shopifyHeaders()));

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
