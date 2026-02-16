import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Adaptive learning error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});