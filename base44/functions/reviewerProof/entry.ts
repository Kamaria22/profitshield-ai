import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const VERSION = "reviewer_proof_v1";

function now() {
  return new Date().toISOString();
}

async function checkWebhooks(db, shop_domain) {
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

  // Collect registered topics from multiple sources
  const registeredSet = new Set();

  // Source 1: PlatformIntegration.webhook_endpoints
  const integrations = await db.PlatformIntegration.filter({ store_key: shop_domain }).catch(() => []);
  if (integrations.length > 0) {
    const endpoints = integrations[0].webhook_endpoints || {};
    // Keys use underscore: orders_create → orders/create, app_subscriptions_update → app_subscriptions/update
    for (const [key, val] of Object.entries(endpoints)) {
      if (val) {
        // Handle special case: app_subscriptions_update → app_subscriptions/update
        // Split on last underscore group to reconstruct topic
        // Strategy: replace ALL underscores, then fix known compound namespaces
        let topic = key.replace(/_/g, '/');
        // Fix compound namespaces: app/subscriptions/update → app_subscriptions/update
        topic = topic
          .replace('app/subscriptions/update', 'app_subscriptions/update')
          .replace('app/uninstalled', 'app/uninstalled') // already correct
          .replace('customers/data/request', 'customers/data_request');
        registeredSet.add(topic);
      }
    }
  }

  // Source 2: ShopifyWebhookRegistry (may have GDPR + subscription webhooks)
  const registry = await db.ShopifyWebhookRegistry.filter({ shop_domain }).catch(() => []);
  for (const r of registry) {
    if (r.topic && r.status !== 'missing') registeredSet.add(r.topic);
  }

  const registered = Array.from(registeredSet);
  const missing = required.filter(t => !registered.includes(t));

  return {
    ok: missing.length === 0,
    registered,
    missing,
    sources: { integration_endpoints: Object.keys(integrations[0]?.webhook_endpoints || {}).length, registry_records: registry.length }
  };
}

async function checkBilling(db, shop_domain) {
  // Check ShopifySubscriptionState first
  const sub = await db.ShopifySubscriptionState.filter({ shop_domain }, "-updated_at", 1).catch(() => []);
  if (sub.length > 0) {
    return { ok: true, status: sub[0].status, plan: sub[0].plan, source: "shopify_subscription" };
  }

  // Fallback: check Tenant record — trial and active both count as billing-enabled
  const tenants = await db.Tenant.filter({ shop_domain }).catch(() => []);
  if (tenants.length > 0) {
    const t = tenants[0];
    const validStatuses = ["trial", "active"];
    const ok = validStatuses.includes(t.plan_status) || validStatuses.includes(t.status);
    return {
      ok,
      status: t.plan_status || t.status,
      plan: t.subscription_tier,
      trial_ends_at: t.trial_ends_at,
      source: "tenant_record"
    };
  }

  return { ok: false, reason: "no_billing_record" };
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