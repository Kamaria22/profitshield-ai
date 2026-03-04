import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const VERSION = "reviewer_proof_v1";

function now() {
  return new Date().toISOString();
}

async function checkWebhooks(db, shop_domain) {
  const registry = await db.ShopifyWebhookRegistry.filter({ shop_domain }).catch(() => []);
  const required = [
    "orders/create",
    "orders/updated",
    "orders/paid",
    "refunds/create",
    "customers/data_request",
    "customers/redact",
    "shop/redact",
    "app/uninstalled",
    "app_subscriptions/update"
  ];
  const topics = registry.map(r => r.topic);
  const missing = required.filter(t => !topics.includes(t));
  return { ok: missing.length === 0, registered: topics, missing };
}

async function checkBilling(db, shop_domain) {
  const sub = await db.ShopifySubscriptionState.filter({ shop_domain }, "-updated_at", 1).catch(() => []);
  if (!sub.length) return { ok: false, reason: "no_subscription_record" };
  return { ok: true, status: sub[0].status, plan: sub[0].plan };
}

async function checkGDPR(db) {
  const gdprTypes = ["gdpr_data_request", "gdpr_customer_redact", "gdpr_shop_redact"];
  const jobs = await db.ShopifyDeferredJob.filter({}).catch(() => []);
  const gdprJobs = jobs.filter(j => gdprTypes.includes(j.job_type));
  const recentDone = gdprJobs.filter(j => j.status === "done").length;
  return { ok: true, total_gdpr_jobs: gdprJobs.length, completed: recentDone };
}

async function checkUninstall(db, shop_domain) {
  const integrations = await db.PlatformIntegration.filter({ store_key: shop_domain }).catch(() => []);
  if (!integrations.length) return { ok: false, reason: "no_integration_record" };
  return { ok: true, status: integrations[0].status };
}

async function checkSync(db, tenant_id) {
  if (!tenant_id) return { ok: false, reason: "no_tenant_id" };
  const orders = await db.Order.filter({ tenant_id }, "-created_date", 5).catch(() => []);
  return { ok: true, orders_found: orders.length, is_demo: orders.every(o => o.is_demo) };
}

async function checkRateLimit(db, shop_domain) {
  const integration = await db.PlatformIntegration.filter({ store_key: shop_domain }, "-updated_date", 1).catch(() => []);
  if (!integration.length) return { ok: false, reason: "no_integration" };
  const rl = integration[0].rate_limit_status || {};
  return { ok: !rl.is_throttled, is_throttled: !!rl.is_throttled, requests_remaining: rl.requests_remaining ?? "unknown" };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  const payload = await req.json().catch(() => ({}));
  const { tenant_id, shop_domain } = payload;

  if (!shop_domain) {
    return Response.json({ ok: false, error: "shop_domain required" }, { status: 400 });
  }

  const [webhooks, billing, gdpr, uninstall, sync, rateLimit] = await Promise.all([
    checkWebhooks(db, shop_domain),
    checkBilling(db, shop_domain),
    checkGDPR(db),
    checkUninstall(db, shop_domain),
    checkSync(db, tenant_id),
    checkRateLimit(db, shop_domain),
  ]);

  const passed = webhooks.ok && billing.ok && uninstall.ok && sync.ok;

  return Response.json({
    ok: true,
    version: VERSION,
    timestamp: now(),
    passed,
    checks: { webhooks, billing, gdpr, uninstall, sync, rateLimit }
  });
});