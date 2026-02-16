/**
 * Multi-Platform Context Utilities - Single Source of Truth
 * Supports Shopify, WooCommerce, BigCommerce context handling.
 */

const STORAGE_KEYS = {
  PLATFORM: 'ctx_platform',
  STORE_KEY: 'ctx_store_key',
  TENANT_ID: 'ctx_tenant_id',
  HOST: 'ctx_host',
  EMBEDDED: 'ctx_embedded',
  DEBUG: 'ctx_debug',
  INTEGRATION_ID: 'ctx_integration_id'
};

/**
 * Parses URL search string for platform context params
 * SAFE: Always returns an object with all keys, never throws
 * @param {string} search - URL search string
 * @returns {Object} Parsed params
 */
export function parseQuery(search) {
  const defaults = {
    platform: null,
    store: null,
    shop: null,
    host: null,
    site: null,
    store_hash: null,
    embedded: null,
    debug: null
  };
  
  // Safe handling of null/undefined search
  if (!search || typeof search !== 'string') {
    return defaults;
  }
  
  try {
    const params = new URLSearchParams(search);
    
    // Normalize boolean-like params
    const embedded = params.get('embedded');
    const debug = params.get('debug');
    
    return {
      // Generic
      platform: params.get('platform') || null,
      store: params.get('store') || null,
      
      // Shopify-specific
      shop: params.get('shop') || null,
      host: params.get('host') || null,
      
      // WooCommerce-specific
      site: params.get('site') || null,
      
      // BigCommerce-specific
      store_hash: params.get('store_hash') || null,
      
      // Flags
      embedded: (embedded === '1' || embedded === 'true') ? '1' : null,
      debug: (debug === '1' || debug === 'true') ? '1' : null
    };
  } catch (e) {
    console.warn('Error parsing query:', e.message);
    return defaults;
  }
}

/**
 * Normalizes a store key based on platform
 * @param {string} platform - Platform type
 * @param {string} raw - Raw store identifier
 * @returns {string} Normalized store key
 */
export function normalizeStoreKey(platform, raw) {
  if (!raw) return '';
  
  const trimmed = raw.trim().toLowerCase();
  
  switch (platform) {
    case 'shopify':
      // Ensure .myshopify.com suffix
      return trimmed.includes('.myshopify.com') 
        ? trimmed 
        : `${trimmed}.myshopify.com`;
    
    case 'woocommerce':
      // Normalize URL: ensure https, remove trailing slash
      let url = trimmed;
      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }
      return url.replace(/\/+$/, '');
    
    case 'bigcommerce':
      // Just lowercase the store hash
      return trimmed;
    
    default:
      return trimmed;
  }
}

/**
 * Detects platform from URL params
 * @param {Object} urlParams - Parsed URL params
 * @returns {Object} { platform, storeKey }
 */
export function detectPlatformFromUrl(urlParams) {
  // Shopify: has shop param
  if (urlParams.shop) {
    return {
      platform: 'shopify',
      storeKey: normalizeStoreKey('shopify', urlParams.shop)
    };
  }
  
  // WooCommerce: explicit platform or site param
  if (urlParams.platform === 'woocommerce' && urlParams.site) {
    return {
      platform: 'woocommerce',
      storeKey: normalizeStoreKey('woocommerce', urlParams.site)
    };
  }
  
  // BigCommerce: explicit platform or store_hash param
  if (urlParams.platform === 'bigcommerce' && urlParams.store_hash) {
    return {
      platform: 'bigcommerce',
      storeKey: normalizeStoreKey('bigcommerce', urlParams.store_hash)
    };
  }
  
  // Generic store param with platform
  if (urlParams.platform && urlParams.store) {
    return {
      platform: urlParams.platform,
      storeKey: normalizeStoreKey(urlParams.platform, urlParams.store)
    };
  }
  
  return { platform: null, storeKey: null };
}

/**
 * Retrieves persisted platform context from localStorage
 * SAFE: Always returns an object with all keys, never throws
 * @returns {Object} Persisted context
 */
