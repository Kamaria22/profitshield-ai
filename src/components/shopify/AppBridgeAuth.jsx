/**
 * Shopify App Bridge Authentication (NPM version - works in embedded apps)
 * Replaces CDN loading (which is failing with 404 / ORB).
 */

import { useEffect, useState } from "react";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";

// Get apiKey from runtime injection (Base44 / meta tag)
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

export async function getAppBridgeToken() {
  try {
    if (typeof window === "undefined") return null;

    const host = getHost();
    const apiKey = getApiKey();

    console.info("[AB-PROOF] href=", window.location.href);
    console.info("[AB-PROOF] embedded=", (() => {
      try { return window.top !== window.self; } catch { return true; }
    })());
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

    // Create App Bridge app instance (no CDN)
    const app = createApp({
      apiKey,
      host,
      forceRedirect: true,
    });

    // Get session token
    const token = await getSessionToken(app);

    console.info("[AB-PROOF] tokenLen=", token?.length || 0);

    return token || null;
  } catch (err) {
    console.error("App Bridge error:", err);
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
  }, []);

  return { token, loading, error };
}