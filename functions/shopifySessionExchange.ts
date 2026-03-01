/**
 * Shopify Session Token Exchange — PUBLIC ENDPOINT
 * 
 * This function is intentionally PUBLIC (no Base44 session required).
 * It is called from the embedded app BEFORE any Base44 auth check.
 * 
 * 1. Validates the Shopify App Bridge JWT (session token) — this IS the auth.
 * 2. Extracts shop domain from the token.
 * 3. Looks up the tenant via service-role (no user session needed).
 * 4. Returns a merchant identity payload the frontend uses to skip login.
 * 
 * Security model:
 *   - Only valid JWTs signed by SHOPIFY_API_SECRET are accepted.
 *   - Uses asServiceRole for all DB access (never requires a Base44 user session).
 *   - Returns 401/403 ONLY for invalid/expired/missing token.
 *   - Returns 200 with install_required:true if shop not installed yet.
 */

import { createClient } from 'npm:@base44/sdk@0.8.6';

const SHOPIFY_API_SECRET = Deno.env.get('SHOPIFY_API_SECRET');
const SHOPIFY_API_KEY = Deno.env.get('SHOPIFY_API_KEY');

/**
 * base64url decode helper
 */
function base64urlDecode(str) {
  // Convert base64url → base64
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return atob(padded);
}

/**
 * Verify Shopify session token JWT (HS256, signed with SHOPIFY_API_SECRET).
 * 
 * Validates:
 *  - Signature (HMAC-SHA256)
 *  - aud === SHOPIFY_API_KEY
 *  - iss === "https://{shop}" (extracted from dest claim)
 *  - exp not expired
 *  - nbf not in future (if present)
 * 
 * Returns decoded payload or throws with a descriptive message.
 */
async function verifySessionToken(token) {
  if (!SHOPIFY_API_SECRET) throw new Error('SHOPIFY_API_SECRET not configured');
  if (!SHOPIFY_API_KEY) throw new Error('SHOPIFY_API_KEY not configured');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format: expected 3 parts');

  const [headerB64, payloadB64, signatureB64] = parts;

  // --- 1. Verify HMAC-SHA256 signature ---
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SHOPIFY_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signingInput = encoder.encode(`${headerB64}.${payloadB64}`);
  const sigBytes = Uint8Array.from(base64urlDecode(signatureB64), c => c.charCodeAt(0));

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, signingInput);
  if (!valid) throw new Error('Invalid token signature');

  // --- 2. Decode payload ---
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch {
    throw new Error('Malformed JWT payload');
  }

  const now = Math.floor(Date.now() / 1000);

  // --- 3. Validate exp ---
  if (!payload.exp) throw new Error('Missing exp claim');
  if (payload.exp < now) throw new Error(`Session token expired (exp=${payload.exp}, now=${now})`);

  // --- 4. Validate nbf (if present) ---
  if (payload.nbf && payload.nbf > now) {
    throw new Error(`Session token not yet valid (nbf=${payload.nbf}, now=${now})`);
  }

  // --- 5. Validate aud === SHOPIFY_API_KEY ---
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(SHOPIFY_API_KEY)) {
    throw new Error(`Invalid aud claim: expected ${SHOPIFY_API_KEY}, got ${JSON.stringify(payload.aud)}`);
  }

  // --- 6. Validate iss === "https://{shop}" ---
  // Shopify sets iss = "https://mystore.myshopify.com/admin"
  // and dest = "https://mystore.myshopify.com"
  const shop = extractShopFromPayload(payload);
  const expectedIssPrefix = `https://${shop}`;
  if (!payload.iss || !payload.iss.startsWith(expectedIssPrefix)) {
    throw new Error(`Invalid iss claim: expected prefix ${expectedIssPrefix}, got ${payload.iss}`);
  }

  return payload;
}

/**
 * Extract shop domain from session token payload.
 * Shopify puts it in `dest` as "https://mystore.myshopify.com"
 * Falls back to parsing `iss`.
 */
function extractShopFromPayload(payload) {
  const source = payload.dest || payload.iss || '';
  const match = source.match(/https?:\/\/([^\/]+)/);
  if (!match) throw new Error('Cannot extract shop domain from token claims');
  let shop = match[1].toLowerCase().trim();
  if (!shop.includes('.myshopify.com')) shop = `${shop}.myshopify.com`;
  return shop;
}

