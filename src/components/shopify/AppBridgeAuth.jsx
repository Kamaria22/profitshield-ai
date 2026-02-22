/**
 * Shopify App Bridge Authentication (NPM version - works in embedded apps)
 */
import { useEffect, useMemo, useState } from "react";
import createApp from "@shopify/app-bridge";
import { getSessionToken } from "@shopify/app-bridge-utils";

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

function isEmbedded() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("host");
}

export async function getAppBridgeToken() {
  try {
    if (typeof window === "undefined") return null;

    const host = getHost();
    const apiKey = getApiKey();

    console.info("[AB-PROOF] href=", window.location.href);
    console.info(
      "[AB-PROOF] embedded=",
      (() => {
        try {
          return window.top !== window.self;
        } catch {
          return true;
        }
      })()
    );
    console.info("[AB-PROOF] host=", host);
    console.info("[AB-PROOF] apiKeyPresent=", !!apiKey);

    if (!host) {
      console.error("[AB] Missing host param (must open inside Shopify Admin).");
      return null;
    }
    if (!apiKey) {
      console.error("[AB] Missing SHOPIFY_API_KEY injection.");
      return null;
    }

    const app = createApp({ apiKey, host, forceRedirect: true });
    const token = await getSessionToken(app);

    console.info("[AB-PROOF] tokenLen=", token?.length || 0);
    return token || null;
  } catch (err) {
    console.error("[AB] App Bridge error:", err);
    return null;
  }
}

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
  }, [embedded]);

  return { token, loading, error };
}