/**
 * Shopify App Bridge Authentication (NPM version - works in embedded apps)
 * With fresh token management for reliable JWT handling
 */
import { useEffect, useMemo, useState } from "react";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";

// Token cache (module scope)
let cachedToken = null;
let tokenFetchedAt = 0;
const TOKEN_CACHE_TTL_MS = 20000; // 20 seconds
const TOKEN_FETCH_TIMEOUT_MS = 5000;

function decodeHostParam(host) {
  if (!host || typeof host !== "string") return null;
  try {
    const normalized = host.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = atob(padded);
    if (!decoded) return null;
    return decoded.startsWith("http://") || decoded.startsWith("https://")
      ? decoded
      : `https://${decoded}`;
  } catch {
    return null;
  }
}

function isAllowedShopifyOrigin(origin) {
  if (!origin) return false;
  return origin === "https://admin.shopify.com" || /^https:\/\/[a-z0-9-]+\.myshopify\.com$/i.test(origin);
}

function getConfiguredAppUrlOrigin() {
  if (typeof window === "undefined") return null;
  const configured = window.__SHOPIFY_APP_URL_ORIGIN__;
  if (!configured || typeof configured !== "string") return null;
  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

function getApiKey() {
  if (typeof window !== "undefined" && window.__SHOPIFY_API_KEY__) return window.__SHOPIFY_API_KEY__;

  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="shopify-api-key"]');
    return meta?.content || null;
  }
  return null;
}

function getHost() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("host");
}

function getShopOrigin() {
  if (typeof window === "undefined") return null;
  const shop = new URLSearchParams(window.location.search).get("shop");
  if (!shop) return null;
  const normalized = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  return `https://${normalized}`;
}

function getHostOrigin() {
  if (typeof window === "undefined") return null;
  const decoded = decodeHostParam(getHost());
  if (!decoded) return null;
  try {
    return new URL(decoded).origin;
  } catch {
    return null;
  }
}

function isIframeContext() {
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export function hasValidAppBridgeContext() {
  if (typeof window === "undefined") return false;
  const host = getHost();
  const apiKey = getApiKey();
  if (!host || !apiKey) return false;
  if (!isIframeContext()) return false;

  // Prevent App Bridge bootstrap when the rendered frontend origin
  // does not match the Shopify App URL origin (e.g. worker -> base44 redirect).
  const configuredOrigin = getConfiguredAppUrlOrigin();
  if (configuredOrigin && window.location.origin !== configuredOrigin) {
    return false;
  }

  const hostOrigin = getHostOrigin();
  if (!isAllowedShopifyOrigin(hostOrigin)) return false;

  const referrer = typeof document !== "undefined" ? document.referrer : "";
  if (referrer) {
    try {
      const refOrigin = new URL(referrer).origin;
      if (isAllowedShopifyOrigin(refOrigin) && refOrigin !== hostOrigin) {
        return false;
      }
    } catch {
      // Ignore malformed referrer values.
    }
  }

  return true;
}

function isEmbedded() {
  if (typeof window === "undefined") return false;
  return hasValidAppBridgeContext();
}

/**
 * Get a fresh or cached Shopify session token
 * @param {Object} options
 * @param {boolean} options.force - Force fresh token fetch (ignore cache)
 * @returns {Promise<string|null>} Token or null on failure
 */
export async function getFreshAppBridgeToken({ force = false } = {}) {
  try {
    if (typeof window === "undefined") return null;

    const host = getHost();
    const apiKey = getApiKey();
    const shopOrigin = getShopOrigin();

    // Not a valid embedded App Bridge context? No token needed.
    if (!hasValidAppBridgeContext()) {
      return null;
    }

    // Return cached token if fresh enough and not forced
    const now = Date.now();
    if (!force && cachedToken && (now - tokenFetchedAt) < TOKEN_CACHE_TTL_MS) {
      console.log(`[AB] Using cached token (${Math.round((now - tokenFetchedAt) / 1000)}s old)`);
      return cachedToken;
    }

    // Fetch fresh token
    console.log(`[AB] Fetching fresh token (force=${force})`);
    const app = createApp({ apiKey, host, shopOrigin: shopOrigin || undefined, forceRedirect: true });
    const token = await Promise.race([
      getSessionToken(app),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('app_bridge_token_timeout')), TOKEN_FETCH_TIMEOUT_MS);
      }),
    ]);

    if (token && token.length > 50) {
      cachedToken = token;
      tokenFetchedAt = now;
      console.log(`[AB] Fresh token obtained (${token.length} bytes)`);
      return token;
    }

    console.error("[AB] Token fetch returned invalid value");
    return null;
  } catch (err) {
    console.error("[AB] App Bridge error:", err?.message || err);
    return null;
  }
}

/**
 * Legacy getAppBridgeToken (uses cache by default)
 */
export async function getAppBridgeToken() {
  return getFreshAppBridgeToken({ force: false });
}

/**
 * React hook for App Bridge token with automatic initialization
 */
export function useAppBridgeToken() {
  const embedded = useMemo(() => isEmbedded(), []);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(embedded); // only "loading" in embedded
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    // Not embedded? No token needed.
    if (!embedded) {
      setToken(null);
      setLoading(false);
      setError(null);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      const tok = await getFreshAppBridgeToken({ force: false });
      if (!mounted) return;

      if (tok && tok.length > 50) {
        setToken(tok);
        setError(null);
      } else {
        setToken(null);
        setError("Failed to retrieve Shopify session token");
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [embedded]);

  return { token, loading, error };
}
