/**
 * shopifyBillingCreateSubscription
 * Creates a Shopify App Subscription via GraphQL Admin API.
 * Used when ENABLE_SHOPIFY_BILLING=true (app store mode).
 * Falls back to Stripe path if flag is false.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ENABLE_SHOPIFY_BILLING = (Deno.env.get('ENABLE_SHOPIFY_BILLING') || '').toLowerCase() === 'true';
const API_VERSION = '2024-10';

const PLAN_PRICES = {
  STARTER: { monthly: 49.00, yearly: 490.00 },
  GROWTH:  { monthly: 99.00, yearly: 990.00 },
  PRO:     { monthly: 199.00, yearly: 1990.00 },
};

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

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    let body = {};
    try { body = await req.json(); } catch {}

    const { action = 'create', plan_code, billing_cycle = 'monthly', tenant_id, shop_domain } = body;

    if (action === 'prove_live') {
      return Response.json({ ok: true, billing_mode: ENABLE_SHOPIFY_BILLING ? 'shopify' : 'stripe' });
    }

    if (!ENABLE_SHOPIFY_BILLING) {
      return Response.json({ ok: false, error: 'Shopify billing not enabled. Set ENABLE_SHOPIFY_BILLING=true', billing_mode: 'stripe' }, { status: 400 });
    }

    if (!plan_code || !tenant_id) {
      return Response.json({ error: 'plan_code and tenant_id required' }, { status: 400 });
    }

    const planPrices = PLAN_PRICES[plan_code.toUpperCase()];
    if (!planPrices) {
      return Response.json({ error: `Unknown plan: ${plan_code}` }, { status: 400 });
    }

    // Resolve integration
    const integrations = await db.PlatformIntegration.filter({ tenant_id, platform: 'shopify', status: 'connected' }).catch(() => []);
    if (!integrations.length) {
      return Response.json({ error: 'No active Shopify integration found' }, { status: 404 });
    }
    const integration = integrations[0];
    const resolvedShop = shop_domain || integration.store_key;

    // Get access token
    const tokens = await db.OAuthToken.filter({ tenant_id, platform: 'shopify', is_valid: true }).catch(() => []);
    if (!tokens.length) return Response.json({ error: 'No valid OAuth token' }, { status: 401 });
    const accessToken = await decryptToken(tokens[0].encrypted_access_token);
    if (!accessToken) return Response.json({ error: 'Token decrypt failed' }, { status: 500 });

    const appUrl = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
    const returnUrl = `${appUrl}/api/functions/shopifyBillingConfirm?tenant_id=${tenant_id}&plan=${plan_code}&cycle=${billing_cycle}`;
    const priceAmount = billing_cycle === 'yearly' ? planPrices.yearly : planPrices.monthly;
    const interval = billing_cycle === 'yearly' ? 'ANNUAL' : 'EVERY_30_DAYS';
    const planName = `ProfitShield ${plan_code.charAt(0) + plan_code.slice(1).toLowerCase()} (${billing_cycle})`;

    const mutation = `
      mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!) {
        appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems) {
          userErrors { field message }
          appSubscription { id status }
          confirmationUrl
        }
      }
    `;

    const gqlRes = await shopifyAdminFetch(resolvedShop, accessToken, '/graphql.json', {
      method: 'POST',
      body: JSON.stringify({
        query: mutation,
        variables: {
          name: planName,
          returnUrl,
          lineItems: [{
            plan: {
              appRecurringPricingDetails: {
                price: { amount: priceAmount, currencyCode: 'USD' },
                interval,
              }
            }
          }]
        }
      })
    });
    if (!gqlRes.ok) {
      const text = await gqlRes.text().catch(() => '');
      return Response.json({ ok: false, error: `Shopify billing request failed (${gqlRes.status})`, detail: text.slice(0, 400) }, { status: 502 });
    }

    const gqlData = await gqlRes.json();
    const result = gqlData?.data?.appSubscriptionCreate;

    if (result?.userErrors?.length) {
      return Response.json({ ok: false, errors: result.userErrors }, { status: 400 });
    }

    const confirmationUrl = result?.confirmationUrl;
    const subscriptionId = result?.appSubscription?.id;

    // Store pending state
    const existing = await db.ShopifySubscriptionState.filter({ shop_domain: resolvedShop }).catch(() => []);
    const statePayload = {
      shop_domain: resolvedShop, tenant_id,
      subscription_id: subscriptionId,
      status: 'pending', plan: plan_code,
      updated_at: new Date().toISOString(),
    };
    if (existing.length) await db.ShopifySubscriptionState.update(existing[0].id, statePayload).catch(() => {});
    else await db.ShopifySubscriptionState.create(statePayload).catch(() => {});

    return Response.json({ ok: true, confirmation_url: confirmationUrl, subscription_id: subscriptionId });
  } catch (e) {
    return Response.json({ error: e?.message }, { status: 500 });
  }
});
