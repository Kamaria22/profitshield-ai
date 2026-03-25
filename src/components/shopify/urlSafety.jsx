const SHOPIFY_HOST_RE = /(^|\.)myshopify\.com$/i;

function toSafeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return new URL(raw, window.location.origin);
  } catch {
    return null;
  }
}

export function isTrustedShopifyRedirect(rawUrl) {
  const parsed = toSafeUrl(rawUrl);
  if (!parsed) return false;

  // App-relative redirects are safe.
  if (parsed.origin === window.location.origin) return true;

  // Only allow Shopify admin/myshopify domains for remote OAuth handoff.
  if (parsed.protocol !== 'https:') return false;
  if (parsed.origin === 'https://admin.shopify.com') return true;
  return SHOPIFY_HOST_RE.test(parsed.hostname);
}

export function normalizeTrustedRedirect(rawUrl, fallbackPath = '/Home') {
  const parsed = toSafeUrl(rawUrl);
  if (parsed && isTrustedShopifyRedirect(rawUrl)) {
    return parsed.toString();
  }
  return new URL(fallbackPath, window.location.origin).toString();
}
