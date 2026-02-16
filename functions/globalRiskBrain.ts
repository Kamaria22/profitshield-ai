import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'score_order':
        return Response.json(await scoreOrderWithAudit(base44, params));
      
      case 'explain_score':
        return Response.json(await explainScore(base44, params));
      
      case 'record_outcome':
        return Response.json(await recordOutcome(base44, params));
      
      case 'retrain_model':
        return Response.json(await triggerModelRetrain(base44, params));
      
      case 'check_drift':
        return Response.json(await checkModelDrift(base44, params));
      
      case 'get_global_signals':
        return Response.json(await getGlobalSignals(base44, params));
      
      case 'aggregate_patterns':
        return Response.json(await aggregatePatterns(base44, params));
      
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Global Risk Brain error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function scoreOrderWithAudit(base44, { order_id, tenant_id }) {
  // Fetch order
  const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id, tenant_id });
  if (orders.length === 0) throw new Error('Order not found');
  const order = orders[0];

  // Get active model version
  const models = await base44.asServiceRole.entities.ModelVersion.filter({ 
    model_type: 'fraud_detection', 
    status: 'active' 
  });
  const model = models[0] || { version: '1.0.0', feature_weights: getDefaultWeights() };

  // Get global signals
  const signals = await base44.asServiceRole.entities.GlobalRiskSignal.filter({ is_active: true });
  
  // Get anomaly patterns
  const patterns = await base44.asServiceRole.entities.AnomalyPattern.filter({ is_active: true });

  // Get tenant risk rules
  const rules = await base44.asServiceRole.entities.RiskRule.filter({ tenant_id, is_active: true });

  // Get customer history
  const customerOrders = order.customer_email 
    ? await base44.asServiceRole.entities.Order.filter({ tenant_id, customer_email: order.customer_email })
    : [];

  // Calculate score with explainability
  const scoreResult = calculateScore(order, customerOrders, model, signals, patterns, rules);

  // Create audit record
  await base44.asServiceRole.entities.RiskScoreAudit.create({
    tenant_id,
    order_id,
    platform_order_id: order.platform_order_id,
    model_version_id: model.id,
    model_version: model.version,
    score_timestamp: new Date().toISOString(),
    final_score: scoreResult.final_score,
    risk_level: scoreResult.risk_level,
    score_breakdown: scoreResult.breakdown,
    feature_contributions: scoreResult.contributions,
    signals_matched: scoreResult.matched_signals,
    patterns_matched: scoreResult.matched_patterns,
    rules_triggered: scoreResult.triggered_rules,
    confidence_interval: scoreResult.confidence_interval,
    recommended_action: scoreResult.recommended_action
  });

  // Update order
  await base44.asServiceRole.entities.Order.update(order_id, {
    fraud_score: scoreResult.final_score,
    risk_level: scoreResult.risk_level,
    risk_reasons: scoreResult.contributions.slice(0, 10).map(c => c.feature + ': ' + c.value),
    recommended_action: scoreResult.recommended_action,
    confidence: scoreResult.confidence_level
  });

  return { success: true, score: scoreResult };
}

