import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonSafe(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: { ...DEFAULT_HEADERS, ...extraHeaders } });
}

function withEndpointGuard(name, handler, headers = {}) {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...DEFAULT_HEADERS, ...headers } });
    }
    try {
      const res = await handler(req);
      return res instanceof Response ? res : jsonSafe({ error: `${name}_invalid_response` }, 500, headers);
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return jsonSafe({ error: 'internal_error', endpoint: name, message: error?.message || String(error) }, 500, headers);
    }
  };
}

const WINDOW_MS = 60 * 1000;
const ipCounters = new Map();
const probeCounters = new Map();
function cleanupExpired(map, ttlMs = WINDOW_MS) {
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    const t = typeof v === 'number' ? v : v?.resetAt;
    if (!t || t <= now - ttlMs) map.delete(k);
  }
}
function getClientKey(req) {
  const fwd = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
  const first = fwd.split(',').map((s) => s.trim()).filter(Boolean)[0];
  return first || 'unknown';
}
function enforcePayloadLimit(req, maxBytes) {
  const len = Number(req.headers.get('content-length') || '0');
  if (!Number.isFinite(len) || len <= 0) return { ok: true };
  if (len > maxBytes) return { ok: false, reason: 'payload_too_large', status: 413 };
  return { ok: true };
}
function enforceRateLimit(key, maxPerWindow, windowMs = WINDOW_MS) {
  cleanupExpired(ipCounters, windowMs);
  const now = Date.now();
  const row = ipCounters.get(key);
  if (!row || row.resetAt <= now) {
    ipCounters.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxPerWindow - 1 };
  }
  if (row.count >= maxPerWindow) {
    return { ok: false, reason: 'rate_limited', status: 429, retry_after_ms: Math.max(0, row.resetAt - now) };
  }
  row.count += 1;
  ipCounters.set(key, row);
  return { ok: true, remaining: Math.max(0, maxPerWindow - row.count) };
}
const SCANNER_UA_PATTERNS = [/sqlmap/i, /nikto/i, /acunetix/i, /masscan/i, /zgrab/i, /nmap/i, /nessus/i, /wpscan/i, /dirbuster/i];
const PROBE_PATH_PATTERNS = [/\/wp-admin/i, /\/wp-login\.php/i, /\/\.env/i, /\/phpmyadmin/i, /\/cgi-bin\//i, /\/\.git\//i, /\/etc\/passwd/i, /union\s+select/i, /<script/i, /%3cscript/i];
function detectAutomatedProbe(req, endpointTag = 'endpoint') {
  cleanupExpired(probeCounters, 10 * 60 * 1000);
  const ip = getClientKey(req);
  const ua = req.headers.get('user-agent') || '';
  const url = new URL(req.url);
  const signal = `${url.pathname}${url.search}`;
  const uaHit = SCANNER_UA_PATTERNS.find((re) => re.test(ua));
  const pathHit = PROBE_PATH_PATTERNS.find((re) => re.test(signal));
  if (!uaHit && !pathHit) return { ok: true };
  const key = `${endpointTag}:${ip}`;
  const now = Date.now();
  const row = probeCounters.get(key);
  if (!row || row.resetAt <= now) probeCounters.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
  else {
    row.count += 1;
    probeCounters.set(key, row);
  }
  return { ok: false, status: 403, reason: 'automated_probe_detected' };
}

const VERSION = 'submit_review_rating_v1';

function normalizeShop(shop = '') {
  const clean = String(shop || '').trim().toLowerCase().replace(/^https?:\/\//, '');
  if (!clean) return '';
  return clean.includes('.myshopify.com') ? clean : `${clean}.myshopify.com`;
}

const handler = withEndpointGuard('submitReviewRating', async (req) => {
  const probeCheck = detectAutomatedProbe(req, 'submit_review_rating');
  if (!probeCheck.ok) {
    return jsonSafe({ ok: false, reason: probeCheck.reason }, probeCheck.status || 403);
  }

  const payloadLimit = enforcePayloadLimit(req, 12 * 1024);
  if (!payloadLimit.ok) {
    return jsonSafe({ ok: false, reason: payloadLimit.reason }, payloadLimit.status || 413);
  }

  const rate = enforceRateLimit(`submit_review:${getClientKey(req)}`, 20, 60_000);
  if (!rate.ok) {
    return jsonSafe({ ok: false, reason: rate.reason, retry_after_ms: rate.retry_after_ms }, rate.status || 429);
  }

  const base44 = createClientFromRequest(req).asServiceRole;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const rating = Number(body?.rating || 0);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return jsonSafe({ ok: false, reason: 'invalid_rating' }, 400);
  }

  const feedbackText = String(body?.feedback_text || '').trim().slice(0, 2000);
  const appStore = String(body?.platform || body?.app_store || 'shopify').toLowerCase();
  const shopDomain = normalizeShop(body?.shop || body?.shop_domain || body?.store_key);
  let tenantId = String(body?.tenant_id || '').trim();

  if (!tenantId && !shopDomain) {
    return jsonSafe({ ok: false, reason: 'missing_context' }, 400);
  }

  if (!tenantId && shopDomain) {
    const tenants = await base44.entities.Tenant.filter({ shop_domain: shopDomain }).catch(() => []);
    if (!tenants.length) {
      return jsonSafe({ ok: false, reason: 'tenant_not_found' }, 404);
    }
    tenantId = tenants[0].id;
  }

  const responseType = rating >= 4 ? 'review' : 'feedback';
  const now = new Date().toISOString();

  const created = await base44.entities.ReviewRequest.create({
    tenant_id: tenantId,
    app_store: appStore,
    condition_triggered: 'manual_rating_submit',
    condition_value: rating,
    triggered_at: now,
    shown_to_user: true,
    shown_at: now,
    user_response: responseType,
    review_submitted: responseType === 'review',
    rating,
    feedback_text: feedbackText || null,
  });

  return jsonSafe({
    ok: true,
    request_id: created?.id || null,
    review_submitted: responseType === 'review',
    version: VERSION,
  });
});

Deno.serve(handler);
export default handler;
