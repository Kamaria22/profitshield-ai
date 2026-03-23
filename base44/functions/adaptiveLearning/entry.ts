import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ============================================
// GLOBAL RISK INTELLIGENCE CONSTANTS
// ============================================
const GLOBAL_MODEL_BLEND_WEIGHT = 0.30; // 30% global, 70% tenant
const MIN_MERCHANTS_FOR_CROSS_SIGNAL = 3; // Privacy threshold
const MIN_SAMPLE_FOR_WEIGHT_ADJUSTMENT = 20;
const FEATURE_EFFECTIVENESS_HIGH = 0.5;
const FEATURE_EFFECTIVENESS_LOW = 0.2;

// ============================================
// ANALYSIS FUNCTIONS
// ============================================

// Analyze outcomes and suggest model improvements
function analyzeOutcomes(outcomes) {
  const analysis = {
    total_outcomes: outcomes.length,
    true_positives: 0,
    true_negatives: 0,
    false_positives: 0,
    false_negatives: 0,
    by_outcome_type: {},
    by_risk_factor: {},
    avg_days_to_outcome: 0,
    total_financial_loss: 0
  };

  let totalDays = 0;

  for (const outcome of outcomes) {
    // Count prediction accuracy
    if (outcome.prediction_analysis) {
      analysis[outcome.prediction_analysis]++;
    }

    // Count by outcome type
    if (outcome.outcome_type) {
      analysis.by_outcome_type[outcome.outcome_type] = (analysis.by_outcome_type[outcome.outcome_type] || 0) + 1;
    }

    // Analyze contributing factors
    if (outcome.contributing_factors) {
      for (const factor of outcome.contributing_factors) {
        if (!analysis.by_risk_factor[factor]) {
          analysis.by_risk_factor[factor] = { count: 0, bad_outcomes: 0 };
        }
        analysis.by_risk_factor[factor].count++;
        
        if (outcome.outcome_type?.includes('chargeback') || 
            outcome.outcome_type?.includes('fraud') ||
            outcome.outcome_type?.includes('abuse')) {
          analysis.by_risk_factor[factor].bad_outcomes++;
        }
      }
    }

    // Sum days and losses
    if (outcome.days_to_outcome) totalDays += outcome.days_to_outcome;
    if (outcome.financial_impact?.net_loss) {
      analysis.total_financial_loss += outcome.financial_impact.net_loss;
    }
  }

  analysis.avg_days_to_outcome = outcomes.length > 0 ? Math.round(totalDays / outcomes.length) : 0;

  // Calculate precision, recall, F1
  const tp = analysis.true_positives;
  const fp = analysis.false_positives;
  const fn = analysis.false_negatives;
  const tn = analysis.true_negatives;

  analysis.precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  analysis.recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  analysis.f1_score = analysis.precision + analysis.recall > 0 
    ? 2 * (analysis.precision * analysis.recall) / (analysis.precision + analysis.recall) 
    : 0;
  analysis.accuracy = outcomes.length > 0 ? (tp + tn) / outcomes.length : 0;

  return analysis;
}

// Generate weight suggestions based on outcome analysis
function generateWeightSuggestions(currentWeights, analysis) {
  const suggestions = { ...currentWeights };
  const factorEffectiveness = {};

  // Calculate effectiveness of each factor
  for (const [factor, stats] of Object.entries(analysis.by_risk_factor)) {
    if (stats.count >= 5) { // Need minimum sample
      factorEffectiveness[factor] = stats.bad_outcomes / stats.count;
    }
  }

  // Adjust weights based on effectiveness
  const weightMapping = {
    'new_customer': 'new_customer',
    'high_order_value': 'high_order_value_500',
    'address_mismatch': 'address_country_mismatch',
    'heavy_discount': 'heavy_discount',
    'suspicious_email': 'suspicious_email',
    'high_refund_history': 'high_refund_history',
    'velocity': 'velocity_24h'
  };

  for (const [factor, effectiveness] of Object.entries(factorEffectiveness)) {
    const weightKey = weightMapping[factor];
    if (weightKey && suggestions[weightKey] !== undefined) {
      // If factor is highly effective (>50% bad outcomes), increase weight
      // If factor has low effectiveness (<20%), decrease weight
      if (effectiveness > 0.5) {
        suggestions[weightKey] = Math.min(suggestions[weightKey] * 1.2, 50);
      } else if (effectiveness < 0.2) {
        suggestions[weightKey] = Math.max(suggestions[weightKey] * 0.8, 5);
      }
    }
  }

  // Round all weights
  for (const key in suggestions) {
    suggestions[key] = Math.round(suggestions[key]);
  }

  return suggestions;
}

