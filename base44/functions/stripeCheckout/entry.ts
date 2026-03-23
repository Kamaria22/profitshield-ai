import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@14.21.0';

/**
 * STRIPE CHECKOUT — LIVE MODE
 * All plans reference env-based Price IDs only.
 * Fails safely with 400 if any price ID is missing.
 */

const APP_URL = Deno.env.get('APP_URL') || 'https://profitshield.base44.app';

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
    const { action, plan_code, billing_cycle = 'monthly', tenant_id, success_url, cancel_url } = body;

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

    // ── CREATE CHECKOUT SESSION ──────────────────────────
    if (action === 'create_checkout') {
      const priceKey = `${plan_code}_${billing_cycle}`;
      const priceIds = getPriceIds();
      const priceId = priceIds[priceKey];

      if (!priceId) {
        return Response.json({
          level: 'error',
          message: `Price ID not configured for ${priceKey}`,
          status: 'error',
          missing_key: `STRIPE_PRICE_${priceKey.replace('_', '_').toUpperCase()}`,
        }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: user.email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: success_url || `${APP_URL}/?page=Billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || `${APP_URL}/?page=Pricing&checkout=cancelled`,
        metadata: { tenant_id: tenant_id || '', user_id: user.id, plan_code, billing_cycle },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      });

      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant_id || 'system',
        action: 'checkout_created',
        entity_type: 'Subscription',
        entity_id: session.id,
        performed_by: user.email,
        description: `Checkout created for plan ${plan_code} (${billing_cycle})`,
        metadata: { plan_code, billing_cycle, session_id: session.id, price_id: priceId }
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