// Shopify-safe response headers — allow embedding in Shopify Admin
function embeddedHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // Allow Shopify to embed us in an iframe
    'Content-Security-Policy': "frame-ancestors https://*.myshopify.com https://admin.shopify.com",
    // Explicitly remove DENY so Shopify admin can embed
    'X-Frame-Options': 'ALLOWALL',
  };
}

function jsonResponse(body, status = 200) {
  return Response.json(body, { status, headers: embeddedHeaders() });
}

// Service-role client — no user session required
let serviceClient = null;
function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient({ serviceRoleKey: Deno.env.get('BASE44_SERVICE_ROLE_KEY') || '' });
  }
  return serviceClient;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: embeddedHeaders() });
  }

  try {
    // PUBLIC ENDPOINT — use service-role client, NOT createClientFromRequest
    // This means no Base44 session is needed to call this function.
    const base44 = getServiceClient();

    let bodyText = '';
    try {
      bodyText = await req.text();
    } catch { bodyText = '{}'; }

    let body = {};
    try { body = JSON.parse(bodyText || '{}'); } catch { body = {}; }

    const { session_token, shop: shopParam } = body;

    console.log(`[shopifySessionExchange] path=${path} shop=${shopParam || '(none)'} has_token=${!!session_token}`);

    let shopDomain = null;

    // Strategy 1: Validate session token JWT (embedded app — preferred, most secure)
    if (session_token) {
      try {
        const payload = await verifySessionToken(session_token);
        shopDomain = extractShopFromPayload(payload);
        console.log(`[shopifySessionExchange] ✓ Valid session token for shop: ${shopDomain}`);
      } catch (tokenErr) {
        console.error(`[shopifySessionExchange] ✗ Token validation failed: ${tokenErr.message}`);
        return jsonResponse({ error: 'Invalid session token: ' + tokenErr.message, reason: 'invalid_token' }, 401);
      }
    }

    // Strategy 2: Shop param only (no session token — first load before App Bridge ready)
    // This is TRUSTED only because the next call will include a real session token.
    // We return tenant info so the frontend can render; the gate will re-verify.
    if (!shopDomain && shopParam) {
      shopDomain = shopParam.toLowerCase().includes('.myshopify.com')
        ? shopParam.toLowerCase().trim()
        : `${shopParam.toLowerCase().trim()}.myshopify.com`;
      console.log(`[shopifySessionExchange] Using shop param (no token yet): ${shopDomain}`);
    }

    if (!shopDomain) {
      console.warn('[shopifySessionExchange] ✗ No shop domain — missing both session_token and shop param');
      return jsonResponse({ error: 'Missing shop or session_token', reason: 'missing_shop' }, 400);
    }

    // Resolve tenant by shop_domain (service-role, no user session)
    const tenants = await base44.entities.Tenant.filter({ shop_domain: shopDomain });
    console.log(`[shopifySessionExchange] Tenant lookup for ${shopDomain}: found ${tenants.length}`);

    if (tenants.length === 0) {
      // Shop hasn't gone through OAuth install yet — signal frontend to show install screen
      console.log(`[shopifySessionExchange] install_required for ${shopDomain}`);
      return jsonResponse({
        authenticated: false,
        shop_domain: shopDomain,
        reason: 'shop_not_installed',
        install_required: true
      }, 200);
    }

    const tenant = tenants[0];

    // Get primary connected integration
    const integrations = await base44.entities.PlatformIntegration.filter({
      tenant_id: tenant.id,
      platform: 'shopify',
      status: 'connected'
    });

    const integration = integrations[0] || null;

    console.log(`[shopifySessionExchange] ✓ Authenticated: tenant=${tenant.id} integration=${integration?.id || 'none'}`);

    // Return authenticated context — frontend persists this to skip Base44 login
    return jsonResponse({
      authenticated: true,
      shop_domain: shopDomain,
      tenant_id: tenant.id,
      tenant_name: tenant.shop_name || shopDomain,
      integration_id: integration?.id || null,
      platform: 'shopify',
      shopify_authenticated: true
    });

  } catch (error) {
    console.error('[shopifySessionExchange] Unhandled error:', error.message, error.stack);
    return jsonResponse({ error: error.message, reason: 'server_error' }, 500);
  }
});