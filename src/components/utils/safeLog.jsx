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
  /session/i,
  /credential/i,
  /bearer/i,
  /api_key/i,
  /apikey/i,
  /access_token/i,
  /refresh_token/i,
  /private/i
];

const EMAIL_REGEX = /([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
const DOMAIN_REGEX = /([a-z0-9-]+\.myshopify\.com)/gi;
const PHONE_REGEX = /(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})/g;
const ORDER_NAME_REGEX = /(#[0-9]{4,})/g;

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
 * Mask phone number (***-***-1234)
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return 'unknown';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

/**
 * Mask address (123 *** St)
 */
export function maskAddress(address) {
  if (!address || typeof address !== 'string') return 'unknown';
  const parts = address.split(' ');
  if (parts.length <= 2) return '***';
  return `${parts[0]} *** ${parts[parts.length - 1]}`;
}

/**
 * Mask order name (#****1234)
 */
export function maskOrderName(name) {
  if (!name || typeof name !== 'string') return 'unknown';
  if (name.length <= 5) return '***';
  return `#****${name.slice(-4)}`;
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
    // Mask phone numbers
    sanitized = sanitized.replace(PHONE_REGEX, maskPhone);
    // Mask order names
    sanitized = sanitized.replace(ORDER_NAME_REGEX, maskOrderName);
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