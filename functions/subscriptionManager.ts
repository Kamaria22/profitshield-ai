import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SUBSCRIPTION MANAGER
 * Handles trial creation, plan selection, entitlements, and feature gating
 */

const TRIAL_DURATION_DAYS = 3;

const PLAN_FEATURES = {
  TRIAL: {
    dashboard_view: true,
    full_history: false,
    advanced_alerts: false,
    exports: false,
    multi_store: false,
    automation: false,
    advanced_risk_engine: false,
    api_access: false,
    white_label: false,
    priority_support: false,
    max_orders: 100,
    max_stores: 1,
    data_retention_days: 7
  },
  STARTER: {
    dashboard_view: true,
    full_history: true,
    advanced_alerts: true,
    exports: true,
    multi_store: false,
    automation: false,
    advanced_risk_engine: false,
    api_access: false,
    white_label: false,
    priority_support: false,
    max_orders: 1000,
    max_stores: 1,
    data_retention_days: 90
  },
  GROWTH: {
    dashboard_view: true,
    full_history: true,
    advanced_alerts: true,
    exports: true,
    multi_store: true,
    automation: true,
    advanced_risk_engine: true,
    api_access: false,
    white_label: false,
    priority_support: false,
    max_orders: 10000,
    max_stores: 5,
    data_retention_days: 365
  },
  PRO: {
    dashboard_view: true,
    full_history: true,
    advanced_alerts: true,
    exports: true,
    multi_store: true,
    automation: true,
    advanced_risk_engine: true,
    api_access: true,
    white_label: false,
    priority_support: true,
    max_orders: -1,
    max_stores: -1,
    data_retention_days: -1
  },
  ENTERPRISE: {
    dashboard_view: true,
    full_history: true,
    advanced_alerts: true,
    exports: true,
    multi_store: true,
    automation: true,
    advanced_risk_engine: true,
    api_access: true,
    white_label: true,
    priority_support: true,
    max_orders: -1,
    max_stores: -1,
    data_retention_days: -1
  }
};

Deno.serve(async (req) => {
  let level = "info";
  let message = "Processing subscription request";
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
    const { action, tenant_id, plan_code, user_id } = body;

    if (action === 'start_trial') {
      const result = await startTrial(base44, user.id, tenant_id);
      level = result.success ? "info" : "error";
      message = result.success ? "Trial started" : result.error;
      data = result;
      return Response.json({ level, message, status, data });
    }

    if (action === 'get_entitlements') {
      const entitlements = await getEntitlements(base44, tenant_id || body.tenantId);
      level = "info";
      message = "Entitlements retrieved";
      data = entitlements;
      return Response.json({ level, message, status, data });
    }

    if (action === 'check_feature') {
      const hasFeature = await checkFeature(base44, tenant_id, body.feature);
      level = hasFeature ? "info" : "warn";
      message = hasFeature ? "Feature allowed" : "Upgrade required";
      data = { has_feature: hasFeature, feature: body.feature };
      return Response.json({ level, message, status, data });
    }

    if (action === 'get_trial_status') {
      const trialStatus = await getTrialStatus(base44, user.id);
      level = "info";
      message = "Trial status retrieved";
      data = trialStatus;
      return Response.json({ level, message, status, data });
    }

    level = "error";
    message = "Invalid action";
    status = "error";
    return Response.json({ level, message, status, data }, { status: 400 });

  } catch (error) {
    level = "error";
    message = `Subscription error: ${error.message}`;
    status = "error";
    data = { error: error.message };
    return Response.json({ level, message, status, data }, { status: 500 });
  }
});

async function startTrial(base44, userId, tenantId) {
  try {
    // Check if user already has profile
    let profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_id: userId });
    let profile = profiles[0];

    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

    if (!profile) {
      profile = await base44.asServiceRole.entities.UserProfile.create({
        user_id: userId,
        tenant_id: tenantId,
        plan_status: 'TRIAL',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd.toISOString(),
        last_login_at: now.toISOString(),
        has_seen_welcome: false
      });
    } else if (!profile.trial_started_at) {
      await base44.asServiceRole.entities.UserProfile.update(profile.id, {
        plan_status: 'TRIAL',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd.toISOString()
      });
    }

    // Create subscription record
    const subscription = await base44.asServiceRole.entities.Subscription.create({
      tenant_id: tenantId,
      user_id: userId,
      plan_code: 'TRIAL',
      status: 'TRIALING',
      trial_start: now.toISOString(),
      trial_end: trialEnd.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: trialEnd.toISOString(),
      provider: 'INTERNAL'
    });

    // Log trial start
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: tenantId || 'system',
      action: 'trial_started',
      entity_type: 'Subscription',
      entity_id: subscription.id,
      performed_by: userId,
      description: `Trial started for user ${userId}`,
      metadata: { trial_days: TRIAL_DURATION_DAYS }
    });

    return {
      success: true,
      profile_id: profile.id,
      subscription_id: subscription.id,
      trial_ends_at: trialEnd.toISOString(),
      days_remaining: TRIAL_DURATION_DAYS
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getEntitlements(base44, tenantId) {
  try {
    const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ 
      tenant_id: tenantId 
    }, '-created_date', 1);

    if (!subscriptions || subscriptions.length === 0) {
      return {
        plan_code: 'TRIAL',
        features: PLAN_FEATURES.TRIAL,
        status: 'TRIALING'
      };
    }

    const sub = subscriptions[0];
    const features = PLAN_FEATURES[sub.plan_code] || PLAN_FEATURES.TRIAL;

    return {
      plan_code: sub.plan_code,
      features,
      status: sub.status,
      current_period_end: sub.current_period_end,
      trial_end: sub.trial_end
    };

  } catch (error) {
    return {
      plan_code: 'TRIAL',
      features: PLAN_FEATURES.TRIAL,
      status: 'TRIALING',
      error: error.message
    };
  }
}

async function checkFeature(base44, tenantId, feature) {
  try {
    const entitlements = await getEntitlements(base44, tenantId);
    return entitlements.features[feature] === true;
  } catch (error) {
    return false;
  }
}

async function getTrialStatus(base44, userId) {
  try {
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_id: userId });
    
    if (!profiles || profiles.length === 0) {
      return {
        is_trial: false,
        trial_active: false,
        days_remaining: 0
      };
    }

    const profile = profiles[0];
    
    if (!profile.trial_ends_at) {
      return {
        is_trial: false,
        trial_active: false,
        days_remaining: 0
      };
    }

    const now = new Date();
    const trialEnd = new Date(profile.trial_ends_at);
    const daysRemaining = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));

    return {
      is_trial: true,
      trial_active: daysRemaining > 0,
      days_remaining: daysRemaining,
      trial_ends_at: profile.trial_ends_at,
      plan_status: profile.plan_status
    };

  } catch (error) {
    return {
      is_trial: false,
      trial_active: false,
      days_remaining: 0,
      error: error.message
    };
  }
}