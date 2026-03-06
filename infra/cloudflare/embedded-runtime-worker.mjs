// ProfitShield Embedded Runtime Worker
// Serves the standalone embedded SPA and proxies session exchange to Base44 backend.

const DEFAULT_BASE44_API_ORIGIN = 'https://profit-shield-ai.base44.app';

function normalizeShop(shop) {
  if (!shop || typeof shop !== 'string') return null;
  const clean = shop.toLowerCase().trim();
  if (!clean) return null;
  return clean.includes('.myshopify.com') ? clean : `${clean}.myshopify.com`;
}

function buildCsp(shop) {
  const frameAncestors = shop
    ? `frame-ancestors https://${shop} https://admin.shopify.com;`
    : 'frame-ancestors https://admin.shopify.com https://*.myshopify.com;';

  return [
    frameAncestors,
    "default-src 'self' https:;",
    "script-src 'self' https://cdn.shopify.com;",
    "connect-src 'self' https://admin.shopify.com https://*.myshopify.com https:;",
    "img-src 'self' https: data:;",
    "style-src 'self' 'unsafe-inline' https:;",
    "font-src 'self' https: data:;",
    "object-src 'none';",
    "base-uri 'self';",
  ].join(' ');
}

function withSecurityHeaders(response, shop) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', buildCsp(shop));
  headers.delete('x-frame-options');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Embedded-Runtime', 'profitshield-v1');
  return headers;
}

async function serveSpa(request, env) {
  const url = new URL(request.url);
  const shop = normalizeShop(url.searchParams.get('shop'));
  const isHtmlRoute =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/dashboard' ||
    url.pathname.startsWith('/dashboard/');

  // For SPA HTML routes, always serve index.html so CSP is attached consistently.
  let assetResponse;
  if (isHtmlRoute) {
    const indexRequest = new Request(new URL('/index.html', url).toString(), request);
    assetResponse = await env.ASSETS.fetch(indexRequest);
  } else {
    assetResponse = await env.ASSETS.fetch(request);
  }

  // SPA fallback to /index.html for app routes (GET + HEAD).
  if (assetResponse.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
    const fallbackRequest = new Request(new URL('/index.html', url).toString(), request);
    assetResponse = await env.ASSETS.fetch(fallbackRequest);
  }

  return new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers: withSecurityHeaders(assetResponse, shop),
  });
}

async function proxySessionExchange(request, env) {
  const baseOrigin = env.BASE44_API_ORIGIN || DEFAULT_BASE44_API_ORIGIN;
  const upstreamUrl = `${baseOrigin}/api/functions/shopifySessionExchange`;

  const payload = await request.text();
  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: payload,
  });

  const body = await upstream.text();
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });

  return new Response(body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/shopify/session-exchange') {
      return proxySessionExchange(request, env);
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      return serveSpa(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};
