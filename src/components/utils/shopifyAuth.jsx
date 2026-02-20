/**
 * Shopify App Bridge Authentication Helper
 * Handles session token retrieval for embedded Shopify apps
 */

export async function getShopifySessionToken({ timeoutMs = 5000 } = {}) {
  const embedded = window.top !== window.self;
  
  // Not in iframe - no Shopify token needed
  if (!embedded) {
    return null;
  }
  
  try {
    // Shopify App Bridge 4.x API: window.shopify.idToken()
    if (window.shopify?.idToken && typeof window.shopify.idToken === 'function') {
      const tokenPromise = window.shopify.idToken();
      
      const token = await Promise.race([
        tokenPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        )
      ]);
      
      if (token && typeof token === 'string') {
        console.info('[AUTH] embedded=', embedded, 'token_len=', token.length);
        return token;
      }
    }
    
    // Shopify App Bridge 3.x API: window.shopify.sessionToken
    if (window.shopify?.sessionToken?.get && typeof window.shopify.sessionToken.get === 'function') {
      const tokenPromise = window.shopify.sessionToken.get();
      
      const token = await Promise.race([
        tokenPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        )
      ]);
      
      if (token && typeof token === 'string') {
        console.info('[AUTH] embedded=', embedded, 'token_len=', token.length);
        return token;
      }
    }
    
    console.info('[AUTH] embedded=', embedded, 'token_len=', 0);
    return null;
  } catch (e) {
    console.info('[AUTH] embedded=', embedded, 'token_len=', 0);
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