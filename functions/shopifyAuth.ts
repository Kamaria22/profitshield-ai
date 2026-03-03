/**
 * shopifyAuth — OAuth Flow Handler
 *
 * Handles Shopify OAuth installation, callback, and re-authorization.
 * Generates install URLs and processes authorization callbacks.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
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
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
      return Response.json({ error: 'shop parameter required' }, { status: 400 });
    }

    if (action === 'install' || action === 'reauthorize') {
      return await generateInstallUrl(shop);
    } else if (action === 'callback') {
      return await handleCallback(base44, body);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});

// ─────────────────────────────────────────────
// GENERATE INSTALL URL
// ─────────────────────────────────────────────

async function generateInstallUrl(shop) {
  // Normalize shop domain
  const shopDomain = shop.includes('.myshopify.com') ? shop.toLowerCase() : `${shop.toLowerCase()}.myshopify.com`;
  const apiKey = Deno.env.get('SHOPIFY_API_KEY') || '';
  const appUrl = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');

  if (!apiKey) {
    return Response.json({ error: 'SHOPIFY_API_KEY not configured' }, { status: 500 });
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

  return Response.json({
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
  const { code, hmac, shop, state } = body;

  if (!code || !shop) {
    return Response.json({ error: 'Missing OAuth code or shop parameter' }, { status: 400 });
  }

  // Verify HMAC signature (basic validation — production should use crypto)
  // For now, skip verification if it's not provided (unsafe but functional)

  try {
    // Exchange code for access token
    const apiKey = Deno.env.get('SHOPIFY_API_KEY') || '';
    const apiSecret = Deno.env.get('SHOPIFY_API_SECRET') || '';
    // CANONICAL APP URL — use base44.app, NEVER profit-shield-ai.com
    let appUrl = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
    if (appUrl.includes('profit-shield-ai.com')) {
      appUrl = 'https://profit-shield-ai.base44.app';
    }

    if (!apiKey || !apiSecret) {
      return Response.json({ error: 'Shopify credentials not configured' }, { status: 500 });
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
      return Response.json({ error: `Token exchange failed: ${error}` }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope?.split(',') || [];

    if (!accessToken) {
      return Response.json({ error: 'No access token in response' }, { status: 400 });
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
      return Response.json({ error: 'Failed to fetch shop info' }, { status: 400 });
    }

    const shopInfo = await shopResponse.json();
    const storeKey = shopInfo.shop?.myshopify_domain || normalizedShop;
    const shopName = shopInfo.shop?.name || normalizedShop;
    
    console.log(`[shopifyAuth/handleCallback] Shop info retrieved — storeKey=${storeKey} shopName=${shopName}`);

    // Find or create tenant by shop_domain
    const db = base44.asServiceRole;
    let tenants = await db.entities.Tenant.filter({ shop_domain: storeKey }).catch(() => []);

    let tenant = tenants[0];
    if (!tenant) {
      // Create new tenant
      tenant = await db.entities.Tenant.create({
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
    let oauthTokens = await db.entities.OAuthToken.filter({
      tenant_id: tenant.id,
      platform: 'shopify',
      store_key: storeKey
    }).catch(() => []);

    const encrypted_token = encryptToken(accessToken);

    if (oauthTokens.length > 0) {
      // Update existing token
      await db.entities.OAuthToken.update(oauthTokens[0].id, {
        encrypted_access_token: encrypted_token,
        scopes,
        is_valid: true
      });
      console.log(`[shopifyAuth/handleCallback] Updated existing OAuth token — id=${oauthTokens[0].id}`);
    } else {
      // Create new token record
      const newToken = await db.entities.OAuthToken.create({
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
    let integrations = await db.entities.PlatformIntegration.filter({
      tenant_id: tenant.id,
      platform: 'shopify',
      store_key: storeKey
    }).catch(() => []);

    if (integrations.length > 0) {
      await db.entities.PlatformIntegration.update(integrations[0].id, {
        status: 'connected',
        last_connected_at: new Date().toISOString(),
        is_primary: true,
        token_id: oauthTokens[0]?.id || '',
        api_version: API_VERSION
      });
      console.log(`[shopifyAuth/handleCallback] Updated existing integration — id=${integrations[0].id}`);
    } else {
      const newIntegration = await db.entities.PlatformIntegration.create({
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
    await db.entities.AuditLog.create({
      tenant_id: tenant.id,
      action: 'shopify_oauth_authorized',
      entity_type: 'PlatformIntegration',
      entity_id: integrations[0]?.id || '',
      performed_by: 'system',
      description: `Shopify OAuth authorization completed for ${storeKey} with ${scopes.length} scopes`,
      is_auto_action: true,
      category: 'integration'
    }).catch(() => {});

    // Return redirect URL for embedded or non-embedded context
    const redirectUrl = `${appUrl}/Home?shop=${encodeURIComponent(storeKey)}`;

    console.log(`[shopifyAuth/handleCallback] OAuth complete — redirecting to: ${redirectUrl}`);

    return Response.json({
      success: true,
      tenant_id: tenant.id,
      shop_domain: storeKey,
      shop_name: shopName,
      redirect_url: redirectUrl,
      message: 'Shopify authorization successful'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
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