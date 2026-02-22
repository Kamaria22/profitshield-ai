/**
 * Shopify App Bridge Authentication (Shopify CDN version)
 * - Avoids NPM imports (@shopify/app-bridge) so Vite/Base44 won't fail to resolve.
 * - Uses Shopify's CDN script (preferred for embedded app checks).
 */

import { useEffect, useState } from "react";

const APP_BRIDGE_CDN = "https://cdn.shopify.com/shopifycloud/app-bridge.js";

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
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

async function loadAppBridge() {
  if (typeof window === "undefined") return null;
  if (window["app-bridge"]) return window["app-bridge"];

  await new Promise((resolve, reject) => {
    // Avoid double-inject
    const existing = document.querySelector(`script[data-ps="app-bridge"][src="${APP_BRIDGE_CDN}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = APP_BRIDGE_CDN;
    script.async = true;
    script.defer = true;
    script.dataset.ps = "app-bridge";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return window["app-bridge"] || null;
}

export async function getAppBridgeToken() {
  try {
    if (typeof window === "undefined") return null;

    const host = getHost();
    const apiKey = getApiKey();

    console.info("[AB-PROOF] href=", window.location.href);
    console.info("[AB-PROOF] embedded=", isEmbedded());
    console.info("[AB-PROOF] host=", host);
    console.info("[AB-PROOF] apiKeyPresent=", !!apiKey);

    if (!host) {
      console.error("[AB] Missing host param. Must open inside Shopify Admin.");
      return null;
    }
    if (!apiKey) {
      console.error("[AB] Missing SHOPIFY_API_KEY injection.");
      return null;
    }

    const AppBridge = await loadAppBridge();
    if (!AppBridge?.createApp) {
      console.error("[AB] App Bridge not available after script load.");
      return null;
    }

    const app = AppBridge.createApp({
      apiKey,
      host,
      forceRedirect: true,
    });

    // In CDN build, session token util is under AppBridge.utilities
    const getSessionToken = AppBridge?.utilities?.getSessionToken;
    if (typeof getSessionToken !== "function") {
      console.error("[AB] AppBridge.utilities.getSessionToken not found.");
      return null;
    }

    const token = await getSessionToken(app);
    console.info("[AB-PROOF] tokenLen=", token?.length || 0);

    return token || null;
  } catch (err) {
    console.error("[AB] App Bridge error:", err);
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