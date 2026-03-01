/**
 * ShopifyEmbeddedAuthGate
 * 
 * When the app is opened inside Shopify Admin (embedded=1 or ?shop= + ?host=),
 * this gate uses the Shopify App Bridge session token as the identity proof —
 * NO Google login, NO manual approval, NO redirect.
 * 
 * It exchanges the session token server-side, gets back a verified tenant identity,
 * and stores it so the platform resolver can use it immediately.
 */

import React, { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getFreshAppBridgeToken } from '@/components/shopify/AppBridgeAuth';
import { persistContext } from '@/components/platformContext';
import { Shield, Loader2, ExternalLink } from 'lucide-react';

const SHOPIFY_AUTH_KEY = 'shopify_embedded_auth';
const AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isEmbeddedContext() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return !!(p.get('shop') && (p.get('host') || p.get('embedded') === '1'));
}

function getShopParam() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const shop = p.get('shop');
  if (!shop) return null;
  return shop.toLowerCase().includes('.myshopify.com') ? shop.toLowerCase() : `${shop.toLowerCase()}.myshopify.com`;
}

function getCachedAuth() {
  try {
    const raw = sessionStorage.getItem(SHOPIFY_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.cachedAt > AUTH_TTL_MS) {
      sessionStorage.removeItem(SHOPIFY_AUTH_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function setCachedAuth(data) {
  try {
    sessionStorage.setItem(SHOPIFY_AUTH_KEY, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch {}
}

/**
 * Props:
 *   children: rendered when auth is complete or not in embedded context
 *   onAuthenticated(ctx): called with { tenantId, integrationId, shopDomain, platform }
 */
export default function ShopifyEmbeddedAuthGate({ children, onAuthenticated }) {
  const embedded = isEmbeddedContext();
  const [phase, setPhase] = useState(embedded ? 'authenticating' : 'done');
  const [error, setError] = useState(null);
  const [installData, setInstallData] = useState(null); // { shopDomain, host }
  const attempted = useRef(false);

  useEffect(() => {
    if (!embedded || attempted.current) return;
    attempted.current = true;

    // Check session cache first
    const cached = getCachedAuth();
    if (cached?.authenticated && cached?.tenant_id) {
      persistContext({
        platform: 'shopify',
        storeKey: cached.shop_domain,
        tenantId: cached.tenant_id,
        integrationId: cached.integration_id,
        shop: cached.shop_domain,
      });
      onAuthenticated?.({
        tenantId: cached.tenant_id,
        integrationId: cached.integration_id,
        shopDomain: cached.shop_domain,
        platform: 'shopify',
      });
      setPhase('done');
      return;
    }

    authenticate();
  }, [embedded]);

  async function authenticate() {
    try {
      const shopDomain = getShopParam();
      if (!shopDomain) {
        setPhase('done');
        return;
      }

      // Try to get App Bridge session token (works when fully embedded)
      let sessionToken = null;
      try {
        sessionToken = await getFreshAppBridgeToken({ force: true });
      } catch (e) {
        console.warn('[ShopifyEmbeddedAuthGate] App Bridge token failed:', e.message);
      }

      // Exchange session token (or fall back to shop param alone)
      const { data } = await base44.functions.invoke('shopifySessionExchange', {
        session_token: sessionToken || undefined,
        shop: shopDomain,
      });

      if (data?.install_required) {
        // Shop hasn't completed OAuth — show install screen with top-level redirect
        const p = new URLSearchParams(window.location.search);
        setInstallData({ shopDomain, host: p.get('host') });
        setPhase('install_required');
        return;
      }

      if (!data?.authenticated) {
        setError(data?.error || 'Shopify authentication failed');
        setPhase('error');
        return;
      }

      // Cache and persist
      setCachedAuth(data);
      persistContext({
        platform: 'shopify',
        storeKey: data.shop_domain,
        tenantId: data.tenant_id,
        integrationId: data.integration_id,
        shop: data.shop_domain,
      });

      onAuthenticated?.({
        tenantId: data.tenant_id,
        integrationId: data.integration_id,
        shopDomain: data.shop_domain,
        platform: 'shopify',
      });

      setPhase('done');
    } catch (err) {
      console.error('[ShopifyEmbeddedAuthGate] Error:', err);
      // Non-fatal — let app continue, platform resolver will handle
      setPhase('done');
    }
  }

  if (phase === 'install_required') {
    const { shopDomain, host } = installData || {};
    const installUrl = `/install?shop=${shopDomain}${host ? `&host=${host}` : ''}`;

    const handleCompleteInstall = () => {
      // Must break out of Shopify iframe
      const target = window.top || window;
      target.location.href = installUrl;
    };

    return (
      <div className="min-h-screen bg-[#f6f6f7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          {/* Shopify-green icon */}
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: '#008060' }}>
            <Shield className="w-8 h-8 text-white" />
          </div>

          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Complete Your Installation
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            ProfitShield needs to finish connecting to <strong>{shopDomain}</strong>. This only takes a few seconds.
          </p>

          <button
            onClick={handleCompleteInstall}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-medium text-white text-sm transition-opacity hover:opacity-90"
            style={{ background: '#008060' }}
          >
            <ExternalLink className="w-4 h-4" />
            Complete Installation
          </button>

          <p className="text-xs text-gray-400 mt-4">
            You'll be redirected to Shopify to authorize the app.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'authenticating') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4"
            style={{ boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}>
            <Shield className="w-6 h-6 text-white" />
          </div>
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Authenticating with Shopify...</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-slate-200 font-semibold mb-2">Authentication Failed</p>
          <p className="text-slate-400 text-sm">{error}</p>
          <p className="text-slate-500 text-xs mt-4">
            Please reinstall ProfitShield from the Shopify App Store.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}