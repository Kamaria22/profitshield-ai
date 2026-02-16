/**
 * Creates a page URL that preserves Shopify embedded app context params.
 * 
 * @param {string} pageName - The page name to navigate to
 * @param {string} [locationSearch] - Optional query string (defaults to window.location.search)
 * @returns {string} The full URL path with preserved query params
 */
export function createPageUrl(pageName, locationSearch) {
  const searchString = locationSearch ?? (typeof window !== 'undefined' ? window.location.search : '');
  const currentParams = new URLSearchParams(searchString);
  const preservedParams = new URLSearchParams();

  // 1. Shop param: from URL or localStorage
  let shop = currentParams.get('shop');
  if (!shop && typeof localStorage !== 'undefined') {
    shop = localStorage.getItem('resolved_shop_domain');
  }
  if (shop) {
    // Normalize shop domain
    const normalizedShop = shop.includes('.myshopify.com') 
      ? shop.toLowerCase().trim()
      : `${shop.toLowerCase().trim()}.myshopify.com`;
    preservedParams.set('shop', normalizedShop);
  }

  // 2. Host param: from URL or localStorage
  let host = currentParams.get('host');
  if (!host && typeof localStorage !== 'undefined') {
    host = localStorage.getItem('resolved_host');
  }
  if (host) {
    preservedParams.set('host', host);
  }

  // 3. Embedded param: keep if present
  const embedded = currentParams.get('embedded');
  if (embedded) {
    preservedParams.set('embedded', embedded);
  }

  // 4. Debug param: keep if present
  const debug = currentParams.get('debug');
  if (debug) {
    preservedParams.set('debug', debug);
  }

  const queryString = preservedParams.toString();
  const basePath = `/${pageName.toLowerCase()}`;
  
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Persists Shopify context to localStorage for navigation fallback.
 * 
 * @param {Object} context - The context to persist
 * @param {string} [context.shopDomain] - The shop domain
 * @param {string} [context.tenantId] - The tenant ID
 * @param {string} [context.host] - The Shopify host param
 */
export function persistShopifyContext({ shopDomain, tenantId, host }) {
  if (typeof localStorage === 'undefined') return;
  
  if (shopDomain) {
    localStorage.setItem('resolved_shop_domain', shopDomain);
  }
  if (tenantId) {
    localStorage.setItem('resolved_tenant_id', tenantId);
  }
  if (host) {
    localStorage.setItem('resolved_host', host);
  }
}

/**
 * Retrieves persisted Shopify context from localStorage.
 * 
 * @returns {Object} The persisted context
 */
export function getPersistedShopifyContext() {
  if (typeof localStorage === 'undefined') {
    return { shopDomain: null, tenantId: null, host: null };
  }
  
  return {
    shopDomain: localStorage.getItem('resolved_shop_domain'),
    tenantId: localStorage.getItem('resolved_tenant_id'),
    host: localStorage.getItem('resolved_host')
  };
}