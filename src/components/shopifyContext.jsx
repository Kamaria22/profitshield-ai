/**
 * Shopify Context Utilities - Single Source of Truth
 * All Shopify embedded app context handling should use these functions.
 */

/**
 * Normalizes a shop domain to the standard format
 * @param {string} shopParam - Shop param (e.g., "mystore" or "mystore.myshopify.com")
 * @returns {string} Normalized shop domain (e.g., "mystore.myshopify.com")
 */
export function normalizeShopDomain(shopParam) {
  if (!shopParam) return '';
  const trimmed = shopParam.toLowerCase().trim();
  return trimmed.includes('.myshopify.com') ? trimmed : `${trimmed}.myshopify.com`;
}

/**
 * Parses URL search string for Shopify context params
 * @param {string} search - URL search string (e.g., "?shop=mystore&host=xxx")
 * @returns {Object} Parsed params {shop, host, embedded, debug}
 */
export function parseQuery(search) {
  const params = new URLSearchParams(search || '');
  return {
    shop: params.get('shop'),
    host: params.get('host'),
    embedded: params.get('embedded'),
    debug: params.get('debug')
  };
}

/**
 * Retrieves persisted Shopify context from localStorage
 * @returns {Object} {shopDomain, tenantId, host}
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

/**
 * Persists Shopify context to localStorage
 * @param {Object} context - Context to persist
 * @param {string} [context.shop] - Shop domain
 * @param {string} [context.host] - Shopify host param
 * @param {string} [context.tenantId] - Tenant ID
 */
export function persistShopifyContext({ shop, host, tenantId }) {
  if (typeof localStorage === 'undefined') return;
  if (shop) localStorage.setItem('resolved_shop_domain', shop);
  if (host) localStorage.setItem('resolved_host', host);
  if (tenantId) localStorage.setItem('resolved_tenant_id', tenantId);
}

/**
 * Builds a query string from context params (only includes non-null values)
 * @param {Object} params - Query params {shop, host, embedded, debug}
 * @returns {string} Query string (e.g., "?shop=...&host=...")
 */
export function buildQuery({ shop, host, embedded, debug }) {
  const queryParams = new URLSearchParams();
  if (shop) queryParams.set('shop', normalizeShopDomain(shop));
  if (host) queryParams.set('host', host);
  if (embedded) queryParams.set('embedded', embedded);
  if (debug) queryParams.set('debug', debug);
  const str = queryParams.toString();
  return str ? `?${str}` : '';
}

/**
 * Creates a page URL that preserves Shopify embedded app context
 * Priority: A) URL params, B) localStorage, C) nothing
 * @param {string} pageName - Page name to navigate to
 * @param {string} [locationSearch] - Current URL search string
 * @returns {string} Full URL path with preserved query params
 */
export function createPageUrl(pageName, locationSearch) {
  // Parse current URL params (Priority A)
  const urlParams = parseQuery(locationSearch);
  
  // Get persisted context (Priority B fallback)
  const persisted = getPersistedShopifyContext();
  
  // Merge with URL taking priority
  const merged = {
    shop: urlParams.shop || persisted.shopDomain,
    host: urlParams.host || persisted.host,
    embedded: urlParams.embedded,
    debug: urlParams.debug
  };
  
  const queryString = buildQuery(merged);
  const basePath = `/${pageName.toLowerCase()}`;
  
  return `${basePath}${queryString}`;
}

/**
 * Checks if user has admin access based on app_role
 * @param {Object} user - User object
 * @returns {boolean} True if user is admin or owner
 */
export function isUserAdmin(user) {
  if (!user) return false;
  return user.app_role === 'owner' || user.app_role === 'admin';
}