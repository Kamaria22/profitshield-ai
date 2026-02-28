import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@14.21.0';

/**
 * STRIPE WEBHOOK HANDLER — LIVE MODE
 * Verifies Stripe signature using STRIPE_WEBHOOK_SECRET.
 * Rejects unsigned or invalid payloads with 400.
 */

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeKey || !webhookSecret) {
    console.error('[stripeWebhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return Response.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const base44 = createClientFromRequest(req);

  // Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    console.error('[stripeWebhook] Missing stripe-signature header');
    return Response.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event;
  try {
    // IMPORTANT: Must use async version for Deno (SubtleCrypto is async)
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripeWebhook] Signature verification failed:', err.message);
    await logVerificationFailure(base44, err.message, signature).catch(() => {});
    return Response.json({ error: `Webhook signature invalid: ${err.message}` }, { status: 400 });
  }

  try {
    const eventType = event.type;
    console.log(`[stripeWebhook] Processing event: ${eventType} (${event.id})`);

    // Activate subscription
    if (['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated'].includes(eventType)) {
      const obj = event.data.object;
      if (eventType === 'checkout.session.completed') {
        await handleCheckoutCompleted(base44, obj, event.id);
      } else {
        await handleSubscriptionUpdated(base44, obj, event.id);
      }
      return Response.json({ received: true, event: eventType });
    }

    // Downgrade / lock features
    if (['invoice.payment_failed', 'customer.subscription.deleted'].includes(eventType)) {
      const obj = event.data.object;
      if (eventType === 'customer.subscription.deleted') {
        await handleSubscriptionCanceled(base44, obj, event.id);
      } else {
        await handlePaymentFailed(base44, obj, event.id);
      }
      return Response.json({ received: true, event: eventType });
    }

    // Unhandled event — acknowledge
    return Response.json({ received: true, event: eventType, handled: false });

  } catch (error) {
    console.error('[stripeWebhook] Handler error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function logVerificationFailure(base44, message, signature) {
  await base44.asServiceRole.entities.AuditLog.create({
    tenant_id: 'system',
    action: 'webhook_signature_failed',
    entity_type: 'Subscription',
    entity_id: 'unknown',
    performed_by: 'system',
    description: `Stripe webhook signature verification failed: ${message}`,
    severity: 'high',
    category: 'security',
    metadata: { signature_prefix: signature?.substring(0, 20) }
  });
}

async function handleCheckoutCompleted(base44, session, eventId) {
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const metadata = session.metadata || {};
  const tenantId = metadata.tenant_id || 'system';

  // Idempotency: check if already processed
  const existing = await base44.asServiceRole.entities.AuditLog.filter({
    action: 'subscription_activated',
    entity_id: subscriptionId || session.id
  });
  if (existing.length > 0) {
    console.log(`[stripeWebhook] Already processed checkout ${session.id}, skipping`);
    return;
  }

  // Find and update subscription record
  const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
    provider_customer_id: customerId
  });

  if (subscriptions.length > 0) {
    await base44.asServiceRole.entities.Subscription.update(subscriptions[0].id, {
      status: 'ACTIVE',
      provider_subscription_id: subscriptionId,
      plan_code: metadata.plan_code || subscriptions[0].plan_code
    });
  }

  // Update Tenant subscription tier
  if (tenantId && tenantId !== 'system') {
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
    if (tenants.length > 0) {
      await base44.asServiceRole.entities.Tenant.update(tenants[0].id, {
        subscription_tier: (metadata.plan_code || 'starter').toLowerCase(),
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      });
    }
  }

  await base44.asServiceRole.entities.AuditLog.create({
    tenant_id: tenantId,
    action: 'subscription_activated',
    entity_type: 'Subscription',
    entity_id: subscriptionId || session.id,
    performed_by: metadata.user_id || 'system',
    description: `Subscription activated via Stripe checkout (${metadata.plan_code}, ${metadata.billing_cycle})`,
    metadata: { stripe_event_id: eventId, session_id: session.id }
  });
}

async function handleSubscriptionUpdated(base44, subscription, eventId) {
  const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
    provider_subscription_id: subscription.id
  });

  if (subscriptions.length === 0) return;

  const stripeStatus = subscription.status;
  const mappedStatus = stripeStatus === 'active' ? 'ACTIVE'
    : stripeStatus === 'past_due' ? 'PAST_DUE'
    : stripeStatus === 'canceled' ? 'CANCELED'
    : stripeStatus.toUpperCase();

  await base44.asServiceRole.entities.Subscription.update(subscriptions[0].id, {
    status: mappedStatus,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end || false
  });

  // Lock features if past due
  if (mappedStatus === 'PAST_DUE' && subscriptions[0].tenant_id) {
    await base44.asServiceRole.entities.Tenant.filter({ id: subscriptions[0].tenant_id })
      .then(async (tenants) => {
        if (tenants.length > 0) {
          await base44.asServiceRole.entities.Tenant.update(tenants[0].id, { status: 'active' });
        }
      }).catch(() => {});
  }
}

async function handleSubscriptionCanceled(base44, subscription, eventId) {
  const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
    provider_subscription_id: subscription.id
  });

  if (subscriptions.length === 0) return;

  await base44.asServiceRole.entities.Subscription.update(subscriptions[0].id, {
    status: 'CANCELED',
    canceled_at: new Date().toISOString()
  });

  // Downgrade tenant to trial/free
  if (subscriptions[0].tenant_id) {
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: subscriptions[0].tenant_id });
    if (tenants.length > 0) {
      await base44.asServiceRole.entities.Tenant.update(tenants[0].id, {
        subscription_tier: 'trial',
      });
    }
  }

  await base44.asServiceRole.entities.AuditLog.create({
    tenant_id: subscriptions[0].tenant_id || 'system',
    action: 'subscription_canceled',
    entity_type: 'Subscription',
    entity_id: subscriptions[0].id,
    performed_by: 'system',
    description: 'Subscription canceled — tenant downgraded to trial',
    metadata: { stripe_event_id: eventId }
  });
}

async function handlePaymentFailed(base44, invoice, eventId) {
  const subscriptionId = invoice.subscription;

  if (subscriptionId) {
    const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
      provider_subscription_id: subscriptionId
    });
    if (subscriptions.length > 0) {
      await base44.asServiceRole.entities.Subscription.update(subscriptions[0].id, {
        status: 'PAST_DUE'
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
    description: `Payment failed for invoice ${invoice.id}`,
    metadata: { stripe_event_id: eventId, invoice_id: invoice.id, amount: invoice.amount_due }
  });
}