// Generate threshold suggestions
function generateThresholdSuggestions(currentThresholds, analysis) {
  const suggestions = { ...currentThresholds };

  // If too many false positives, raise thresholds
  if (analysis.false_positives > analysis.true_positives * 0.5) {
    suggestions.high_risk = Math.min(suggestions.high_risk + 5, 90);
    suggestions.medium_risk = Math.min(suggestions.medium_risk + 5, suggestions.high_risk - 10);
  }

  // If too many false negatives, lower thresholds
  if (analysis.false_negatives > analysis.true_negatives * 0.1) {
    suggestions.high_risk = Math.max(suggestions.high_risk - 5, 50);
    suggestions.medium_risk = Math.max(suggestions.medium_risk - 5, 25);
  }

  return suggestions;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'analyze_tenant_performance': {
        const { tenant_id, days = 90 } = params;

        // Get outcomes for the tenant
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({
          tenant_id
        });

        // Filter by date
        const recentOutcomes = outcomes.filter(o => 
          new Date(o.created_date) >= startDate
        );

        const analysis = analyzeOutcomes(recentOutcomes);

        return Response.json({
          success: true,
          tenant_id,
          period_days: days,
          analysis
        });
      }

      case 'generate_model_suggestions': {
        const { tenant_id, days = 90 } = params;

        // Get current model
        const models = await base44.asServiceRole.entities.TenantRiskModel.filter({
          tenant_id,
          is_active: true
        });

        const currentModel = models.length > 0 ? models[0] : {
          weights: {
            new_customer: 15,
            high_order_value_500: 10,
            high_order_value_1000: 15,
            order_value_3x_avg: 20,
            address_country_mismatch: 25,
            address_zip_mismatch: 10,
            heavy_discount: 15,
            multiple_discount_codes: 10,
            free_shipping_high_value: 10,
            suspicious_email: 15,
            free_email_high_value: 5,
            velocity_24h: 20,
            high_refund_history: 25,
            moderate_refund_history: 15,
            negative_margin: 10
          },
          thresholds: {
            high_risk: 70,
            medium_risk: 40
          }
        };

        // Get outcomes
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({
          tenant_id
        });

        const recentOutcomes = outcomes.filter(o => 
          new Date(o.created_date) >= startDate && !o.learning_applied
        );

        if (recentOutcomes.length < 20) {
          return Response.json({
            success: false,
            message: 'Insufficient outcome data for learning. Need at least 20 outcomes.',
            outcomes_available: recentOutcomes.length
          });
        }

        const analysis = analyzeOutcomes(recentOutcomes);
        const suggestedWeights = generateWeightSuggestions(currentModel.weights, analysis);
        const suggestedThresholds = generateThresholdSuggestions(currentModel.thresholds, analysis);

        // Calculate confidence based on sample size and consistency
        const confidence = Math.min(
          0.5 + (recentOutcomes.length / 200) * 0.5,
          0.95
        );

        return Response.json({
          success: true,
          tenant_id,
          current_model: {
            weights: currentModel.weights,
            thresholds: currentModel.thresholds
          },
          suggestions: {
            weights: suggestedWeights,
            thresholds: suggestedThresholds,
            confidence: Math.round(confidence * 100) / 100
          },
          analysis: {
            sample_size: recentOutcomes.length,
            precision: Math.round(analysis.precision * 100) / 100,
            recall: Math.round(analysis.recall * 100) / 100,
            f1_score: Math.round(analysis.f1_score * 100) / 100,
            false_positive_rate: analysis.true_positives + analysis.false_positives > 0 
              ? Math.round((analysis.false_positives / (analysis.true_positives + analysis.false_positives)) * 100)
              : 0,
            total_loss_prevented: analysis.true_positives > 0 
              ? Math.round(analysis.total_financial_loss * (analysis.true_positives / (analysis.true_positives + analysis.false_negatives)))
              : 0
          }
        });
      }

      case 'apply_model_update': {
        const { tenant_id, new_weights, new_thresholds, reason } = params;

        // Verify admin
        if (user.role !== 'admin' && user.app_role !== 'admin') {
          return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Get current active model
        const currentModels = await base44.asServiceRole.entities.TenantRiskModel.filter({
          tenant_id,
          is_active: true
        });

        // Deactivate current model
        if (currentModels.length > 0) {
          await base44.asServiceRole.entities.TenantRiskModel.update(currentModels[0].id, {
            is_active: false,
            deactivated_at: new Date().toISOString()
          });
        }

        // Create new model version
        const newModel = await base44.asServiceRole.entities.TenantRiskModel.create({
          tenant_id,
          version: (currentModels[0]?.version || 0) + 1,
          is_active: true,
          weights: new_weights,
          thresholds: new_thresholds,
          source: 'ai_suggested',
          activated_at: new Date().toISOString(),
          change_reason: reason,
          parent_version_id: currentModels[0]?.id,
          performance_metrics: {
            total_orders_scored: 0,
            true_positives: 0,
            false_positives: 0,
            true_negatives: 0,
            false_negatives: 0
          }
        });

        // Mark outcomes as used for learning
        const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({
          tenant_id,
          learning_applied: false
        });

        for (const outcome of outcomes) {
          await base44.asServiceRole.entities.OrderOutcome.update(outcome.id, {
            learning_applied: true,
            learning_applied_at: new Date().toISOString()
          });
        }

        // Log audit
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          user_id: user.id,
          user_email: user.email,
          action_type: 'risk_score_changed',
          entity_type: 'TenantRiskModel',
          entity_id: newModel.id,
          previous_state: currentModels[0] ? {
            weights: currentModels[0].weights,
            thresholds: currentModels[0].thresholds
          } : null,
          new_state: { weights: new_weights, thresholds: new_thresholds },
          reason
        });

        return Response.json({
          success: true,
          model_id: newModel.id,
          version: newModel.version
        });
      }

      case 'record_outcome': {
        const { order_id, outcome_type, financial_impact, notes } = params;

        // Get order
        const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        if (!orders.length) {
          return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        const order = orders[0];

        // Check if outcome already exists
        const existingOutcomes = await base44.asServiceRole.entities.OrderOutcome.filter({
          order_id
        });

        if (existingOutcomes.length > 0) {
          // Update existing
          await base44.asServiceRole.entities.OrderOutcome.update(existingOutcomes[0].id, {
            outcome_type,
            financial_impact,
            notes,
            outcome_date: new Date().toISOString()
          });
          return Response.json({ success: true, outcome_id: existingOutcomes[0].id, action: 'updated' });
        }

        // Determine prediction accuracy
        const wasHighRisk = order.risk_level === 'high' || order.fraud_score >= 70;
        const wasBadOutcome = outcome_type.includes('chargeback') || 
                              outcome_type.includes('fraud') || 
                              outcome_type.includes('abuse');
        
        let predictionAnalysis;
        if (wasHighRisk && wasBadOutcome) predictionAnalysis = 'true_positive';
        else if (!wasHighRisk && !wasBadOutcome) predictionAnalysis = 'true_negative';
        else if (wasHighRisk && !wasBadOutcome) predictionAnalysis = 'false_positive';
        else predictionAnalysis = 'false_negative';

        const orderDate = new Date(order.order_date || order.created_date);
        const daysToOutcome = Math.floor((Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

        const outcome = await base44.asServiceRole.entities.OrderOutcome.create({
          tenant_id: order.tenant_id,
          order_id,
          platform_order_id: order.platform_order_id,
          risk_score_at_creation: order.fraud_score,
          risk_level_at_creation: order.risk_level,
          recommended_action_at_creation: order.recommended_action,
          outcome_type,
          outcome_date: new Date().toISOString(),
          days_to_outcome: daysToOutcome,
          financial_impact: financial_impact || {
            original_value: order.total_revenue,
            refund_amount: order.refund_amount || 0,
            net_loss: order.refund_amount || 0
          },
          was_correct_prediction: (wasHighRisk && wasBadOutcome) || (!wasHighRisk && !wasBadOutcome),
          prediction_analysis: predictionAnalysis,
          contributing_factors: order.risk_reasons || [],
          notes
        });

        return Response.json({ success: true, outcome_id: outcome.id, action: 'created' });
      }

      // ============================================
      // CHARGEBACK OUTCOME PROCESSING
      // ============================================
      case 'process_chargeback_outcome': {
        const { 
          tenant_id, 
          order_id, 
          dispute_reason, 
          outcome, // won/lost
          recovered_amount,
          days_to_resolution,
          evidence_submitted,
          evidence_types 
        } = params;

        // Get order
        const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        if (!orders.length) {
          return Response.json({ error: 'Order not found' }, { status: 404 });
        }
        const order = orders[0];

        // Check for existing chargeback outcome
        const existing = await base44.asServiceRole.entities.ChargebackOutcome.filter({
          order_id,
          tenant_id
        });

        let chargebackRecord;
        const chargebackData = {
          tenant_id,
          platform: 'shopify',
          order_id,
          platform_order_id: order.platform_order_id,
          dispute_reason,
          dispute_amount: order.total_revenue || 0,
          outcome: outcome || 'pending',
          recovered_amount: recovered_amount || 0,
          days_to_resolution,
          evidence_submitted: evidence_submitted || false,
          evidence_types: evidence_types || [],
          original_risk_score: order.fraud_score,
          original_risk_level: order.risk_level,
          dispute_resolved_at: outcome !== 'pending' ? new Date().toISOString() : null
        };

        if (existing.length > 0) {
          await base44.asServiceRole.entities.ChargebackOutcome.update(existing[0].id, chargebackData);
          chargebackRecord = { ...existing[0], ...chargebackData };
        } else {
          chargebackRecord = await base44.asServiceRole.entities.ChargebackOutcome.create({
            ...chargebackData,
            dispute_opened_at: new Date().toISOString()
          });
        }

        // Also record as OrderOutcome for model training
        if (outcome === 'won' || outcome === 'lost') {
          const outcomeType = dispute_reason === 'fraudulent' 
            ? 'chargeback_fraud' 
            : dispute_reason === 'product_not_received' 
            ? 'chargeback_not_received'
            : 'chargeback_other';

          await base44.asServiceRole.entities.OrderOutcome.create({
            tenant_id,
            order_id,
            platform_order_id: order.platform_order_id,
            risk_score_at_creation: order.fraud_score,
            risk_level_at_creation: order.risk_level,
            outcome_type: outcomeType,
            outcome_date: new Date().toISOString(),
            financial_impact: {
              original_value: order.total_revenue,
              chargeback_amount: order.total_revenue,
              chargeback_fee: 15, // Standard chargeback fee
              net_loss: outcome === 'lost' ? order.total_revenue + 15 : 0
            },
            was_correct_prediction: order.risk_level === 'high',
            prediction_analysis: order.risk_level === 'high' ? 'true_positive' : 'false_negative',
            contributing_factors: order.risk_reasons || []
          });

          // Mark for model learning
          await base44.asServiceRole.entities.ChargebackOutcome.update(chargebackRecord.id, {
            fed_to_model: true,
            fed_to_model_at: new Date().toISOString(),
            lessons_learned: {
              key_factors: order.risk_reasons || [],
              prevention_suggestion: outcome === 'lost' 
                ? 'Consider requiring signature confirmation for similar orders'
                : 'Evidence submission was effective',
              model_feedback_applied: true
            }
          });
        }

        return Response.json({
          success: true,
          chargeback_id: chargebackRecord.id,
          model_feedback: outcome !== 'pending'
        });
      }

      // ============================================
      // GLOBAL + TENANT BLENDED SCORING
      // ============================================
      case 'get_blended_risk_weights': {
        const { tenant_id, industry_vertical } = params;

        // Get tenant-specific weights
        const tenantModels = await base44.asServiceRole.entities.TenantRiskModel.filter({
          tenant_id,
          is_active: true
        });

        // Get global weights
        const globalWeights = await base44.asServiceRole.entities.RiskFeatureWeight.filter({
          scope: 'global'
        });

        // Get industry weights if available
        let industryWeights = [];
        if (industry_vertical) {
          industryWeights = await base44.asServiceRole.entities.RiskFeatureWeight.filter({
            scope: 'industry',
            industry_vertical
          });
        }

        // Build global weight map
        const globalWeightMap = {};
        for (const gw of globalWeights) {
          globalWeightMap[gw.feature_name] = {
            weight: gw.weight,
            confidence: gw.confidence || 0.5
          };
        }

        // Build industry weight map
        const industryWeightMap = {};
        for (const iw of industryWeights) {
          industryWeightMap[iw.feature_name] = {
            weight: iw.weight,
            confidence: iw.confidence || 0.5
          };
        }

        // Get tenant weights
        const tenantWeights = tenantModels.length > 0 ? tenantModels[0].weights : {};

        // Blend weights: 70% tenant, 20% industry (if exists), 10% global
        // OR: 70% tenant, 30% global if no industry
        const blendedWeights = {};
        const allFeatures = new Set([
          ...Object.keys(tenantWeights),
          ...Object.keys(globalWeightMap),
          ...Object.keys(industryWeightMap)
        ]);

        for (const feature of allFeatures) {
          const tenantW = tenantWeights[feature] || 0;
          const globalW = globalWeightMap[feature]?.weight || 0;
          const industryW = industryWeightMap[feature]?.weight || 0;

          if (industryWeights.length > 0 && industryW > 0) {
            // Tenant 70%, Industry 20%, Global 10%
            blendedWeights[feature] = Math.round(
              tenantW * 0.70 + industryW * 0.20 + globalW * 0.10
            );
          } else {
            // Tenant 70%, Global 30%
            blendedWeights[feature] = Math.round(
              tenantW * (1 - GLOBAL_MODEL_BLEND_WEIGHT) + 
              globalW * GLOBAL_MODEL_BLEND_WEIGHT
            );
          }
        }

        return Response.json({
          success: true,
          blended_weights: blendedWeights,
          sources: {
            tenant: !!tenantModels.length,
            industry: industryWeights.length > 0,
            global: globalWeights.length > 0
          },
          blend_ratio: industryWeights.length > 0 
            ? { tenant: 0.70, industry: 0.20, global: 0.10 }
            : { tenant: 0.70, global: 0.30 }
        });
      }

      // ============================================
      // CROSS-MERCHANT SIGNAL AGGREGATION
      // ============================================
      case 'update_cross_merchant_signals': {
        // Admin only - scheduled job
        if (user?.role !== 'admin') {
          return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { signal_type, days = 90 } = params;

        // Get all outcomes across tenants (anonymized aggregation)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const allOutcomes = await base44.asServiceRole.entities.OrderOutcome.filter({});
        const recentOutcomes = allOutcomes.filter(o => new Date(o.created_date) >= startDate);

        // Group by tenant for privacy check
        const outcomesByTenant = {};
        for (const outcome of recentOutcomes) {
          if (!outcomesByTenant[outcome.tenant_id]) {
            outcomesByTenant[outcome.tenant_id] = [];
          }
          outcomesByTenant[outcome.tenant_id].push(outcome);
        }

        const merchantCount = Object.keys(outcomesByTenant).length;
        if (merchantCount < MIN_MERCHANTS_FOR_CROSS_SIGNAL) {
          return Response.json({
            success: false,
            message: `Need at least ${MIN_MERCHANTS_FOR_CROSS_SIGNAL} merchants for cross-merchant signals`,
            current_merchants: merchantCount
          });
        }

        // Aggregate risk factors
        const factorStats = {};
        let totalBadOutcomes = 0;
        let totalOutcomes = recentOutcomes.length;

        for (const outcome of recentOutcomes) {
          const isBad = outcome.outcome_type?.includes('chargeback') ||
                        outcome.outcome_type?.includes('fraud') ||
                        outcome.outcome_type?.includes('abuse');
          
          if (isBad) totalBadOutcomes++;

          for (const factor of (outcome.contributing_factors || [])) {
            if (!factorStats[factor]) {
              factorStats[factor] = { total: 0, bad: 0, tenants: new Set() };
            }
            factorStats[factor].total++;
            factorStats[factor].tenants.add(outcome.tenant_id);
            if (isBad) factorStats[factor].bad++;
          }
        }

        const baselineRate = totalOutcomes > 0 ? totalBadOutcomes / totalOutcomes : 0;
        const signalsCreated = [];

        // Create/update cross-merchant signals
        for (const [factor, stats] of Object.entries(factorStats)) {
          // Privacy check: only if appears in 3+ merchants
          if (stats.tenants.size < MIN_MERCHANTS_FOR_CROSS_SIGNAL) continue;
          if (stats.total < 10) continue; // Minimum sample

          const badRate = stats.bad / stats.total;
          const liftRatio = baselineRate > 0 ? badRate / baselineRate : 1;

          // Only create signal if significantly higher than baseline
          if (liftRatio < 1.5) continue;

          const signalKey = `factor_${factor.replace(/\s+/g, '_').toLowerCase()}`;
          
          // Check existing
          const existing = await base44.asServiceRole.entities.CrossMerchantSignal.filter({
            signal_key: signalKey,
            signal_type: 'velocity_pattern'
          });

          const signalData = {
            signal_type: 'velocity_pattern',
            signal_key: signalKey,
            risk_score_contribution: Math.min(Math.round(liftRatio * 5), 25),
            confidence: Math.min(stats.total / 100, 0.95),
            merchant_count: stats.tenants.size,
            occurrence_count: stats.total,
            bad_outcome_rate: Math.round(badRate * 100) / 100,
            baseline_rate: Math.round(baselineRate * 100) / 100,
            lift_ratio: Math.round(liftRatio * 100) / 100,
            last_updated_at: new Date().toISOString(),
            is_active: true
          };

          if (existing.length > 0) {
            await base44.asServiceRole.entities.CrossMerchantSignal.update(existing[0].id, signalData);
          } else {
            await base44.asServiceRole.entities.CrossMerchantSignal.create({
              ...signalData,
              first_detected_at: new Date().toISOString()
            });
          }

          signalsCreated.push(signalKey);
        }

        // Also update global RiskFeatureWeight
        for (const [factor, stats] of Object.entries(factorStats)) {
          if (stats.tenants.size < MIN_MERCHANTS_FOR_CROSS_SIGNAL) continue;
          if (stats.total < MIN_SAMPLE_FOR_WEIGHT_ADJUSTMENT) continue;

          const badRate = stats.bad / stats.total;
          const effectiveness = badRate;

          const existing = await base44.asServiceRole.entities.RiskFeatureWeight.filter({
            scope: 'global',
            feature_name: factor
          });

          const weightData = {
            scope: 'global',
            model_type: 'fraud_detection',
            feature_name: factor,
            weight: Math.round(10 + effectiveness * 30), // 10-40 range
            confidence: Math.min(stats.total / 200, 0.95),
            sample_size: stats.total,
            true_positive_rate: badRate,
            effectiveness_trend: 'stable',
            last_recalibrated_at: new Date().toISOString()
          };

          if (existing.length > 0) {
            await base44.asServiceRole.entities.RiskFeatureWeight.update(existing[0].id, weightData);
          } else {
            await base44.asServiceRole.entities.RiskFeatureWeight.create(weightData);
          }
        }

        return Response.json({
          success: true,
          signals_created: signalsCreated.length,
          signals: signalsCreated,
          merchant_count: merchantCount,
          outcomes_analyzed: totalOutcomes
        });
      }

      // ============================================
      // WEEKLY RISK RECALIBRATION
      // ============================================
      case 'weekly_risk_recalibration': {
        // Scheduled job - admin only
        if (user?.role !== 'admin') {
          return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        const results = { tenants_processed: 0, models_updated: 0, errors: [] };

        // Get all active tenants
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });

        for (const tenant of tenants) {
          try {
            // Get outcomes for this tenant
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({
              tenant_id: tenant.id,
              learning_applied: false
            });

            if (outcomes.length < MIN_SAMPLE_FOR_WEIGHT_ADJUSTMENT) {
              results.tenants_processed++;
              continue;
            }

            // Get current model
            const models = await base44.asServiceRole.entities.TenantRiskModel.filter({
              tenant_id: tenant.id,
              is_active: true
            });

            if (!models.length) {
              results.tenants_processed++;
              continue;
            }

            const currentModel = models[0];
            const analysis = analyzeOutcomes(outcomes);
            const suggestedWeights = generateWeightSuggestions(currentModel.weights, analysis);
            const suggestedThresholds = generateThresholdSuggestions(currentModel.thresholds, analysis);

            // Check if significant changes needed
            const weightChanges = Object.keys(suggestedWeights).filter(k => 
              Math.abs(suggestedWeights[k] - (currentModel.weights[k] || 0)) > 3
            );

            if (weightChanges.length > 0 || 
                Math.abs(suggestedThresholds.high_risk - currentModel.thresholds.high_risk) > 3) {
              
              // Deactivate old model
              await base44.asServiceRole.entities.TenantRiskModel.update(currentModel.id, {
                is_active: false,
                deactivated_at: new Date().toISOString()
              });

              // Create new model
              await base44.asServiceRole.entities.TenantRiskModel.create({
                tenant_id: tenant.id,
                version: (currentModel.version || 0) + 1,
                is_active: true,
                weights: suggestedWeights,
                thresholds: suggestedThresholds,
                source: 'weekly_recalibration',
                activated_at: new Date().toISOString(),
                parent_version_id: currentModel.id,
                performance_metrics: {
                  sample_size: outcomes.length,
                  precision: analysis.precision,
                  recall: analysis.recall,
                  f1_score: analysis.f1_score
                }
              });

              // Mark outcomes as used
              for (const outcome of outcomes) {
                await base44.asServiceRole.entities.OrderOutcome.update(outcome.id, {
                  learning_applied: true,
                  learning_applied_at: new Date().toISOString()
                });
              }

              results.models_updated++;
            }

            results.tenants_processed++;

          } catch (err) {
            results.errors.push({ tenant_id: tenant.id, error: err.message });
          }
        }

        // Update global moat metrics
        await updateMoatMetrics(base44, results);

        return Response.json({
          success: true,
          ...results
        });
      }

      // ============================================
      // CALCULATE RISK ROI METRICS
      // ============================================
      case 'calculate_risk_roi': {
        const { tenant_id, period_type = 'monthly' } = params;

        const now = new Date();
        let startDate, period;

        if (period_type === 'weekly') {
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          period = `${now.getFullYear()}-W${Math.ceil(now.getDate() / 7)}`;
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        // Get orders for period
        const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
        const periodOrders = orders.filter(o => new Date(o.order_date || o.created_date) >= startDate);

        // Get outcomes
        const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({ tenant_id });
        const periodOutcomes = outcomes.filter(o => new Date(o.created_date) >= startDate);

        // Get chargebacks
        const chargebacks = await base44.asServiceRole.entities.ChargebackOutcome.filter({ tenant_id });
        const periodChargebacks = chargebacks.filter(c => new Date(c.created_date) >= startDate);

        // Calculate metrics
        const metrics = {
          tenant_id,
          period,
          period_type,
          orders_analyzed: periodOrders.length,
          high_risk_orders: periodOrders.filter(o => o.risk_level === 'high').length,
          
          // Chargebacks
          chargebacks_total: periodChargebacks.length,
          chargebacks_won: periodChargebacks.filter(c => c.outcome === 'won').length,
          chargebacks_lost: periodChargebacks.filter(c => c.outcome === 'lost').length,
          chargeback_amount_total: periodChargebacks.reduce((s, c) => s + (c.dispute_amount || 0), 0),
          chargeback_amount_recovered: periodChargebacks.filter(c => c.outcome === 'won')
            .reduce((s, c) => s + (c.recovered_amount || c.dispute_amount || 0), 0),

          // Prevention estimates
          chargebacks_prevented: 0,
          chargeback_amount_prevented: 0,
          fraud_orders_blocked: 0,
          fraud_loss_avoided: 0,

          // AI performance
          ai_interventions_total: 0,
          ai_interventions_correct: 0,
          false_positive_count: 0,
          true_positive_count: 0
        };

        // Count AI interventions
        for (const outcome of periodOutcomes) {
          metrics.ai_interventions_total++;
          
          if (outcome.prediction_analysis === 'true_positive') {
            metrics.ai_interventions_correct++;
            metrics.true_positive_count++;
            
            // Estimate prevented loss
            if (outcome.outcome_type?.includes('chargeback') || outcome.outcome_type?.includes('fraud')) {
              const wasHeld = outcome.action_taken === 'held' || outcome.action_taken === 'cancelled';
              if (wasHeld) {
                metrics.chargebacks_prevented++;
                metrics.chargeback_amount_prevented += outcome.financial_impact?.original_value || 0;
              }
            }
          } else if (outcome.prediction_analysis === 'true_negative') {
            metrics.ai_interventions_correct++;
          } else if (outcome.prediction_analysis === 'false_positive') {
            metrics.false_positive_count++;
          }
        }

        // High risk orders that were blocked
        const blockedHighRisk = periodOrders.filter(o => 
          o.risk_level === 'high' && 
          (o.status === 'cancelled' || o.recommended_action === 'cancel')
        );
        metrics.fraud_orders_blocked = blockedHighRisk.length;
        metrics.fraud_loss_avoided = blockedHighRisk.reduce((s, o) => s + (o.total_revenue || 0), 0);

        // Calculate rates
        metrics.ai_accuracy_percent = metrics.ai_interventions_total > 0
          ? Math.round((metrics.ai_interventions_correct / metrics.ai_interventions_total) * 100)
          : 0;

        metrics.false_positive_rate = metrics.true_positive_count + metrics.false_positive_count > 0
          ? Math.round((metrics.false_positive_count / (metrics.true_positive_count + metrics.false_positive_count)) * 100) / 100
          : 0;

        metrics.true_positive_rate = metrics.ai_interventions_total > 0
          ? Math.round((metrics.true_positive_count / metrics.ai_interventions_total) * 100) / 100
          : 0;

        // Margin recovered
        metrics.margin_recovered = metrics.fraud_loss_avoided + 
                                   metrics.chargeback_amount_prevented + 
                                   metrics.chargeback_amount_recovered;

        // ROI calculation (assuming $50/month subscription)
        const subscriptionCost = 50;
        metrics.roi_multiple = subscriptionCost > 0 
          ? Math.round((metrics.margin_recovered / subscriptionCost) * 10) / 10
          : 0;

        metrics.estimated_annual_savings = metrics.margin_recovered * (period_type === 'weekly' ? 52 : 12);

        // Save or update
        const existing = await base44.asServiceRole.entities.RiskROIMetric.filter({
          tenant_id,
          period,
          period_type
        });

        if (existing.length > 0) {
          await base44.asServiceRole.entities.RiskROIMetric.update(existing[0].id, metrics);
        } else {
          await base44.asServiceRole.entities.RiskROIMetric.create(metrics);
        }

        return Response.json({ success: true, metrics });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Adaptive learning error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ============================================
// HELPER: Update Moat Metrics
// ============================================
async function updateMoatMetrics(base44, recalibrationResults) {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Get aggregate stats
  const allOutcomes = await base44.asServiceRole.entities.OrderOutcome.filter({});
  const allSignals = await base44.asServiceRole.entities.CrossMerchantSignal.filter({ is_active: true });
  const allTenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });

  // Calculate metrics
  let totalTP = 0, totalFP = 0, totalTN = 0, totalFN = 0;
  for (const outcome of allOutcomes) {
    if (outcome.prediction_analysis === 'true_positive') totalTP++;
    else if (outcome.prediction_analysis === 'false_positive') totalFP++;
    else if (outcome.prediction_analysis === 'true_negative') totalTN++;
    else if (outcome.prediction_analysis === 'false_negative') totalFN++;
  }

  const accuracy = (totalTP + totalTN) / (allOutcomes.length || 1);
  const falsePositiveRate = totalFP / ((totalTP + totalFP) || 1);
  const chargebackPrevention = totalTP / ((totalTP + totalFN) || 1);

  // Update MoatMetric
  const existing = await base44.asServiceRole.entities.MoatMetric.filter({
    period,
    period_type: 'monthly'
  });

  const moatData = {
    period,
    period_type: 'monthly',
    data_moat: {
      total_orders_processed: allOutcomes.length,
      unique_fraud_patterns: allSignals.length,
      cross_merchant_signals: allSignals.filter(s => s.merchant_count >= 3).length,
      data_uniqueness_score: Math.min(allOutcomes.length / 1000, 100),
      model_accuracy_advantage: Math.round(accuracy * 100)
    },
    ai_moat: {
      model_versions_deployed: recalibrationResults.models_updated,
      retraining_cycles: 1,
      personalization_depth: allTenants.length,
      prediction_accuracy: Math.round(accuracy * 100)
    },
    overall_moat_score: Math.round(
      (accuracy * 40) + 
      (allSignals.length * 0.5) + 
      (allTenants.length * 2)
    ),
    competitive_position: accuracy > 0.8 ? 'strong' : accuracy > 0.6 ? 'competitive' : 'developing'
  };

  if (existing.length > 0) {
    await base44.asServiceRole.entities.MoatMetric.update(existing[0].id, moatData);
  } else {
    await base44.asServiceRole.entities.MoatMetric.create(moatData);
  }
}