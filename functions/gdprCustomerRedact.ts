/**
 * GDPR Customer Redaction Webhook — fast path
 * Validates HMAC, enqueues job, returns 200 immediately.
 * Heavy deletion runs asynchronously via ShopifyDeferredJob processor.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function hmacSha256Base64(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  let binary = '';
  for (const c of new Uint8Array(sig)) binary += String.fromCharCode(c);
  return btoa(binary);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';

    if (!shopDomain) return Response.json({ ok: false }, { status: 400 });

    const body = await req.text();

    const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || Deno.env.get('SHOPIFY_API_SECRET') || '';
    if (!secret || !hmacHeader) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const computed = await hmacSha256Base64(secret, body);
    const valid = timingSafeEqual(new TextEncoder().encode(computed), new TextEncoder().encode(hmacHeader));
    if (!valid) {
      console.warn('[GDPR/customer_redact] HMAC mismatch for shop:', shopDomain);
      return Response.json({ ok: false }, { status: 401 });
    }

    let payload = {};
    try { payload = JSON.parse(body); } catch {}

    // Enqueue heavy work — return 200 fast
    await db.ShopifyDeferredJob.create({
      job_type: 'gdpr_customer_redact',
      shop_domain: shopDomain,
      payload: {
        customer_id: payload.customer?.id,
        orders_to_redact: payload.orders_to_redact,
        shop_id: payload.shop_id,
      },
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    }).catch(() => {});

    await db.AuditLog.create({
      tenant_id: null,
      action: 'gdpr_customer_redact_enqueued',
      entity_type: 'customer',
      performed_by: 'shopify_gdpr_webhook',
      description: `GDPR customer redact enqueued for shop ${shopDomain}`,
      metadata: { shop_domain: shopDomain, enqueued_at: new Date().toISOString() },
      category: 'compliance',
      severity: 'high',
    }).catch(() => {});

    return Response.json({ ok: true, enqueued: true });
  } catch (error) {
    console.error('[GDPR] customer_redact error:', error);
    return Response.json({ ok: true }); // Always 200
  }
});
