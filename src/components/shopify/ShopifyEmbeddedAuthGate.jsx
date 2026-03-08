/**
 * ShopifyEmbeddedAuthGate
 *
 * FIRST RENDER PATH in embedded mode. When URL has shop= + (host= or embedded=1),
 * this gate takes FULL control — no Base44 login, no auth redirect, ever.
 *
 * Authentication flow:
 *   1. Check sessionStorage cache (5 min TTL)
 *   2. Get Shopify App Bridge session token
 *   3. Exchange via shopifySessionExchange (PUBLIC endpoint — no Base44 session needed)
 *   4. Persist tenant context → platform resolver uses it immediately
 *   5. Render children (app shell) or onboarding
 *
 * On ANY failure: show Shopify-branded error with Retry + Reinstall — NEVER Base44 login.
 */

import React, { useEffect, useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getFreshAppBridgeToken, hasValidAppBridgeContext } from '@/components/shopify/AppBridgeAuth';
import { persistContext } from '@/components/platformContext';
import { stabilityAgent } from '@/agents/StabilityAgent';
import { Shield, Loader2, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import ShopifyOnboarding from '@/pages/ShopifyOnboarding';
import createApp from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';

// ─── Constants ──────────────────────────────────────────────────────────────

const SHOPIFY_AUTH_KEY = 'shopify_embedded_auth';
const AUTH_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── CSP via HTTP Headers ───────────────────────────────────────────────────
// NOTE: CSP frame-ancestors must be delivered via HTTP headers, not meta tags.
// Meta tag CSP is ignored by browsers for frame-ancestors directive.
// Headers are set on the server side in shopifySessionExchange and shopifyAuth.

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isEmbeddedContext() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return !!(p.get('shop') && (p.get('host') || p.get('embedded') === '1'));
}

function getShopParam() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const shop = p.get('shop');
  if (!shop) return null;
  return shop.toLowerCase().includes('.myshopify.com')
    ? shop.toLowerCase()
    : `${shop.toLowerCase()}.myshopify.com`;
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

function redirectRemote(url) {
  try {
    if (!hasValidAppBridgeContext()) return false;
    const p = new URLSearchParams(window.location.search);
    const host = p.get('host');
    const shop = p.get('shop');
    const apiKey = window.__SHOPIFY_API_KEY__;
    if (!host || !apiKey) throw new Error('missing_host_or_api_key');
    const normalizedShop = shop && (shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`);
    const app = createApp({
      apiKey,
      host,
      shopOrigin: normalizedShop ? `https://${normalizedShop}` : undefined,
      forceRedirect: true,
    });
    Redirect.create(app).dispatch(Redirect.Action.REMOTE, url);
    return true;
  } catch {
    return false;
  }
}

