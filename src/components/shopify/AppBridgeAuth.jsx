/**
 * Shopify App Bridge Authentication (CDN version for Base44)
 */

import { useEffect, useState } from 'react';

// Get apiKey from runtime injection
function getApiKey() {
  if (typeof window !== 'undefined' && window.__SHOPIFY_API_KEY__) {
    return window.__SHOPIFY_API_KEY__;
  }

  const meta =
    typeof window !== 'undefined'
      ? document.querySelector('meta[name="shopify-api-key"]')
      : null;

  return meta?.content || null;
}

function getHost() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('host');
}

function isEmbedded() {
  if (typeof window === 'undefined') return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

async function loadAppBridgeScript() {
  if (window.appBridge) return;

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.shopify.com/s/app-bridge/3.7.1/app-bridge.min.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function getAppBridgeToken() {
  try {
    if (typeof window === 'undefined') return null;

    const embedded = window.top !== window.self;
const host = getHost();
const apiKey = getApiKey();

console.info('[AB-PROOF] href=', window.location.href);
console.info('[AB-PROOF] embedded=', embedded);
console.info('[AB-PROOF] host=', host);
console.info('[AB-PROOF] apiKeyPresent=', !!apiKey);

    if (!host) {
      console.error('Missing host param. Must open inside Shopify Admin.');
      return null;
    }

    if (!apiKey) {
      console.error('Missing SHOPIFY_API_KEY injection.');
      return null;
    }

    await loadAppBridgeScript();

    if (!window.appBridge) {
      console.error('App Bridge not available after script load.');
      return null;
    }

    const { createApp } = window.appBridge;
    const app = createApp({ apiKey, host, forceRedirect: true });

    // Load App Bridge Utils (needed to fetch session token correctly)
if (!window.appBridgeUtils) {
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src =
      "https://cdn.shopify.com/s/app-bridge-utils/3.7.1/app-bridge-utils.min.js";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const token = await window.appBridgeUtils.getSessionToken(app);

    console.info('[AB-PROOF] tokenLen=', token?.length || 0);

    return token || null;
  } catch (err) {
    console.error('App Bridge error:', err);
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
        setError('Failed to retrieve Shopify session token');
      }

      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return { token, loading, error };
}

export { getAppBridgeToken };