function calculateScore(order, customerOrders, model, signals, patterns, rules) {
  const weights = model.feature_weights || getDefaultWeights();
  const contributions = [];
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  const matchedSignals = [];
  const matchedPatterns = [];
  const triggeredRules = [];

  // Feature: New Customer
  const isFirstOrder = customerOrders.length <= 1;
  if (isFirstOrder) {
    const contrib = weights.new_customer || 15;
    fraudScore += contrib;
    contributions.push({ feature: 'New Customer', value: 'Yes', contribution: contrib, weight: weights.new_customer });
  }

  // Feature: Order Value
  if (order.total_revenue > 500) {
    const contrib = weights.high_order_value_500 || 10;
    fraudScore += contrib;
    contributions.push({ feature: 'High Order Value', value: `$${order.total_revenue}`, contribution: contrib, weight: weights.high_order_value_500 });
  }
  if (order.total_revenue > 1000) {
    fraudScore += weights.high_order_value_1000 || 15;
    chargebackScore += 10;
  }

  // Feature: Address Mismatch
  const billing = order.billing_address || {};
  const shipping = order.shipping_address || {};
  if (billing.country && shipping.country && billing.country !== shipping.country) {
    const contrib = weights.address_country_mismatch || 25;
    fraudScore += contrib;
    chargebackScore += 15;
    contributions.push({ feature: 'Address Mismatch', value: 'Country differs', contribution: contrib, weight: weights.address_country_mismatch });
  }

  // Feature: Discount Analysis
  const discountPct = order.total_revenue > 0 
    ? ((order.discount_total || 0) / (order.total_revenue + (order.discount_total || 0))) * 100 
    : 0;
  if (discountPct > 30) {
    const contrib = weights.heavy_discount || 15;
    fraudScore += contrib;
    contributions.push({ feature: 'Heavy Discount', value: `${discountPct.toFixed(0)}%`, contribution: contrib, weight: weights.heavy_discount });
  }

  // Feature: Velocity Check
  const recentOrders = customerOrders.filter(o => {
    const orderDate = new Date(o.order_date);
    const hoursDiff = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60);
    return hoursDiff < 24 && o.id !== order.id;
  });
  if (recentOrders.length >= 2) {
    const contrib = weights.velocity_24h || 20;
    fraudScore += contrib;
    chargebackScore += 15;
    contributions.push({ feature: 'Velocity', value: `${recentOrders.length + 1} orders/24h`, contribution: contrib, weight: weights.velocity_24h });
  }

  // Match global signals
  for (const signal of signals) {
    if (matchSignal(signal, order, customerOrders)) {
      fraudScore += signal.impact_weight || 5;
      matchedSignals.push(signal.id);
      contributions.push({ feature: `Signal: ${signal.signal_type}`, value: signal.signal_key, contribution: signal.impact_weight, weight: signal.impact_weight });
    }
  }

  // Match anomaly patterns
  for (const pattern of patterns) {
    if (matchPattern(pattern, order)) {
      fraudScore *= pattern.risk_multiplier || 1;
      matchedPatterns.push(pattern.id);
    }
  }

  // Apply custom rules
  for (const rule of rules) {
    if (evaluateRule(rule, order, customerOrders)) {
      fraudScore += rule.risk_adjustment || 0;
      triggeredRules.push({ rule_id: rule.id, rule_name: rule.name, adjustment: rule.risk_adjustment });
      contributions.push({ feature: `Rule: ${rule.name}`, value: 'Matched', contribution: rule.risk_adjustment, weight: rule.risk_adjustment });
    }
  }

  // Calculate combined score
  const finalScore = Math.min(100, Math.max(0, Math.round(
    (fraudScore * 0.5) + (returnScore * 0.25) + (chargebackScore * 0.25)
  )));

  // Determine risk level
  const thresholds = model.thresholds || { high_risk: 70, medium_risk: 40 };
  let riskLevel = 'low';
  if (finalScore >= thresholds.high_risk) riskLevel = 'high';
  else if (finalScore >= thresholds.medium_risk) riskLevel = 'medium';

  // Calculate confidence interval
  const sampleSize = customerOrders.length;
  const confidenceWidth = Math.max(5, 20 - sampleSize);
  const confidenceInterval = {
    lower: Math.max(0, finalScore - confidenceWidth),
    upper: Math.min(100, finalScore + confidenceWidth),
    confidence: Math.min(0.95, 0.6 + (sampleSize * 0.05))
  };

  // Determine recommended action
  let recommendedAction = 'none';
  if (riskLevel === 'high') {
    if (fraudScore >= 60) recommendedAction = 'cancel';
    else if (fraudScore >= 40) recommendedAction = 'verify';
    else recommendedAction = 'hold';
  } else if (riskLevel === 'medium') {
    recommendedAction = order.total_revenue > 500 ? 'signature' : 'verify';
  }

  // Sort contributions by impact
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    final_score: finalScore,
    risk_level: riskLevel,
    breakdown: { fraud_score: fraudScore, return_score: returnScore, chargeback_score: chargebackScore },
    contributions,
    matched_signals: matchedSignals,
    matched_patterns: matchedPatterns,
    triggered_rules: triggeredRules,
    confidence_interval: confidenceInterval,
    confidence_level: confidenceInterval.confidence > 0.8 ? 'high' : confidenceInterval.confidence > 0.6 ? 'medium' : 'low',
    recommended_action: recommendedAction
  };
}

function matchSignal(signal, order, customerOrders) {
  // Basic signal matching logic
  if (signal.signal_type === 'velocity_anomaly' && customerOrders.length > 3) {
    const recent = customerOrders.filter(o => {
      const hrs = (Date.now() - new Date(o.order_date).getTime()) / 3600000;
      return hrs < 24;
    });
    return recent.length >= 3;
  }
  if (signal.signal_type === 'address_mismatch') {
    return order.billing_address?.country !== order.shipping_address?.country;
  }
  return false;
}

function matchPattern(pattern, order) {
  if (pattern.pattern_type === 'amount_outlier' && pattern.statistical_profile) {
    const zScore = (order.total_revenue - (pattern.statistical_profile.mean || 100)) / (pattern.statistical_profile.std_dev || 50);
    return Math.abs(zScore) > (pattern.statistical_profile.z_score_threshold || 2);
  }
  return false;
}

