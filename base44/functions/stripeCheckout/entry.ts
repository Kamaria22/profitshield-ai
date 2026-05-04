import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@14.21.0';

/**
 * STRIPE CHECKOUT — LIVE MODE
 * All plans reference env-based Price IDs only.
 * Fails safely with 400 if any price ID is missing.
 */

const APP_URL = Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app';
const PLAN_ORDER = ['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];

function getPriceIds() {
  return {
    STARTER_monthly: Deno.env.get('STRIPE_PRICE_STARTER_MONTHLY') || '',
    STARTER_yearly:  Deno.env.get('STRIPE_PRICE_STARTER_YEARLY')  || '',
    GROWTH_monthly:  Deno.env.get('STRIPE_PRICE_GROWTH_MONTHLY')  || '',
    GROWTH_yearly:   Deno.env.get('STRIPE_PRICE_GROWTH_YEARLY')   || '',
    PRO_monthly:     Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')     || '',
    PRO_yearly:      Deno.env.get('STRIPE_PRICE_PRO_YEARLY')      || '',
  };
}

function getMissingPriceIds() {
  const ids = getPriceIds();
  return Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
}

function inferPlanCode(price: Stripe.Price, product: Stripe.Product | Stripe.DeletedProduct | null) {
  const candidates = [
    price.lookup_key,
    price.metadata?.plan_code,
    product && !('deleted' in product) ? product.metadata?.plan_code : null,
    product && !('deleted' in product) ? product.name : null,
    price.nickname,
  ].filter(Boolean).map((value) => String(value).toUpperCase());

  for (const candidate of candidates) {
    if (candidate.includes('STARTER')) return 'STARTER';
    if (candidate.includes('GROWTH')) return 'GROWTH';
    if (candidate.includes('PRO')) return 'PRO';
    if (candidate.includes('ENTERPRISE')) return 'ENTERPRISE';
  }

  return null;
}

function normalizeInterval(price: Stripe.Price) {
  if (!price.recurring?.interval) return null;
  if (price.recurring.interval === 'month' && price.recurring.interval_count === 1) return 'monthly';
  if (price.recurring.interval === 'year' && price.recurring.interval_count === 1) return 'yearly';
  return `${price.recurring.interval_count || 1}_${price.recurring.interval}`;
}

function formatCatalogPrice(price: Stripe.Price, product: Stripe.Product | Stripe.DeletedProduct | null) {
  return {
    id: price.id,
    unit_amount: price.unit_amount,
    currency: price.currency,
    lookup_key: price.lookup_key || null,
    recurring: price.recurring
      ? {
          interval: price.recurring.interval,
          interval_count: price.recurring.interval_count,
        }
      : null,
    active: price.active,
    product: product && !('deleted' in product)
      ? {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata || {},
          active: product.active,
        }
      : null,
    metadata: price.metadata || {},
  };
}

async function loadPricingCatalog(stripe: Stripe) {
  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
    expand: ['data.product'],
    type: 'recurring',
  });

  const catalog = new Map<string, any>();

  for (const price of prices.data) {
    const product = price.product && typeof price.product !== 'string' ? price.product : null;
    if (product && 'deleted' in product) continue;
    if (product && !product.active) continue;

    const planCode = inferPlanCode(price, product);
    const billingKey = normalizeInterval(price);
    if (!planCode || !billingKey) continue;

    const current = catalog.get(planCode) || {
      code: planCode,
      name: product?.name || planCode,
      description: product?.description || '',
      product_id: product?.id || null,
      metadata: product?.metadata || {},
      prices: {},
    };

    current.prices[billingKey] = formatCatalogPrice(price, product);
    catalog.set(planCode, current);
  }

  return PLAN_ORDER
    .map((code) => catalog.get(code))
    .filter(Boolean)
    .concat(
      Array.from(catalog.values()).filter((plan) => !PLAN_ORDER.includes(plan.code))
    );
}

