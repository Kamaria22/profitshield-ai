/**
 * shopifyConnectionManager
 * ------------------------------------------------------------------
 * Autonomous Shopify integration manager:
 * - heal_token: validates token (access_scopes); marks disconnected on 401
 * - reconcile_webhooks: deletes stale endpoints, registers required topics (idempotent)
 * - sync_historical: pulls orders for N days (default 365) using REST pagination
 * - run_watchdog: runs heal_token + reconcile + backfill if stale
 *
 * IMPORTANT:
 * - This cannot access orders before install/OAuth.
 * - "Always works" achieved via: webhooks + periodic backfill + queue-first ingestion.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const API_VERSION = "2024-10";
const REQUIRED_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled",
  "refunds/create",
  "products/update",
  "app/uninstalled",
];

function json(res, status = 200) {
  return Response.json(res, { status });
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function canonicalShopDomain(input) {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s.endsWith(".myshopify.com")) return s;
  if (s.includes(".")) return s;
  return `${s}.myshopify.com`;
}

function appUrlFromEnv() {
  const appUrl = Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL") || "";
  return appUrl.replace(/\/+$/, "");
}

function webhookEndpointCanonical() {
  // Your deployed function webhook endpoint (Base44 domain)
  // Ensure this matches your Shopify webhook receiver route.
  // If you use Base44 functions endpoint: keep it stable.
  return `${appUrlFromEnv()}/api/functions/shopifyWebhook`;
}

async function shopifyFetch(opts) {
  const url = `https://${opts.shopDomain}/admin/api/${API_VERSION}${opts.path}`;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "X-Shopify-Access-Token": opts.accessToken,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

async function getIntegration(db, tenantId) {
  const rows = await db.PlatformIntegration.filter({ tenant_id: tenantId, platform: "shopify" }).catch(() => []);
  return rows?.[0] || null;
}

async function getOAuthToken(db, integrationId) {
  const rows = await db.OAuthToken.filter({ integration_id: integrationId }).catch(() => []);
  return rows?.[0] || null;
}

async function markIntegration(db, integrationId, patch) {
  await db.PlatformIntegration.update(integrationId, patch).catch(() => {});
}

async function audit(db, tenantId, action, details) {
  await db.AuditLog.create({
    tenant_id: tenantId,
    action,
    entity_type: "ShopifyIntegration",
    performed_by: "system",
    details,
    timestamp: nowIso(),
    category: "ai_action",
    severity: "medium",
  }).catch(() => {});
}

/** Token validity check that *really* indicates token health */
async function checkAccessScopes(shopDomain, accessToken) {
  return await shopifyFetch({
    shopDomain,
    accessToken,
    path: "/oauth/access_scopes.json",
  });
}

async function healToken(db, tenantId) {
  const integration = await getIntegration(db, tenantId);
  if (!integration) return { ok: false, error: "No Shopify integration record" };

  const tokenRow = await getOAuthToken(db, integration.id);
  if (!tokenRow?.access_token) {
    await markIntegration(db, integration.id, { status: "disconnected", last_error: "Missing access token" });
    return { ok: false, needs_reconnect: true, error: "Missing access token" };
  }

  const shopDomain = canonicalShopDomain(integration.store_key || integration.shop_domain);
  if (!shopDomain) {
    await markIntegration(db, integration.id, { status: "error", last_error: "Missing shop domain" });
    return { ok: false, error: "Missing shop domain" };
  }

  const scopeCheck = await checkAccessScopes(shopDomain, tokenRow.access_token);

  if (scopeCheck.status === 401) {
    await markIntegration(db, integration.id, {
      status: "disconnected",
      last_error: "401 from Shopify (token revoked/invalid)",
      disconnected_at: nowIso(),
    });
    await db.OAuthToken.update(tokenRow.id, { is_valid: false, last_error: "401 token revoked" }).catch(() => {});
    await audit(db, tenantId, "shopify_token_revoked", { shopDomain, status: 401 });
    return { ok: false, needs_reconnect: true, status: 401 };
  }

  if (!scopeCheck.ok) {
    await markIntegration(db, integration.id, { status: "error", last_error: `Shopify API error ${scopeCheck.status}` });
    await audit(db, tenantId, "shopify_api_error", { shopDomain, status: scopeCheck.status, data: scopeCheck.data });
    return { ok: false, status: scopeCheck.status };
  }

  // Token appears valid
  await markIntegration(db, integration.id, { status: "connected", last_error: null, last_ok_at: nowIso() });
  await db.OAuthToken.update(tokenRow.id, { is_valid: true, last_error: null }).catch(() => {});

  return { ok: true, shopDomain };
}

