/**
 * shopifyAutoHeal
 * ------------------------------------------------------------------
 * Comprehensive Shopify auto-healing:
 * - Validates token reachability (fail-closed on 401)
 * - Canonicalizes stale DB endpoints
 * - Reconciles webhooks
 * - Performs historical sync
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const FUNCTION_NAME = "shopifyAutoHeal";
const LIVE_ID = `shopifyAutoHeal_${crypto.randomUUID()}`;

function isProdHost(host) {
  return typeof host === "string" && host.includes("base44.app");
}

function canonicalBaseUrl(req, envAppUrl) {
  const origin = req.headers.get("origin") || "";
  const candidate = (envAppUrl || origin || "").trim();

  if (!candidate.startsWith("https://")) return null;

  if (isProdHost(candidate) && candidate.includes("profit-shield-ai.base44.app")) {
    return candidate.replace(/\/+$/, "");
  }

  return candidate.replace(/\/+$/, "");
}

function needsCanonicalize(v) {
  return typeof v === "string" && v.includes("profit-shield-ai.com");
}

async function accessScopesCheck(shopDomain, token, apiVersion = "2024-10") {
  const url = `https://${shopDomain}/admin/api/${apiVersion}/oauth/access_scopes.json`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token, "Accept": "application/json" },
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

Deno.serve(async (req) => {
  const started = Date.now();
  const base44 = createClientFromRequest(req);

  let payload = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const action = payload.action || "run";

  if (action === "prove_live") {
    return Response.json(
      {
        ok: true,
        function_name: FUNCTION_NAME,
        live_id: LIVE_ID,
        ts: new Date().toISOString(),
        status_code: 200,
      },
      { status: 200 }
    );
  }

  const envAppUrl = Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL") || "";
  const baseUrl = canonicalBaseUrl(req, envAppUrl);

  if (!baseUrl) {
    return Response.json(
      {
        ok: false,
        live_id: LIVE_ID,
        error: "Cannot determine canonical base URL",
        status_code: 500,
      },
      { status: 500 }
    );
  }

  const CANONICAL_WEBHOOK_ENDPOINT = `${baseUrl}/api/functions/shopifyWebhook`;
  const CANONICAL_REDIRECT_URI = `${baseUrl}/auth/callback`;

  const tenantId = payload.tenant_id;
  const shopDomain = payload.shop_domain;

  if (!tenantId || !shopDomain) {
    return Response.json(
      {
        ok: false,
        live_id: LIVE_ID,
        error: "tenant_id and shop_domain are required",
        status_code: 400,
      },
      { status: 400 }
    );
  }

  // Load integration
  const svc = base44.asServiceRole;
  const integrations = await svc.entities.PlatformIntegration.filter({
    tenant_id: tenantId,
    platform: "shopify",
    store_key: shopDomain,
  }).catch(() => []);
  const integration = integrations?.[0] || null;

  if (!integration) {
    return Response.json(
      {
        ok: false,
        live_id: LIVE_ID,
        error: "PlatformIntegration not found",
        status_code: 404,
      },
      { status: 404 }
    );
  }

  const token = integration.encrypted_access_token || integration.access_token || integration.token;
  if (!token) {
    return Response.json(
      {
        ok: true,
        live_id: LIVE_ID,
        needs_reconnect: true,
        reason: "missing_token",
        status_code: 200,
      },
      { status: 200 }
    );
  }

  // 1) Token reachability test (fail-closed on 401)
  const scopeCheck = await accessScopesCheck(shopDomain, token);
  if (!scopeCheck.ok) {
    if (scopeCheck.status === 401) {
      await svc.entities.PlatformIntegration.update(integration.id, {
        status: "disconnected",
      }).catch(() => {});
      await svc.entities.AuditLog.create({
        tenant_id: tenantId,
        action: "shopify_token_invalid",
        entity_type: "PlatformIntegration",
        entity_id: integration.id,
        performed_by: "system",
        severity: "high",
        description: "Shopify token invalid/revoked; needs reconnect",
        details: { status: 401 },
      }).catch(() => {});

      return Response.json(
        {
          ok: true,
          live_id: LIVE_ID,
          needs_reconnect: true,
          token_reachable: false,
          status: 401,
          status_code: 200,
        },
        { status: 200 }
      );
    }

    return Response.json(
      {
        ok: false,
        live_id: LIVE_ID,
        error: `Shopify API unreachable: ${scopeCheck.status}`,
        status_code: 502,
      },
      { status: 502 }
    );
  }

  // 2) Canonicalize stale endpoint fields
  const before = {
    webhook_endpoint: integration.webhook_endpoint || null,
    app_url: integration.app_url || null,
    redirect_uri: integration.redirect_uri || null,
  };

  const shouldFix =
    needsCanonicalize(before.webhook_endpoint) ||
    needsCanonicalize(before.app_url) ||
    needsCanonicalize(before.redirect_uri) ||
    before.webhook_endpoint !== CANONICAL_WEBHOOK_ENDPOINT;

  if (shouldFix) {
    await svc.entities.PlatformIntegration.update(integration.id, {
      webhook_endpoint: CANONICAL_WEBHOOK_ENDPOINT,
      app_url: baseUrl,
      redirect_uri: CANONICAL_REDIRECT_URI,
      status: "connected",
    }).catch(() => {});

    await svc.entities.AuditLog.create({
      tenant_id: tenantId,
      action: "shopify_canonicalized",
      entity_type: "PlatformIntegration",
      entity_id: integration.id,
      performed_by: "system",
      severity: "medium",
      description: "Canonicalized Shopify endpoints to Base44 domain",
      details: {
        before,
        after: {
          webhook_endpoint: CANONICAL_WEBHOOK_ENDPOINT,
          app_url: baseUrl,
          redirect_uri: CANONICAL_REDIRECT_URI,
        },
      },
    }).catch(() => {});
  }

  // 3) Reconcile webhooks (idempotent)
  const reconcile = await base44.functions
    .invoke("shopifyReconcileWebhooks", {
      tenant_id: tenantId,
      shop_domain: shopDomain,
    })
    .catch((e) => ({ ok: false, error: e?.message }));

  // 4) Historical sync
  const syncDays = payload.days || 365;
  const sync = await base44.functions
    .invoke("shopifyHistoricalSync", {
      tenant_id: tenantId,
      shop_domain: shopDomain,
      days: syncDays,
      status: "any",
    })
    .catch((e) => ({ ok: false, error: e?.message }));

  const ordersFetched = Number(sync?.data?.orders_fetched || 0);
  const reason = ordersFetched > 0 ? "synced" : "store_has_no_orders_or_filters";

  return Response.json(
    {
      ok: true,
      live_id: LIVE_ID,
      canonical_base_url: baseUrl,
      canonical_webhook_endpoint: CANONICAL_WEBHOOK_ENDPOINT,
      canonical_redirect_uri: CANONICAL_REDIRECT_URI,
      db_endpoint_before: before.webhook_endpoint,
      db_endpoint_after: CANONICAL_WEBHOOK_ENDPOINT,
      reconcile: reconcile?.data || reconcile,
      sync: sync?.data || sync,
      found_orders_reason: reason,
      elapsed_ms: Date.now() - started,
      status_code: 200,
    },
    { status: 200 }
  );
});