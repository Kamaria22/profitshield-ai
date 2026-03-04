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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    let body = {};
    try { body = await req.json(); } catch {}

    const action = body.action || 'confirm';

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
    const { charge_id, tenant_id, plan, cycle, shop_domain } = body;
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const integrations = await db.PlatformIntegration.filter({ tenant_id, platform: 'shopify', status: 'connected' }).catch(() => []);
    if (!integrations.length) return Response.json({ error: 'No integration found' }, { status: 404 });

    const resolvedShop = shop_domain || integrations[0].store_key;
    const tokens = await db.OAuthToken.filter({ tenant_id, platform: 'shopify', is_valid: true }).catch(() => []);
    if (!tokens.length) return Response.json({ error: 'No token' }, { status: 401 });
    const accessToken = await decryptToken(tokens[0].encrypted_access_token);

    // Activate the subscription
    if (charge_id && accessToken) {
      const activateRes = await fetch(`https://${resolvedShop}/admin/api/${API_VERSION}/recurring_application_charges/${charge_id}/activate.json`, {
        method: 'POST',
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recurring_application_charge: { id: charge_id } })
      });
      const activateData = await activateRes.json().catch(() => ({}));
      const activated = activateData?.recurring_application_charge?.status === 'active';

      if (activated) {
        const stateExisting = await db.ShopifySubscriptionState.filter({ shop_domain: resolvedShop }).catch(() => []);
        const sp = { shop_domain: resolvedShop, tenant_id, subscription_id: String(charge_id), status: 'active', plan: plan || 'unknown', updated_at: new Date().toISOString() };
        if (stateExisting.length) await db.ShopifySubscriptionState.update(stateExisting[0].id, sp).catch(() => {});
        else await db.ShopifySubscriptionState.create(sp).catch(() => {});

        // Update tenant
        await db.Tenant.update(tenant_id, { plan_status: 'active', subscription_tier: (plan || '').toLowerCase() }).catch(() => {});

        return Response.json({ ok: true, status: 'active', plan, shop_domain: resolvedShop });
      }
    }

    return Response.json({ ok: false, error: 'Activation failed or charge_id missing' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e?.message }, { status: 500 });
  }
});