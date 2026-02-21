// /app/src/components/shopify/AppBridgeAuth.jsx
import { useEffect, useState } from "react";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";

/**
 * Shopify App Bridge Authentication (BUNDLED / NPM)
 * - No CDN script tags
 * - Works better inside Shopify Admin iframe (CSP-safe)
 */

function getApiKey() {
  if (typeof window !== "undefined" && window.__SHOPIFY_API_KEY__) {
    return window.__SHOPIFY_API_KEY__;
  }

  const meta =
    typeof window !== "undefined"
      ? document.querySelector('meta[name="shopify-api-key"]')
      : null;

  return meta?.content || null;
}

function getHost() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("host");
}

function isEmbedded() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("host");
}

export async function getAppBridgeToken() {
  try {
    if (typeof window === "undefined") return null;

    const embedded = isEmbedded();
    if (!embedded) return null; // only needed when embedded

    const host = getHost();
    const apiKey = getApiKey();

    console.info("[AB-PROOF] href=", window.location.href);
    console.info("[AB-PROOF] embedded=", embedded);
    console.info("[AB-PROOF] host=", host);
    console.info("[AB-PROOF] apiKeyPresent=", !!apiKey);

    if (!host) {
      console.error("Missing host param. Must open inside Shopify Admin.");
      return null;
    }

    if (!apiKey) {
      console.error("Missing SHOPIFY_API_KEY injection.");
      return null;
    }

    const app = createApp({ apiKey, host, forceRedirect: true });
    const token = await getSessionToken(app);

    console.info("[AB-PROOF] tokenLen=", token?.length || 0);

    return token || null;
  } catch (err) {
    console.error("App Bridge token error:", err);
    return null;
  }
}

export function useAppBridgeToken() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const tok = await getAppBridgeToken();

      if (!mounted) return;

      const embedded = isEmbedded();

      if (embedded && (!tok || tok.length < 50)) {
        setToken(null);
        setError("Failed to retrieve Shopify session token");
      } else {
        setToken(tok);
        setError(null);
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return { token, loading, error };
}