import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { getPersistedContext } from '@/components/platformContext'
import { base44 } from '@/api/base44Client'
import { stabilityAgent } from '@/agents/StabilityAgent'

function normalizeShop(shop) {
  if (!shop || typeof shop !== 'string') return null
  const trimmed = shop.toLowerCase().trim()
  if (!trimmed) return null
  return trimmed.includes('.myshopify.com') ? trimmed : `${trimmed}.myshopify.com`
}

function decodeHostParam(host) {
  if (!host || typeof host !== 'string') return null
  try {
    const normalized = host.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const decoded = atob(padded)
    if (!decoded) return null
    return decoded.startsWith('http://') || decoded.startsWith('https://')
      ? decoded
      : `https://${decoded}`
  } catch {
    return null
  }
}

function isValidEmbeddedHost(host) {
  const decoded = decodeHostParam(host)
  if (!decoded) return false
  try {
    const origin = new URL(decoded).origin
    return origin === 'https://admin.shopify.com' || /^https:\/\/[a-z0-9-]+\.myshopify\.com$/i.test(origin)
  } catch {
    return false
  }
}

function ensureEmbeddedContextParams() {
  if (typeof window === 'undefined') return

  let embedded = false
  try {
    embedded = window.top !== window.self
  } catch {
    embedded = true
  }
  if (!embedded) return

  const url = new URL(window.location.href)
  const params = url.searchParams
  const hasShop = !!params.get('shop')
  const hasHost = !!params.get('host')

  if (hasShop && hasHost) return

  const persisted = getPersistedContext(true)
  const fallbackShop = normalizeShop(
    params.get('shop')
    || persisted.shop
    || (persisted.platform === 'shopify' ? persisted.storeKey : null)
    || localStorage.getItem('resolved_shop_domain')
  )
  const fallbackHostRaw = params.get('host') || persisted.host || localStorage.getItem('resolved_host')
  const fallbackHost = isValidEmbeddedHost(fallbackHostRaw) ? fallbackHostRaw : null

  if (!fallbackShop || !fallbackHost) return

  params.set('shop', fallbackShop)
  params.set('host', fallbackHost)
  params.set('embedded', '1')
  const next = `${url.pathname}?${params.toString()}${url.hash}`
  const current = `${url.pathname}${url.search}${url.hash}`
  if (next !== current) {
    window.history.replaceState({}, '', next)
  }
}

ensureEmbeddedContextParams()

function isEmbeddedRuntime() {
  try {
    return window.top !== window.self
  } catch {
    return true
  }
}

function hasEmbeddedShopifyContext() {
  if (typeof window === 'undefined') return false
  try {
    const p = new URLSearchParams(window.location.search || '')
    if (p.get('shop') && (p.get('host') || p.get('embedded') === '1')) return true
    const persisted = getPersistedContext(true)
    return persisted?.platform === 'shopify' && !!persisted?.tenantId
  } catch {
    return false
  }
}

// Hard guard: in embedded runtime, never allow Base44 auth.me bootstrap calls.
// ShopifyEmbeddedAuthGate/session exchange is the source of truth.
if (typeof window !== 'undefined' && !window.__PS_EMBEDDED_AUTH_ME_PATCHED__) {
  window.__PS_EMBEDDED_AUTH_ME_PATCHED__ = true
  const originalAuthMe = base44?.auth?.me?.bind(base44.auth)
  if (typeof originalAuthMe === 'function') {
    base44.auth.me = async (...args) => {
      if (isEmbeddedRuntime() && hasEmbeddedShopifyContext()) {
        return null
      }
      return originalAuthMe(...args)
    }
  }
}

