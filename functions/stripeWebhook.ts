import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@14.21.0';

/**
 * STRIPE WEBHOOK — FULLY AUTOMATED SUBSCRIBER ACCESS
 * No manual approval required for paying users.
 * Subscription-driven, event-driven access control.
 */

const PRICE_TO_TIER = () => ({
  [Deno.env.get('STRIPE_PRICE_STARTER_MONTHLY') || 'UNSET_SM']: 'starter',
  [Deno.env.get('STRIPE_PRICE_STARTER_YEARLY')  || 'UNSET_SY']: 'starter',
  [Deno.env.get('STRIPE_PRICE_GROWTH_MONTHLY')  || 'UNSET_GM']: 'growth',
  [Deno.env.get('STRIPE_PRICE_GROWTH_YEARLY')   || 'UNSET_GY']: 'growth',
  [Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')     || 'UNSET_PM']: 'pro',
  [Deno.env.get('STRIPE_PRICE_PRO_YEARLY')      || 'UNSET_PY']: 'pro',
});

const TIER_ORDER_LIMITS = {
  trial: 100, starter: 500, growth: 2500, pro: 10000, enterprise: -1
};

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeKey || !webhookSecret) {
    console.error('[stripeWebhook] Missing Stripe credentials');
    return Response.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const base44 = createClientFromRequest(req);

  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripeWebhook] Signature verification failed:', err.message);
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: 'system',
      action: 'webhook_signature_failed',
      entity_type: 'Subscription',
      entity_id: 'unknown',
      performed_by: 'system',
      description: `Webhook signature failed: ${err.message}`,
      severity: 'high',
      category: 'security'
    }).catch(() => {});
    return Response.json({ error: `Invalid signature: ${err.message}` }, { status: 400 });
  }

  console.log(`[stripeWebhook] Event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(base44, stripe, event.data.object, event.id);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(base44, stripe, event.data.object, event.id);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(base44, event.data.object, event.id);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(base44, event.data.object, event.id);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(base44, event.data.object, event.id);
        break;
      default:
        console.log(`[stripeWebhook] Unhandled: ${event.type}`);
    }

    return Response.json({ received: true, event: event.type });

  } catch (error) {
    console.error('[stripeWebhook] Handler error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHECKOUT COMPLETED → Activate full access immediately
// ─────────────────────────────────────────────────────────────────────────────
async function handleCheckoutCompleted(base44, stripe, session, eventId) {
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const metadata = session.metadata || {};
  const customerEmail = session.customer_email || metadata.email;
  const tenantId = metadata.tenant_id || null;
  const planCode = metadata.plan_code || null;
  const billingCycle = metadata.billing_cycle || 'monthly';

  // Idempotency guard
  const existing = await base44.asServiceRole.entities.AuditLog.filter({
    action: 'subscription_activated',
    entity_id: subscriptionId || session.id
  }).catch(() => []);
  if (existing.length > 0) {
    console.log(`[stripeWebhook] Already processed, skipping`);
    return;
  }

  // Determine tier from price ID
  let tier = planCode?.toLowerCase() || 'starter';
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items?.data?.[0]?.price?.id;
      const priceMap = PRICE_TO_TIER();
      if (priceId && priceMap[priceId]) tier = priceMap[priceId];
    } catch (e) {
      console.warn('[stripeWebhook] Could not retrieve subscription:', e.message);
    }
  }

  // ── Activate or create Tenant ──
  let tenant = null;
  if (tenantId) {
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId }).catch(() => []);
    tenant = tenants[0] || null;
  }

  if (tenant) {
    await base44.asServiceRole.entities.Tenant.update(tenant.id, {
      subscription_tier: tier,
      status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      billing_cycle: billingCycle,
      monthly_order_limit: TIER_ORDER_LIMITS[tier] || 500,
      trial_ends_at: null, // Remove trial restriction
      onboarding_completed: true,
    });
  }

  // ── Activate or create Subscription record ──
  const subs = await base44.asServiceRole.entities.Subscription.filter({
    provider_customer_id: customerId
  }).catch(() => []);

  if (subs.length > 0) {
    await base44.asServiceRole.entities.Subscription.update(subs[0].id, {
      status: 'ACTIVE',
      plan_code: tier.toUpperCase(),
      provider_subscription_id: subscriptionId,
      billing_cycle: billingCycle,
      last_payment_at: new Date().toISOString(),
    });
  } else if (tenantId) {
    await base44.asServiceRole.entities.Subscription.create({
      tenant_id: tenantId,
      user_id: metadata.user_id || 'system',
      plan_code: tier.toUpperCase(),
      status: 'ACTIVE',
      provider: 'STRIPE',
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
      billing_cycle: billingCycle,
      last_payment_at: new Date().toISOString(),
    });
  }

  // ── Audit log ──
  await base44.asServiceRole.entities.AuditLog.create({
    tenant_id: tenantId || 'system',
    action: 'subscription_activated',
    entity_type: 'Subscription',
    entity_id: subscriptionId || session.id,
    performed_by: metadata.user_id || 'system',
    description: `Subscription ACTIVATED — Tier: ${tier} (${billingCycle}). Full access granted automatically.`,
    severity: 'low',
    category: 'integration',
    metadata: { stripe_event_id: eventId, session_id: session.id, tier, billing_cycle: billingCycle }
  }).catch(() => {});

  console.log(`[stripeWebhook] ✅ Access granted: tenant=${tenantId} tier=${tier}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICE PAID → Ensure continued access (renewal)
// ─────────────────────────────────────────────────────────────────────────────
async function handleInvoicePaid(base44, stripe, invoice, eventId) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const subs = await base44.asServiceRole.entities.Subscription.filter({
    provider_subscription_id: subscriptionId
  }).catch(() => []);

  if (subs.length === 0) return;

  const sub = subs[0];

  // Re-activate if was past_due
  if (sub.status !== 'ACTIVE') {
    await base44.asServiceRole.entities.Subscription.update(sub.id, {
      status: 'ACTIVE',
      last_payment_at: new Date().toISOString(),
    });

    // Re-activate tenant
    if (sub.tenant_id) {
      await base44.asServiceRole.entities.Tenant.filter({ id: sub.tenant_id })
        .then(async (tenants) => {
          if (tenants[0]) {
            await base44.asServiceRole.entities.Tenant.update(tenants[0].id, { status: 'active' });
          }
        }).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION UPDATED → Sync tier + status
// ─────────────────────────────────────────────────────────────────────────────
async function handleSubscriptionUpdated(base44, subscription, eventId) {
  const subs = await base44.asServiceRole.entities.Subscription.filter({
    provider_subscription_id: subscription.id
  }).catch(() => []);

  if (subs.length === 0) return;

  const stripeStatus = subscription.status;
  const mappedStatus =
    stripeStatus === 'active' ? 'ACTIVE' :
    stripeStatus === 'past_due' ? 'PAST_DUE' :
    stripeStatus === 'canceled' ? 'CANCELED' :
    stripeStatus === 'trialing' ? 'TRIALING' :
    stripeStatus.toUpperCase();

  await base44.asServiceRole.entities.Subscription.update(subs[0].id, {
    status: mappedStatus,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end || false,
  });

  // Determine new tier from price
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const priceMap = PRICE_TO_TIER();
  const newTier = priceMap[priceId] || null;

  if (newTier && subs[0].tenant_id) {
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: subs[0].tenant_id }).catch(() => []);
    if (tenants[0]) {
      await base44.asServiceRole.entities.Tenant.update(tenants[0].id, {
        subscription_tier: newTier,
        status: mappedStatus === 'ACTIVE' ? 'active' : tenants[0].status,
        monthly_order_limit: TIER_ORDER_LIMITS[newTier] || 500,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION CANCELED → Graceful downgrade, preserve data
// ─────────────────────────────────────────────────────────────────────────────
async function handleSubscriptionCanceled(base44, subscription, eventId) {
  const subs = await base44.asServiceRole.entities.Subscription.filter({
    provider_subscription_id: subscription.id
  }).catch(() => []);

  if (subs.length === 0) return;

  await base44.asServiceRole.entities.Subscription.update(subs[0].id, {
    status: 'CANCELED',
    canceled_at: new Date().toISOString(),
  });

  // Downgrade tenant to trial (preserve all data)
  if (subs[0].tenant_id) {
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: subs[0].tenant_id }).catch(() => []);
    if (tenants[0]) {
      await base44.asServiceRole.entities.Tenant.update(tenants[0].id, {
        subscription_tier: 'trial',
        monthly_order_limit: TIER_ORDER_LIMITS.trial,
      });
    }
  }

  await base44.asServiceRole.entities.AuditLog.create({
    tenant_id: subs[0].tenant_id || 'system',
    action: 'subscription_canceled',
    entity_type: 'Subscription',
    entity_id: subs[0].id,
    performed_by: 'system',
    description: 'Subscription canceled. Tenant gracefully downgraded to trial. All data preserved.',
    severity: 'medium',
    category: 'integration',
    metadata: { stripe_event_id: eventId }
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT FAILED → Mark past_due, lock premium features
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentFailed(base44, invoice, eventId) {
  const subscriptionId = invoice.subscription;

  if (subscriptionId) {
    const subs = await base44.asServiceRole.entities.Subscription.filter({
      provider_subscription_id: subscriptionId
    }).catch(() => []);

    if (subs.length > 0) {
      await base44.asServiceRole.entities.Subscription.update(subs[0].id, {
        status: 'PAST_DUE',
      });
    }
  }

  await base44.asServiceRole.entities.AuditLog.create({
    tenant_id: 'system',
    action: 'payment_failed',
    entity_type: 'Subscription',
    entity_id: subscriptionId || 'unknown',
    performed_by: 'system',
    severity: 'high',
    description: `Payment failed for invoice ${invoice.id}. Subscription marked PAST_DUE.`,
    metadata: { stripe_event_id: eventId, invoice_id: invoice.id, amount: invoice.amount_due }
  }).catch(() => {});
}