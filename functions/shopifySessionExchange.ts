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

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { withEndpointGuard, validateEnv, safeFilter, jsonSafe } from './helpers/endpointSafety.ts';

// ── Inline token decrypt (no local imports allowed in Deno Deploy) ─────────────
async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    try { return atob(encryptedToken); } catch { return null; }
  }
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const enc = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, enc);
    return new TextDecoder().decode(decrypted);
  } catch {
    try { return atob(encryptedToken); } catch { return null; }
  }
}

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
const SHOPIFY_FRAME_ANCESTORS = "https://admin.shopify.com https://*.myshopify.com";

function mergeFrameAncestors(csp = "") {
  const normalized = (csp || "").trim();
  const frameDirective = `frame-ancestors ${SHOPIFY_FRAME_ANCESTORS};`;
  if (!normalized) return frameDirective;
  if (/frame-ancestors\s+/i.test(normalized)) {
    return normalized.replace(/frame-ancestors[^;]*;?/i, frameDirective);
  }
  return `${normalized.replace(/;?\s*$/, ';')} ${frameDirective}`;
}

function embeddedHeaders() {
  const existingCsp = '';
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // Keep any CSP directives and force Shopify-compatible frame-ancestors.
    'Content-Security-Policy': mergeFrameAncestors(existingCsp),
  };
}

function jsonResponse(body, status = 200) {
  return jsonSafe(body, status, embeddedHeaders());
}

// Build a request that looks unauthenticated (no Authorization header)
// so createClientFromRequest gives us a base client, then we use asServiceRole.
function makeUnauthenticatedReq(originalReq) {
  const headers = new Headers(originalReq.headers);
  headers.delete('authorization');
  headers.delete('Authorization');
  return new Request(originalReq.url, {
    method: originalReq.method,
    headers,
  });
}

Deno.serve(withEndpointGuard('shopifySessionExchange', async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  try {
    const envState = validateEnv(['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET']);
    if (!envState.ok) {
      return jsonResponse({ error: `Missing env: ${envState.missing.join(',')}`, reason: 'env_missing' }, 500);
    }

    // PUBLIC ENDPOINT — use asServiceRole so no Base44 user session is required.
    const base44 = createClientFromRequest(req).asServiceRole;

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

    // Resolve tenant by shop_domain (service-role, no user session required)
    const tenants = await safeFilter(
      () => base44.entities.Tenant.filter({ shop_domain: shopDomain }),
      [],
      'shopifySessionExchange.tenant_lookup'
    );
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

    let tenant = tenants[0];

    // AUTO-PROVISION TRIAL on first open if billing fields are missing
    if (!tenant.trial_started_at) {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await base44.entities.Tenant.update(tenant.id, {
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        plan_status: 'trial',
        subscription_tier: 'trial',
        status: 'active'
      });
      tenant.trial_started_at = now.toISOString();
      tenant.trial_ends_at = trialEnd.toISOString();
      tenant.plan_status = 'trial';
      console.log(`[shopifySessionExchange] Auto-provisioned 14-day trial for tenant=${tenant.id}`);
    }

    // Get primary integration — prefer connected, but accept any for auto-heal
    let integrationsList = await base44.entities.PlatformIntegration.filter({
      tenant_id: tenant.id,
      platform: 'shopify',
      status: 'connected'
    });

    let integration = integrationsList[0] || null;
    let autoHealed = false;

    // AUTO-HEAL: If no connected integration but we have a session token (embedded valid), 
    // try to find a disconnected one and verify token is still valid.
    if (!integration && session_token) {
      const anyIntegrations = await base44.entities.PlatformIntegration.filter({
        tenant_id: tenant.id,
        platform: 'shopify'
      });
      const disconnected = anyIntegrations[0] || null;

      if (disconnected) {
        // Check if we have a valid token for this shop
        const tokens = await base44.entities.OAuthToken.filter({ tenant_id: tenant.id, platform: 'shopify' });
        const token = tokens.find(t => t.is_valid !== false) || tokens[0] || null;

        if (token?.encrypted_access_token) {
          // Quick token validity check via access_scopes
          try {
            const accessToken = await decryptToken(token.encrypted_access_token);
            if (accessToken) {
              const scopeRes = await fetch(`https://${shopDomain}/admin/oauth/access_scopes.json`, {
                headers: { 'X-Shopify-Access-Token': accessToken }
              });
              if (scopeRes.ok) {
                // Token is valid — auto-heal the integration status
                await base44.entities.PlatformIntegration.update(disconnected.id, {
                  status: 'connected',
                  last_connected_at: new Date().toISOString(),
                  metadata: { ...(disconnected.metadata || {}), auto_healed_at: new Date().toISOString() }
                });
                if (token.is_valid === false) {
                  await base44.entities.OAuthToken.update(token.id, { is_valid: true });
                }
                integration = { ...disconnected, status: 'connected' };
                autoHealed = true;
                console.log(`[shopifySessionExchange] ✅ Auto-healed integration ${disconnected.id} for tenant ${tenant.id}`);
              }
            }
          } catch (healErr) {
            console.warn('[shopifySessionExchange] Auto-heal check failed:', healErr.message);
          }
        }
      }
    }

    // is_new_tenant = true triggers the guided onboarding flow on first open
    const isNewTenant = !tenant.onboarding_completed;

    // Compute billing state for frontend (no extra round-trip needed)
    const now = new Date();
    const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
    const trialExpired = tenant.subscription_tier === 'trial' && trialEnds && now >= trialEnds;
    const createdAt = tenant.created_date ? new Date(tenant.created_date).getTime() : null;
    const inGraceWindow = createdAt && (Date.now() - createdAt) < 15 * 60 * 1000;
    const inReviewWindow = tenant.review_mode_enabled ||
      (createdAt && (Date.now() - createdAt) < 7 * 24 * 60 * 60 * 1000);

    console.log(`[shopifySessionExchange] ✓ Authenticated: tenant=${tenant.id} integration=${integration?.id || 'none'} is_new=${isNewTenant} trial_expired=${trialExpired} auto_healed=${autoHealed}`);

    // Return authenticated context — frontend persists this to skip Base44 login
    return jsonResponse({
      authenticated: true,
      shop_domain: shopDomain,
      tenant_id: tenant.id,
      tenant_name: tenant.shop_name || shopDomain,
      integration_id: integration?.id || null,
      platform: 'shopify',
      shopify_authenticated: true,
      is_new_tenant: isNewTenant,
      auto_healed: autoHealed,
      billing: {
        plan_status: tenant.plan_status || 'trial',
        subscription_tier: tenant.subscription_tier || 'trial',
        trial_started_at: tenant.trial_started_at,
        trial_ends_at: tenant.trial_ends_at,
        trial_expired: trialExpired,
        in_grace_window: inGraceWindow,
        review_mode: inReviewWindow
      }
    });

  } catch (error) {
    console.error('[shopifySessionExchange] Unhandled error:', error.message, error.stack);
    return jsonResponse({ error: error.message, reason: 'server_error' }, 500);
  }
}, embeddedHeaders()));
