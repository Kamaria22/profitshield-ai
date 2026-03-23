import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TIER_LIMITS = {
  trial: { limit: 100, next: 'starter' },
  starter: { limit: 500, next: 'growth' },
  growth: { limit: 2000, next: 'pro' },
  pro: { limit: 10000, next: 'enterprise' },
  enterprise: { limit: Infinity, next: null }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, increment_orders = false } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Get tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    if (!tenants || tenants.length === 0) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenant = tenants[0];
    const currentTier = tenant.subscription_tier || 'trial';
    const tierConfig = TIER_LIMITS[currentTier] || TIER_LIMITS.trial;
    const monthlyLimit = tenant.monthly_order_limit || tierConfig.limit;
    let ordersThisMonth = tenant.orders_this_month || 0;

    // Optionally increment order count
    if (increment_orders) {
      ordersThisMonth += 1;
      await base44.asServiceRole.entities.Tenant.update(tenant_id, {
        orders_this_month: ordersThisMonth
      });
    }

    const usagePercent = Math.min(100, (ordersThisMonth / monthlyLimit) * 100);
    const isAtLimit = ordersThisMonth >= monthlyLimit;
    const isNearLimit = usagePercent >= 80;
    const ordersRemaining = Math.max(0, monthlyLimit - ordersThisMonth);

    // Send notification if at limit
    if (isAtLimit && currentTier !== 'enterprise') {
      // Check if we already sent a limit notification today
      const today = new Date().toISOString().split('T')[0];
      const lastNotification = tenant.settings?.last_limit_notification;
      
      if (lastNotification !== today) {
        // Send email notification
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: tenant.billing_email || user.email,
            subject: `⚠️ Order Limit Reached - Upgrade Required`,
            body: `
Your ProfitShield ${currentTier} plan has reached its monthly limit of ${monthlyLimit.toLocaleString()} orders.

Current usage: ${ordersThisMonth.toLocaleString()} / ${monthlyLimit.toLocaleString()} orders

To continue processing orders and avoid service interruption, please upgrade your plan.

${tierConfig.next ? `Upgrade to ${tierConfig.next} to get more orders per month.` : ''}

Upgrade now: ${Deno.env.get('APP_URL') || 'https://app.profitshield.ai'}/Pricing

Thank you for using ProfitShield!
            `.trim()
          });
        } catch (e) {
          console.error('Failed to send limit notification email:', e);
        }

        // Create alert
        try {
          await base44.asServiceRole.entities.Alert.create({
            tenant_id,
            alert_type: 'billing',
            severity: 'high',
            title: 'Monthly Order Limit Reached',
            message: `Your ${currentTier} plan limit of ${monthlyLimit.toLocaleString()} orders has been reached. Upgrade to continue processing orders.`,
            status: 'pending',
            action_url: '/Pricing',
            action_label: 'Upgrade Plan'
          });
        } catch (e) {
          console.error('Failed to create alert:', e);
        }

        // Update last notification date
        await base44.asServiceRole.entities.Tenant.update(tenant_id, {
          settings: {
            ...tenant.settings,
            last_limit_notification: today
          }
        });
      }
    }

    // Send warning at 80% usage
    if (isNearLimit && !isAtLimit && currentTier !== 'enterprise') {
      const warningKey = `limit_warning_${Math.floor(usagePercent / 10) * 10}`;
      const lastWarning = tenant.settings?.[warningKey];
      const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      
      if (lastWarning !== thisMonth) {
        // Create warning alert (no email for warnings)
        try {
          await base44.asServiceRole.entities.Alert.create({
            tenant_id,
            alert_type: 'billing',
            severity: 'medium',
            title: `${Math.round(usagePercent)}% of Monthly Order Limit Used`,
            message: `You've used ${ordersThisMonth.toLocaleString()} of ${monthlyLimit.toLocaleString()} orders this month. ${ordersRemaining.toLocaleString()} orders remaining.`,
            status: 'pending',
            action_url: '/Pricing',
            action_label: 'View Plans'
          });
        } catch (e) {
          console.error('Failed to create warning alert:', e);
        }

        // Update warning sent flag
        await base44.asServiceRole.entities.Tenant.update(tenant_id, {
          settings: {
            ...tenant.settings,
            [warningKey]: thisMonth
          }
        });
      }
    }

    return Response.json({
      success: true,
      tier: currentTier,
      orders_this_month: ordersThisMonth,
      monthly_limit: monthlyLimit,
      orders_remaining: ordersRemaining,
      usage_percent: usagePercent,
      is_at_limit: isAtLimit,
      is_near_limit: isNearLimit,
      can_process_orders: !isAtLimit || currentTier === 'enterprise',
      next_tier: tierConfig.next,
      upgrade_required: isAtLimit && currentTier !== 'enterprise'
    });

  } catch (error) {
    console.error('Error checking order limits:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});