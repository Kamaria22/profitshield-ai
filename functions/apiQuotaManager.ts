import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Quota tier configurations
const QUOTA_TIERS = {
  free: { requests_per_minute: 10, requests_per_day: 100, requests_per_month: 1000, webhook_deliveries_per_day: 50, bulk_operations_per_day: 5 },
  starter: { requests_per_minute: 60, requests_per_day: 5000, requests_per_month: 100000, webhook_deliveries_per_day: 500, bulk_operations_per_day: 50 },
  growth: { requests_per_minute: 120, requests_per_day: 20000, requests_per_month: 500000, webhook_deliveries_per_day: 2000, bulk_operations_per_day: 200 },
  pro: { requests_per_minute: 300, requests_per_day: 100000, requests_per_month: 2000000, webhook_deliveries_per_day: 10000, bulk_operations_per_day: 1000 },
  enterprise: { requests_per_minute: 1000, requests_per_day: 500000, requests_per_month: 10000000, webhook_deliveries_per_day: 50000, bulk_operations_per_day: 5000 }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'check_quota') {
      return await checkQuota(base44, body.tenant_id);
    } else if (action === 'record_usage') {
      return await recordUsage(base44, body.tenant_id, body.usage_type);
    } else if (action === 'get_usage_dashboard') {
      return await getUsageDashboard(base44, body.tenant_id);
    } else if (action === 'update_tier') {
      return await updateTier(base44, body.tenant_id, body.new_tier);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function checkQuota(base44, tenantId) {
  let quotas = await base44.asServiceRole.entities.APIQuota.filter({ tenant_id: tenantId });
  
  // Create quota record if doesn't exist
  if (quotas.length === 0) {
    const tenant = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
    const tier = tenant[0]?.subscription_tier || 'starter';
    
    const quota = await base44.asServiceRole.entities.APIQuota.create({
      tenant_id: tenantId,
      quota_tier: tier,
      limits: QUOTA_TIERS[tier] || QUOTA_TIERS.starter,
      current_usage: {
        requests_today: 0,
        requests_this_month: 0,
        webhooks_today: 0,
        bulk_ops_today: 0,
        last_request_at: null
      },
      rate_limit_status: 'normal',
      overage_config: {
        allow_overage: false,
        overage_rate_per_1k: 5,
        max_overage_spend: 100,
        current_overage_charges: 0
      }
    });
    quotas = [quota];
  }

  const quota = quotas[0];
  const limits = quota.limits || QUOTA_TIERS[quota.quota_tier] || QUOTA_TIERS.starter;
  const usage = quota.current_usage || {};

  // Calculate percentages
  const dailyUsagePct = (usage.requests_today || 0) / limits.requests_per_day * 100;
  const monthlyUsagePct = (usage.requests_this_month || 0) / limits.requests_per_month * 100;

  // Determine status
  let status = 'normal';
  if (dailyUsagePct >= 100 || monthlyUsagePct >= 100) {
    status = quota.overage_config?.allow_overage ? 'overage' : 'blocked';
  } else if (dailyUsagePct >= 80 || monthlyUsagePct >= 80) {
    status = 'warning';
  } else if (dailyUsagePct >= 90 || monthlyUsagePct >= 90) {
    status = 'throttled';
  }

  return Response.json({
    quota_status: {
      tenant_id: tenantId,
      tier: quota.quota_tier,
      status,
      limits,
      usage: {
        daily: { used: usage.requests_today || 0, limit: limits.requests_per_day, percentage: dailyUsagePct },
        monthly: { used: usage.requests_this_month || 0, limit: limits.requests_per_month, percentage: monthlyUsagePct },
        webhooks: { used: usage.webhooks_today || 0, limit: limits.webhook_deliveries_per_day },
        bulk_ops: { used: usage.bulk_ops_today || 0, limit: limits.bulk_operations_per_day }
      },
      can_make_request: status !== 'blocked',
      overage_enabled: quota.overage_config?.allow_overage || false
    }
  });
}

async function recordUsage(base44, tenantId, usageType = 'request') {
  const quotas = await base44.asServiceRole.entities.APIQuota.filter({ tenant_id: tenantId });
  if (quotas.length === 0) {
    // Auto-create quota
    await checkQuota(base44, tenantId);
    return await recordUsage(base44, tenantId, usageType);
  }

  const quota = quotas[0];
  const usage = quota.current_usage || {};
  const limits = quota.limits || QUOTA_TIERS[quota.quota_tier];

  // Increment usage
  if (usageType === 'request') {
    usage.requests_today = (usage.requests_today || 0) + 1;
    usage.requests_this_month = (usage.requests_this_month || 0) + 1;
  } else if (usageType === 'webhook') {
    usage.webhooks_today = (usage.webhooks_today || 0) + 1;
  } else if (usageType === 'bulk') {
    usage.bulk_ops_today = (usage.bulk_ops_today || 0) + 1;
  }
  usage.last_request_at = new Date().toISOString();

  // Check for overage
  let overageCharges = quota.overage_config?.current_overage_charges || 0;
  if (usage.requests_this_month > limits.requests_per_month && quota.overage_config?.allow_overage) {
    const overageRequests = usage.requests_this_month - limits.requests_per_month;
    overageCharges = (overageRequests / 1000) * (quota.overage_config?.overage_rate_per_1k || 5);
  }

  // Check rate limit status
  let status = 'normal';
  const dailyPct = usage.requests_today / limits.requests_per_day * 100;
  if (dailyPct >= 100 && !quota.overage_config?.allow_overage) {
    status = 'blocked';
  } else if (dailyPct >= 90) {
    status = 'throttled';
  } else if (dailyPct >= 80) {
    status = 'warning';
  }

  // Send alert if crossing thresholds
  const alerts = quota.alerts_sent || [];
  if (dailyPct >= 80 && !alerts.some(a => a.threshold === 80)) {
    alerts.push({ threshold: 80, sent_at: new Date().toISOString() });
    // Would trigger notification here
  }
  if (dailyPct >= 95 && !alerts.some(a => a.threshold === 95)) {
    alerts.push({ threshold: 95, sent_at: new Date().toISOString() });
  }

  await base44.asServiceRole.entities.APIQuota.update(quota.id, {
    current_usage: usage,
    rate_limit_status: status,
    alerts_sent: alerts,
    overage_config: {
      ...quota.overage_config,
      current_overage_charges: overageCharges
    }
  });

  return Response.json({
    success: true,
    status,
    usage_recorded: usageType,
    current_daily_usage: usage.requests_today
  });
}

async function getUsageDashboard(base44, tenantId) {
  const quotas = await base44.asServiceRole.entities.APIQuota.filter({ tenant_id: tenantId });
  if (quotas.length === 0) {
    return Response.json({ error: 'No quota record found' }, { status: 404 });
  }

  const quota = quotas[0];
  const limits = quota.limits || QUOTA_TIERS[quota.quota_tier];
  const usage = quota.current_usage || {};

  return Response.json({
    usage_dashboard: {
      tier: quota.quota_tier,
      status: quota.rate_limit_status,
      limits,
      current_usage: usage,
      utilization: {
        daily_requests: ((usage.requests_today || 0) / limits.requests_per_day * 100).toFixed(1),
        monthly_requests: ((usage.requests_this_month || 0) / limits.requests_per_month * 100).toFixed(1),
        webhooks: ((usage.webhooks_today || 0) / limits.webhook_deliveries_per_day * 100).toFixed(1),
        bulk_ops: ((usage.bulk_ops_today || 0) / limits.bulk_operations_per_day * 100).toFixed(1)
      },
      overage: {
        enabled: quota.overage_config?.allow_overage || false,
        current_charges: quota.overage_config?.current_overage_charges || 0,
        max_spend: quota.overage_config?.max_overage_spend || 0,
        rate_per_1k: quota.overage_config?.overage_rate_per_1k || 5
      },
      usage_history: quota.usage_history || [],
      recommendations: getRecommendations(quota)
    }
  });
}

function getRecommendations(quota) {
  const recs = [];
  const usage = quota.current_usage || {};
  const limits = quota.limits || {};

  if (usage.requests_this_month > limits.requests_per_month * 0.9) {
    recs.push({
      type: 'upgrade',
      message: 'You are approaching your monthly limit. Consider upgrading to a higher tier.',
      priority: 'high'
    });
  }

  if (quota.rate_limit_status === 'throttled') {
    recs.push({
      type: 'optimization',
      message: 'Your requests are being throttled. Consider implementing caching or batching.',
      priority: 'medium'
    });
  }

  if (!quota.overage_config?.allow_overage && usage.requests_today > limits.requests_per_day * 0.8) {
    recs.push({
      type: 'overage',
      message: 'Enable overage to prevent service interruption when limits are reached.',
      priority: 'medium'
    });
  }

  return recs;
}

async function updateTier(base44, tenantId, newTier) {
  const quotas = await base44.asServiceRole.entities.APIQuota.filter({ tenant_id: tenantId });
  if (quotas.length === 0) {
    return Response.json({ error: 'No quota record found' }, { status: 404 });
  }

  const newLimits = QUOTA_TIERS[newTier];
  if (!newLimits) {
    return Response.json({ error: 'Invalid tier' }, { status: 400 });
  }

  await base44.asServiceRole.entities.APIQuota.update(quotas[0].id, {
    quota_tier: newTier,
    limits: newLimits,
    rate_limit_status: 'normal'
  });

  return Response.json({
    success: true,
    new_tier: newTier,
    new_limits: newLimits
  });
}