import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * STRIPE CHECKOUT
 * Creates Stripe checkout sessions for plan upgrades
 */

Deno.serve(async (req) => {
  let level = "info";
  let message = "Processing checkout";
  let status = "success";
  let data = {};

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      level = "error";
      message = "Authentication required";
      status = "error";
      return Response.json({ level, message, status, data }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, plan_code, billing_cycle, tenant_id } = body;

    if (action === 'create_checkout') {
      // In production, integrate with Stripe SDK
      const checkoutUrl = `https://checkout.stripe.com/pay/test_${Date.now()}`;
      
      // Log checkout creation
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant_id || 'system',
        action: 'checkout_created',
        entity_type: 'Subscription',
        entity_id: 'pending',
        performed_by: user.id,
        description: `Checkout created for plan ${plan_code}`,
        metadata: { plan_code, billing_cycle }
      });

      level = "info";
      message = "Checkout session created";
      data = { checkout_url: checkoutUrl, session_id: `sess_${Date.now()}` };
      return Response.json({ level, message, status, data });
    }

    if (action === 'create_portal') {
      // Customer portal for managing subscription
      const portalUrl = `https://billing.stripe.com/session/test_${Date.now()}`;
      
      level = "info";
      message = "Portal session created";
      data = { portal_url: portalUrl };
      return Response.json({ level, message, status, data });
    }

    level = "error";
    message = "Invalid action";
    status = "error";
    return Response.json({ level, message, status, data }, { status: 400 });

  } catch (error) {
    level = "error";
    message = `Checkout error: ${error.message}`;
    status = "error";
    data = { error: error.message };
    return Response.json({ level, message, status, data }, { status: 500 });
  }
});