/**
 * Real Shopify App Bridge Authentication
 * Handles session token retrieval for embedded Shopify apps
 */

import { useEffect, useState } from 'react';

// Parse embedded params from URL
function parseEmbeddedParams() {
  const params = new URLSearchParams(window.location.search);
  const host = params.get('host');
  const apiKey = params.get('apiKey') || '';
  
  return { host, apiKey };
}

// Get session token using App Bridge
async function getAppBridgeToken() {
  try {
    // Check if we're in embedded context
    if (typeof window === 'undefined') {
      console.log('[AppBridge] Not in browser');
      return null;
    }

    const { host, apiKey } = parseEmbeddedParams();
    
    if (!host) {
      console.log('[AppBridge] Not embedded (no host param)');
      return null;
    }

    if (!apiKey) {
      console.error('[AppBridge] ✗ No apiKey - cannot initialize App Bridge');
      return null;
    }

    console.log('[AppBridge] Initializing: host=', host, 'apiKey=', apiKey.slice(0, 10) + '...');

    // Dynamically load Shopify App Bridge
    if (!window.shopifyApp) {
      const script = document.createElement('script');
      script.src = 'https://cdn.shopify.com/s/app-bridge/3.7.1/app-bridge.min.js';
      script.async = true;
      
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    // Initialize App Bridge
    if (!window.shopifyApp?.AppBridge) {
      console.error('[AppBridge] ✗ App Bridge not loaded');
      return null;
    }

    const app = window.shopifyApp.AppBridge.createApp({
      apiKey,
      host,
      forceRedirect: true
    });

    console.log('[AppBridge] App instance created');

    // Get session token - this is the key call
    const token = await app.getSessionToken();
    
    if (!token) {
      console.error('[AppBridge] ✗ getSessionToken returned empty/null');
      return null;
    }

    console.log('[AppBridge] ✓ Token obtained, length=', token.length);
    return token;
  } catch (err) {
    console.error('[AppBridge] ✗ Error:', err.message);
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

    async function init() {
      try {
        console.log('[AppBridge-Hook] Starting token retrieval...');
        const tok = await getAppBridgeToken();
        
        if (mounted) {
          if (tok) {
            setToken(tok);
            setError(null);
          } else {
            setToken(null);
            setError('Failed to retrieve Shopify session token');
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('[AppBridge-Hook] Exception:', err);
        if (mounted) {
          setToken(null);
          setError(err.message || 'Unknown error');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  return { token, loading, error };
}

// Direct export for imperative use
export { getAppBridgeToken, parseEmbeddedParams };