function evaluateRule(rule, order, customerOrders) {
  const conditions = rule.conditions || [];
  for (const cond of conditions) {
    const fieldValue = getFieldValue(cond.field, order, customerOrders);
    if (!evaluateCondition(fieldValue, cond.operator, cond.value)) return false;
  }
  return conditions.length > 0;
}

function getFieldValue(field, order, customerOrders) {
  switch (field) {
    case 'order_value': return order.total_revenue || 0;
    case 'discount_pct': return order.total_revenue > 0 ? ((order.discount_total || 0) / (order.total_revenue + (order.discount_total || 0))) * 100 : 0;
    case 'customer_orders': return customerOrders.length;
    case 'is_first_order': return customerOrders.length <= 1;
    case 'shipping_country': return order.shipping_address?.country || '';
    default: return null;
  }
}

function evaluateCondition(fieldValue, operator, compareValue) {
  switch (operator) {
    case 'equals': return String(fieldValue).toLowerCase() === String(compareValue).toLowerCase();
    case 'not_equals': return String(fieldValue).toLowerCase() !== String(compareValue).toLowerCase();
    case 'greater_than': return Number(fieldValue) > Number(compareValue);
    case 'less_than': return Number(fieldValue) < Number(compareValue);
    case 'contains': return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());
    default: return false;
  }
}

function getDefaultWeights() {
  return {
    new_customer: 15,
    high_order_value_500: 10,
    high_order_value_1000: 15,
    address_country_mismatch: 25,
    address_zip_mismatch: 10,
    heavy_discount: 15,
    velocity_24h: 20,
    suspicious_email: 15,
    high_refund_history: 25
  };
}

async function explainScore(base44, { order_id, tenant_id }) {
  const audits = await base44.asServiceRole.entities.RiskScoreAudit.filter({ order_id, tenant_id });
  if (audits.length === 0) return { error: 'No audit record found' };
  
  const audit = audits[0];
  return {
    score: audit.final_score,
    risk_level: audit.risk_level,
    confidence: audit.confidence_interval,
    top_factors: audit.feature_contributions?.slice(0, 5) || [],
    signals_matched: audit.signals_matched?.length || 0,
    patterns_matched: audit.patterns_matched?.length || 0,
    rules_triggered: audit.rules_triggered || [],
    model_version: audit.model_version,
    scored_at: audit.score_timestamp
  };
}

async function recordOutcome(base44, { order_id, tenant_id, outcome }) {
  // Update audit record
  const audits = await base44.asServiceRole.entities.RiskScoreAudit.filter({ order_id, tenant_id });
  if (audits.length > 0) {
    await base44.asServiceRole.entities.RiskScoreAudit.update(audits[0].id, {
      outcome,
      outcome_recorded_at: new Date().toISOString()
    });
  }

  // Update global signals based on outcome
  const audit = audits[0];
  if (audit?.signals_matched?.length > 0) {
    const isBadOutcome = ['fraud_confirmed', 'chargeback'].includes(outcome);
    for (const signalId of audit.signals_matched) {
      const signals = await base44.asServiceRole.entities.GlobalRiskSignal.filter({ id: signalId });
      if (signals.length > 0) {
        const signal = signals[0];
        await base44.asServiceRole.entities.GlobalRiskSignal.update(signalId, {
          occurrence_count: (signal.occurrence_count || 0) + 1,
          true_positive_count: isBadOutcome ? (signal.true_positive_count || 0) + 1 : signal.true_positive_count,
          false_positive_count: !isBadOutcome ? (signal.false_positive_count || 0) + 1 : signal.false_positive_count,
          last_observed_at: new Date().toISOString()
        });
      }
    }
  }

  return { success: true };
}

async function triggerModelRetrain(base44, { model_type = 'fraud_detection', scope = 'global', tenant_id }) {
  // Get recent outcomes for training
  const filter = scope === 'tenant' && tenant_id 
    ? { tenant_id, outcome: { $ne: 'pending' } }
    : { outcome: { $ne: 'pending' } };
  
  const outcomes = await base44.asServiceRole.entities.RiskScoreAudit.filter(filter);
  
  if (outcomes.length < 100) {
    return { success: false, reason: 'Insufficient outcome data for retraining', sample_size: outcomes.length };
  }

  // Calculate new weights based on outcomes
  const newWeights = calculateOptimalWeights(outcomes);
  
  // Get current model
  const models = await base44.asServiceRole.entities.ModelVersion.filter({ model_type, status: 'active' });
  const currentModel = models[0];
  const currentVersion = currentModel?.version || '1.0.0';
  const versionParts = currentVersion.split('.').map(Number);
  versionParts[2] = (versionParts[2] || 0) + 1;
  const newVersion = versionParts.join('.');

  // Create new model version
  const newModel = await base44.asServiceRole.entities.ModelVersion.create({
    model_type,
    version: newVersion,
    scope,
    tenant_id: scope === 'tenant' ? tenant_id : undefined,
    status: 'validating',
    feature_weights: newWeights,
    training_data: {
      sample_size: outcomes.length,
      date_range_start: outcomes[outcomes.length - 1]?.score_timestamp,
      date_range_end: outcomes[0]?.score_timestamp,
      positive_samples: outcomes.filter(o => ['fraud_confirmed', 'chargeback'].includes(o.outcome)).length,
      negative_samples: outcomes.filter(o => o.outcome === 'fulfilled_ok').length
    },
    parent_version_id: currentModel?.id
  });

  return { success: true, new_version: newVersion, model_id: newModel.id };
}