export function clearEmbeddedAuthCache() {
  try { sessionStorage.removeItem(SHOPIFY_AUTH_KEY); } catch {}
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Props:
 *   children       – rendered when auth complete or not in embedded context
 *   onAuthenticated(ctx) – called with { tenantId, integrationId, shopDomain, platform }
 */
export default function ShopifyEmbeddedAuthGate({ children, onAuthenticated }) {
  const embedded = isEmbeddedContext();

  // phases: 'authenticating' | 'done' | 'install_required' | 'onboarding' | 'error'
  const [phase, setPhase] = useState(embedded ? 'authenticating' : 'done');
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [installData, setInstallData] = useState(null);
  const [authCtx, setAuthCtx] = useState(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!embedded) return;
    runAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, retryCount]);

  async function exchangeSession({ sessionToken, shopDomain }) {
    const payload = {
      session_token: sessionToken || undefined,
      shop: shopDomain,
    };

    // Primary path: dedicated exchange function.
    try {
      const primaryResult = await stabilityAgent.retry(() => base44.functions.invoke('shopifySessionExchange', payload), {
        attempts: 2,
        baseDelayMs: 300
      });
      if (primaryResult && typeof primaryResult === 'object') return primaryResult;
    } catch (e) {
      console.warn('[ShopifyEmbeddedAuthGate] shopifySessionExchange invoke failed:', e?.message || String(e));
    }

    // Durable fallback path: shopifyAuth action-based exchange.
    try {
      const fallbackResult = await stabilityAgent.retry(() => base44.functions.invoke('shopifyAuth', {
        action: 'session_exchange',
        ...payload,
      }), {
        attempts: 2,
        baseDelayMs: 300
      });
      if (fallbackResult && typeof fallbackResult === 'object') return fallbackResult;
      return { data: { authenticated: false, ok: false, fallback: true, reason: 'session_exchange_unreachable' } };
    } catch (e) {
      console.warn('[ShopifyEmbeddedAuthGate] shopifyAuth session_exchange fallback failed:', e?.message || String(e));
      return { data: { authenticated: false, ok: false, fallback: true, reason: 'session_exchange_failed' } };
    }
  }

  async function runAuth() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('authenticating');
    setError(null);

    try {
      // ── 1. Cache check ────────────────────────────────────────────────────
      const cached = getCachedAuth();
      if (cached?.authenticated && cached?.tenant_id) {
        applyAuth(cached);
        inFlight.current = false;
        return;
      }

      // ── 2. Get shop ───────────────────────────────────────────────────────
      const shopDomain = getShopParam();
      if (!shopDomain) {
        // Not actually embedded — fall through to normal app
        setPhase('done');
        inFlight.current = false;
        return;
      }

      // ── 3. App Bridge session token ───────────────────────────────────────
      let sessionToken = null;
      try {
        sessionToken = await getFreshAppBridgeToken({ force: true });
      } catch (e) {
        console.warn('[ShopifyEmbeddedAuthGate] App Bridge token failed:', e.message);
        // Continue — shopifySessionExchange accepts shop-only fallback
      }

      // ── 4. Exchange (PUBLIC endpoint — no Base44 session required) ────────
      console.log(`[ShopifyEmbeddedAuthGate] Exchanging: shop=${shopDomain} has_token=${!!sessionToken}`);
      const { data } = await exchangeSession({ sessionToken, shopDomain });
      console.log(`[ShopifyEmbeddedAuthGate] Result: authenticated=${data?.authenticated} reason=${data?.reason || '-'}`);

      // ── 5. Handle responses ───────────────────────────────────────────────
      if (data?.install_required) {
        const p = new URLSearchParams(window.location.search);
        setInstallData({ shopDomain, host: p.get('host') });
        setPhase('install_required');
        inFlight.current = false;
        return;
      }

      if (!data?.authenticated) {
        throw new Error(data?.error || 'Shopify session exchange returned unauthenticated');
      }

      // ── 6. Persist + proceed ──────────────────────────────────────────────
      setCachedAuth(data);
      applyAuth(data);
    } catch (err) {
      console.error('[ShopifyEmbeddedAuthGate] Auth error:', err.message);
      setError(err.message || 'Authentication failed');
      setPhase('error');
    } finally {
      inFlight.current = false;
    }
  }

  function applyAuth(data) {
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');

    persistContext({
      platform: 'shopify',
      storeKey: data.shop_domain,
      tenantId: data.tenant_id,
      integrationId: data.integration_id,
      shop: data.shop_domain,
      host: host || undefined,
      embedded: '1',
    });

    const ctx = {
      tenantId: data.tenant_id,
      integrationId: data.integration_id,
      shopDomain: data.shop_domain,
      platform: 'shopify',
      isNew: !!data.is_new_tenant,
    };

    setAuthCtx(ctx);

    if (data.is_new_tenant) {
      setPhase('onboarding');
      return;
    }

    onAuthenticated?.(ctx);
    setPhase('done');
  }

  function handleRetry() {
    clearEmbeddedAuthCache();
    inFlight.current = false;
    setRetryCount(c => c + 1);
  }

  // ── Render: onboarding ────────────────────────────────────────────────────
  if (phase === 'onboarding' && authCtx) {
    return (
      <ShopifyOnboarding
        tenantId={authCtx.tenantId}
        integrationId={authCtx.integrationId}
        shopDomain={authCtx.shopDomain}
        onComplete={() => {
          onAuthenticated?.(authCtx);
          setPhase('done');
        }}
      />
    );
  }

  // ── Render: install required ──────────────────────────────────────────────
  if (phase === 'install_required') {
    const { shopDomain, host } = installData || {};
    const installUrl = `/install?shop=${shopDomain}${host ? `&host=${host}` : ''}`;

    return (
      <div className="min-h-screen bg-[#f6f6f7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: '#008060' }}>
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Complete Your Installation</h1>
          <p className="text-gray-500 text-sm mb-6">
            ProfitShield needs to finish connecting to <strong>{shopDomain}</strong>. This only takes a few seconds.
          </p>
          <button
            onClick={() => {
              if (!redirectRemote(installUrl)) {
                window.location.assign(installUrl);
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-medium text-white text-sm transition-opacity hover:opacity-90"
            style={{ background: '#008060' }}
          >
            <ExternalLink className="w-4 h-4" />
            Complete Installation
          </button>
          <p className="text-xs text-gray-400 mt-4">You'll be redirected to Shopify to authorize the app.</p>
        </div>
      </div>
    );
  }

  // ── Render: authenticating ────────────────────────────────────────────────
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

  // ── Render: error (Shopify-branded — NEVER Base44 login) ─────────────────
  if (phase === 'error') {
    const shopDomain = getShopParam();
    const reinstallUrl = `/install?shop=${shopDomain || ''}`;

    return (
      <div className="min-h-screen bg-[#f6f6f7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 bg-red-50">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Connection Error</h1>
          <p className="text-gray-500 text-sm mb-6">
            ProfitShield couldn't connect to your Shopify store. This is usually a temporary issue.
          </p>
          {error && (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 mb-6 font-mono text-left break-all">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-medium text-white text-sm transition-opacity hover:opacity-90"
              style={{ background: '#008060' }}
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>
            {shopDomain && (
              <button
                onClick={() => {
                  if (!redirectRemote(reinstallUrl)) {
                    window.location.assign(reinstallUrl);
                  }
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-medium text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Reinstall / Reconnect
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: done (or non-embedded) ───────────────────────────────────────
  return <>{children}</>;
}
