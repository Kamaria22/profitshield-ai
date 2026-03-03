import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    // Default to 'predict_churn' for scheduled automation calls (no action provided)
    const action = body.action || 'predict_churn';

    if (action === 'predict_churn') {
      return await predictChurn(base44);
    } else if (action === 'trigger_retention') {
      return await triggerRetention(base44, body.tenant_id);
    } else if (action === 'get_at_risk_tenants') {
      return await getAtRiskTenants(base44);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function predictChurn(base44) {
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
  const predictions = [];

  for (const tenant of tenants) {
    // Calculate usage metrics
    const daysSinceCreation = Math.floor((Date.now() - new Date(tenant.created_date).getTime()) / (1000 * 60 * 60 * 24));
    const ordersThisMonth = tenant.orders_this_month || 0;
    
    // Simulate usage data
    const usageMetrics = {
      login_frequency_7d: Math.floor(Math.random() * 14),
      orders_processed_7d: Math.floor(ordersThisMonth / 4),
      feature_usage_score: 30 + Math.floor(Math.random() * 70),
      support_tickets_30d: Math.floor(Math.random() * 5),
      nps_score: Math.floor(Math.random() * 100),
      days_since_last_login: Math.floor(Math.random() * 30)
    };

    // Calculate churn probability based on factors
    const factors = [];
    let churnScore = 0;

    // Low login frequency
    if (usageMetrics.login_frequency_7d < 2) {
      factors.push({ factor: 'low_login_frequency', weight: 25, current_value: usageMetrics.login_frequency_7d, threshold: 2, trend: 'declining' });
      churnScore += 25;
    }

    // Low feature usage
    if (usageMetrics.feature_usage_score < 40) {
      factors.push({ factor: 'low_feature_adoption', weight: 20, current_value: usageMetrics.feature_usage_score, threshold: 40, trend: 'stable' });
      churnScore += 20;
    }

    // High support tickets
    if (usageMetrics.support_tickets_30d > 3) {
      factors.push({ factor: 'high_support_volume', weight: 15, current_value: usageMetrics.support_tickets_30d, threshold: 3, trend: 'increasing' });
      churnScore += 15;
    }

    // Low NPS
    if (usageMetrics.nps_score < 30) {
      factors.push({ factor: 'low_satisfaction', weight: 20, current_value: usageMetrics.nps_score, threshold: 30, trend: 'declining' });
      churnScore += 20;
    }

    // Days since last login
    if (usageMetrics.days_since_last_login > 14) {
      factors.push({ factor: 'inactive', weight: 20, current_value: usageMetrics.days_since_last_login, threshold: 14, trend: 'increasing' });
      churnScore += 20;
    }

    const riskLevel = churnScore >= 70 ? 'critical' : churnScore >= 50 ? 'high' : churnScore >= 30 ? 'medium' : 'low';
    
    // Calculate LTV at risk
    const monthlyValue = tenant.subscription_tier === 'pro' ? 299 : tenant.subscription_tier === 'growth' ? 99 : 29;
    const ltvAtRisk = monthlyValue * 12;

    // Check for existing prediction
    const existing = await base44.asServiceRole.entities.ChurnPrediction.filter({ tenant_id: tenant.id });
    
    const predictionData = {
      tenant_id: tenant.id,
      prediction_date: new Date().toISOString(),
      churn_probability: Math.min(100, churnScore),
      risk_level: riskLevel,
      days_to_churn_estimate: riskLevel === 'critical' ? 14 : riskLevel === 'high' ? 30 : 60,
      contributing_factors: factors,
      usage_metrics: usageMetrics,
      ltv_at_risk: ltvAtRisk,
      subscription_tier: tenant.subscription_tier,
      months_as_customer: Math.floor(daysSinceCreation / 30),
      status: riskLevel === 'critical' || riskLevel === 'high' ? 'at_risk' : 'active'
    };

    if (existing.length > 0) {
      await base44.asServiceRole.entities.ChurnPrediction.update(existing[0].id, predictionData);
    } else {
      await base44.asServiceRole.entities.ChurnPrediction.create(predictionData);
    }

    predictions.push({ tenant_id: tenant.id, churn_probability: churnScore, risk_level: riskLevel });
  }

  const atRisk = predictions.filter(p => p.risk_level === 'critical' || p.risk_level === 'high');

  return Response.json({
    success: true,
    tenants_analyzed: predictions.length,
    at_risk_count: atRisk.length,
    total_ltv_at_risk: atRisk.length * 1500,
    breakdown: {
      critical: predictions.filter(p => p.risk_level === 'critical').length,
      high: predictions.filter(p => p.risk_level === 'high').length,
      medium: predictions.filter(p => p.risk_level === 'medium').length,
      low: predictions.filter(p => p.risk_level === 'low').length
    }
  });
}

async function triggerRetention(base44, tenantId) {
  const predictions = await base44.asServiceRole.entities.ChurnPrediction.filter({ tenant_id: tenantId });
  if (predictions.length === 0) {
    return Response.json({ error: 'No prediction found for tenant' }, { status: 404 });
  }

  const prediction = predictions[0];
  const actions = prediction.retention_actions_triggered || [];

  // Determine retention action based on risk level
  let actionType;
  if (prediction.risk_level === 'critical') {
    actionType = 'personal_outreach';
  } else if (prediction.risk_level === 'high') {
    actionType = 'discount_offer';
  } else {
    actionType = 'engagement_email';
  }

  actions.push({
    action_type: actionType,
    triggered_at: new Date().toISOString(),
    status: 'triggered',
    outcome: 'pending'
  });

  await base44.asServiceRole.entities.ChurnPrediction.update(prediction.id, {
    retention_actions_triggered: actions,
    status: 'intervention'
  });

  return Response.json({
    success: true,
    action_triggered: actionType,
    tenant_id: tenantId,
    risk_level: prediction.risk_level
  });
}

async function getAtRiskTenants(base44) {
  const predictions = await base44.asServiceRole.entities.ChurnPrediction.filter({});
  const atRisk = predictions.filter(p => p.risk_level === 'critical' || p.risk_level === 'high');

  return Response.json({
    at_risk_tenants: atRisk.map(p => ({
      tenant_id: p.tenant_id,
      churn_probability: p.churn_probability,
      risk_level: p.risk_level,
      ltv_at_risk: p.ltv_at_risk,
      days_to_churn: p.days_to_churn_estimate,
      top_factors: (p.contributing_factors || []).slice(0, 3).map(f => f.factor),
      status: p.status
    })),
    summary: {
      total_at_risk: atRisk.length,
      total_ltv_at_risk: atRisk.reduce((sum, p) => sum + (p.ltv_at_risk || 0), 0),
      critical_count: atRisk.filter(p => p.risk_level === 'critical').length,
      high_count: atRisk.filter(p => p.risk_level === 'high').length
    }
  });
}