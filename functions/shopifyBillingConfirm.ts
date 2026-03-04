/**
 * shopifyBillingConfirm
 * Handles the return from Shopify App Subscription confirmation.
 * Also processes app_subscriptions/update webhook events (queued via shopifyWebhook).
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const API_VERSION = '2024-10';

async function decryptToken(enc) {
  try { return atob(enc); } catch { return null; }
}

async function shopifyAdminFetch(shopDomain, accessToken, path, init = {}, maxAttempts = 4) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
        ...(init.headers || {})
      }
    });
    if (res.status !== 429) return res;

    const retryAfter = Number(res.headers.get('Retry-After') || '0');
    const backoffMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * Math.pow(2, attempt));
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    attempt++;
  }
  return fetch(`https://${shopDomain}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...(init.headers || {})
    }
  });
}

function parsePlanTier(inputPlan) {
  const p = String(inputPlan || '').toLowerCase();
  if (p.includes('starter')) return 'starter';
  if (p.includes('growth')) return 'growth';
  if (p.includes('pro')) return 'pro';
  if (p.includes('enterprise')) return 'enterprise';
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const url = new URL(req.url);

    let body = {};
    try { body = await req.json(); } catch {}

    const action = body.action || url.searchParams.get('action') || 'confirm';

    if (action === 'prove_live') {
      return Response.json({ ok: true, function: 'shopifyBillingConfirm' });
    }

    // Handle app_subscriptions/update webhook (called from processWebhookQueue)
    if (action === 'process_subscription_update') {
      const { shop_domain, payload } = body;
      if (!shop_domain || !payload) return Response.json({ error: 'shop_domain and payload required' }, { status: 400 });

      const appSub = payload.app_subscription || payload;
      const subId = String(appSub.id || appSub.admin_graphql_api_id || '');
      const status = (appSub.status || '').toLowerCase();

      const existing = await db.ShopifySubscriptionState.filter({ shop_domain }).catch(() => []);
      const statePayload = {
        shop_domain,
        subscription_id: subId,
        status,
        plan: appSub.name || existing[0]?.plan || 'unknown',
        current_period_end: appSub.current_period_end || null,
        updated_at: new Date().toISOString(),
        raw: appSub,
      };
      if (existing.length) await db.ShopifySubscriptionState.update(existing[0].id, statePayload).catch(() => {});
      else await db.ShopifySubscriptionState.create(statePayload).catch(() => {});

      // Update tenant plan status
      const integrations = await db.PlatformIntegration.filter({ store_key: shop_domain, platform: 'shopify' }).catch(() => []);
      if (integrations.length) {
        const tenants = await db.Tenant.filter({ id: integrations[0].tenant_id }).catch(() => []);
        if (tenants.length) {
          await db.Tenant.update(tenants[0].id, {
            plan_status: status === 'active' ? 'active' : status === 'cancelled' ? 'canceled' : status,
          }).catch(() => {});
        }
      }

      return Response.json({ ok: true, status });
    }

    // Direct confirmation: charge_id passed back from Shopify redirect
    const chargeIdFromQuery = url.searchParams.get('charge_id');
    const tenantIdFromQuery = url.searchParams.get('tenant_id');
    const planFromQuery = url.searchParams.get('plan');
    const cycleFromQuery = url.searchParams.get('cycle');
    const shopFromQuery = url.searchParams.get('shop_domain');

    const {
      charge_id: chargeIdFromBody,
      tenant_id: tenantIdFromBody,
      plan: planFromBody,
      cycle: cycleFromBody,
      shop_domain: shopFromBody
    } = body;

    const charge_id = chargeIdFromBody || chargeIdFromQuery;
    const tenant_id = tenantIdFromBody || tenantIdFromQuery;
    const plan = planFromBody || planFromQuery;
    const cycle = cycleFromBody || cycleFromQuery;
    const shop_domain = shopFromBody || shopFromQuery;
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const integrations = await db.PlatformIntegration.filter({ tenant_id, platform: 'shopify', status: 'connected' }).catch(() => []);
    if (!integrations.length) return Response.json({ error: 'No integration found' }, { status: 404 });

    const resolvedShop = shop_domain || integrations[0].store_key;
    const tokens = await db.OAuthToken.filter({ tenant_id, platform: 'shopify', is_valid: true }).catch(() => []);
    if (!tokens.length) return Response.json({ error: 'No token' }, { status: 401 });
    const accessToken = await decryptToken(tokens[0].encrypted_access_token);

    // Verify subscription status via GraphQL AppSubscription node.
    if (charge_id && accessToken) {
      const subscriptionGid = String(charge_id).startsWith('gid://')
        ? String(charge_id)
        : `gid://shopify/AppSubscription/${charge_id}`;
      const query = `
        query appSubscriptionStatus($id: ID!) {
          node(id: $id) {
            ... on AppSubscription {
              id
              name
              status
              currentPeriodEnd
            }
          }
        }
      `;
      const statusRes = await shopifyAdminFetch(resolvedShop, accessToken, '/graphql.json', {
        method: 'POST',
        body: JSON.stringify({ query, variables: { id: subscriptionGid } })
      });
      const statusData = await statusRes.json().catch(() => ({}));
      const appSub = statusData?.data?.node || null;
      const status = String(appSub?.status || '').toLowerCase();
      const activated = status === 'active';

      if (activated) {
        const stateExisting = await db.ShopifySubscriptionState.filter({ shop_domain: resolvedShop }).catch(() => []);
        const resolvedPlan = parsePlanTier(plan || appSub?.name) || 'unknown';
        const sp = {
          shop_domain: resolvedShop,
          tenant_id,
          subscription_id: String(appSub?.id || charge_id),
          status: 'active',
          plan: resolvedPlan,
          billing_cycle: cycle || null,
          current_period_end: appSub?.currentPeriodEnd || null,
          updated_at: new Date().toISOString()
        };
        if (stateExisting.length) await db.ShopifySubscriptionState.update(stateExisting[0].id, sp).catch(() => {});
        else await db.ShopifySubscriptionState.create(sp).catch(() => {});

        // Update tenant
        await db.Tenant.update(tenant_id, { plan_status: 'active', subscription_tier: resolvedPlan }).catch(() => {});

        return Response.json({ ok: true, status: 'active', plan: resolvedPlan, shop_domain: resolvedShop });
      }

      return Response.json({
        ok: false,
        error: 'Subscription is not active yet',
        status: status || 'unknown',
        shop_domain: resolvedShop
      }, { status: 202 });
    }

    return Response.json({ ok: false, error: 'charge_id missing' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e?.message }, { status: 500 });
  }
});
