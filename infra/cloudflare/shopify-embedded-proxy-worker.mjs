// Shopify embedded app entry proxy for single-origin App Bridge runtime.
// Version: 2026-03-06-shopify-embedded-proxy-v1
//
// Deploy this Worker on the SAME origin configured as Shopify application_url.
// It proxies both frontend HTML/assets and /api/functions calls to Base44,
// while setting CSP response headers required for iframe embedding.

const BASE44_ORIGIN = 'https://profit-shield-ai.base44.app';

function normalizeShop(shop) {
  if (!shop || typeof shop !== 'string') return null;
  const s = shop.toLowerCase().trim();
  if (!s) return null;
  return s.includes('.myshopify.com') ? s : `${s}.myshopify.com`;
}

function buildEmbeddedCsp(shop) {
  const ancestors = shop
    ? `frame-ancestors https://${shop} https://admin.shopify.com;`
    : `frame-ancestors https://admin.shopify.com https://*.myshopify.com;`;

  return [
    ancestors,
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

function withEmbeddedHeaders(upstream, shop) {
  const headers = new Headers(upstream.headers);
  headers.set('Content-Security-Policy', buildEmbeddedCsp(shop));
  headers.delete('x-frame-options');
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  headers.set('X-Shopify-Embedded-Proxy', 'v1');
  return headers;
}

function proxyUrl(requestUrl) {
  const upstream = new URL(BASE44_ORIGIN);
  upstream.pathname = requestUrl.pathname;
  upstream.search = requestUrl.search;
  return upstream.toString();
}

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const shop = normalizeShop(reqUrl.searchParams.get('shop'));

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // IMPORTANT: no redirects to Base44 origin.
    const upstreamRequest = new Request(proxyUrl(reqUrl), request);
    const upstreamResponse = await fetch(upstreamRequest, { redirect: 'manual' });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: withEmbeddedHeaders(upstreamResponse, shop),
    });
  },
};

