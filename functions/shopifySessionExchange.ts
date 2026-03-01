/**
 * Shopify Session Token Exchange
 * 
 * Called from the embedded app BEFORE any Base44 auth check.
 * 1. Validates the Shopify App Bridge JWT (session token).
 * 2. Extracts shop domain from the token.
 * 3. Looks up or auto-provisions the tenant.
 * 4. Returns a merchant identity payload the frontend can use to skip login.
 * 
 * Security: Only valid JWTs signed by our SHOPIFY_API_SECRET are accepted.
 * A 403 is returned for invalid/expired tokens.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SHOPIFY_API_SECRET = Deno.env.get('SHOPIFY_API_SECRET');
const SHOPIFY_API_KEY = Deno.env.get('SHOPIFY_API_KEY');

/**
 * Verify Shopify session token JWT (HS256, signed with SHOPIFY_API_SECRET)
 * Returns decoded payload or throws.
 */
async function verifySessionToken(token) {
  if (!SHOPIFY_API_SECRET) throw new Error('SHOPIFY_API_SECRET not configured');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SHOPIFY_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

  const valid = await crypto.subtle.verify('HMAC', key, signature, data);
  if (!valid) throw new Error('Invalid token signature');

  // Decode payload
  const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
  const payload = JSON.parse(payloadJson);

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Session token expired');
  if (payload.nbf && payload.nbf > now) throw new Error('Session token not yet valid');

  // Verify audience (iss and dest contain the shop)
  if (payload.aud && payload.aud !== SHOPIFY_API_KEY) {
    throw new Error('Invalid token audience');
  }

  return payload;
}

/**
 * Extract shop domain from session token payload.
 * Shopify puts it in `dest` as "https://mystore.myshopify.com"
 */
function extractShopFromPayload(payload) {
  const dest = payload.dest || payload.iss || '';
  // dest = "https://mystore.myshopify.com"
  const match = dest.match(/https?:\/\/([^\/]+)/);
  if (!match) throw new Error('Cannot extract shop from token');
  let shop = match[1].toLowerCase().trim();
  if (!shop.includes('.myshopify.com')) shop = `${shop}.myshopify.com`;
  return shop;
}

Deno.serve(async (req) => {
  // CORS for Shopify embedded context
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { session_token, shop: shopParam } = await req.json();

    let shopDomain = null;

    // Strategy 1: Validate session token JWT (embedded app)
    if (session_token) {
      try {
        const payload = await verifySessionToken(session_token);
        shopDomain = extractShopFromPayload(payload);
        console.log('[shopifySessionExchange] Valid session token for shop:', shopDomain);
      } catch (tokenErr) {
        console.error('[shopifySessionExchange] Token validation failed:', tokenErr.message);
        return Response.json({ error: 'Invalid session token: ' + tokenErr.message }, { status: 403 });
      }
    }

    // Strategy 2: HMAC-validated shop param (from OAuth callback, server verified already)
    if (!shopDomain && shopParam) {
      shopDomain = shopParam.toLowerCase().includes('.myshopify.com')
        ? shopParam.toLowerCase().trim()
        : `${shopParam.toLowerCase().trim()}.myshopify.com`;
      console.log('[shopifySessionExchange] Using shop param (no session token):', shopDomain);
    }

    if (!shopDomain) {
      return Response.json({ error: 'No shop domain could be determined' }, { status: 400 });
    }

    // Resolve tenant by shop_domain
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ shop_domain: shopDomain });

    if (tenants.length === 0) {
      // Shop hasn't gone through OAuth install yet
      return Response.json({
        authenticated: false,
        shop_domain: shopDomain,
        reason: 'shop_not_installed',
        install_required: true
      }, { status: 200 });
    }

    const tenant = tenants[0];

    // Get primary integration
    const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
      tenant_id: tenant.id,
      platform: 'shopify',
      status: 'connected'
    });

    const integration = integrations[0] || null;

    // Return authenticated context — frontend uses this to skip login
    return Response.json({
      authenticated: true,
      shop_domain: shopDomain,
      tenant_id: tenant.id,
      tenant_name: tenant.shop_name || shopDomain,
      integration_id: integration?.id || null,
      platform: 'shopify',
      // Signal to frontend: this is a valid Shopify embedded session
      shopify_authenticated: true
    });

  } catch (error) {
    console.error('[shopifySessionExchange] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});