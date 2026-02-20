/**
 * Shopify App Bridge Authentication Helper
 * Handles session token retrieval for embedded Shopify apps
 */

let appBridgeInstance = null;

export async function getShopifySessionToken() {
  const embedded = window.top !== window.self;
  console.log('[ShopifyAuth] embedded=', embedded);
  
  // Not in iframe - no Shopify token needed
  if (!embedded) {
    console.log('[ShopifyAuth] Not embedded, skipping token');
    return null;
  }
  
  try {
    // Method 1: Use existing window.shopify API (newest App Bridge)
    if (window.shopify?.idToken) {
      const token = await window.shopify.idToken();
      console.log('[ShopifyAuth] Got token via window.shopify.idToken, length=', token?.length || 0);
      return token;
    }
    
    // Method 2: Try App Bridge 3.x (createApp)
    if (window.shopify?.sessionToken) {
      const token = await window.shopify.sessionToken.get();
      console.log('[ShopifyAuth] Got token via window.shopify.sessionToken, length=', token?.length || 0);
      return token;
    }
    
    // Method 3: Extract from URL parameters (Shopify passes session token in URL)
    const urlParams = new URLSearchParams(window.location.search);
    const idToken = urlParams.get('id_token');
    if (idToken) {
      console.log('[ShopifyAuth] Got token from URL params, length=', idToken.length);
      return idToken;
    }
    
    // Method 4: Try localStorage (some implementations cache it)
    const cachedToken = localStorage.getItem('shopify_session_token');
    if (cachedToken) {
      console.log('[ShopifyAuth] Using cached token from localStorage, length=', cachedToken.length);
      return cachedToken;
    }
    
    console.error('[ShopifyAuth] ❌ No Shopify session token available');
    console.error('[ShopifyAuth] window.shopify=', !!window.shopify);
    console.error('[ShopifyAuth] window.shopify.idToken=', !!window.shopify?.idToken);
    console.error('[ShopifyAuth] window.shopify.sessionToken=', !!window.shopify?.sessionToken);
    
    return null;
  } catch (e) {
    console.error('[ShopifyAuth] Failed to get token:', e);
    return null;
  }
}

export function isEmbedded() {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}