function calculateOptimalWeights(outcomes) {
  // Simplified weight optimization
  const weights = getDefaultWeights();
  const featureImpact = {};

  for (const outcome of outcomes) {
    const isBad = ['fraud_confirmed', 'chargeback'].includes(outcome.outcome);
    for (const contrib of (outcome.feature_contributions || [])) {
      if (!featureImpact[contrib.feature]) {
        featureImpact[contrib.feature] = { bad: 0, good: 0, total: 0 };
      }
      featureImpact[contrib.feature].total++;
      if (isBad) featureImpact[contrib.feature].bad++;
      else featureImpact[contrib.feature].good++;
    }
  }

  // Adjust weights based on precision
  for (const [feature, impact] of Object.entries(featureImpact)) {
    if (impact.total > 10) {
      const precision = impact.bad / impact.total;
      const weightKey = feature.toLowerCase().replace(/ /g, '_');
      if (weights[weightKey]) {
        weights[weightKey] = Math.round(weights[weightKey] * (0.5 + precision));
      }
    }
  }

  return weights;
}

async function checkModelDrift(base44, { model_type = 'fraud_detection' }) {
  const models = await base44.asServiceRole.entities.ModelVersion.filter({ model_type, status: 'active' });
  if (models.length === 0) return { drift_detected: false, reason: 'No active model' };

  const model = models[0];
  
  // Get recent predictions
  const recentAudits = await base44.asServiceRole.entities.RiskScoreAudit.filter({});
  const recent = recentAudits.slice(0, 1000);
  
  // Calculate current performance
  const withOutcome = recent.filter(a => a.outcome && a.outcome !== 'pending');
  if (withOutcome.length < 50) {
    return { drift_detected: false, reason: 'Insufficient outcome data' };
  }

  const truePositives = withOutcome.filter(a => 
    a.risk_level === 'high' && ['fraud_confirmed', 'chargeback'].includes(a.outcome)
  ).length;
  const falsePositives = withOutcome.filter(a => 
    a.risk_level === 'high' && a.outcome === 'fulfilled_ok'
  ).length;
  const falseNegatives = withOutcome.filter(a => 
    a.risk_level !== 'high' && ['fraud_confirmed', 'chargeback'].includes(a.outcome)
  ).length;

  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  const f1 = 2 * (precision * recall) / (precision + recall) || 0;

  const baselineF1 = model.performance_metrics?.f1_score || 0.7;
  const driftScore = Math.abs(f1 - baselineF1);
  const driftDetected = driftScore > 0.1;

  // Update model drift metrics
  await base44.asServiceRole.entities.ModelVersion.update(model.id, {
    drift_metrics: {
      feature_drift_score: 0,
      prediction_drift_score: driftScore,
      last_drift_check: new Date().toISOString(),
      drift_alert_triggered: driftDetected
    }
  });

  return {
    drift_detected: driftDetected,
    current_f1: f1,
    baseline_f1: baselineF1,
    drift_score: driftScore,
    precision,
    recall,
    sample_size: withOutcome.length
  };
}

async function getGlobalSignals(base44, { signal_type, min_confidence = 0 }) {
  const filter = { is_active: true };
  if (signal_type) filter.signal_type = signal_type;
  
  const signals = await base44.asServiceRole.entities.GlobalRiskSignal.filter(filter);
  return signals.filter(s => (s.confidence_score || 0) >= min_confidence);
}

async function aggregatePatterns(base44, { industry, region, days = 30 }) {
  // Get recent orders with outcomes across tenants (privacy-safe aggregation)
  const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({});
  
  // Aggregate patterns
  const patterns = {};
  for (const outcome of outcomes) {
    if (outcome.prediction_analysis === 'true_positive') {
      const key = `${outcome.risk_level_at_creation}_${outcome.outcome_type}`;
      if (!patterns[key]) {
        patterns[key] = { count: 0, merchant_count: new Set() };
      }
      patterns[key].count++;
      patterns[key].merchant_count.add(outcome.tenant_id);
    }
  }

  return Object.entries(patterns).map(([key, data]) => ({
    pattern: key,
    occurrence_count: data.count,
    merchant_count: data.merchant_count.size
  }));
}