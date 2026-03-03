/**
 * churnPrevention — Real signal-based churn prediction for all active tenants
 * Uses actual entity data: orders, alerts, AuditLogs, SupportConversations,
 * integration health, trial status, etc. NO random/simulated data.
 *
 * Actions:
 *   predict_churn         — daily batch: compute churn probability for all active tenants
 *   trigger_retention     — send retention action for a specific tenant
 *   get_at_risk_tenants   — list all at-risk predictions
 *   predict_single        — compute + upsert prediction for one tenant_id
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both authenticated users and service-role (scheduled automation)
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'predict_churn';

    const db = base44.asServiceRole;

    if (action === 'predict_churn') {
      return await predictChurnBatch(db);
    } else if (action === 'predict_single') {
      if (!body.tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });
      return await predictSingle(db, body.tenant_id);
    } else if (action === 'trigger_retention') {
      if (!body.tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });
      return await triggerRetention(db, body.tenant_id, user);
    } else if (action === 'get_at_risk_tenants') {
      return await getAtRiskTenants(db);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[churnPrevention]', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─── Main batch prediction ────────────────────────────────────────────────────

async function predictChurnBatch(db) {
  const tenants = await db.entities.Tenant.filter({ status: 'active' });
  console.log(`[churnPrevention] Processing ${tenants.length} active tenants`);

  const results = [];
  for (const tenant of tenants) {
    try {
      const prediction = await computePrediction(db, tenant);
      await upsertPrediction(db, tenant.id, prediction);
      results.push({ tenant_id: tenant.id, shop: tenant.shop_domain, ...summarize(prediction) });
    } catch (e) {
      console.error(`[churnPrevention] Error for tenant ${tenant.id}:`, e.message);
      results.push({ tenant_id: tenant.id, error: e.message });
    }
  }

  const successful = results.filter(r => !r.error);
  const atRisk = successful.filter(r => r.risk_level === 'critical' || r.risk_level === 'high');
  const breakdown = {
    critical: successful.filter(r => r.risk_level === 'critical').length,
    high: successful.filter(r => r.risk_level === 'high').length,
    medium: successful.filter(r => r.risk_level === 'medium').length,
    low: successful.filter(r => r.risk_level === 'low').length,
  };

  // Audit log the batch run
  await db.entities.AuditLog.create({
    tenant_id: tenants[0]?.id || 'system',
    action: 'churn_prediction_batch',
    entity_type: 'churn_prediction',
    entity_id: 'batch',
    performed_by: 'system',
    description: `Churn prediction batch complete: ${successful.length}/${tenants.length} tenants. At-risk: ${atRisk.length} (critical: ${breakdown.critical}, high: ${breakdown.high})`,
    severity: atRisk.length > 0 ? 'medium' : 'low',
    category: 'ai_action',
    is_auto_action: true,
    metadata: { breakdown, at_risk_count: atRisk.length, errors: results.filter(r => r.error).length }
  }).catch(() => {});

  return Response.json({
    success: true,
    tenants_analyzed: successful.length,
    errors: results.filter(r => r.error).length,
    at_risk_count: atRisk.length,
    total_ltv_at_risk: atRisk.reduce((s, r) => s + (r.ltv_at_risk || 0), 0),
    breakdown,
    predictions: results
  });
}

// ─── Single tenant prediction ──────────────────────────────────────────────────

async function predictSingle(db, tenantId) {
  const tenants = await db.entities.Tenant.filter({ id: tenantId });
  const tenant = tenants[0];
  if (!tenant) return Response.json({ error: 'Tenant not found' }, { status: 404 });

  const prediction = await computePrediction(db, tenant);
  const record = await upsertPrediction(db, tenantId, prediction);

  return Response.json({
    success: true,
    tenant_id: tenantId,
    shop: tenant.shop_domain,
    prediction: { ...prediction, id: record?.id }
  });
}

// ─── Core scoring engine ──────────────────────────────────────────────────────

async function computePrediction(db, tenant) {
  const tenantId = tenant.id;
  const now = Date.now();
  const daysSinceCreation = Math.floor((now - new Date(tenant.created_date).getTime()) / 86400000);

  // ── Pull real signals in parallel ──────────────────────────────────────────
  const [
    recentOrders,
    allOrders,
    recentAlerts,
    supportConvs,
    integrations,
    recentAuditLogs,
  ] = await Promise.all([
    db.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 50).catch(() => []),
    db.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 500).catch(() => []),
    db.entities.Alert.filter({ tenant_id: tenantId }, '-created_date', 50).catch(() => []),
    db.entities.SupportConversation.filter({ tenant_id: tenantId }, '-created_date', 20).catch(() => []),
    db.entities.PlatformIntegration.filter({ tenant_id: tenantId }).catch(() => []),
    db.entities.AuditLog.filter({ tenant_id: tenantId }, '-created_date', 100).catch(() => []),
  ]);

  // ── Compute real usage metrics ─────────────────────────────────────────────

  const now7dAgo = new Date(now - 7 * 86400000);
  const now30dAgo = new Date(now - 30 * 86400000);

  const orders7d = recentOrders.filter(o => new Date(o.created_date) > now7dAgo);
  const orders30d = recentOrders.filter(o => new Date(o.created_date) > now30dAgo);

  // Login frequency: count unique login audit events in last 7d
  const loginEvents = recentAuditLogs.filter(l =>
    l.action === 'user_login' && new Date(l.created_date) > now7dAgo
  );

  // Days since last activity (any audit log action)
  const lastActivity = recentAuditLogs.length > 0
    ? Math.floor((now - new Date(recentAuditLogs[0].created_date).getTime()) / 86400000)
    : daysSinceCreation;

  // Support tickets in last 30d
  const support30d = supportConvs.filter(c => new Date(c.created_date) > now30dAgo);
  const escalatedSupport = support30d.filter(c => c.status === 'escalated' || c.priority === 'critical' || c.priority === 'high');

  // Integration health
  const shopifyIntegration = integrations.find(i => i.platform === 'shopify');
  const integrationConnected = shopifyIntegration?.status === 'connected';
  const integrationDisconnected = !shopifyIntegration || shopifyIntegration.status === 'disconnected' || shopifyIntegration.status === 'error';

  // Pending alerts (unresolved)
  const pendingAlerts = recentAlerts.filter(a => a.status === 'pending');
  const highRiskAlerts = pendingAlerts.filter(a => a.severity === 'high' || a.severity === 'critical');

  // Revenue trend (last 7d vs prior 7d)
  const rev7d = orders7d.reduce((s, o) => s + (o.total_revenue || 0), 0);
  const prev7d = recentOrders
    .filter(o => {
      const d = new Date(o.created_date);
      return d > new Date(now - 14 * 86400000) && d <= now7dAgo;
    })
    .reduce((s, o) => s + (o.total_revenue || 0), 0);
  const revenueDecline = prev7d > 0 && rev7d < prev7d * 0.5;

  // Trial expiry — are they expiring soon with no upgrade action?
  const trialEndsAt = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
  const daysToTrialEnd = trialEndsAt ? Math.floor((trialEndsAt.getTime() - now) / 86400000) : null;
  const trialExpiringSoon = daysToTrialEnd !== null && daysToTrialEnd <= 5 && daysToTrialEnd >= 0;
  const trialExpired = daysToTrialEnd !== null && daysToTrialEnd < 0;

  // Onboarding not completed
  const onboardingIncomplete = !tenant.onboarding_completed;

  // Feature usage score: based on how many different audit action types they've triggered
  const uniqueActionTypes = new Set(recentAuditLogs.slice(0, 50).map(l => l.action)).size;
  const featureUsageScore = Math.min(100, uniqueActionTypes * 8);

  // Order volume health
  const avgOrdersPerWeek = allOrders.length / Math.max(1, daysSinceCreation / 7);
  const lowOrderVolume = avgOrdersPerWeek < 0.5 && daysSinceCreation > 14;

  // ── Scoring ────────────────────────────────────────────────────────────────

  const factors = [];
  let churnScore = 0;

  // 1. Inactivity (last activity > 14 days) — weight 25
  if (lastActivity > 21) {
    const weight = 25;
    factors.push({ factor: 'highly_inactive', weight, current_value: lastActivity, threshold: 21, trend: 'increasing' });
    churnScore += weight;
  } else if (lastActivity > 14) {
    const weight = 15;
    factors.push({ factor: 'inactive', weight, current_value: lastActivity, threshold: 14, trend: 'increasing' });
    churnScore += weight;
  }

  // 2. No orders in 7 days — weight 20
  if (orders7d.length === 0 && daysSinceCreation > 14 && allOrders.length > 0) {
    const weight = 20;
    factors.push({ factor: 'no_recent_orders', weight, current_value: 0, threshold: 1, trend: 'declining' });
    churnScore += weight;
  }

  // 3. Low login frequency (< 2 in 7 days) — weight 20
  if (loginEvents.length < 2 && daysSinceCreation > 7) {
    const weight = 20;
    factors.push({ factor: 'low_login_frequency', weight, current_value: loginEvents.length, threshold: 2, trend: 'declining' });
    churnScore += weight;
  }

  // 4. Integration disconnected — weight 20
  if (integrationDisconnected && daysSinceCreation > 3) {
    const weight = 20;
    factors.push({ factor: 'integration_disconnected', weight, current_value: 0, threshold: 1, trend: 'stable' });
    churnScore += weight;
  }

  // 5. Trial expiring soon with no upgrade — weight 25
  if (trialExpiringSoon && (tenant.plan_status === 'trial' || tenant.subscription_tier === 'trial')) {
    const weight = 25;
    factors.push({ factor: 'trial_expiring_soon', weight, current_value: daysToTrialEnd, threshold: 5, trend: 'increasing' });
    churnScore += weight;
  }

  // 6. Trial expired — weight 40
  if (trialExpired && (tenant.plan_status === 'trial' || tenant.subscription_tier === 'trial')) {
    const weight = 40;
    factors.push({ factor: 'trial_expired', weight, current_value: Math.abs(daysToTrialEnd), threshold: 0, trend: 'increasing' });
    churnScore += weight;
  }

  // 7. Escalated support tickets — weight 15
  if (escalatedSupport.length > 0) {
    const weight = 15;
    factors.push({ factor: 'escalated_support', weight, current_value: escalatedSupport.length, threshold: 0, trend: 'increasing' });
    churnScore += weight;
  }

  // 8. Unresolved high-risk alerts — weight 10
  if (highRiskAlerts.length >= 3) {
    const weight = 10;
    factors.push({ factor: 'unresolved_high_risk_alerts', weight, current_value: highRiskAlerts.length, threshold: 3, trend: 'increasing' });
    churnScore += weight;
  }

  // 9. Revenue decline — weight 15
  if (revenueDecline) {
    const weight = 15;
    factors.push({ factor: 'revenue_decline', weight, current_value: Math.round(rev7d), threshold: Math.round(prev7d * 0.5), trend: 'declining' });
    churnScore += weight;
  }

  // 10. Low feature usage — weight 10
  if (featureUsageScore < 24 && daysSinceCreation > 14) {
    const weight = 10;
    factors.push({ factor: 'low_feature_adoption', weight, current_value: featureUsageScore, threshold: 24, trend: 'stable' });
    churnScore += weight;
  }

  // 11. Onboarding incomplete — weight 15
  if (onboardingIncomplete && daysSinceCreation > 7) {
    const weight = 15;
    factors.push({ factor: 'onboarding_incomplete', weight, current_value: 0, threshold: 1, trend: 'stable' });
    churnScore += weight;
  }

  // Cap at 100
  const churnProbability = Math.min(100, churnScore);

  const riskLevel = churnProbability >= 70 ? 'critical'
    : churnProbability >= 50 ? 'high'
    : churnProbability >= 25 ? 'medium'
    : 'low';

  const monthlyValue = {
    pro: 299, growth: 99, starter: 29, trial: 29, enterprise: 499
  }[tenant.subscription_tier] || 29;

  const monthsAsCustomer = Math.floor(daysSinceCreation / 30);
  const ltvAtRisk = monthlyValue * Math.max(12, 24 - monthsAsCustomer);

  const daysToChurnEstimate = riskLevel === 'critical' ? 7
    : riskLevel === 'high' ? 21
    : riskLevel === 'medium' ? 45
    : 90;

  const usageMetrics = {
    login_frequency_7d: loginEvents.length,
    orders_processed_7d: orders7d.length,
    orders_last_30d: orders30d.length,
    total_orders: allOrders.length,
    feature_usage_score: featureUsageScore,
    support_tickets_30d: support30d.length,
    escalated_tickets_30d: escalatedSupport.length,
    days_since_last_activity: lastActivity,
    pending_alerts: pendingAlerts.length,
    integration_connected: integrationConnected,
    trial_days_remaining: daysToTrialEnd,
    revenue_7d: Math.round(rev7d),
    revenue_prev_7d: Math.round(prev7d),
  };

  return {
    tenant_id: tenantId,
    prediction_date: new Date().toISOString(),
    churn_probability: churnProbability,
    risk_level: riskLevel,
    days_to_churn_estimate: daysToChurnEstimate,
    contributing_factors: factors,
    usage_metrics: usageMetrics,
    ltv_at_risk: ltvAtRisk,
    subscription_tier: tenant.subscription_tier,
    months_as_customer: monthsAsCustomer,
    status: (riskLevel === 'critical' || riskLevel === 'high') ? 'at_risk' : 'active',
    retention_actions_triggered: [],
  };
}

function summarize(p) {
  return {
    churn_probability: p.churn_probability,
    risk_level: p.risk_level,
    ltv_at_risk: p.ltv_at_risk,
    factors_count: p.contributing_factors.length,
    top_factor: p.contributing_factors[0]?.factor || 'none',
  };
}

// ─── Upsert prediction ────────────────────────────────────────────────────────

async function upsertPrediction(db, tenantId, data) {
  const existing = await db.entities.ChurnPrediction.filter({ tenant_id: tenantId });

  // Preserve existing retention_actions_triggered if record exists
  if (existing.length > 0) {
    const merged = {
      ...data,
      retention_actions_triggered: existing[0].retention_actions_triggered || data.retention_actions_triggered,
      // Don't override 'intervention' status if already in intervention
      status: existing[0].status === 'intervention' ? 'intervention' : data.status,
    };
    await db.entities.ChurnPrediction.update(existing[0].id, merged);
    return { ...existing[0], ...merged };
  }

  return await db.entities.ChurnPrediction.create(data);
}

// ─── Retention action ─────────────────────────────────────────────────────────

async function triggerRetention(db, tenantId, user) {
  const predictions = await db.entities.ChurnPrediction.filter({ tenant_id: tenantId });
  if (predictions.length === 0) {
    return Response.json({ error: 'No prediction found for tenant' }, { status: 404 });
  }

  const prediction = predictions[0];
  const existing = prediction.retention_actions_triggered || [];

  let actionType;
  if (prediction.risk_level === 'critical') {
    actionType = 'personal_outreach';
  } else if (prediction.risk_level === 'high') {
    actionType = 'discount_offer';
  } else {
    actionType = 'engagement_email';
  }

  const newAction = {
    action_type: actionType,
    triggered_at: new Date().toISOString(),
    triggered_by: user?.email || 'system',
    status: 'triggered',
    outcome: 'pending'
  };

  await db.entities.ChurnPrediction.update(prediction.id, {
    retention_actions_triggered: [...existing, newAction],
    status: 'intervention'
  });

  await db.entities.AuditLog.create({
    tenant_id: tenantId,
    action: 'retention_action_triggered',
    entity_type: 'churn_prediction',
    entity_id: prediction.id,
    performed_by: user?.email || 'system',
    description: `Retention action triggered: ${actionType} for ${prediction.risk_level} risk tenant`,
    severity: 'medium',
    category: 'ai_action',
    is_auto_action: !user,
    metadata: { action_type: actionType, risk_level: prediction.risk_level, churn_probability: prediction.churn_probability }
  }).catch(() => {});

  return Response.json({
    success: true,
    action_triggered: actionType,
    tenant_id: tenantId,
    risk_level: prediction.risk_level,
    churn_probability: prediction.churn_probability
  });
}

// ─── Get at-risk tenants ──────────────────────────────────────────────────────

async function getAtRiskTenants(db) {
  const predictions = await db.entities.ChurnPrediction.filter({});
  const atRisk = predictions.filter(p => p.risk_level === 'critical' || p.risk_level === 'high');

  return Response.json({
    at_risk_tenants: atRisk
      .sort((a, b) => b.churn_probability - a.churn_probability)
      .map(p => ({
        tenant_id: p.tenant_id,
        churn_probability: p.churn_probability,
        risk_level: p.risk_level,
        ltv_at_risk: p.ltv_at_risk,
        days_to_churn: p.days_to_churn_estimate,
        top_factors: (p.contributing_factors || []).slice(0, 3).map(f => f.factor),
        status: p.status,
        prediction_date: p.prediction_date,
        subscription_tier: p.subscription_tier,
        months_as_customer: p.months_as_customer,
      })),
    summary: {
      total_at_risk: atRisk.length,
      total_ltv_at_risk: atRisk.reduce((sum, p) => sum + (p.ltv_at_risk || 0), 0),
      critical_count: atRisk.filter(p => p.risk_level === 'critical').length,
      high_count: atRisk.filter(p => p.risk_level === 'high').length,
      last_prediction: predictions.reduce((latest, p) => {
        if (!latest) return p.prediction_date;
        return p.prediction_date > latest ? p.prediction_date : latest;
      }, null),
    }
  });
}