/**
 * PLATFORM CONTEXT - SINGLE SOURCE OF TRUTH
 * Enterprise-grade context persistence for multi-platform commerce apps.
 * Supports: Shopify (embedded + standalone), WooCommerce, BigCommerce, future platforms
 * 
 * STORAGE KEY: profitshield_ctx_v1
 * This is the ONLY localStorage key used for platform context.
 */

const STORAGE_KEY = 'profitshield_ctx_v1';

/**
 * Context Shape - always returned with all keys defined
 * @typedef {Object} PlatformContext
 * @property {string|null} platform - 'shopify'|'woocommerce'|'bigcommerce'|null
 * @property {string|null} storeKey - Normalized store identifier
 * @property {string|null} tenantId - ProfitShield tenant ID
 * @property {string|null} integrationId - PlatformIntegration record ID
 * @property {string|null} shop - Shopify shop domain (shopify only)
 * @property {string|null} host - Shopify embedded host param
 * @property {string|null} embedded - '1' if embedded mode
 * @property {string|null} debug - '1' if debug mode
 * @property {string|null} userHintEmail - Last known user email (for validation)
 * @property {number|null} persistedAt - Unix timestamp when persisted
 */

/**
 * Returns a fully-shaped empty context object
 * @returns {PlatformContext}
 */
function getEmptyContext() {
  return {
    platform: null,
    storeKey: null,
    tenantId: null,
    integrationId: null,
    shop: null,
    host: null,
    embedded: null,
    debug: null,
    userHintEmail: null,
    persistedAt: null
  };
}

/**
 * Safely checks if localStorage is available
 * @returns {boolean}
 */
