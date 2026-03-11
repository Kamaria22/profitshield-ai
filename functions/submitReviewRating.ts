import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsonSafe, withEndpointGuard } from './helpers/endpointSafety.ts';
import { detectAutomatedProbe, enforcePayloadLimit, enforceRateLimit, getClientKey } from './helpers/requestGuards.ts';

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
