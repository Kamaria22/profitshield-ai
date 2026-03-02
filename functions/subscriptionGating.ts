import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SUBSCRIPTION GATING SYSTEM
 * Controls access to features based on subscription tier and trial status
 * Handles 30-day trial period enforcement
 *
 * TRIAL LOGIC:
 * - New tenants always get 14 days from install.
 * - If trial_end_at is null, treat as active trial (billing fields still syncing).
 * - "Trial expired" only fires when now > trial_end_at (never on first open).
 *
 * REVIEW MODE:
 * - Tenants within first 7 days of install OR flagged review_mode_enabled=true
 *   get read-only access with a banner instead of a hard paywall.
 *
 * GRACE WINDOW:
 * - If tenant was created in the last 15 minutes, never block (billing sync lag).
 */

const TRIAL_DAYS = 30;
const BILLING_SYNC_GRACE_MINUTES = 15;
const REVIEW_MODE_DAYS = 7;

const TIER_FEATURES = {
  trial: {
    orders_per_month: 100,
    features: ['dashboard', 'basic_alerts', 'manual_sync'],
    ai_features: false,
    automation: false,
    api_access: false
  },
  starter: {
    orders_per_month: 500,
    features: ['dashboard', 'alerts', 'risk_scoring', 'basic_reports', 'manual_sync'],
    ai_features: false,
    automation: false,
    api_access: false
  },
  growth: {
    orders_per_month: 2000,
    features: ['dashboard', 'alerts', 'risk_scoring', 'reports', 'ai_insights', 'segmentation', 'campaigns', 'auto_sync'],
    ai_features: true,
    automation: false,
    api_access: true
  },
  pro: {
    orders_per_month: 10000,
    features: ['dashboard', 'alerts', 'risk_scoring', 'reports', 'ai_insights', 'segmentation', 'campaigns', 'auto_sync', 'automation', 'custom_rules', 'priority_support'],
    ai_features: true,
    automation: true,
    api_access: true
  },
  enterprise: {
    orders_per_month: -1, // Unlimited
    features: ['all'],
    ai_features: true,
    automation: true,
    api_access: true
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, tenant_id, feature } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Get tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    const tenant = tenants[0];
    
    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // AUTO-PROVISION TRIAL if trial_start_at is missing (covers first-open race condition)
    if (!tenant.trial_started_at) {
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await base44.asServiceRole.entities.Tenant.update(tenant.id, {
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        subscription_tier: 'trial',
        status: 'active'
      });
      // Re-fetch updated tenant
      const refreshed = await base44.asServiceRole.entities.Tenant.filter({ id: tenant.id });
      if (refreshed[0]) Object.assign(tenant, refreshed[0]);
    }

    // CHECK ACCESS
    if (action === 'check_access') {
      const accessResult = checkAccess(tenant, feature);
      return Response.json(accessResult);
    }

    // GET SUBSCRIPTION STATUS
    if (action === 'get_status') {
      const status = getSubscriptionStatus(tenant);
      return Response.json({ success: true, ...status });
    }

    // ADMIN: RESET TRIAL
    if (action === 'admin_reset_trial') {
      if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await base44.asServiceRole.entities.Tenant.update(tenant.id, {
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        subscription_tier: 'trial',
        status: 'active',
        review_mode_enabled: false
      });
      return Response.json({ success: true, trial_ends_at: trialEnd.toISOString() });
    }

    // ADMIN: SET REVIEW MODE
    if (action === 'admin_set_review_mode') {
      if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      await base44.asServiceRole.entities.Tenant.update(tenant.id, {
        review_mode_enabled: !!body.enabled
      });
      return Response.json({ success: true, review_mode_enabled: !!body.enabled });
    }

    // ADMIN: FORCE BILLING RESYNC
    if (action === 'admin_force_billing_resync') {
      if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      await base44.asServiceRole.entities.Tenant.update(tenant.id, {
        last_billing_sync_at: null
      });
      return Response.json({ success: true, message: 'Billing resync triggered — next check_access will re-evaluate.' });
    }

    // RESTORE ACCESS (billing resync check — merchant-facing)
    if (action === 'restore_access') {
      const status = getSubscriptionStatus(tenant);
      // Re-check and potentially auto-provision trial
      return Response.json({ success: true, ...status });
    }

    // START TRIAL
    if (action === 'start_trial') {
      if (tenant.trial_started_at) {
        return Response.json({ error: 'Trial already started' }, { status: 400 });
      }

      const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      
      await base44.asServiceRole.entities.Tenant.update(tenant.id, {
        subscription_tier: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        status: 'active'
      });

      // Schedule trial reminder emails
      await scheduleTrialReminders(base44, tenant.id, tenant.billing_email || user.email, trialEnd);

      return Response.json({ 
        success: true, 
        trial_ends_at: trialEnd.toISOString(),
        days_remaining: TRIAL_DAYS
      });
    }

    // CHECK TRIAL STATUS
    if (action === 'check_trial') {
      const status = getSubscriptionStatus(tenant);
      
      // If trial expired, lock the account
      if (status.trial_expired && tenant.status === 'active') {
        await base44.asServiceRole.entities.Tenant.update(tenant.id, {
          status: 'pending_setup' // Lock until they subscribe
        });

        // Send final reminder
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: tenant.billing_email || user.email,
          subject: '⚠️ Your ProfitShield Trial Has Ended',
          body: `Hi,

Your 30-day ProfitShield trial has ended. Your account has been temporarily locked.

To continue protecting your profits and accessing all features, please subscribe to a plan:

👉 Subscribe Now: ${getAppUrl()}/Pricing

Your data is safe and will be restored immediately upon subscription.

Questions? Reply to this email.

- The ProfitShield Team`
        });

        return Response.json({ 
          success: true, 
          trial_expired: true,
          locked: true,
          message: 'Trial expired. Please subscribe to continue.'
        });
      }

      return Response.json({ success: true, ...status });
    }

    // UPGRADE TIER
    if (action === 'upgrade' && body.new_tier) {
      const validTiers = ['starter', 'growth', 'pro', 'enterprise'];
      if (!validTiers.includes(body.new_tier)) {
        return Response.json({ error: 'Invalid tier' }, { status: 400 });
      }

      await base44.asServiceRole.entities.Tenant.update(tenant.id, {
        subscription_tier: body.new_tier,
        status: 'active',
        // Clear trial data on upgrade
        trial_started_at: tenant.trial_started_at, // Keep for records
        trial_ends_at: null
      });

      return Response.json({ success: true, new_tier: body.new_tier });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Subscription gating error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function checkAccess(tenant, feature) {
  const tier = tenant.subscription_tier || 'trial';
  const tierConfig = TIER_FEATURES[tier] || TIER_FEATURES.trial;
  const status = getSubscriptionStatus(tenant);
  const now = Date.now();

  // GRACE WINDOW: new tenant within 15 minutes — never block (billing sync lag)
  const createdAt = tenant.created_date ? new Date(tenant.created_date).getTime() : null;
  const inGraceWindow = createdAt && (now - createdAt) < BILLING_SYNC_GRACE_MINUTES * 60 * 1000;
  if (inGraceWindow) {
    return {
      allowed: true,
      reason: 'grace_window',
      grace_window: true,
      message: 'Verifying subscription…',
      trial_days_remaining: TRIAL_DAYS
    };
  }

  // REVIEW MODE: first 7 days after install OR explicit flag
  const isReviewMode = tenant.review_mode_enabled ||
    (createdAt && (now - createdAt) < REVIEW_MODE_DAYS * 24 * 60 * 60 * 1000);

  // If trial_end_at is null — treat as active trial (billing fields still initializing)
  if (!tenant.trial_ends_at && tier === 'trial') {
    return {
      allowed: true,
      reason: 'trial_initializing',
      message: 'Verifying subscription…',
      grace_window: true,
      trial_days_remaining: TRIAL_DAYS
    };
  }

  // TRIAL EXPIRED check — only if now > trial_end_at (strict, timezone-safe)
  if (status.trial_expired) {
    if (isReviewMode) {
      // Reviewers and first-week installs get read-only access with a banner
      return {
        allowed: true,
        reason: 'review_mode',
        review_mode: true,
        message: 'Review mode — subscription required to enable protection actions',
        upgrade_required: false
      };
    }
    return {
      allowed: false,
      reason: 'trial_expired',
      message: 'Your 30-day trial has ended. Subscribe to continue protecting your profits.',
      upgrade_required: true
    };
  }

  // PAID plans with past_due beyond 3-day grace
  const planStatus = tenant.plan_status;
  if (planStatus === 'canceled' || planStatus === 'expired') {
    if (isReviewMode) {
      return { allowed: true, reason: 'review_mode', review_mode: true };
    }
    return {
      allowed: false,
      reason: 'subscription_ended',
      message: 'Your subscription has ended. Please renew to continue.',
      upgrade_required: true
    };
  }

  // Check if account is hard-locked (legacy path)
  if (tenant.status !== 'active') {
    return {
      allowed: false,
      reason: 'account_locked',
      message: 'Your account is locked. Please subscribe to unlock.',
      upgrade_required: true
    };
  }

  // Check feature access
  if (feature) {
    if (tierConfig.features.includes('all') || tierConfig.features.includes(feature)) {
      return { allowed: true, tier, feature };
    }

    // Check AI features
    if (feature.startsWith('ai_') && !tierConfig.ai_features) {
      return {
        allowed: false,
        reason: 'feature_locked',
        message: 'AI features require Growth tier or higher',
        required_tier: 'growth',
        upgrade_required: true
      };
    }

    // Check automation
    if (feature === 'automation' && !tierConfig.automation) {
      return {
        allowed: false,
        reason: 'feature_locked',
        message: 'Automation requires Pro tier or higher',
        required_tier: 'pro',
        upgrade_required: true
      };
    }

    return {
      allowed: false,
      reason: 'feature_locked',
      message: `This feature requires a higher tier`,
      upgrade_required: true
    };
  }

  // Check order limits
  const ordersThisMonth = tenant.orders_this_month || 0;
  const limit = tierConfig.orders_per_month;
  
  if (limit !== -1 && ordersThisMonth >= limit) {
    return {
      allowed: false,
      reason: 'order_limit_reached',
      message: `You've reached your ${limit} orders/month limit`,
      current: ordersThisMonth,
      limit,
      upgrade_required: true
    };
  }

  return { 
    allowed: true, 
    tier,
    orders_remaining: limit === -1 ? 'unlimited' : limit - ordersThisMonth,
    trial_days_remaining: status.days_remaining
  };
}

function getSubscriptionStatus(tenant) {
  const tier = tenant.subscription_tier || 'trial';
  const trialStarted = tenant.trial_started_at ? new Date(tenant.trial_started_at) : null;
  const trialEnds = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;

  const now = new Date();
  const isPaid = ['starter', 'growth', 'pro', 'enterprise'].includes(tier);

  // Trial expired ONLY if: tier=trial AND trial_ends_at is set AND now >= trial_ends_at
  const isInTrial = tier === 'trial' && trialEnds && now < trialEnds;
  const trialExpired = tier === 'trial' && trialEnds && now >= trialEnds;

  let daysRemaining = 0;
  if (trialEnds && now < trialEnds) {
    daysRemaining = Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Review mode: first 7 days after install or explicit flag
  const createdAt = tenant.created_date ? new Date(tenant.created_date).getTime() : null;
  const isReviewMode = tenant.review_mode_enabled ||
    (createdAt && (Date.now() - createdAt) < REVIEW_MODE_DAYS * 24 * 60 * 60 * 1000);

  return {
    tier,
    plan_status: tenant.plan_status || (isPaid ? 'active' : (trialExpired ? 'expired' : 'trial')),
    is_trial: tier === 'trial',
    is_in_trial: isInTrial,
    trial_expired: trialExpired,
    trial_started_at: tenant.trial_started_at,
    trial_ends_at: tenant.trial_ends_at,
    days_remaining: daysRemaining,
    is_paid: isPaid,
    review_mode: isReviewMode,
    review_mode_enabled: !!tenant.review_mode_enabled,
    features: TIER_FEATURES[tier]?.features || [],
    order_limit: TIER_FEATURES[tier]?.orders_per_month || 100,
    orders_used: tenant.orders_this_month || 0
  };
}

async function scheduleTrialReminders(base44, tenantId, email, trialEnd) {
  const reminders = [
    { days_before: 7, subject: '🕐 7 Days Left on Your ProfitShield Trial' },
    { days_before: 3, subject: '⏰ 3 Days Left - Don\'t Lose Your Profit Protection' },
    { days_before: 1, subject: '🚨 Final Day! Your Trial Ends Tomorrow' }
  ];

  for (const reminder of reminders) {
    const sendAt = new Date(trialEnd.getTime() - (reminder.days_before * 24 * 60 * 60 * 1000));
    
    // Create a scheduled task for each reminder
    await base44.asServiceRole.entities.Task.create({
      tenant_id: tenantId,
      title: `Send trial reminder: ${reminder.days_before} days`,
      description: JSON.stringify({ email, subject: reminder.subject, send_at: sendAt.toISOString() }),
      category: 'trial_reminder',
      status: 'pending',
      due_date: sendAt.toISOString(),
      is_auto_generated: true
    });
  }
}

function getAppUrl() {
  return 'https://app.profitshield.ai'; // Replace with actual app URL
}