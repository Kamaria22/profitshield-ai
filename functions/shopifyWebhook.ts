/**
 * shopifyWebhook
 * ------------------------------------------------------------------
 * Queue-first webhook ingestion (fast + reliable)
 * - Verifies HMAC (fail-closed)
 * - Immediately enqueues payload
 * - Separate processor drains queue and writes Orders
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { checkReplay, detectAutomatedProbe, enforcePayloadLimit, enforceRateLimit, getClientKey } from "./helpers/requestGuards.ts";

function json(res, status = 200) {
  return Response.json(res, { status });
}

const ALLOWED_TOPICS = new Set([
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled",
  "refunds/create",
  "products/update",
  "customers/data_request",
  "customers/redact",
  "shop/redact",
  "app/uninstalled",
  "app_subscriptions/update",
]);
const SHOP_DOMAIN_RE = /^[a-z0-9-]+\.myshopify\.com$/i;

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

  const probeCheck = detectAutomatedProbe(req, 'shopify_webhook');
  if (!probeCheck.ok) return json({ ok: false, error: probeCheck.reason }, probeCheck.status || 403);

  const payloadLimit = enforcePayloadLimit(req, 1024 * 1024); // 1MB
  if (!payloadLimit.ok) return json({ ok: false, error: payloadLimit.reason }, payloadLimit.status || 413);

  const clientKey = `webhook:${getClientKey(req)}`;
  const rate = enforceRateLimit(clientKey, 240, 60_000);
  if (!rate.ok) {
    return json({ ok: false, error: rate.reason, retry_after_ms: rate.retry_after_ms }, rate.status || 429);
  }

  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  if (!secret) return json({ ok: false, error: "Missing SHOPIFY_WEBHOOK_SECRET" }, 500);

  const topic = req.headers.get("x-shopify-topic") || "";
  const shop = req.headers.get("x-shopify-shop-domain") || "";
  const hmac = req.headers.get("x-shopify-hmac-sha256") || "";
  const webhookId = req.headers.get("x-shopify-webhook-id") || "";

  if (!ALLOWED_TOPICS.has(topic)) return json({ ok: false, error: "unsupported_topic" }, 400);
  if (!SHOP_DOMAIN_RE.test(shop)) return json({ ok: false, error: "invalid_shop_domain" }, 400);
  if (!hmac) return json({ ok: false, error: "missing_hmac" }, 401);

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

  // Replay protection (best-effort per runtime instance) using webhook id.
  if (webhookId) {
    const replay = checkReplay(`${shop}:${topic}:${webhookId}`, 10 * 60 * 1000);
    if (replay.replay) {
      return json({ ok: true, duplicate: true, ignored: true }, 200);
    }
  }

  // Resolve tenant by shop domain (store_key)
  const integrations = await db.PlatformIntegration.filter({
    platform: "shopify",
    store_key: shop,
  }).catch(() => []);
  const integration = integrations?.[0] || null;

  const tenantId = integration?.tenant_id || null;

  // Fast-path: handle app/uninstalled synchronously (must be < 2s)
  if (topic === "app/uninstalled" && integration) {
    db.PlatformIntegration.update(integration.id, {
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
      webhook_endpoints: {},
    }).catch(() => {});
    // Clear OAuth tokens (revoke)
    db.OAuthToken.filter({ tenant_id: tenantId, platform: "shopify" }).then(tokens => {
      for (const t of tokens) {
        db.OAuthToken.update(t.id, { is_valid: false, encrypted_access_token: "", encrypted_refresh_token: "" }).catch(() => {});
      }
    }).catch(() => {});
    db.ShopifySubscriptionState?.filter({ shop_domain: shop }).then(states => {
      for (const s of states || []) {
        db.ShopifySubscriptionState.update(s.id, { status: "canceled", updated_at: new Date().toISOString() }).catch(() => {});
      }
    }).catch(() => {});
    db.AuditLog.create({
      tenant_id: tenantId,
      action: "app_uninstalled",
      entity_type: "PlatformIntegration",
      entity_id: integration.id,
      performed_by: "system",
      description: `App uninstalled from ${shop}`,
      category: "integration",
      severity: "high",
      is_auto_action: true,
    }).catch(() => {});
    return json({ ok: true, action: "uninstall_handled" }, 200);
  }

  // app_subscriptions/update — enqueue to ShopifyDeferredJob
  if (topic === "app_subscriptions/update") {
    let payload = {};
    try { payload = JSON.parse(raw); } catch {}
    db.ShopifyDeferredJob?.create({
      job_type: "subscription_update",
      shop_domain: shop,
      tenant_id: tenantId,
      payload,
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    }).catch(() => {});
    return json({ ok: true, queued: true, topic }, 200);
  }

  // All other topics: queue as before
  const queued = await db.WebhookQueue.create({
    platform: "shopify",
    tenant_id: tenantId,
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
