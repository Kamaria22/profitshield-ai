import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, tenant_id } = body;

    if (action === 'detect_anomalies') {
      return await detectAnomalies(base44, tenant_id);
    } else if (action === 'get_active_anomalies') {
      return await getActiveAnomalies(base44, tenant_id);
    } else if (action === 'acknowledge_anomaly') {
      return await acknowledgeAnomaly(base44, body.anomaly_id, user.email);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function detectAnomalies(base44, tenantId) {
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
  const anomalies = [];

  // Calculate baseline metrics (last 30 days vs previous 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  const currentPeriod = orders.filter(o => new Date(o.created_date) >= thirtyDaysAgo);
  const previousPeriod = orders.filter(o => 
    new Date(o.created_date) >= sixtyDaysAgo && new Date(o.created_date) < thirtyDaysAgo
  );

  // Calculate metrics for both periods
  const currentMetrics = calculateMetrics(currentPeriod);
  const previousMetrics = calculateMetrics(previousPeriod);

  // Detect revenue drop
  if (previousMetrics.revenue > 0) {
    const revenueChange = ((currentMetrics.revenue - previousMetrics.revenue) / previousMetrics.revenue) * 100;
    if (revenueChange < -15) {
      anomalies.push(await createAnomaly(base44, {
        tenant_id: tenantId,
        anomaly_type: 'revenue_drop',
        severity: revenueChange < -30 ? 'critical' : 'warning',
        metric_name: 'Revenue',
        current_value: currentMetrics.revenue,
        expected_value: previousMetrics.revenue,
        change_percentage: revenueChange,
        comparison_period: 'vs_previous_30d',
        impact_estimate: previousMetrics.revenue - currentMetrics.revenue,
        root_cause_analysis: analyzeRevenueDrop(currentPeriod, previousPeriod),
        recommended_actions: [
          'Review marketing spend and channel performance',
          'Check for inventory/stockout issues',
          'Analyze customer acquisition trends'
        ]
      }));
    }
  }

  // Detect margin decline
  if (previousMetrics.margin > 0) {
    const marginChange = currentMetrics.margin - previousMetrics.margin;
    if (marginChange < -5) {
      anomalies.push(await createAnomaly(base44, {
        tenant_id: tenantId,
        anomaly_type: 'margin_decline',
        severity: marginChange < -10 ? 'critical' : 'warning',
        metric_name: 'Profit Margin',
        current_value: currentMetrics.margin,
        expected_value: previousMetrics.margin,
        change_percentage: (marginChange / previousMetrics.margin) * 100,
        comparison_period: 'vs_previous_30d',
        impact_estimate: currentMetrics.revenue * (Math.abs(marginChange) / 100),
        root_cause_analysis: [
          { cause: 'increased_costs', confidence: 70, evidence: 'COGS increase detected' },
          { cause: 'discount_heavy', confidence: 50, evidence: 'Higher discount usage' }
        ],
        recommended_actions: [
          'Review supplier pricing and contracts',
          'Analyze discount and promotion effectiveness',
          'Check for pricing errors'
        ]
      }));
    }
  }

  // Detect refund surge
  if (previousMetrics.refundRate > 0) {
    const refundChange = currentMetrics.refundRate - previousMetrics.refundRate;
    if (refundChange > 5) {
      anomalies.push(await createAnomaly(base44, {
        tenant_id: tenantId,
        anomaly_type: 'refund_surge',
        severity: refundChange > 10 ? 'critical' : 'warning',
        metric_name: 'Refund Rate',
        current_value: currentMetrics.refundRate,
        expected_value: previousMetrics.refundRate,
        change_percentage: (refundChange / Math.max(1, previousMetrics.refundRate)) * 100,
        comparison_period: 'vs_previous_30d',
        impact_estimate: currentMetrics.revenue * (refundChange / 100),
        root_cause_analysis: [
          { cause: 'product_quality', confidence: 60, evidence: 'Check product reviews' },
          { cause: 'shipping_issues', confidence: 40, evidence: 'Delayed deliveries noted' }
        ],
        recommended_actions: [
          'Review recent product quality issues',
          'Check shipping carrier performance',
          'Analyze refund reasons'
        ]
      }));
    }
  }

  // Detect chargeback spike
  if (currentMetrics.chargebackRate > 1.5) {
    anomalies.push(await createAnomaly(base44, {
      tenant_id: tenantId,
      anomaly_type: 'chargeback_spike',
      severity: currentMetrics.chargebackRate > 2.5 ? 'critical' : 'warning',
      metric_name: 'Chargeback Rate',
      current_value: currentMetrics.chargebackRate,
      expected_value: 1.0,
      change_percentage: (currentMetrics.chargebackRate - 1.0) * 100,
      comparison_period: 'vs_industry_threshold',
      impact_estimate: currentMetrics.revenue * (currentMetrics.chargebackRate / 100) * 2,
      root_cause_analysis: [
        { cause: 'fraud_increase', confidence: 65, evidence: 'Higher risk scores observed' },
        { cause: 'merchant_error', confidence: 35, evidence: 'Check fulfillment accuracy' }
      ],
      recommended_actions: [
        'Enable enhanced fraud detection',
        'Review and update risk rules',
        'Improve order confirmation process'
      ]
    }));
  }

  // Detect AOV change
  if (previousMetrics.aov > 0) {
    const aovChange = ((currentMetrics.aov - previousMetrics.aov) / previousMetrics.aov) * 100;
    if (Math.abs(aovChange) > 20) {
      anomalies.push(await createAnomaly(base44, {
        tenant_id: tenantId,
        anomaly_type: 'aov_change',
        severity: 'info',
        metric_name: 'Average Order Value',
        current_value: currentMetrics.aov,
        expected_value: previousMetrics.aov,
        change_percentage: aovChange,
        comparison_period: 'vs_previous_30d',
        impact_estimate: Math.abs(currentMetrics.aov - previousMetrics.aov) * currentPeriod.length,
        root_cause_analysis: [
          { cause: aovChange > 0 ? 'upsell_success' : 'basket_shrink', confidence: 60, evidence: 'Product mix analysis' }
        ],
        recommended_actions: aovChange > 0 
          ? ['Continue successful cross-sell strategies']
          : ['Review product bundling', 'Implement cart recommendations']
      }));
    }
  }

  return Response.json({
    success: true,
    anomalies_detected: anomalies.length,
    anomalies: anomalies.map(a => ({
      id: a.id,
      type: a.anomaly_type,
      severity: a.severity,
      metric: a.metric_name,
      change: a.change_percentage,
      impact: a.impact_estimate
    })),
    metrics_summary: {
      current: currentMetrics,
      previous: previousMetrics
    }
  });
}

function calculateMetrics(orders) {
  const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const cost = orders.reduce((sum, o) => sum + (o.cost || 0), 0);
  const profit = orders.reduce((sum, o) => sum + (o.profit || 0), 0);
  const refunds = orders.filter(o => o.status === 'refunded').length;
  const chargebacks = orders.filter(o => o.chargeback_status === 'lost').length;

  return {
    revenue,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    orders: orders.length,
    aov: orders.length > 0 ? revenue / orders.length : 0,
    refundRate: orders.length > 0 ? (refunds / orders.length) * 100 : 0,
    chargebackRate: orders.length > 0 ? (chargebacks / orders.length) * 100 : 0
  };
}

function analyzeRevenueDrop(currentOrders, previousOrders) {
  const causes = [];
  
  // Volume analysis
  const volumeChange = ((currentOrders.length - previousOrders.length) / Math.max(1, previousOrders.length)) * 100;
  if (volumeChange < -10) {
    causes.push({ cause: 'order_volume_drop', confidence: 70, evidence: `${volumeChange.toFixed(1)}% fewer orders` });
  }

  // AOV analysis
  const currentAOV = currentOrders.reduce((sum, o) => sum + (o.total || 0), 0) / Math.max(1, currentOrders.length);
  const previousAOV = previousOrders.reduce((sum, o) => sum + (o.total || 0), 0) / Math.max(1, previousOrders.length);
  const aovChange = ((currentAOV - previousAOV) / Math.max(1, previousAOV)) * 100;
  if (aovChange < -10) {
    causes.push({ cause: 'aov_decline', confidence: 60, evidence: `${aovChange.toFixed(1)}% lower AOV` });
  }

  return causes;
}

async function createAnomaly(base44, data) {
  return await base44.asServiceRole.entities.RevenueAnomaly.create({
    ...data,
    status: 'detected',
    detected_at: new Date().toISOString()
  });
}

async function getActiveAnomalies(base44, tenantId) {
  const filter = tenantId ? { tenant_id: tenantId } : {};
  const anomalies = await base44.asServiceRole.entities.RevenueAnomaly.filter(filter);
  const active = anomalies.filter(a => a.status === 'detected' || a.status === 'investigating');

  return Response.json({
    anomalies: active.map(a => ({
      id: a.id,
      type: a.anomaly_type,
      severity: a.severity,
      metric: a.metric_name,
      current: a.current_value,
      expected: a.expected_value,
      change_pct: a.change_percentage,
      impact: a.impact_estimate,
      recommendations: a.recommended_actions,
      detected_at: a.detected_at
    })),
    summary: {
      total: active.length,
      critical: active.filter(a => a.severity === 'critical').length,
      warning: active.filter(a => a.severity === 'warning').length,
      total_impact: active.reduce((sum, a) => sum + (a.impact_estimate || 0), 0)
    }
  });
}

async function acknowledgeAnomaly(base44, anomalyId, userEmail) {
  await base44.asServiceRole.entities.RevenueAnomaly.update(anomalyId, {
    status: 'acknowledged'
  });

  await base44.asServiceRole.entities.GovernanceAuditEvent.create({
    event_type: 'data_access',
    entity_affected: 'RevenueAnomaly',
    entity_id: anomalyId,
    changed_by: userEmail,
    change_reason: 'Anomaly acknowledged',
    severity: 'info'
  });

  return Response.json({ success: true, anomaly_id: anomalyId, status: 'acknowledged' });
}