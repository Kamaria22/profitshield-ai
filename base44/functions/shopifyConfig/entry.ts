/**
 * shopifyConfig — Canonical Shopify Integration Constants
 * Single source of truth for all Shopify-related configuration.
 * Import this in every Shopify backend function.
 */

export const SHOPIFY_API_KEY = Deno.env.get('SHOPIFY_API_KEY') || '';
export const SHOPIFY_API_SECRET = Deno.env.get('SHOPIFY_API_SECRET') || '';
export const APP_URL = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
export const API_VERSION = '2024-10';

// These MUST be whitelisted in Shopify Partner Dashboard → App → Configuration → Redirect URLs
export const REDIRECT_URI_CANONICAL = `${APP_URL}/ShopifyCallback`;
export const WEBHOOK_ENDPOINT_CANONICAL = `${APP_URL}/api/functions/shopifyWebhook`;

export const REQUIRED_SCOPES = 'read_orders,read_products,read_customers,read_inventory,read_fulfillments,read_shipping';

export const REQUIRED_TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/paid',
  'orders/cancelled',
  'refunds/create',
  'products/update',
  'app/uninstalled',
];

/**
 * Canonicalize a shop domain — always returns "mystore.myshopify.com"
 */
export function canonicalizeShopDomain(shop) {
  if (!shop) return null;
  const s = shop.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return s.includes('.myshopify.com') ? s : `${s}.myshopify.com`;
}

/**
 * Validate a shop param is a real myshopify.com domain.
 * Returns null if invalid, normalized domain if valid.
 */
export function validateShopParam(shop) {
  const normalized = canonicalizeShopDomain(shop);
  if (!normalized) return null;
  // Must match *.myshopify.com pattern
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(normalized)) return null;
  return normalized;
}

/**
 * Log a warning if the redirect URI being used doesn't match the canonical one.
 * Call from shopifyAuth before generating OAuth URLs.
 */
export function validateRedirectWhitelist(redirectUri) {
  if (redirectUri !== REDIRECT_URI_CANONICAL) {
    console.error(
      `[shopifyConfig] REDIRECT_URI MISMATCH!\n` +
      `  Used:     ${redirectUri}\n` +
      `  Expected: ${REDIRECT_URI_CANONICAL}\n` +
      `  This WILL cause "redirect_uri is not whitelisted" errors in Shopify.\n` +
      `  Fix: Add "${redirectUri}" to Shopify Partner Dashboard → App → Configuration → Redirect URLs`
    );
    return false;
  }
  return true;
}

/**
 * AES-GCM token encryption/decryption (shared across all Shopify functions)
 */
export async function encryptToken(token) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    console.warn('[shopifyConfig] ENCRYPTION_KEY not set — storing token as base64 only');
    return btoa(token);
  }
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoder.encode(token));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(encryptedToken) {
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