function hasLocalStorage() {
  if (typeof window === 'undefined') return false;
  try {
    const test = '__storage_test__';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Parses URL search string for platform context params
 * SAFE: Always returns a fully-shaped object, never throws
 * @param {string} search - URL search string (with or without leading ?)
 * @returns {PlatformContext}
 */
export function parseQuery(search) {
  const ctx = getEmptyContext();
  
  if (!search || typeof search !== 'string') {
    return ctx;
  }
  
  try {
    // Remove leading ? if present
    const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
    const params = new URLSearchParams(cleanSearch);
    
    // Extract all known params
    ctx.platform = params.get('platform') || null;
    ctx.shop = params.get('shop') || null;
    ctx.host = params.get('host') || null;
    ctx.storeKey = params.get('store') || params.get('storeKey') || null;
    ctx.tenantId = params.get('tenant') || params.get('tenantId') || null;
    ctx.integrationId = params.get('integration') || params.get('integrationId') || null;
    
    // Platform-specific store keys
    const site = params.get('site'); // WooCommerce
    const storeHash = params.get('store_hash'); // BigCommerce
    
    // Normalize embedded/debug to '1' or null
    const embedded = params.get('embedded');
    const debug = params.get('debug');
    ctx.embedded = (embedded === '1' || embedded === 'true') ? '1' : null;
    ctx.debug = (debug === '1' || debug === 'true') ? '1' : null;
    
    // Auto-detect platform from params
    if (ctx.shop) {
      ctx.platform = 'shopify';
      ctx.storeKey = normalizeStoreKey('shopify', ctx.shop);
    } else if (ctx.platform === 'woocommerce' && site) {
      ctx.storeKey = normalizeStoreKey('woocommerce', site);
    } else if (ctx.platform === 'bigcommerce' && storeHash) {
      ctx.storeKey = normalizeStoreKey('bigcommerce', storeHash);
    } else if (ctx.platform && ctx.storeKey) {
      ctx.storeKey = normalizeStoreKey(ctx.platform, ctx.storeKey);
    }
    
  } catch (e) {
    console.warn('[platformContext] parseQuery error:', e.message);
  }
  
  return ctx;
}

/**
 * Builds a query string from context params
 * STABLE: Keys are sorted alphabetically for caching/debugging
 * @param {Partial<PlatformContext>} params
 * @returns {string} Query string WITHOUT leading ? (empty string if no params)
 */
export function buildQuery(params) {
  if (!params || typeof params !== 'object') return '';
  
  const output = new URLSearchParams();
  
  // Platform-specific formatting
  const platform = params.platform;
  const storeKey = params.storeKey;
  
  if (platform && storeKey) {
    switch (platform) {
      case 'shopify':
        output.set('shop', storeKey);
        if (params.host) output.set('host', params.host);
        if (params.embedded === '1') output.set('embedded', '1');
        break;
      
      case 'woocommerce':
        output.set('platform', 'woocommerce');
        output.set('site', storeKey);
        break;
      
      case 'bigcommerce':
        output.set('platform', 'bigcommerce');
        output.set('store_hash', storeKey);
        break;
      
      default:
        output.set('platform', platform);
        output.set('store', storeKey);
    }
  }
  
  // Always preserve debug
  if (params.debug === '1') output.set('debug', '1');
  
  // Sort keys for stable output
  const sorted = new URLSearchParams();
  const keys = Array.from(output.keys()).sort();
  for (const key of keys) {
    sorted.set(key, output.get(key));
  }
  
  return sorted.toString();
}

/**
 * Retrieves persisted platform context from localStorage
 * SAFE: Always returns a fully-shaped object, never throws
 * Auto-resets if JSON is corrupted
 * @returns {PlatformContext}
 */
export function getPersistedContext() {
  const ctx = getEmptyContext();
  
  if (!hasLocalStorage()) return ctx;
  
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ctx;
    
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      // Corrupted - clear it
      window.localStorage.removeItem(STORAGE_KEY);
      return ctx;
    }
    
    // Merge parsed values into context (only known keys)
    return {
      platform: parsed.platform || null,
      storeKey: parsed.storeKey || null,
      tenantId: parsed.tenantId || null,
      integrationId: parsed.integrationId || null,
      shop: parsed.shop || null,
      host: parsed.host || null,
      embedded: parsed.embedded === '1' ? '1' : null,
      debug: parsed.debug === '1' ? '1' : null,
      userHintEmail: parsed.userHintEmail || null,
      persistedAt: typeof parsed.persistedAt === 'number' ? parsed.persistedAt : null
    };
    
  } catch (e) {
    // JSON parse error - clear corrupted data
    console.warn('[platformContext] Corrupted persisted context, clearing:', e.message);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    return ctx;
  }
}

/**
 * Persists platform context to localStorage
 * SAFE: Merges with existing, never throws
 * @param {Partial<PlatformContext>} partial - Fields to persist (merged with existing)
 */
export function persistContext(partial) {
  if (!hasLocalStorage() || !partial) return;
  
  try {
    const existing = getPersistedContext();
    
    // Merge: only overwrite if new value is truthy (except for explicit null clearing)
    const merged = { ...existing };
    
    if (partial.platform !== undefined) merged.platform = partial.platform || null;
    if (partial.storeKey !== undefined) merged.storeKey = partial.storeKey || null;
    if (partial.tenantId !== undefined) merged.tenantId = partial.tenantId || null;
    if (partial.integrationId !== undefined) merged.integrationId = partial.integrationId || null;
    if (partial.shop !== undefined) merged.shop = partial.shop || null;
    if (partial.host !== undefined) merged.host = partial.host || null;
    if (partial.embedded !== undefined) merged.embedded = partial.embedded === '1' ? '1' : null;
    if (partial.debug !== undefined) merged.debug = partial.debug === '1' ? '1' : null;
    if (partial.userHintEmail !== undefined) merged.userHintEmail = partial.userHintEmail || null;
    
    // Always update timestamp
    merged.persistedAt = Date.now();
    
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    
  } catch (e) {
    console.warn('[platformContext] persistContext error:', e.message);
  }
}

