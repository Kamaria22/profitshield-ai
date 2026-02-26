import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * STRIPE WEBHOOK HANDLER
 * Processes Stripe events for subscription lifecycle
 */

Deno.serve(async (req) => {
  let level = "info";
  let message = "Processing webhook";
  let status = "success";
  let data = {};

  try {
    const base44 = createClientFromRequest(req);
    
    const body = await req.json().catch(() => ({}));
    const eventType = body.type || body.event_type;

    if (eventType === 'checkout.session.completed') {
      const session = body.data?.object || body;
      const result = await handleCheckoutCompleted(base44, session);
      
      level = result.success ? "info" : "error";
      message = result.success ? "Subscription activated" : result.error;
      data = result;
      return Response.json({ level, message, status, data });
    }

    if (eventType === 'customer.subscription.updated') {
      const subscription = body.data?.object || body;
      const result = await handleSubscriptionUpdated(base44, subscription);
      
      level = result.success ? "info" : "error";
      message = result.success ? "Subscription updated" : result.error;
      data = result;
      return Response.json({ level, message, status, data });
    }

    if (eventType === 'customer.subscription.deleted') {
      const subscription = body.data?.object || body;
      const result = await handleSubscriptionCanceled(base44, subscription);
      
      level = result.success ? "info" : "error";
      message = result.success ? "Subscription canceled" : result.error;
      data = result;
      return Response.json({ level, message, status, data });
    }

    if (eventType === 'invoice.payment_failed') {
      const invoice = body.data?.object || body;
      const result = await handlePaymentFailed(base44, invoice);
      
      level = "warn";
      message = "Payment failed";
      data = result;
      return Response.json({ level, message, status, data });
    }

    level = "info";
    message = `Event ${eventType} received`;
    return Response.json({ level, message, status, data });

  } catch (error) {
    level = "error";
    message = `Webhook error: ${error.message}`;
    status = "error";
    data = { error: error.message };
    return Response.json({ level, message, status, data }, { status: 500 });
  }
});

async function handleCheckoutCompleted(base44, session) {
  try {
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    const metadata = session.metadata || {};

    // Find subscription by provider ID
    const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
      provider_customer_id: customerId
    });

    if (subscriptions.length > 0) {
      await base44.asServiceRole.entities.Subscription.update(subscriptions[0].id, {
        status: 'ACTIVE',
        provider_subscription_id: subscriptionId
      });
    }

    // Log activation
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: metadata.tenant_id || 'system',
      action: 'subscription_activated',
      entity_type: 'Subscription',
      entity_id: subscriptions[0]?.id || 'unknown',
      performed_by: metadata.user_id || 'system',
      description: 'Subscription activated via Stripe checkout'
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleSubscriptionUpdated(base44, subscription) {
  try {
    const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
      provider_subscription_id: subscription.id
    });

    if (subscriptions.length > 0) {
      await base44.asServiceRole.entities.Subscription.update(subscriptions[0].id, {
        status: subscription.status === 'active' ? 'ACTIVE' : subscription.status.toUpperCase(),
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleSubscriptionCanceled(base44, subscription) {
  try {
    const subscriptions = await base44.asServiceRole.entities.Subscription.filter({
      provider_subscription_id: subscription.id
    });

    if (subscriptions.length > 0) {
      await base44.asServiceRole.entities.Subscription.update(subscriptions[0].id, {
        status: 'CANCELED',
        canceled_at: new Date().toISOString()
      });

      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: subscriptions[0].tenant_id,
        action: 'subscription_canceled',
        entity_type: 'Subscription',
        entity_id: subscriptions[0].id,
        performed_by: 'system',
        description: 'Subscription canceled'
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handlePaymentFailed(base44, invoice) {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: 'system',
      action: 'payment_failed',
      entity_type: 'Subscription',
      entity_id: invoice.subscription || 'unknown',
      performed_by: 'system',
      description: `Payment failed: ${invoice.id}`,
      metadata: { invoice_id: invoice.id, amount: invoice.amount_due }
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}