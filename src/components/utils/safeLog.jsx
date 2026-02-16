/**
 * Safe logging utility - never logs tokens, PII, or sensitive data
 */

const SENSITIVE_PATTERNS = [
  /token/i,
  /password/i,
  /secret/i,
  /key/i,
  /authorization/i,
  /cookie/i,
  /session/i
];

const EMAIL_REGEX = /([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
const DOMAIN_REGEX = /([a-z0-9-]+\.myshopify\.com)/gi;

/**
 * Mask email addresses (ro***@gmail.com)
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const local = parts[0];
  const masked = local.length > 2 
    ? `${local.slice(0, 2)}***` 
    : '***';
  return `${masked}@${parts[1]}`;
}

/**
 * Mask store domain (my***store.myshopify.com)
 */
export function maskDomain(domain) {
  if (!domain || typeof domain !== 'string') return 'unknown';
  if (domain.length <= 6) return '***';
  return `${domain.slice(0, 3)}***${domain.slice(-10)}`;
}

/**
 * Sanitize an object for safe logging
 */
export function sanitizeForLog(obj, depth = 0) {
  if (depth > 5) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // Mask emails
    let sanitized = obj.replace(EMAIL_REGEX, (match, local, domain) => {
      return maskEmail(`${local}@${domain}`);
    });
    // Mask domains
    sanitized = sanitized.replace(DOMAIN_REGEX, maskDomain);
    return sanitized;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLog(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip sensitive keys entirely
      if (SENSITIVE_PATTERNS.some(p => p.test(key))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }
      sanitized[key] = sanitizeForLog(value, depth + 1);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Safe console.log wrapper
 */
export function safeLog(level, message, data = {}) {
  const sanitized = sanitizeForLog(data);
  const logFn = console[level] || console.log;
  logFn(`[${level.toUpperCase()}]`, message, sanitized);
}

export const log = {
  info: (msg, data) => safeLog('info', msg, data),
  warn: (msg, data) => safeLog('warn', msg, data),
  error: (msg, data) => safeLog('error', msg, data),
  debug: (msg, data) => safeLog('log', msg, data)
};

export default log;