async function reconcileWebhooks(db, tenantId) {
  const integration = await getIntegration(db, tenantId);
  if (!integration) return { ok: false, error: "No Shopify integration record" };

  const tokenRow = await getOAuthToken(db, integration.id);
  if (!tokenRow?.access_token) return { ok: false, needs_reconnect: true, error: "Missing access token" };

  const shopDomain = canonicalShopDomain(integration.store_key || integration.shop_domain);
  if (!shopDomain) return { ok: false, error: "Missing shop domain" };

  const endpoint = webhookEndpointCanonical();

  // Pre-flight token check
  const scopeCheck = await checkAccessScopes(shopDomain, tokenRow.access_token);
  if (scopeCheck.status === 401) return { ok: false, needs_reconnect: true, status: 401 };

  // List webhooks
  const list = await shopifyFetch({ shopDomain, accessToken: tokenRow.access_token, path: "/webhooks.json?limit=250" });
  if (!list.ok) return { ok: false, error: "Failed to list webhooks", status: list.status, data: list.data };

  const existing = (list.data?.webhooks || []);
  const existingByTopic = new Map();
  for (const w of existing) {
    const t = w?.topic;
    if (!existingByTopic.has(t)) existingByTopic.set(t, []);
    existingByTopic.get(t).push(w);
  }

  const staleEndpoints = new Set();
  // Anything not matching current canonical endpoint but looks like ours gets removed
  for (const w of existing) {
    const addr = (w?.address || "").toString();
    const looksLikeUs =
      addr.includes("/api/functions/shopifyWebhook") ||
      addr.includes("profit-shield-ai.com") ||
      addr.includes("base44.app");
    const isCanonical = addr === endpoint;

    if (looksLikeUs && !isCanonical) staleEndpoints.add(String(w.id));
  }

  // Delete stale webhooks
  const deleted = [];
  for (const wid of Array.from(staleEndpoints)) {
    const del = await shopifyFetch({
      shopDomain,
      accessToken: tokenRow.access_token,
      path: `/webhooks/${wid}.json`,
      method: "DELETE",
    });
    if (del.ok) deleted.push(wid);
    await sleep(80); // gentle pacing
  }

  // Create missing topics to canonical endpoint
  const created = [];
  for (const topic of REQUIRED_TOPICS) {
    const candidates = existingByTopic.get(topic) || [];
    const hasCanonical = candidates.some((w) => String(w.address || "") === endpoint);

    if (!hasCanonical) {
      const create = await shopifyFetch({
        shopDomain,
        accessToken: tokenRow.access_token,
        path: "/webhooks.json",
        method: "POST",
        body: { webhook: { topic, address: endpoint, format: "json" } },
      });

      if (create.ok) created.push(topic);
      await sleep(120);
    }
  }

  await audit(db, tenantId, "shopify_webhooks_reconciled", { endpoint, deleted, created });

  return { ok: true, endpoint, deleted, created, required: REQUIRED_TOPICS };
}

async function upsertOrder(db, tenantId, shopifyOrder) {
  // Idempotent upsert by platform_order_id (Shopify order id)
  const platformOrderId = String(shopifyOrder.id);
  const existing = await db.Order.filter({ tenant_id: tenantId, platform_order_id: platformOrderId }).catch(() => []);
  const record = {
    tenant_id: tenantId,
    platform: "shopify",
    platform_order_id: platformOrderId,
    order_number: String(shopifyOrder.order_number || ""),
    order_date: shopifyOrder.created_at || nowIso(),
    total_price: Number(shopifyOrder.total_price || 0),
    currency: String(shopifyOrder.currency || "USD"),
    customer_email: shopifyOrder.email || shopifyOrder?.customer?.email || null,
    raw: shopifyOrder, // keep raw for debugging
    updated_at_platform: shopifyOrder.updated_at || shopifyOrder.created_at || nowIso(),
  };

  if (existing?.[0]) {
    await db.Order.update(existing[0].id, record).catch(() => {});
    return { action: "updated" };
  } else {
    await db.Order.create(record).catch(() => {});
    return { action: "created" };
  }
}

