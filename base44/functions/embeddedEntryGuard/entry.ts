/**
 * Embedded Entry Guard — Shopify embedded app HTML entrypoint.
 *
 * Shopify app URL should point here so CSP/frame-ancestors headers are applied
 * on the first HTML response (instead of static hosting defaults).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
const EMBEDDED_ENTRY_VERSION = '2026-03-06-csp-v2';

const SHOPIFY_DOMAINS = [
  'myshopify.com',
  'admin.shopify.com',
  'shopify.com',
];
function normalizeShopDomain(shop) {
  if (!shop || typeof shop !== 'string') return null;
  const trimmed = shop.toLowerCase().trim();
  if (!trimmed) return null;
  return trimmed.includes('.myshopify.com') ? trimmed : `${trimmed}.myshopify.com`;
}

function buildEmbeddedCsp(shopDomain) {
  const frameAncestors = shopDomain
    ? `frame-ancestors https://${shopDomain} https://admin.shopify.com;`
    : "frame-ancestors https://admin.shopify.com https://*.myshopify.com;";
  return [
    frameAncestors,
    "script-src 'self' https://cdn.shopify.com https://unpkg.com;",
    "connect-src 'self' https://*.myshopify.com https://admin.shopify.com https:;",
    "img-src 'self' https: data:;",
    "style-src 'self' 'unsafe-inline' https:;",
    "font-src 'self' https: data:;",
    "object-src 'none';",
    "base-uri 'self';",
  ].join(' ');
}

function isShopifyOrigin(referer = '') {
  return SHOPIFY_DOMAINS.some(d => referer.includes(d));
}

function jsonResponse(body, csp, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'X-Embedded-Entry-Version': EMBEDDED_ENTRY_VERSION,
      'X-Embedded-Entry-Source': 'function',
    },
  });
}

function htmlResponse(html, csp) {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
      'X-Embedded-Entry-Version': EMBEDDED_ENTRY_VERSION,
      'X-Embedded-Entry-Source': 'function',
    },
  });
}

async function loadAppShell(reqUrl) {
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;
  const candidates = [`${origin}/index.html`, `${origin}/`];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { headers: { Accept: 'text/html' } });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.includes('<html')) return text;
    } catch (_) {}
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const url = new URL(req.url);
  const referer = req.headers.get('referer') || '';
  const userAgent = req.headers.get('user-agent') || '';

  // Parse params from body (POST) or query (GET)
  let params = {};
  if (req.method === 'POST') {
    try { params = await req.json(); } catch { params = {}; }
  } else {
    url.searchParams.forEach((v, k) => { params[k] = v; });
  }

  const shop = normalizeShopDomain(params.shop || null);
  const host = params.host || null;
  const embedded = params.embedded === '1' || params.embedded === 'true' ? '1' : null;
  const reason = params.reason || null;           // optional reason code from caller
  const clientPath = params.path || url.pathname; // original request path
  const httpStatus = params.status ? Number(params.status) : null;

  const hasEmbeddedParams = !!(shop && (host || embedded));
  const embeddedValid = embedded === '1';

  // --- Structured server-side log ---
  const logEntry = {
    ts: new Date().toISOString(),
    event: httpStatus === 403 ? '403_BLOCKED' : 'EMBEDDED_ENTRY',
    path: clientPath,
    shop: shop || null,
    host: host ? `${host.slice(0, 12)}…` : null,
    embedded: embedded || null,
    referer: referer || null,
    userAgent: userAgent ? userAgent.slice(0, 120) : null,
    isShopifyOrigin: isShopifyOrigin(referer),
    hasEmbeddedParams,
    embeddedValid,
    reasonCode: reason || null,
    httpStatus,
  };

  if (httpStatus === 403) {
    console.error('[EmbeddedEntryGuard] 403_BLOCKED', JSON.stringify(logEntry));
  } else {
    console.log('[EmbeddedEntryGuard] ENTRY', JSON.stringify(logEntry));
  }

  // Optionally persist to AuditLog for visibility in app
  try {
    const base44 = createClientFromRequest(req).asServiceRole;
    await base44.entities.AuditLog.create({
      tenant_id: 'system',
      action: httpStatus === 403 ? '403_blocked' : 'embedded_entry',
      entity_type: 'request',
      entity_id: shop || 'unknown',
      performed_by: 'system',
      severity: httpStatus === 403 ? 'high' : 'low',
      category: 'security',
      description: httpStatus === 403
        ? `403 blocked for embedded Shopify request — reason: ${reason || 'unknown'}`
        : `Embedded entry detected for shop: ${shop}`,
      metadata: logEntry,
    });
  } catch (e) {
    // Non-fatal — logging only
    console.warn('[EmbeddedEntryGuard] AuditLog write failed:', e.message);
  }

  // --- Determine next action ---
  let nextAction = 'unknown';
  if (!shop) {
    nextAction = 'missing_shop_param';
  } else if (!embeddedValid) {
    nextAction = 'embedded_flag_invalid';
  } else if (httpStatus === 403) {
    nextAction = 'retry_after_install';
  } else {
    nextAction = 'sessionExchange';
  }

  const csp = buildEmbeddedCsp(shop);

  // Allow fast header verification with `curl -I` without forcing HTML shell fetch.
  if (req.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': csp,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        Pragma: 'no-cache',
        'X-Embedded-Entry-Version': EMBEDDED_ENTRY_VERSION,
        'X-Embedded-Entry-Source': 'function',
      },
    });
  }

  // --- Return app shell HTML (not diagnostic page) with CSP-safe headers ---
  let appShell = await loadAppShell(url);
  if (!appShell) {
    appShell = '<!doctype html><html><head><meta charset="UTF-8"/><title>ProfitShield</title></head><body><div id="root"></div></body></html>';
  }

  // If caller wants JSON (e.g. fetch from JS), return JSON
  const acceptsJson = (req.headers.get('accept') || '').includes('application/json')
    || (req.headers.get('content-type') || '').includes('application/json');

  if (acceptsJson && shop && !embeddedValid) {
    return jsonResponse({
      logged: true,
      nextAction,
      error: 'embedded must be 1 for Shopify embedded entry',
      logEntry,
    }, csp, 400);
  }

  if (acceptsJson) {
    return jsonResponse({ logged: true, nextAction, logEntry }, csp);
  }

  return htmlResponse(appShell, csp);
});
