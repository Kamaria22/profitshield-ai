/**
 * Shopify App Bridge Authentication Helper
 * Handles session token retrieval for embedded Shopify apps
 */

let appBridgeInstance = null;

export async function getShopifySessionToken(timeoutMs = 5000) {
  const embedded = window.top !== window.self;
  console.log('[ShopifyAuth] embedded=', embedded);
  
  // Not in iframe - no Shopify token needed
  if (!embedded) {
    console.log('[ShopifyAuth] Not embedded, skipping token');
    return null;
  }
  
  // CRITICAL: Timeout wrapper to prevent infinite hangs
  const withTimeout = (promise, ms) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Token retrieval timeout')), ms)
      )
    ]);
  };
  
  try {
    // Method 1: Use existing window.shopify API (newest App Bridge)
    if (window.shopify?.idToken) {
      const token = await withTimeout(window.shopify.idToken(), timeoutMs);
      console.log('[ShopifyAuth] Got token via window.shopify.idToken, length=', token?.length || 0);
      if (token) {
        // Cache for future use
        try { localStorage.setItem('shopify_session_token', token); } catch {}
        return token;
      }
    }
    
    // Method 2: Try App Bridge 3.x (createApp)
    if (window.shopify?.sessionToken) {
      const token = await withTimeout(window.shopify.sessionToken.get(), timeoutMs);
      console.log('[ShopifyAuth] Got token via window.shopify.sessionToken, length=', token?.length || 0);
      if (token) {
        try { localStorage.setItem('shopify_session_token', token); } catch {}
        return token;
      }
    }
    
    // Method 3: Extract from URL parameters (Shopify passes session token in URL)
    const urlParams = new URLSearchParams(window.location.search);
    const idToken = urlParams.get('id_token');
    if (idToken) {
      console.log('[ShopifyAuth] Got token from URL params, length=', idToken.length);
      try { localStorage.setItem('shopify_session_token', idToken); } catch {}
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
    console.error('[ShopifyAuth] Failed to get token:', e.message);
    // On timeout or error, try cached fallback one more time
    try {
      const fallback = localStorage.getItem('shopify_session_token');
      if (fallback) {
        console.log('[ShopifyAuth] Fallback to cached token after error');
        return fallback;
      }
    } catch {}
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