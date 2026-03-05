/**
 * Embedded Entry Guard — edge function / diagnostic endpoint
 *
 * Called from the HTML shell (index.html) via a <script> tag when
 * Shopify embedded params are detected BEFORE React hydrates.
 *
 * Responsibilities:
 *  1. Server-side log every request with embedded params.
 *  2. If a 403 would have occurred, log the reason code.
 *  3. Return 200 with a minimal diagnostic HTML page so we never
 *     hard-fail inside the Shopify Admin iframe.
 *
 * POST /  { shop, host, embedded, referer, userAgent, path, reason? }
 * GET  /  same, params via query string (for direct browser hits)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SHOPIFY_DOMAINS = [
  'myshopify.com',
  'admin.shopify.com',
  'shopify.com',
];

function isShopifyOrigin(referer = '') {
  return SHOPIFY_DOMAINS.some(d => referer.includes(d));
}

// Full CSP allowing Shopify Admin iframe embedding.
// X-Frame-Options is intentionally NOT set — Shopify requires iframe embedding
// and DENY/SAMEORIGIN would block the Shopify Admin frame.
const CSP_HEADER = [
  "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
  "frame-src https://admin.shopify.com https://*.myshopify.com https: blob:",
  "connect-src https://*.myshopify.com https://admin.shopify.com https:",
  "script-src 'self' https://cdn.shopify.com https://unpkg.com https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: https:",
  "font-src 'self' https: data:",
].join('; ');

const SHOPIFY_EMBEDDING_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Security-Policy': CSP_HEADER,
};

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: SHOPIFY_EMBEDDING_HEADERS,
  });
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...SHOPIFY_EMBEDDING_HEADERS,
    },
  });
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

  const shop = params.shop || null;
  const host = params.host || null;
  const embedded = params.embedded === '1' || params.embedded === 'true' ? '1' : null;
  const reason = params.reason || null;           // optional reason code from caller
  const clientPath = params.path || url.pathname; // original request path
  const httpStatus = params.status ? Number(params.status) : null;

  const hasEmbeddedParams = !!(shop && (host || embedded));

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
  } else if (httpStatus === 403) {
    nextAction = 'retry_after_install';
  } else {
    nextAction = 'sessionExchange';
  }

  // --- Return minimal diagnostic HTML (always 200) ---
  // This is what the Shopify Admin iframe sees if the React shell hasn't loaded yet.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="Content-Security-Policy"
    content="frame-src https://admin.shopify.com https://*.myshopify.com https: blob:; connect-src https://*.myshopify.com https://admin.shopify.com https:; script-src 'self' https://cdn.shopify.com https://unpkg.com https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https: data:;"/>
  <title>ProfitShield — Loading</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#0a0f1e;color:#e2e8f0;min-height:100vh;
         display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:rgba(15,20,40,0.9);border:1px solid rgba(255,255,255,0.08);
          border-radius:16px;padding:32px;max-width:480px;width:100%}
    .logo{width:48px;height:48px;border-radius:12px;
          background:linear-gradient(135deg,#6366f1,#8b5cf6);
          display:flex;align-items:center;justify-content:center;
          margin-bottom:16px;font-size:24px}
    h1{font-size:18px;font-weight:700;margin-bottom:4px;color:#fff}
    p{font-size:13px;color:#94a3b8;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.06)}
    td:first-child{color:#64748b;width:120px;white-space:nowrap}
    td:last-child{color:#e2e8f0;font-family:monospace;word-break:break-all}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
    .pill.ok{background:rgba(52,211,153,0.15);color:#34d399;border:1px solid rgba(52,211,153,0.3)}
    .pill.warn{background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.3)}
    .pill.err{background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3)}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🛡️</div>
    <h1>ProfitShield AI</h1>
    <p>Initializing embedded app context…</p>
    <table>
      <tr><td>Shop</td><td>${shop || '<em>not detected</em>'}</td></tr>
      <tr><td>Host</td><td>${host || '<em>not present</em>'}</td></tr>
      <tr><td>Embedded</td><td>${embedded || '0'}</td></tr>
      <tr><td>HTTP Status</td><td>
        <span class="pill ${httpStatus === 403 ? 'err' : httpStatus ? 'warn' : 'ok'}">
          ${httpStatus || '200'}
        </span>
      </td></tr>
      <tr><td>Reason Code</td><td>${reason || '—'}</td></tr>
      <tr><td>Next Action</td><td>
        <span class="pill ${nextAction === 'sessionExchange' ? 'ok' : 'warn'}">
          ${nextAction}
        </span>
      </td></tr>
      <tr><td>Referer</td><td>${referer ? referer.slice(0, 80) : '—'}</td></tr>
    </table>
    ${hasEmbeddedParams ? `
    <script>
      // Auto-redirect to app shell after diagnostic display
      setTimeout(function() {
        var p = new URLSearchParams(window.location.search);
        var shop = p.get('shop') || '${shop || ''}';
        var host = p.get('host') || '${host || ''}';
        var embedded = p.get('embedded') || '1';
        if (shop) {
          var dest = '/home?shop=' + encodeURIComponent(shop)
            + (host ? '&host=' + encodeURIComponent(host) : '')
            + '&embedded=' + embedded;
          window.top ? (window.top.location.href = dest) : (window.location.href = dest);
        }
      }, 2000);
    </script>
    <p style="margin-top:16px;text-align:center;font-size:11px;color:#475569">
      Redirecting to app in 2 seconds…
    </p>
    ` : ''}
  </div>
</body>
</html>`;

  // If caller wants JSON (e.g. fetch from JS), return JSON
  const acceptsJson = (req.headers.get('accept') || '').includes('application/json')
    || (req.headers.get('content-type') || '').includes('application/json');

  if (acceptsJson) {
    return jsonResponse({ logged: true, nextAction, logEntry });
  }

  return htmlResponse(html);
});