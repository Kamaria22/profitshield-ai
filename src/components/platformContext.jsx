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
  DEBUG: 'ctx_debug'
};

/**
 * Parses URL search string for platform context params
 * @param {string} search - URL search string
 * @returns {Object} Parsed params
 */
export function parseQuery(search) {
  const params = new URLSearchParams(search || '');
  
  // Normalize boolean-like params
  const embedded = params.get('embedded');
  const debug = params.get('debug');
  
  return {
    // Generic
    platform: params.get('platform'),
    store: params.get('store'),
    
    // Shopify-specific
    shop: params.get('shop'),
    host: params.get('host'),
    
    // WooCommerce-specific
    site: params.get('site'),
    
    // BigCommerce-specific
    store_hash: params.get('store_hash'),
    
    // Flags
    embedded: (embedded === '1' || embedded === 'true') ? '1' : null,
    debug: (debug === '1' || debug === 'true') ? '1' : null
  };
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
 * @returns {Object} Persisted context
 */
export function getPersistedContext() {
  if (typeof localStorage === 'undefined') {
    return {
      platform: null,
      storeKey: null,
      tenantId: null,
      host: null,
      embedded: null,
      debug: null
    };
  }
  
  return {
    platform: localStorage.getItem(STORAGE_KEYS.PLATFORM),
    storeKey: localStorage.getItem(STORAGE_KEYS.STORE_KEY),
    tenantId: localStorage.getItem(STORAGE_KEYS.TENANT_ID),
    host: localStorage.getItem(STORAGE_KEYS.HOST),
    embedded: localStorage.getItem(STORAGE_KEYS.EMBEDDED),
    debug: localStorage.getItem(STORAGE_KEYS.DEBUG)
  };
}

/**
 * Persists platform context to localStorage
 * Only overwrites if value is truthy
 * @param {Object} context
 */
export function persistContext({ platform, storeKey, tenantId, host, embedded, debug }) {
  if (typeof localStorage === 'undefined') return;
  
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
}

/**
 * Clears persisted context
 */
export function clearPersistedContext() {
  if (typeof localStorage === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
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
 * @param {string} pageName - Page name to navigate to
 * @param {string} [currentSearch] - Current URL search string
 * @returns {string} Full URL path with preserved query params
 */
export function createPageUrl(pageName, currentSearch) {
  // Parse current URL params (Priority A)
  const urlParams = parseQuery(currentSearch);
  const urlContext = detectPlatformFromUrl(urlParams);
  
  // Get persisted context (Priority B fallback)
  const persisted = getPersistedContext();
  
  // Merge with URL taking priority
  const merged = {
    platform: urlContext.platform || persisted.platform,
    storeKey: urlContext.storeKey || persisted.storeKey,
    host: urlParams.host || persisted.host,
    embedded: urlParams.embedded || persisted.embedded,
    debug: urlParams.debug || persisted.debug
  };
  
  const queryString = buildQueryString(merged);
  const basePath = `/${pageName.toLowerCase()}`;
  
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