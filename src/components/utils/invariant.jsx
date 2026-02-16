/**
 * Enterprise-grade invariant utility
 * Logs structured errors in PROD, throws in DEV
 * 
 * @param {boolean} condition - Condition that must be true
 * @param {string} message - Error message
 * @param {object} context - Additional context for debugging
 */

const isDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname.includes('preview'));

export function invariant(condition, message, context = {}) {
  if (condition) return;
  
  const errorPayload = {
    message,
    context,
    timestamp: new Date().toISOString(),
    route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  };
  
  if (isDev) {
    console.error('[INVARIANT VIOLATION]', errorPayload);
    throw new Error(`Invariant violation: ${message}`);
  } else {
    // In production, log but don't crash
    console.error('[INVARIANT]', message, context);
    // Optionally send to telemetry (rate-limited)
    logTelemetryEvent('invariant_violation', errorPayload);
  }
}

/**
 * Soft invariant - logs warning but never throws
 */
export function softInvariant(condition, message, context = {}) {
  if (condition) return;
  
  console.warn('[SOFT_INVARIANT]', message, context);
  logTelemetryEvent('soft_invariant', { message, ...context });
}

// Rate-limited telemetry logging
const telemetryCache = new Map();
const MAX_EVENTS_PER_DAY = 20;
const CACHE_KEY_PREFIX = 'telemetry_';

function logTelemetryEvent(type, payload) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${CACHE_KEY_PREFIX}${today}`;
    
    // Check rate limit
    const cached = localStorage.getItem(cacheKey);
    const count = cached ? parseInt(cached, 10) : 0;
    
    if (count >= MAX_EVENTS_PER_DAY) {
      return; // Rate limited
    }
    
    localStorage.setItem(cacheKey, String(count + 1));
    
    // Clean old cache entries
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_KEY_PREFIX) && k !== cacheKey)
      .forEach(k => localStorage.removeItem(k));
      
  } catch (e) {
    // Silently fail if localStorage unavailable
  }
}

export default invariant;