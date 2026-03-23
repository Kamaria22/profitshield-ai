/**
 * shopifyHistoricalSync
 * ------------------------------------------------------------------
 * Idempotent historical order sync from Shopify REST API.
 * Pulls orders within N days, upserts to database via platform_order_id.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const API_VERSION = "2024-10";

function isoDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function parseLinkHeader(link) {
  const out = {};
  if (!link) return out;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const tenantId = body.tenant_id;
  const shopDomain = body.shop_domain;
  const days = Number(body.days || 365);
  const status = body.status || "any";

  if (!tenantId || !shopDomain) {
    return Response.json(
      { ok: false, error: "tenant_id and shop_domain required" },
      { status: 400 }
    );
  }

  // Load integration
  const integrations = await svc.entities.PlatformIntegration.filter({
    tenant_id: tenantId,
    platform: "shopify",
    store_key: shopDomain,
  }).catch(() => []);
  const integration = integrations?.[0] || null;
  const token = integration?.encrypted_access_token || integration?.access_token || integration?.token;

  if (!token) {
    return Response.json(
      {
        ok: true,
        needs_reconnect: true,
        orders_fetched: 0,
        orders_upserted: 0,
      },
      { status: 200 }
    );
  }

  // Pull orders
  const createdAtMin = isoDaysAgo(days);
  let url = `https://${shopDomain}/admin/api/${API_VERSION}/orders.json?limit=250&status=${encodeURIComponent(
    status
  )}&created_at_min=${encodeURIComponent(createdAtMin)}`;

  let fetched = 0;
  let upserted = 0;
  let firstDate = null;
  let lastDate = null;

  const MAX_PAGES = 20; // Safety cap

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          error: `Shopify orders fetch failed: ${res.status}`,
          status_code: 502,
        },
        { status: 502 }
      );
    }

    const json = await res.json();
    const orders = Array.isArray(json?.orders) ? json.orders : [];

    fetched += orders.length;

    for (const o of orders) {
      const created = o.created_at || null;
      if (created) {
        if (!firstDate || created < firstDate) firstDate = created;
        if (!lastDate || created > lastDate) lastDate = created;
      }

      // Upsert by platform_order_id + tenant_id
      const existing = await svc.entities.Order.filter({
        tenant_id: tenantId,
        platform_order_id: String(o.id),
      }).catch(() => []);

      const record = {
        tenant_id: tenantId,
        platform_order_id: String(o.id),
        order_date: o.created_at,
        customer_email: o.customer?.email || null,
        customer_name: o.customer?.default_address?.name || null,
        total_revenue: Number(o.total_price || 0),
        status: o.financial_status || "pending",
        fulfillment_status: o.fulfillment_status || "unfulfilled",
        platform_data: o,
      };

      if (existing?.[0]) {
        await svc.entities.Order.update(existing[0].id, record).catch(() => {});
      } else {
        await svc.entities.Order.create(record).catch(() => {});
      }
      upserted++;
    }

    const links = parseLinkHeader(res.headers.get("link"));
    if (!links.next) break;
    url = links.next;
  }

  return Response.json(
    {
      ok: true,
      orders_fetched: fetched,
      orders_upserted: upserted,
      first_order_date: firstDate,
      last_order_date: lastDate,
      created_at_min: createdAtMin,
      status_used: status,
      status_code: 200,
    },
    { status: 200 }
  );
});