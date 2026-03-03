/**
 * shopifyWebhook
 * ------------------------------------------------------------------
 * Queue-first webhook ingestion (fast + reliable)
 * - Verifies HMAC (fail-closed)
 * - Immediately enqueues payload
 * - Separate processor drains queue and writes Orders
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function json(res, status = 200) {
  return Response.json(res, { status });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

async function hmacSha256Base64(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  // base64
  let binary = "";
  for (const c of bytes) binary += String.fromCharCode(c);
  return btoa(binary);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  if (!secret) return json({ ok: false, error: "Missing SHOPIFY_WEBHOOK_SECRET" }, 500);

  const topic = req.headers.get("x-shopify-topic") || "";
  const shop = req.headers.get("x-shopify-shop-domain") || "";
  const hmac = req.headers.get("x-shopify-hmac-sha256") || "";

  const raw = await req.text();

  // Verify HMAC (fail closed)
  const computed = await hmacSha256Base64(secret, raw);
  const hmacOk = timingSafeEqual(new TextEncoder().encode(computed), new TextEncoder().encode(hmac));
  if (!hmacOk) {
    await db.AuditLog.create({
      tenant_id: null,
      action: "shopify_webhook_hmac_failed",
      entity_type: "Webhook",
      performed_by: "system",
      details: { topic, shop },
      timestamp: new Date().toISOString(),
      category: "security",
      severity: "high",
    }).catch(() => {});
    return json({ ok: false }, 401);
  }

  // Resolve tenant by shop domain (store_key)
  const integrations = await db.PlatformIntegration.filter({
    platform: "shopify",
    store_key: shop,
  }).catch(() => []);
  const integration = integrations?.[0] || null;

  // Always accept and queue (even if tenant not found) to avoid Shopify retries storms
  const queued = await db.WebhookQueue.create({
    platform: "shopify",
    tenant_id: integration?.tenant_id || null,
    store_key: shop,
    topic,
    payload: raw,
    status: "pending",
    attempts: 0,
    next_attempt_at: new Date(Date.now() + 5_000).toISOString(),
    created_at: new Date().toISOString(),
  }).catch(() => null);

  return json({ ok: true, queued: true, queue_id: queued?.id || null }, 200);
});