async function resolveCheckoutPrice(stripe: Stripe, params: { plan_code?: string; billing_cycle?: string; price_id?: string }) {
  const { plan_code, billing_cycle = 'monthly', price_id } = params;

  if (price_id) {
    const price = await stripe.prices.retrieve(price_id, { expand: ['product'] });
    const product = price.product && typeof price.product !== 'string' ? price.product : null;
    if (!price.active || (product && !('deleted' in product) && !product.active)) {
      throw new Error('Selected Stripe price is no longer active');
    }

    return {
      price,
      product,
      planCode: inferPlanCode(price, product) || plan_code || 'CUSTOM',
      billingCycle: normalizeInterval(price) || billing_cycle,
    };
  }

  const catalog = await loadPricingCatalog(stripe);
  const matchedPlan = catalog.find((plan) => plan.code === String(plan_code || '').toUpperCase());
  const matchedPrice = matchedPlan?.prices?.[billing_cycle];

  if (matchedPrice?.id) {
    const price = await stripe.prices.retrieve(matchedPrice.id, { expand: ['product'] });
    const product = price.product && typeof price.product !== 'string' ? price.product : null;
    return {
      price,
      product,
      planCode: matchedPlan.code,
      billingCycle: billing_cycle,
    };
  }

  const priceKey = `${plan_code}_${billing_cycle}`;
  const fallbackPriceId = getPriceIds()[priceKey];
  if (!fallbackPriceId) {
    throw new Error(`Price ID not configured for ${priceKey}`);
  }

  const price = await stripe.prices.retrieve(fallbackPriceId, { expand: ['product'] });
  const product = price.product && typeof price.product !== 'string' ? price.product : null;
  return {
    price,
    product,
    planCode: inferPlanCode(price, product) || String(plan_code || 'CUSTOM').toUpperCase(),
    billingCycle: normalizeInterval(price) || billing_cycle,
  };
}

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeKey) {
    return Response.json({
      level: 'error',
      message: 'STRIPE_SECRET_KEY not configured',
      status: 'error',
      stripe_live: false,
    }, { status: 503 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const body = await req.json().catch(() => ({}));
    const { action, plan_code, billing_cycle = 'monthly', tenant_id, success_url, cancel_url, price_id } = body;

    // ── PING / Health check ──────────────────────────────
    if (action === 'ping') {
      const isLive = stripeKey.startsWith('sk_live_');
      const missingIds = getMissingPriceIds();
      const allPriceIdsConfigured = missingIds.length === 0;
      const webhookConfigured = !!Deno.env.get('STRIPE_WEBHOOK_SECRET');

      return Response.json({
        stripe_live: true,
        live_mode: isLive,
        message: 'Stripe configured',
        all_price_ids_configured: allPriceIdsConfigured,
        missing_price_ids: missingIds,
        webhook_configured: webhookConfigured,
      });
    }

    if (action === 'pricing_catalog') {
      const plans = await loadPricingCatalog(stripe);
      return Response.json({
        level: 'info',
        message: 'Stripe pricing catalog loaded',
        status: 'success',
        data: { plans },
      });
    }

    // ── CREATE CHECKOUT SESSION ──────────────────────────
    if (action === 'create_checkout') {
      let checkoutPrice;
      try {
        checkoutPrice = await resolveCheckoutPrice(stripe, { plan_code, billing_cycle, price_id });
      } catch (error) {
        return Response.json({
          level: 'error',
          message: error.message,
          status: 'error',
        }, { status: 400 });
      }

      const selectedPriceId = checkoutPrice.price.id;
      const resolvedPlanCode = checkoutPrice.planCode;
      const resolvedBillingCycle = checkoutPrice.billingCycle;

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: user.email,
        line_items: [{ price: selectedPriceId, quantity: 1 }],
        success_url: success_url || `${APP_URL}/?page=Billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || `${APP_URL}/?page=Pricing&checkout=cancelled`,
        metadata: { tenant_id: tenant_id || '', user_id: user.id, plan_code: resolvedPlanCode, billing_cycle: resolvedBillingCycle, price_id: selectedPriceId },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      });

      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant_id || 'system',
        action: 'checkout_created',
        entity_type: 'Subscription',
        entity_id: session.id,
        performed_by: user.email,
        description: `Checkout created for plan ${resolvedPlanCode} (${resolvedBillingCycle})`,
        metadata: { plan_code: resolvedPlanCode, billing_cycle: resolvedBillingCycle, session_id: session.id, price_id: selectedPriceId }
      });

      return Response.json({
        level: 'info',
        message: 'Checkout session created',
        status: 'success',
        data: { checkout_url: session.url, session_id: session.id }
      });
    }

    // ── CUSTOMER PORTAL ──────────────────────────────────
    if (action === 'create_portal') {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });

      if (customers.data.length === 0) {
        return Response.json({
          level: 'warn',
          message: 'No Stripe customer found',
          status: 'error',
          data: { error: 'No active subscription found for this account' }
        }, { status: 404 });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${APP_URL}/?page=Billing`,
      });

      return Response.json({
        level: 'info',
        message: 'Portal session created',
        status: 'success',
        data: { portal_url: session.url }
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    return Response.json({
      level: 'error',
      message: `Checkout error: ${error.message}`,
      status: 'error',
      data: { error: error.message }
    }, { status: 500 });
  }
});