/**
 * Clears persisted context
 * SAFE: Never throws
 */
export function clearContext() {
  if (!hasLocalStorage()) return;
  
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[platformContext] clearContext error:', e.message);
  }
}

/**
 * Normalizes a store key based on platform
 * @param {string} platform
 * @param {string} raw
 * @returns {string}
 */
export function normalizeStoreKey(platform, raw) {
  if (!raw) return '';
  
  const trimmed = String(raw).trim().toLowerCase();
  
  switch (platform) {
    case 'shopify':
      // Ensure .myshopify.com suffix
      return trimmed.includes('.myshopify.com') 
        ? trimmed 
        : `${trimmed}.myshopify.com`;
    
    case 'woocommerce':
      // Normalize URL
      let url = trimmed;
      if (!url.startsWith('http')) url = `https://${url}`;
      return url.replace(/\/+$/, '');
    
    case 'bigcommerce':
      return trimmed;
    
    default:
      return trimmed;
  }
}

/**
 * Creates a page URL that preserves platform context
 * RULES:
 * 1. Start from parseQuery(currentSearch)
 * 2. Merge in getPersistedContext()
 * 3. Merge overrides last
 * 4. Output ALWAYS includes minimum required params for platform
 * 5. debug=1 is preserved across navigation
 * 6. Never outputs malformed URLs (no duplicate ? or missing &)
 * 
 * @param {string} pageName - Page name to navigate to
 * @param {string} [currentSearch] - Current URL search string
 * @param {Partial<PlatformContext>} [overrides] - Override values
 * @returns {string} Full URL path with query params
 */
export function createPageUrl(pageName, currentSearch, overrides) {
  // Safe page name
  const safePage = (pageName || 'home').toLowerCase();
  
  // Layer 1: URL params
  const fromUrl = parseQuery(currentSearch || '');
  
  // Layer 2: Persisted context
  const fromPersisted = getPersistedContext();
  
  // Layer 3: Overrides
  const safeOverrides = overrides || {};
  
  // Merge with priority: overrides > URL > persisted
  const merged = {
    platform: safeOverrides.platform || fromUrl.platform || fromPersisted.platform || null,
    storeKey: safeOverrides.storeKey || fromUrl.storeKey || fromPersisted.storeKey || null,
    host: safeOverrides.host || fromUrl.host || fromPersisted.host || null,
    embedded: safeOverrides.embedded || fromUrl.embedded || fromPersisted.embedded || null,
    debug: safeOverrides.debug || fromUrl.debug || fromPersisted.debug || null
  };
  
  // Build query string
  const queryString = buildQuery(merged);
  const basePath = `/${safePage}`;
  
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Detects platform info from URL params
 * @param {PlatformContext} urlParams
 * @returns {{ platform: string|null, storeKey: string|null }}
 */
export function detectPlatformFromUrl(urlParams) {
  if (!urlParams) return { platform: null, storeKey: null };
  
  if (urlParams.platform && urlParams.storeKey) {
    return {
      platform: urlParams.platform,
      storeKey: urlParams.storeKey
    };
  }
  
  return { platform: null, storeKey: null };
}

/**
 * Checks if context has enough info to resolve a store
 * @param {PlatformContext} ctx
 * @returns {boolean}
 */
export function hasValidContext(ctx) {
  return !!(ctx && ctx.platform && ctx.storeKey);
}

// Legacy compatibility
export { normalizeStoreKey as normalizeShopDomain };
export { parseQuery as parseQueryParams };

// Additional helper for clearing stale context
export function clearStaleContext(validIntegrationIds) {
  if (!Array.isArray(validIntegrationIds)) return;
  
  const persisted = getPersistedContext();
  if (persisted.integrationId && !validIntegrationIds.includes(persisted.integrationId)) {
    console.log('[platformContext] Clearing stale context for integration:', persisted.integrationId);
    clearContext();
  }
}