export function getPersistedContext() {
  const defaults = {
    platform: null,
    storeKey: null,
    tenantId: null,
    host: null,
    embedded: null,
    debug: null,
    integrationId: null
  };
  
  // Safe check for localStorage availability (SSR, incognito, etc.)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return defaults;
  }
  
  try {
    return {
      platform: localStorage.getItem(STORAGE_KEYS.PLATFORM) || null,
      storeKey: localStorage.getItem(STORAGE_KEYS.STORE_KEY) || null,
      tenantId: localStorage.getItem(STORAGE_KEYS.TENANT_ID) || null,
      host: localStorage.getItem(STORAGE_KEYS.HOST) || null,
      embedded: localStorage.getItem(STORAGE_KEYS.EMBEDDED) || null,
      debug: localStorage.getItem(STORAGE_KEYS.DEBUG) || null,
      integrationId: localStorage.getItem(STORAGE_KEYS.INTEGRATION_ID) || null
    };
  } catch (e) {
    // localStorage blocked (incognito mode in some browsers)
    console.warn('localStorage not available:', e.message);
    return defaults;
  }
}

/**
 * Persists platform context to localStorage
 * SAFE: Only overwrites if value is truthy, never throws
 * @param {Object} context
 */
export function persistContext({ platform, storeKey, tenantId, host, embedded, debug, integrationId }) {
  // Safe check for localStorage availability
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  
  try {
    if (platform) localStorage.setItem(STORAGE_KEYS.PLATFORM, platform);
    if (storeKey) localStorage.setItem(STORAGE_KEYS.STORE_KEY, storeKey);
    if (tenantId) localStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId);
    if (host) localStorage.setItem(STORAGE_KEYS.HOST, host);
    if (embedded !== undefined && embedded !== null) {
      localStorage.setItem(STORAGE_KEYS.EMBEDDED, embedded);
    }
    if (debug !== undefined && debug !== null) {
      localStorage.setItem(STORAGE_KEYS.DEBUG, debug);
    }
    if (integrationId) localStorage.setItem(STORAGE_KEYS.INTEGRATION_ID, integrationId);
  } catch (e) {
    // localStorage blocked (incognito mode in some browsers)
    console.warn('Cannot persist context:', e.message);
  }
}

/**
 * Clears persisted context
 * SAFE: Never throws even if localStorage unavailable
 */
export function clearPersistedContext() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  
  try {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Cannot clear context:', e.message);
  }
}

/**
 * Builds query string for a specific platform context
 * @param {Object} context
 * @returns {string} Query string (without leading ?)
 */
export function buildQueryString({ platform, storeKey, host, embedded, debug }) {
  const params = new URLSearchParams();
  
  if (platform && storeKey) {
    switch (platform) {
      case 'shopify':
        params.set('shop', storeKey);
        if (host) params.set('host', host);
        if (embedded) params.set('embedded', '1');
        break;
      
      case 'woocommerce':
        params.set('platform', 'woocommerce');
        params.set('site', storeKey);
        break;
      
      case 'bigcommerce':
        params.set('platform', 'bigcommerce');
        params.set('store_hash', storeKey);
        break;
      
      default:
        params.set('platform', platform);
        params.set('store', storeKey);
    }
  }
  
  if (debug) params.set('debug', '1');
  
  return params.toString();
}

/**
 * Creates a page URL that preserves platform context
 * Priority: A) URL params, B) localStorage
 * GUARANTEE: Always rebuilds full context from either source
 * @param {string} pageName - Page name to navigate to
 * @param {string} [currentSearch] - Current URL search string
 * @returns {string} Full URL path with preserved query params
 */
export function createPageUrl(pageName, currentSearch) {
  // Safely handle null/undefined pageName
  const safePage = (pageName || 'Home').toLowerCase();
  
  // Parse current URL params (Priority A)
  const urlParams = parseQuery(currentSearch || '');
  const urlContext = detectPlatformFromUrl(urlParams);
  
  // Get persisted context (Priority B fallback)
  const persisted = getPersistedContext();
  
  // Merge with URL taking priority, ALWAYS rebuild if either source has data
  const merged = {
    platform: urlContext.platform || persisted.platform || null,
    storeKey: urlContext.storeKey || persisted.storeKey || null,
    host: urlParams.host || persisted.host || null,
    embedded: urlParams.embedded || persisted.embedded || null,
    debug: urlParams.debug || persisted.debug || null
  };
  
  // Only build query string if we have valid platform context
  const queryString = (merged.platform && merged.storeKey) 
    ? buildQueryString(merged) 
    : '';
  
  const basePath = `/${safePage}`;
  
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Checks if context is sufficient to resolve a store
 * @param {Object} context
 * @returns {boolean}
 */
export function hasValidContext(context) {
  return !!(context.platform && context.storeKey);
}

// Legacy compatibility exports
export { normalizeStoreKey as normalizeShopDomain };
export { parseQuery as parseQueryParams };