async function syncHistoricalOrders(db, tenantId, days = 365) {
  const integration = await getIntegration(db, tenantId);
  if (!integration) return { ok: false, error: "No Shopify integration record" };

  const tokenRow = await getOAuthToken(db, integration.id);
  if (!tokenRow?.access_token) return { ok: false, needs_reconnect: true, error: "Missing access token" };

  const shopDomain = canonicalShopDomain(integration.store_key || integration.shop_domain);
  if (!shopDomain) return { ok: false, error: "Missing shop domain" };

  // Token check
  const scopeCheck = await checkAccessScopes(shopDomain, tokenRow.access_token);
  if (scopeCheck.status === 401) return { ok: false, needs_reconnect: true, status: 401 };

  const since = new Date(Date.now() - days * 86400000).toISOString();

  let pageInfo = null;
  let imported = 0;
  let pages = 0;

  while (true) {
    const basePath = `/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(since)}&order=created_at asc`;
    const path = pageInfo ? `${basePath}&page_info=${encodeURIComponent(pageInfo)}` : basePath;

    const res = await shopifyFetch({ shopDomain, accessToken: tokenRow.access_token, path });
    if (res.status === 429) {
      // rate limit backoff
      await sleep(1200);
      continue;
    }
    if (!res.ok) {
      await audit(db, tenantId, "shopify_sync_failed", { status: res.status, data: res.data });
      return { ok: false, status: res.status, data: res.data, imported, pages };
    }

    const orders = (res.data?.orders || []);
    for (const o of orders) {
      await upsertOrder(db, tenantId, o);
      imported++;
    }

    pages++;
    // Pagination via Link header (REST)
    const link = res.headers.get("link") || res.headers.get("Link") || "";
    const m = /<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/i.exec(link);
    if (!m) break;
    pageInfo = decodeURIComponent(m[1]);
    await sleep(80);
    if (pages > 200) break; // safety
  }

  await markIntegration(db, integration.id, { last_sync_at: nowIso(), last_sync_status: "success" });
  await audit(db, tenantId, "shopify_sync_success", { days, imported, pages });

  return { ok: true, days, imported, pages };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.entities;
  const started = Date.now();

  let payload = {};
  try {
    const txt = await req.text();
    payload = txt ? JSON.parse(txt) : {};
  } catch {
    payload = {};
  }

  const action = payload.action || "run_watchdog";
  const tenantId = payload.tenant_id;

  if (!tenantId) return json({ ok: false, error: "tenant_id required" }, 400);

  try {
    if (action === "heal_token") {
      const r = await healToken(db, tenantId);
      return json({ ok: true, action, ...r, elapsed_ms: Date.now() - started }, 200);
    }

    if (action === "reconcile_webhooks") {
      const r = await reconcileWebhooks(db, tenantId);
      return json({ ok: true, action, ...r, elapsed_ms: Date.now() - started }, 200);
    }

    if (action === "sync_historical") {
      const days = Number(payload.days || 365);
      const r = await syncHistoricalOrders(db, tenantId, days);
      return json({ ok: true, action, ...r, elapsed_ms: Date.now() - started }, 200);
    }

    // WATCHDOG: self-heal + ensure webhooks + ensure backfill if stale
    if (action === "run_watchdog") {
      const token = await healToken(db, tenantId);
      if (!token.ok) return json({ ok: true, action, ...token, elapsed_ms: Date.now() - started }, 200);

      const hooks = await reconcileWebhooks(db, tenantId);

      // backfill if no last_sync_at or older than 6 hours
      const integration = await getIntegration(db, tenantId);
      const lastSync = integration?.last_sync_at ? new Date(integration.last_sync_at).getTime() : 0;
      const stale = !lastSync || (Date.now() - lastSync) > 6 * 3600000;

      let backfill = { skipped: true, reason: "not_stale" };
      if (stale) backfill = await syncHistoricalOrders(db, tenantId, Number(payload.days || 7)); // small backfill by default

      return json(
        {
          ok: true,
          action,
          token,
          hooks,
          backfill,
          elapsed_ms: Date.now() - started,
        },
        200
      );
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    await audit(db, tenantId, "shopify_connection_manager_error", { error: e?.message || String(e) });
    return json({ ok: false, error: e?.message || String(e), action, elapsed_ms: Date.now() - started }, 500);
  }
});