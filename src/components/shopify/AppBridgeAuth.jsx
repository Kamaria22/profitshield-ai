/**
 * Shopify App Bridge Authentication (NPM)
 * IMPORTANT: session tokens are short-lived.
 * This module provides:
 *  - getAppBridgeToken({ forceRefresh })  -> ALWAYS safe to call per request
 *  - useAppBridgeToken() hook             -> includes getToken() to fetch fresh token on demand
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";

function getApiKey() {
  if (typeof window !== "undefined" && window.__SHOPIFY_API_KEY__) {
    return window.__SHOPIFY_API_KEY__;
  }
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

function isEmbedded() {
  try {
    if (typeof window === "undefined") return false;
    // embedded apps typically have host param; iframe check is extra safety
    const hasHost = new URLSearchParams(window.location.search).has("host");
    return hasHost || window.top !== window.self;
  } catch {
    return true;
  }
}

function createAppBridgeApp() {
  const host = getHost();
  const apiKey = getApiKey();

  if (!host) throw new Error("Missing host param. Must open inside Shopify Admin.");
  if (!apiKey) throw new Error("Missing SHOPIFY_API_KEY injection.");

  return createApp({
    apiKey,
    host,
    forceRedirect: true,
  });
}

/**
 * Fetch a fresh session token. Safe to call on every request.
 */
export async function getAppBridgeToken() {
  if (typeof window === "undefined") return null;
  if (!isEmbedded()) return null;

  // Proof logs (keep these while debugging)
  try {
    console.info("[AB-PROOF] href=", window.location.href);
    console.info("[AB-PROOF] embedded=", true);
    console.info("[AB-PROOF] host=", getHost());
    console.info("[AB-PROOF] apiKeyPresent=", !!getApiKey());
  } catch {}

  const app = createAppBridgeApp();
  const token = await getSessionToken(app);
  console.info("[AB-PROOF] tokenLen=", token?.length || 0);
  return token || null;
}

/**
 * Hook: keeps a token for UI display, but ALSO exposes getToken()
 * so callers can fetch a fresh token per click/request.
 */
export function useAppBridgeToken() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(isEmbedded());
  const [error, setError] = useState(null);

  const embedded = useMemo(() => isEmbedded(), []);

  const getToken = useCallback(async () => {
    if (!embedded) return null;

    try {
      setLoading(true);
      const tok = await getAppBridgeToken();
      if (tok && tok.length > 50) {
        setToken(tok);
        setError(null);
        return tok;
      }
      setToken(null);
      setError("Failed to retrieve Shopify session token");
      return null;
    } catch (e) {
      console.error("App Bridge token error:", e);
      setToken(null);
      setError(e?.message || "Failed to retrieve Shopify session token");
      return null;
    } finally {
      setLoading(false);
    }
  }, [embedded]);

  // Initial load for UI indicator only (NOT relied on for downloads)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!embedded) return;
      const tok = await getToken();
      if (!mounted) return;
      // getToken already sets state
      void tok;
    })();
    return () => {
      mounted = false;
    };
  }, [embedded, getToken]);

  return { token, loading, error, getToken, embedded };
}