/**
 * URL Normalization Helper - Single Source of Truth
 * Handles all URL edge cases for download/navigation
 */

export function normalizeUrl(input) {
  if (!input || typeof input !== 'string') {
    return { ok: false, url: null, error: 'Invalid input: null or not string' };
  }

  const trimmed = input.trim();
  
  if (!trimmed) {
    return { ok: false, url: null, error: 'Empty URL after trim' };
  }

  try {
    // Already absolute with protocol
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      return { ok: true, url: url.href, parsed: url };
    }

    // Protocol-relative URL (//cdn.example.com/...)
    if (trimmed.startsWith('//')) {
      const url = new URL(`https:${trimmed}`);
      return { ok: true, url: url.href, parsed: url };
    }

    // Relative path (/api/..., /files/...)
    if (trimmed.startsWith('/')) {
      const base = window.location.origin;
      const url = new URL(trimmed, base);
      return { ok: true, url: url.href, parsed: url, wasRelative: true };
    }

    // Domain without protocol (cdn.example.com/file.mp4)
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
      const url = new URL(`https://${trimmed}`);
      return { ok: true, url: url.href, parsed: url, addedProtocol: true };
    }

    return { ok: false, url: null, error: 'Unrecognized URL format' };

  } catch (e) {
    return { ok: false, url: null, error: `URL parse failed: ${e.message}` };
  }
}

/**
 * Check if URL is external (different origin)
 */
export function isExternalUrl(url) {
  try {
    const normalized = normalizeUrl(url);
    if (!normalized.ok) return false;
    
    const urlObj = new URL(normalized.url);
    return urlObj.origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Safe navigation (respects iframe constraints)
 */
export function safeNavigate(url, options = {}) {
  const normalized = normalizeUrl(url);
  
  if (!normalized.ok) {
    console.error('[URLNormalizer] Invalid URL for navigation:', url, normalized.error);
    return { ok: false, error: normalized.error };
  }

  try {
    // External URLs: use window.top (may fail in strict iframe)
    if (isExternalUrl(normalized.url)) {
      if (options.newTab) {
        window.open(normalized.url, '_blank', 'noopener,noreferrer');
      } else {
        // Try top navigation (may be blocked by iframe policy)
        try {
          window.top.location.href = normalized.url;
        } catch (e) {
          // Fallback: open in new tab
          window.open(normalized.url, '_blank', 'noopener,noreferrer');
        }
      }
    } else {
      // Internal: safe to navigate
      window.location.href = normalized.url;
    }
    return { ok: true };
  } catch (e) {
    console.error('[URLNormalizer] Navigation failed:', e);
    return { ok: false, error: e.message };
  }
}