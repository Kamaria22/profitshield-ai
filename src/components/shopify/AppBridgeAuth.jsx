/**
 * Real Shopify App Bridge Authentication
 * Handles session token retrieval for embedded Shopify apps
 */

import { useEffect, useState } from 'react';

// Get apiKey from environment/config
function getApiKey() {
  // Try from environment variable (build-time or runtime)
  if (typeof window !== 'undefined' && window.__SHOPIFY_API_KEY__) {
    return window.__SHOPIFY_API_KEY__;
  }
  
  // Try from meta tag if injected by server
  const metaTag = typeof window !== 'undefined' ? document.querySelector('meta[name="shopify-api-key"]') : null;
  if (metaTag?.content) {
    return metaTag.content;
  }
  
  // Fallback - this will need to be provided
  return null;
}

// Get session token using App Bridge
async function getAppBridgeToken() {
  try {
    // Check if we're in embedded context
    if (typeof window === 'undefined') {
      console.log('[AppBridge] Not in browser');
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    const apiKey = getApiKey();

    // PROOF LOG 1: Context check
    console.info('[AB-PROOF]', {
      embedded: window.top !== window.self,
      hostPresent: !!host,
      hostLen: host?.length || 0,
      apiKeyPresent: !!apiKey,
      apiKeyLen: apiKey?.length || 0
    });

    // Hard-fail if not embedded or missing host
    if (!host) {
      console.error('[AppBridge] ✗ NOT EMBEDDED: Missing host param. Must open inside Shopify Admin.');
      return null;
    }

    if (!apiKey) {
      console.error('[AppBridge] ✗ FATAL: apiKey not found in env/config. Cannot initialize App Bridge.');
      return null;
    }

    console.log('[AppBridge] Initializing with host=', host.slice(0, 20) + '...');

    // Dynamically load Shopify App Bridge if not already loaded
    if (!window.shopifyApp) {
      console.log('[AppBridge] Loading App Bridge script...');
      const script = document.createElement('script');
      script.src = 'https://cdn.shopify.com/s/app-bridge/3.7.1/app-bridge.min.js';
      script.async = true;
      
      await new Promise((resolve, reject) => {
        script.onload = () => {
          console.log('[AppBridge] Script loaded');
          resolve();
        };
        script.onerror = () => {
          console.error('[AppBridge] ✗ Script load failed');
          reject(new Error('Failed to load App Bridge script'));
        };
        document.head.appendChild(script);
      });
    }

    // Check App Bridge is available
    if (!window.shopifyApp?.AppBridge) {
      console.error('[AppBridge] ✗ window.shopifyApp.AppBridge not available after script load');
      return null;
    }

    console.log('[AppBridge] Creating app instance...');
    const app = window.shopifyApp.AppBridge.createApp({
      apiKey,
      host,
      forceRedirect: true
    });

    if (!app) {
      console.error('[AppBridge] ✗ createApp returned null');
      return null;
    }

    console.log('[AppBridge] App instance created, calling getSessionToken()...');

    // Get session token
    const token = await app.getSessionToken();
    
    // PROOF LOG 2: Token retrieval result
    console.info('[AB-PROOF] tokenLen=', token?.length || 0);

    if (!token) {
      console.error('[AppBridge] ✗ getSessionToken returned empty/null');
      return null;
    }

    console.log('[AppBridge] ✓ Token obtained successfully, length=', token.length);
    return token;
  } catch (err) {
    console.error('[AppBridge] ✗ Error:', err.message);
    if (err.stack) console.error('[AppBridge] Stack:', err.stack);
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
            console.log('[AppBridge-Hook] ✓ Token set');
          } else {
            setToken(null);
            setError('Failed to retrieve Shopify session token');
            console.error('[AppBridge-Hook] ✗ Token retrieval failed');
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

export { getAppBridgeToken, useAppBridgeToken };