import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * GDPR Customer Data Request Webhook
 * Required by Shopify for App Store approval.
 * Fast path: validate HMAC + enqueue to ShopifyDeferredJob, return 200 immediately.
 */

async function hmacSha256Base64(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  let binary = '';
  for (const c of new Uint8Array(sig)) binary += String.fromCharCode(c);
  return btoa(binary);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    const hmacHeader = req.headers.get('x-shopify-hmac-sha256') || '';
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';

    if (!shopDomain) return Response.json({ ok: false }, { status: 400 });

    const body = await req.text();

    // HMAC validation
    const secret = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || Deno.env.get('SHOPIFY_API_SECRET') || '';
    if (secret && hmacHeader) {
      const computed = await hmacSha256Base64(secret, body);
      if (computed !== hmacHeader) {
        console.warn('[GDPR/data_request] HMAC mismatch for shop:', shopDomain);
        return Response.json({ ok: false }, { status: 401 });
      }
    }

    let payload = {};
    try { payload = JSON.parse(body); } catch {}

    // Enqueue and return 200 immediately
    await db.ShopifyDeferredJob.create({
      job_type: 'gdpr_data_request',
      shop_domain: shopDomain,
      payload: { customer: payload.customer, shop_id: payload.shop_id, orders_to_redact: payload.orders_to_redact },
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    }).catch(() => {});

    // Lightweight audit — no PII stored
    await db.AuditLog.create({
      tenant_id: null,
      action: 'gdpr_data_request_enqueued',
      entity_type: 'customer',
      performed_by: 'shopify_gdpr_webhook',
      description: `GDPR data request received for shop ${shopDomain}`,
      metadata: { shop_domain: shopDomain, request_id: payload.shop_id, enqueued_at: new Date().toISOString() },
      category: 'compliance',
    }).catch(() => {});

    return Response.json({ ok: true, enqueued: true });
    
    console.log('[GDPR] Customer data request received for shop:', shopDomain);
    
  } catch (error) {
    console.error('[GDPR] data_request error:', error);
    // Always 200 — Shopify must not retry
    return Response.json({ ok: true });
  }
});