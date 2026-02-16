import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const defaultWeights = {
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
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, tenant_id, model_id } = await req.json();

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    switch (action) {
      case 'analyze': {
        // Analyze historical data to suggest model improvements
        const orders = await base44.asServiceRole.entities.Order.filter({ 
          tenant_id 
        }, '-order_date', 500);

        const auditLogs = await base44.asServiceRole.entities.AuditLog.filter({
          tenant_id,
          action_type: 'alert_reviewed'
        }, '-created_date', 200);

        // Get current active model
        const activeModels = await base44.asServiceRole.entities.TenantRiskModel.filter({
          tenant_id,
          is_active: true
        });
        const currentModel = activeModels[0];
        const currentWeights = currentModel?.weights || defaultWeights;

        // Analyze order outcomes
        const analysis = analyzeOrderOutcomes(orders, auditLogs, currentWeights);

        // Generate AI suggestions using LLM
        const prompt = buildAnalysisPrompt(analysis, currentWeights);
        const llmResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              suggested_weights: { type: 'object' },
              suggested_thresholds: { type: 'object' },
              confidence_score: { type: 'number' },
              analysis_summary: { type: 'string' },
              risk_factors_analysis: { 
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    factor: { type: 'string' },
                    current_weight: { type: 'number' },
                    suggested_weight: { type: 'number' },
                    reasoning: { type: 'string' },
                    impact: { type: 'string' }
                  }
                }
              }
            }
          }
        });

        // Update model with AI analysis
        if (currentModel) {
          await base44.asServiceRole.entities.TenantRiskModel.update(currentModel.id, {
            ai_analysis: {
              ...llmResult,
              analyzed_at: new Date().toISOString()
            },
            performance_metrics: analysis.metrics
          });
        }

        return Response.json({ 
          success: true, 
          analysis: llmResult,
          metrics: analysis.metrics
        });
      }

      case 'apply_suggestions': {
        // Apply AI-suggested weights as a new model version
        const activeModels = await base44.asServiceRole.entities.TenantRiskModel.filter({
          tenant_id,
          is_active: true
        });
        const currentModel = activeModels[0];

        if (!currentModel?.ai_analysis?.suggested_weights) {
          return Response.json({ error: 'No AI suggestions available. Run analysis first.' }, { status: 400 });
        }

        // Deactivate current model
        await base44.asServiceRole.entities.TenantRiskModel.update(currentModel.id, {
          is_active: false,
          deactivated_at: new Date().toISOString()
        });

        // Create new model with suggested weights
        const newModel = await base44.asServiceRole.entities.TenantRiskModel.create({
          tenant_id,
          version: (currentModel.version || 0) + 1,
          is_active: true,
          weights: currentModel.ai_analysis.suggested_weights,
          thresholds: currentModel.ai_analysis.suggested_thresholds || currentModel.thresholds,
          score_composition: currentModel.score_composition,
          source: 'ai_suggested',
          activated_at: new Date().toISOString(),
          change_reason: `AI-suggested optimization (confidence: ${currentModel.ai_analysis.confidence_score}%)`,
          parent_version_id: currentModel.id
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          user_id: user.id,
          user_email: user.email,
          action_type: 'risk_score_changed',
          entity_type: 'TenantRiskModel',
          entity_id: newModel.id,
          previous_state: { weights: currentModel.weights, version: currentModel.version },
          new_state: { weights: newModel.weights, version: newModel.version },
          reason: 'Applied AI-suggested model improvements'
        });

        return Response.json({ success: true, new_model_id: newModel.id, version: newModel.version });
      }

      case 'rollback': {
        // Rollback to a previous model version
        if (!model_id) {
          return Response.json({ error: 'model_id is required for rollback' }, { status: 400 });
        }

        // Get the model to rollback to
        const targetModels = await base44.asServiceRole.entities.TenantRiskModel.filter({ id: model_id });
        if (targetModels.length === 0) {
          return Response.json({ error: 'Target model not found' }, { status: 404 });
        }
        const targetModel = targetModels[0];

        // Deactivate current active model
        const activeModels = await base44.asServiceRole.entities.TenantRiskModel.filter({
          tenant_id,
          is_active: true
        });
        for (const model of activeModels) {
          await base44.asServiceRole.entities.TenantRiskModel.update(model.id, {
            is_active: false,
            deactivated_at: new Date().toISOString()
          });
        }

        // Create new version based on target model
        const newModel = await base44.asServiceRole.entities.TenantRiskModel.create({
          tenant_id,
          version: (activeModels[0]?.version || targetModel.version || 0) + 1,
          is_active: true,
          weights: targetModel.weights,
          thresholds: targetModel.thresholds,
          score_composition: targetModel.score_composition,
          source: 'rollback',
          activated_at: new Date().toISOString(),
          change_reason: `Rolled back to v${targetModel.version}`,
          parent_version_id: targetModel.id
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          user_id: user.id,
          user_email: user.email,
          action_type: 'risk_score_changed',
          entity_type: 'TenantRiskModel',
          entity_id: newModel.id,
          previous_state: { version: activeModels[0]?.version },
          new_state: { version: newModel.version, rolledBackTo: targetModel.version },
          reason: `Rollback to version ${targetModel.version}`
        });

        return Response.json({ success: true, new_model_id: newModel.id, version: newModel.version });
      }

      case 'get_history': {
        // Get all model versions for this tenant
        const allModels = await base44.asServiceRole.entities.TenantRiskModel.filter({
          tenant_id
        }, '-version', 50);

        return Response.json({ 
          success: true, 
          models: allModels.map(m => ({
            id: m.id,
            version: m.version,
            is_active: m.is_active,
            source: m.source || 'manual',
            activated_at: m.activated_at,
            deactivated_at: m.deactivated_at,
            change_reason: m.change_reason,
            performance_metrics: m.performance_metrics,
            weights: m.weights,
            thresholds: m.thresholds
          }))
        });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Risk model learning error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function analyzeOrderOutcomes(orders, auditLogs, currentWeights) {
  // Build a map of order outcomes from audit logs
  const orderOutcomes = {};
  for (const log of auditLogs) {
    if (log.entity_type === 'Order' || log.entity_type === 'Alert') {
      const orderId = log.entity_id;
      const newState = log.new_state || {};
      
      if (newState.status === 'dismissed' || newState.action_taken === 'dismissed') {
        orderOutcomes[orderId] = 'false_positive';
      } else if (newState.status === 'action_taken' || newState.action_taken === 'confirmed') {
        orderOutcomes[orderId] = 'true_positive';
      }
    }
  }

  // Calculate metrics
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  const highRiskOrders = orders.filter(o => o.risk_level === 'high');
  const lowRiskOrders = orders.filter(o => o.risk_level === 'low');

  // Analyze high-risk orders
  for (const order of highRiskOrders) {
    const outcome = orderOutcomes[order.id];
    if (outcome === 'true_positive') {
      truePositives++;
    } else if (outcome === 'false_positive') {
      falsePositives++;
    } else if (order.status === 'refunded' || order.status === 'cancelled') {
      // Infer true positive from refund/cancellation
      truePositives++;
    } else if (order.status === 'fulfilled') {
      // Fulfilled without issue suggests false positive
      falsePositives++;
    }
  }

  // Analyze low-risk orders that had issues
  for (const order of lowRiskOrders) {
    if (order.status === 'refunded' || order.status === 'cancelled') {
      falseNegatives++;
    } else if (order.status === 'fulfilled') {
      trueNegatives++;
    }
  }

  const totalScored = truePositives + falsePositives + trueNegatives + falseNegatives;
  const precision = (truePositives + falsePositives) > 0 
    ? (truePositives / (truePositives + falsePositives)) * 100 
    : 0;
  const recall = (truePositives + falseNegatives) > 0 
    ? (truePositives / (truePositives + falseNegatives)) * 100 
    : 0;
  const f1Score = (precision + recall) > 0 
    ? (2 * precision * recall) / (precision + recall) 
    : 0;

  // Analyze which risk factors correlate with outcomes
  const factorAnalysis = {};
  for (const order of orders) {
    const reasons = order.risk_reasons || [];
    const wasProblematic = order.status === 'refunded' || order.status === 'cancelled';
    
    for (const reason of reasons) {
      if (!factorAnalysis[reason]) {
        factorAnalysis[reason] = { total: 0, problematic: 0, safe: 0 };
      }
      factorAnalysis[reason].total++;
      if (wasProblematic) {
        factorAnalysis[reason].problematic++;
      } else {
        factorAnalysis[reason].safe++;
      }
    }
  }

  return {
    metrics: {
      total_orders_scored: totalScored,
      true_positives: truePositives,
      false_positives: falsePositives,
      true_negatives: trueNegatives,
      false_negatives: falseNegatives,
      precision: Math.round(precision * 10) / 10,
      recall: Math.round(recall * 10) / 10,
      f1_score: Math.round(f1Score * 10) / 10
    },
    factorAnalysis,
    highRiskCount: highRiskOrders.length,
    lowRiskCount: lowRiskOrders.length,
    totalOrders: orders.length
  };
}

function buildAnalysisPrompt(analysis, currentWeights) {
  return `You are an expert fraud detection analyst. Analyze this e-commerce risk model performance data and suggest optimizations.

CURRENT MODEL WEIGHTS:
${JSON.stringify(currentWeights, null, 2)}

PERFORMANCE METRICS:
- Total orders scored: ${analysis.metrics.total_orders_scored}
- True Positives: ${analysis.metrics.true_positives}
- False Positives: ${analysis.metrics.false_positives}
- True Negatives: ${analysis.metrics.true_negatives}
- False Negatives: ${analysis.metrics.false_negatives}
- Precision: ${analysis.metrics.precision}%
- Recall: ${analysis.metrics.recall}%
- F1 Score: ${analysis.metrics.f1_score}

RISK FACTOR CORRELATIONS:
${JSON.stringify(analysis.factorAnalysis, null, 2)}

Based on this data:
1. Suggest adjusted weights for each risk factor (0-50 scale)
2. Suggest threshold adjustments (high_risk: 50-100, medium_risk: 20-70)
3. Provide a confidence score (0-100) for your suggestions
4. Explain your reasoning for each significant change
5. Focus on reducing false positives while maintaining fraud detection

Consider:
- Factors with high false positive rates should have reduced weights
- Factors that strongly correlate with actual problems should have increased weights
- If precision is low, thresholds may need to be raised
- If recall is low, important factors may be underweighted`;
}