/**
 * Real Shopify App Bridge Authentication
 * Handles session token retrieval for embedded Shopify apps
 */

import { useEffect, useState } from 'react';
import { createApp } from '@shopify/app-bridge';
import { getSessionToken } from '@shopify/app-bridge-utils';

// Get apiKey from environment/config
function getApiKey() {
  // If Base44 injects a runtime global
  if (typeof window !== 'undefined' && window.__SHOPIFY_API_KEY__) {
    return window.__SHOPIFY_API_KEY__;
  }

  // If injected via meta tag
  const metaTag =
    typeof window !== 'undefined'
      ? document.querySelector('meta[name="shopify-api-key"]')
      : null;

  if (metaTag?.content) return metaTag.content;

  // Otherwise must be provided via Base44 env/config injection
  return null;
}

function getHostFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('host');
}

function isEmbedded() {
  if (typeof window === 'undefined') return false;
  try {
    return window.top !== window.self;
  } catch {
    // Cross-origin access can throw; if so, assume embedded
    return true;
  }
}

// Get session token using App Bridge (official)
async function getAppBridgeToken() {
  try {
    if (typeof window === 'undefined') return null;

    const host = getHostFromUrl();
    const apiKey = getApiKey();
    const embedded = isEmbedded();

    // PROOF LOG (must show hostPresent/apiKeyPresent)
    console.info('[AB-PROOF]', {
      embedded,
      hostPresent: !!host,
      hostLen: host?.length || 0,
      apiKeyPresent: !!apiKey,
      apiKeyLen: apiKey?.length || 0,
    });

    // Hard-fail if missing host: means not opened inside Shopify Admin
    if (!host) {
      console.error('[AppBridge] Missing host param. Open inside Shopify Admin.');
      return null;
    }

    // Hard-fail if missing apiKey: must come from env/config
    if (!apiKey) {
      console.error('[AppBridge] Missing apiKey. Provide SHOPIFY_API_KEY via env/config injection.');
      return null;
    }

    // Create App Bridge instance (official)
    const app = createApp({ apiKey, host, forceRedirect: true });
    if (!app) {
      console.error('[AppBridge] createApp returned null');
      return null;
    }

    // Get session token (official)
    const token = await getSessionToken(app);

    console.info('[AB-PROOF] tokenLen=', token?.length || 0);

    if (!token) {
      console.error('[AppBridge] getSessionToken returned empty/null');
      return null;
    }

    return token;
  } catch (err) {
    console.error('[AppBridge] Token error:', err?.message || err);
    if (err?.stack) console.error('[AppBridge] Stack:', err.stack);
    return null;
  }
}

// Hook to get App Bridge token
export function useAppBridgeToken() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('[AppBridge-Hook] Starting token retrieval...');
        const tok = await getAppBridgeToken();

        if (!mounted) return;

        if (tok && tok.length >= 100) {
          setToken(tok);
          setError(null);
          console.log('[AppBridge-Hook] ✓ Token set');
        } else {
          setToken(null);
          setError('Failed to retrieve Shopify session token');
          console.error('[AppBridge-Hook] ✗ Token retrieval failed');
        }
      } catch (e) {
        if (!mounted) return;
        setToken(null);
        setError(e?.message || 'Unknown error');
        console.error('[AppBridge-Hook] Exception:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return { token, loading, error };
}

// Optional: export for direct use elsewhere
export { getAppBridgeToken };