// Some SDK/bootstrap paths can still attempt GET /entities/User/me before
// embedded session exchange completes. In Shopify iframe mode, fail this call
// closed (local no-op response) so startup doesn't depend on Base44 login.
if (typeof window !== 'undefined' && !window.__PS_EMBEDDED_USER_ME_FETCH_GUARD__) {
  window.__PS_EMBEDDED_USER_ME_FETCH_GUARD__ = true
  const originalFetch = window.fetch.bind(window)
  const retryableStatuses = new Set([429, 500, 502, 503, 504])

  const shouldRetryApi = (url, method, status) => {
    if (!url || !method) return false
    const isApi = /\/api\/(functions|apps)\//.test(url)
    const idempotent = method === 'GET' || method === 'HEAD'
    return isApi && idempotent && retryableStatuses.has(Number(status || 0))
  }

  const fetchWithRetry = async (input, init, maxAttempts = 3) => {
    const method = (init?.method || 'GET').toUpperCase()
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url || ''
    let response = null
    for (let i = 0; i < maxAttempts; i++) {
      try {
        response = await originalFetch(input, init)
      } catch (error) {
        if (i === maxAttempts - 1) {
          stabilityAgent.logError('global_fetch_network', error, { url, method })
          return new Response(JSON.stringify({ ok: false, fallback: true, reason: 'network_error' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        }
        const waitMs = Math.min(2500, 250 * 2 ** i)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        continue
      }
      stabilityAgent.monitorStatus(response.status, { url, method })
      if (!shouldRetryApi(url, method, response.status) || i === maxAttempts - 1) {
        return response
      }
      const waitMs = Math.min(2500, 250 * 2 ** i)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
    return response
  }

  window.fetch = async (input, init) => {
    const method = (init?.method || 'GET').toUpperCase()
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input?.url || ''
    if (
      method === 'GET' &&
      isEmbeddedRuntime() &&
      hasEmbeddedShopifyContext() &&
      /\/entities\/User\/me(?:\?|$)/.test(url)
    ) {
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    return fetchWithRetry(input, init)
  }
}

if (typeof window !== 'undefined') {
  window.__PS_STABILITY_AGENT__ = stabilityAgent
}

// Some SDK paths use XHR/axios transport instead of fetch. Guard the same
// embedded-only /entities/User/me probe to avoid noisy 403 bootstrap errors.
if (typeof window !== 'undefined' && !window.__PS_EMBEDDED_USER_ME_XHR_GUARD__) {
  window.__PS_EMBEDDED_USER_ME_XHR_GUARD__ = true
  const nativeOpen = XMLHttpRequest.prototype.open
  const nativeSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__psMethod = String(method || 'GET').toUpperCase()
    this.__psUrl = typeof url === 'string' ? url : String(url || '')
    this.__psShouldStub =
      this.__psMethod === 'GET' &&
      isEmbeddedRuntime() &&
      hasEmbeddedShopifyContext() &&
      /\/entities\/User\/me(?:\?|$)/.test(this.__psUrl)
    return nativeOpen.call(this, method, url, ...rest)
  }

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    if (this.__psShouldStub) {
      const payload = '{}'
      queueMicrotask(() => {
        Object.defineProperty(this, 'readyState', { configurable: true, value: 4 })
        Object.defineProperty(this, 'status', { configurable: true, value: 200 })
        Object.defineProperty(this, 'responseText', { configurable: true, value: payload })
        Object.defineProperty(this, 'response', { configurable: true, value: payload })
        this.onreadystatechange?.()
        this.onload?.()
      })
      return
    }
    return nativeSend.call(this, body)
  }
}

// Shopify App Bridge requires the PUBLIC API key (Client ID).
// Set it in external JS (not inline HTML) so CSP can remain strict.
if (typeof window !== 'undefined' && !window.__SHOPIFY_API_KEY__) {
  window.__SHOPIFY_API_KEY__ = import.meta.env.VITE_SHOPIFY_API_KEY || '67be6ef7574f3a32bf9a218ad4582c68';
}
if (typeof window !== 'undefined' && !window.__SHOPIFY_APP_URL_ORIGIN__) {
  window.__SHOPIFY_APP_URL_ORIGIN__ = import.meta.env.VITE_SHOPIFY_APP_URL_ORIGIN || '';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
