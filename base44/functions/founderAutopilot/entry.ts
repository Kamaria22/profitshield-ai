import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * FOUNDER AUTOPILOT - Strategic Orchestrator
 * 
 * Three autonomous layers:
 * 1. Growth Autopilot - optimize reviews, referrals, pricing, onboarding
 * 2. Moat Autopilot - adaptive learning, fraud accuracy, global intelligence
 * 3. Strategic Orchestrator - master AI coordinating both
 */

// Guardrail defaults
const DEFAULT_GUARDRAILS = {
  max_price_change_pct: 20,
  max_weight_adjustment_pct: 15,
  max_review_prompts_per_30_days: 1,
  min_experiment_sample_size: 100,
  min_confidence_for_auto_execute: 0.85,
  max_concurrent_experiments: 5
};

// Get autopilot config (singleton)
async function getAutopilotConfig(base44) {
  const configs = await base44.asServiceRole.entities.AutopilotConfig.filter({
    config_key: 'global'
  });
  
  if (configs.length === 0) {
    return await base44.asServiceRole.entities.AutopilotConfig.create({
      config_key: 'global',
      autopilot_mode: 'advisory',
      growth_autopilot_enabled: true,
      moat_autopilot_enabled: true,
      guardrails: DEFAULT_GUARDRAILS
    });
  }
  return configs[0];
}

// Check if action requires approval based on mode and risk
function requiresApproval(config, riskLevel, confidence) {
  const mode = config.autopilot_mode;
  const minConfidence = config.guardrails?.min_confidence_for_auto_execute || 0.85;
  
  if (mode === 'off' || mode === 'advisory') return true;
  if (mode === 'semi_auto') {
    return riskLevel !== 'low' || confidence < minConfidence;
  }
  if (mode === 'full_auto') {
    return riskLevel === 'critical' || confidence < 0.7;
  }
  return true;
}

// Query relevant strategic memories
async function queryMemories(base44, memoryTypes, limit = 5) {
  const memories = [];
  for (const memType of memoryTypes) {
    const results = await base44.asServiceRole.entities.StrategicMemory.filter({
      memory_type: memType,
      is_active: true
    }, '-confidence', limit);
    memories.push(...results);
  }
  return memories.slice(0, limit * 2);
}

// Record a new strategic memory
async function recordMemory(base44, data) {
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 90); // 90 day validity
  
  return await base44.asServiceRole.entities.StrategicMemory.create({
    ...data,
    valid_until: validUntil.toISOString(),
    times_referenced: 0
  });
}

// Calculate anomaly detection
function detectAnomaly(current, previous, threshold = 0.25) {
  if (!previous || previous === 0) return { detected: false };
  
  const changePct = (current - previous) / Math.abs(previous);
  
  if (Math.abs(changePct) > threshold) {
    return {
      detected: true,
      type: changePct > 0 ? 'spike' : 'drop',
      severity: Math.abs(changePct) > 0.5 ? 'critical' : 'warning',
      magnitude: changePct
    };
  }
  return { detected: false };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { action, ...params } = await req.json();
    const config = await getAutopilotConfig(base44);

    switch (action) {
      // ==========================================
      // STRATEGIC ORCHESTRATOR
      // ==========================================
      case 'weekly_strategy_review': {
        const results = {
          timestamp: new Date().toISOString(),
          growth_actions: [],
          moat_actions: [],
          pricing_suggestion: null,
          signals_analyzed: 0
        };

        // Analyze Growth Signals
        const growthSignals = await base44.asServiceRole.entities.GrowthSignal.filter({}, '-created_date', 20);
        const moatSignals = await base44.asServiceRole.entities.MoatSignal.filter({}, '-created_date', 20);
        
        results.signals_analyzed = growthSignals.length + moatSignals.length;

        // Get growth metrics
        const growthMetrics = await base44.asServiceRole.entities.GrowthMetric.filter({}, '-created_date', 4);
        const latestGrowth = growthMetrics[0] || {};

        // Get moat metrics
        const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({}, '-created_date', 4);
        const latestMoat = moatMetrics[0] || {};

        // Get recent experiments
        const experiments = await base44.asServiceRole.entities.AutopilotExperiment.filter({
          status: 'running'
        });

        // Query strategic memories
        const memories = await queryMemories(base44, [
          'experiment_result', 'conversion_lever', 'churn_driver'
        ], 10);

        // ===== GENERATE GROWTH ACTIONS =====
        
        // Action 1: Install velocity check
        const installVelocity = latestGrowth.installs?.velocity_change_pct || 0;
        if (installVelocity < -10) {
          results.growth_actions.push({
            type: 'growth',
            title: 'Boost Install Velocity',
            hypothesis: 'Increased visibility will recover install rate',
            risk_level: 'low',
            confidence: 0.75,
            suggested_action: 'Increase review request frequency for high-satisfaction merchants'
          });
        }

        // Action 2: Activation rate check
        const activationRate = latestGrowth.activations?.activation_rate || 0;
        if (activationRate < 0.5) {
          results.growth_actions.push({
            type: 'growth',
            title: 'Improve Activation Rate',
            hypothesis: 'Simplified onboarding will increase activation',
            risk_level: 'low',
            confidence: 0.8,
            suggested_action: 'A/B test shorter onboarding flow'
          });
        }

        // Action 3: Referral optimization
        const referralRate = latestGrowth.referrals?.referral_rate || 0;
        if (referralRate < 0.05) {
          results.growth_actions.push({
            type: 'growth',
            title: 'Boost Referral Program',
            hypothesis: 'Better incentives will increase referral rate',
            risk_level: 'medium',
            confidence: 0.7,
            suggested_action: 'Test increased referral reward (2 months vs 1 month)'
          });
        }

        // ===== GENERATE MOAT ACTIONS =====

        // Action 1: Model accuracy check
        const accuracy = latestMoat.ai_moat?.prediction_accuracy || 0;
        if (accuracy < 80) {
          results.moat_actions.push({
            type: 'moat',
            title: 'Improve Risk Model Accuracy',
            hypothesis: 'Weight recalibration will improve accuracy',
            risk_level: 'low',
            confidence: 0.85,
            suggested_action: 'Trigger immediate recalibration cycle'
          });
        }

        // Action 2: Cross-merchant signal growth
        const signalCount = latestMoat.data_moat?.cross_merchant_signals || 0;
        if (signalCount < 10) {
          results.moat_actions.push({
            type: 'moat',
            title: 'Expand Cross-Merchant Signals',
            hypothesis: 'More signals will improve global model',
            risk_level: 'low',
            confidence: 0.9,
            suggested_action: 'Lower signal detection threshold temporarily'
          });
        }

        // ===== PRICING SUGGESTION =====
        const trialToPaid = latestGrowth.conversions?.trial_to_paid_rate || 0;
        const churnRate = latestGrowth.conversions?.churn_rate || 0;

        if (trialToPaid > 0.3 && churnRate < 0.05) {
          results.pricing_suggestion = {
            type: 'pricing',
            title: 'Price Increase Opportunity',
            hypothesis: 'Strong conversion and low churn indicate pricing power',
            risk_level: 'medium',
            confidence: 0.65,
            suggested_action: 'A/B test 10% price increase for new signups'
          };
        } else if (trialToPaid < 0.15) {
          results.pricing_suggestion = {
            type: 'pricing',
            title: 'Trial Extension Test',
            hypothesis: 'Longer trial may improve conversion',
            risk_level: 'low',
            confidence: 0.7,
            suggested_action: 'Test 21-day trial vs 14-day'
          };
        }

        // Create FounderDecisions for each recommendation
        const decisions = [];
        
        for (const action of [...results.growth_actions, ...results.moat_actions]) {
          const decision = await base44.asServiceRole.entities.FounderDecision.create({
            decision_type: action.type,
            title: action.title,
            hypothesis: action.hypothesis,
            risk_level: action.risk_level,
            confidence_score: action.confidence,
            status: 'proposed',
            source_engine: 'strategic_orchestrator',
            requires_approval: requiresApproval(config, action.risk_level, action.confidence),
            action_payload: { suggested_action: action.suggested_action },
            memory_references: memories.slice(0, 3).map(m => m.id),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          });
          decisions.push(decision.id);
        }

        if (results.pricing_suggestion) {
          const pricingDecision = await base44.asServiceRole.entities.FounderDecision.create({
            decision_type: 'pricing',
            title: results.pricing_suggestion.title,
            hypothesis: results.pricing_suggestion.hypothesis,
            risk_level: results.pricing_suggestion.risk_level,
            confidence_score: results.pricing_suggestion.confidence,
            status: 'proposed',
            source_engine: 'strategic_orchestrator',
            requires_approval: true, // Pricing always requires approval
            action_payload: { suggested_action: results.pricing_suggestion.suggested_action },
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          });
          decisions.push(pricingDecision.id);
        }

        // Update config timestamp
        await base44.asServiceRole.entities.AutopilotConfig.update(config.id, {
          last_strategy_review: new Date().toISOString()
        });

        return Response.json({
          success: true,
          ...results,
          decisions_created: decisions.length,
          decision_ids: decisions
        });
      }

      // ==========================================
      // GROWTH AUTOPILOT
      // ==========================================
      case 'run_growth_optimizer': {
        if (!config.growth_autopilot_enabled) {
          return Response.json({ success: false, message: 'Growth autopilot disabled' });
        }

        const results = {
          signals_generated: 0,
          anomalies_detected: 0,
          actions_proposed: 0
        };

        // Get current growth data
        const growthMetrics = await base44.asServiceRole.entities.GrowthMetric.filter({}, '-created_date', 8);
        const current = growthMetrics[0] || {};
        const previous = growthMetrics[1] || {};

        // Generate growth signals
        const signalsToCreate = [];

        // Install velocity signal
        const installsCurrent = current.installs?.total || 0;
        const installsPrev = previous.installs?.total || 0;
        const installAnomaly = detectAnomaly(installsCurrent, installsPrev);
        
        signalsToCreate.push({
          metric_name: 'install_velocity',
          current_value: installsCurrent,
          previous_value: installsPrev,
          change_pct: installsPrev ? ((installsCurrent - installsPrev) / installsPrev) * 100 : 0,
          trend: installsCurrent > installsPrev ? 'improving' : installsCurrent < installsPrev ? 'declining' : 'stable',
          anomaly_detected: installAnomaly.detected,
          anomaly_type: installAnomaly.type,
          anomaly_severity: installAnomaly.severity,
          period: current.period,
          period_type: current.period_type || 'weekly'
        });

        // Activation rate signal
        const activationCurrent = current.activations?.activation_rate || 0;
        const activationPrev = previous.activations?.activation_rate || 0;
        const activationAnomaly = detectAnomaly(activationCurrent, activationPrev);
        
        signalsToCreate.push({
          metric_name: 'activation_rate',
          current_value: activationCurrent,
          previous_value: activationPrev,
          change_pct: activationPrev ? ((activationCurrent - activationPrev) / activationPrev) * 100 : 0,
          trend: activationCurrent > activationPrev ? 'improving' : 'declining',
          anomaly_detected: activationAnomaly.detected,
          anomaly_type: activationAnomaly.type,
          anomaly_severity: activationAnomaly.severity,
          period: current.period,
          period_type: 'weekly'
        });

        // Trial to paid rate
        const conversionCurrent = current.conversions?.trial_to_paid_rate || 0;
        const conversionPrev = previous.conversions?.trial_to_paid_rate || 0;
        const conversionAnomaly = detectAnomaly(conversionCurrent, conversionPrev);
        
        signalsToCreate.push({
          metric_name: 'trial_to_paid_rate',
          current_value: conversionCurrent,
          previous_value: conversionPrev,
          change_pct: conversionPrev ? ((conversionCurrent - conversionPrev) / conversionPrev) * 100 : 0,
          trend: conversionCurrent > conversionPrev ? 'improving' : 'declining',
          anomaly_detected: conversionAnomaly.detected,
          anomaly_type: conversionAnomaly.type,
          anomaly_severity: conversionAnomaly.severity,
          period: current.period,
          period_type: 'weekly'
        });

        // Referral rate
        const referralCurrent = current.referrals?.referral_rate || 0;
        const referralPrev = previous.referrals?.referral_rate || 0;
        
        signalsToCreate.push({
          metric_name: 'referral_rate',
          current_value: referralCurrent,
          previous_value: referralPrev,
          change_pct: referralPrev ? ((referralCurrent - referralPrev) / referralPrev) * 100 : 0,
          trend: referralCurrent > referralPrev ? 'improving' : 'declining',
          anomaly_detected: false,
          period: current.period,
          period_type: 'weekly'
        });

        // Review velocity
        const reviewCurrent = current.reviews?.review_velocity || 0;
        const reviewPrev = previous.reviews?.review_velocity || 0;
        
        signalsToCreate.push({
          metric_name: 'review_velocity',
          current_value: reviewCurrent,
          previous_value: reviewPrev,
          change_pct: reviewPrev ? ((reviewCurrent - reviewPrev) / reviewPrev) * 100 : 0,
          trend: reviewCurrent > reviewPrev ? 'improving' : 'declining',
          anomaly_detected: false,
          period: current.period,
          period_type: 'weekly'
        });

        // Create signals
        for (const signal of signalsToCreate) {
          await base44.asServiceRole.entities.GrowthSignal.create(signal);
          results.signals_generated++;
          if (signal.anomaly_detected) results.anomalies_detected++;
        }

        // Auto-propose actions for anomalies (if semi-auto or full-auto)
        if (config.autopilot_mode !== 'off' && results.anomalies_detected > 0) {
          for (const signal of signalsToCreate.filter(s => s.anomaly_detected && s.anomaly_severity === 'critical')) {
            await base44.asServiceRole.entities.FounderDecision.create({
              decision_type: 'growth',
              title: `Address ${signal.metric_name} ${signal.anomaly_type}`,
              hypothesis: `Investigating ${signal.metric_name} anomaly will prevent growth stall`,
              risk_level: 'medium',
              confidence_score: 0.8,
              status: 'proposed',
              source_engine: 'growth_autopilot',
              requires_approval: config.autopilot_mode !== 'full_auto',
              expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
            });
            results.actions_proposed++;
          }
        }

        // Update config
        await base44.asServiceRole.entities.AutopilotConfig.update(config.id, {
          last_growth_run: new Date().toISOString()
        });

        return Response.json({ success: true, ...results });
      }

      // ==========================================
      // MOAT AUTOPILOT
      // ==========================================
      case 'run_moat_optimizer': {
        if (!config.moat_autopilot_enabled) {
          return Response.json({ success: false, message: 'Moat autopilot disabled' });
        }

        const results = {
          signals_generated: 0,
          drift_detected: false,
          recalibration_triggered: false,
          weight_adjustments: 0
        };

        // Get moat metrics
        const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({}, '-created_date', 4);
        const current = moatMetrics[0] || {};
        const previous = moatMetrics[1] || {};

        // Get ROI metrics across tenants
        const roiMetrics = await base44.asServiceRole.entities.RiskROIMetric.filter({}, '-created_date', 100);
        
        // Aggregate ROI data
        let totalAccuracy = 0, totalFPR = 0, totalTPR = 0, count = 0;
        for (const roi of roiMetrics.slice(0, 50)) {
          if (roi.ai_accuracy_percent) {
            totalAccuracy += roi.ai_accuracy_percent;
            totalFPR += roi.false_positive_rate || 0;
            totalTPR += roi.true_positive_rate || 0;
            count++;
          }
        }

        const avgAccuracy = count > 0 ? totalAccuracy / count : 0;
        const avgFPR = count > 0 ? totalFPR / count : 0;
        const avgTPR = count > 0 ? totalTPR / count : 0;

        // Generate moat signals
        const signalsToCreate = [];

        // Risk accuracy signal
        signalsToCreate.push({
          signal_name: 'risk_accuracy',
          current_value: avgAccuracy,
          previous_value: current.ai_moat?.prediction_accuracy || 0,
          trend: avgAccuracy > (current.ai_moat?.prediction_accuracy || 0) ? 'improving' : 'stable',
          health_status: avgAccuracy > 85 ? 'excellent' : avgAccuracy > 70 ? 'good' : avgAccuracy > 50 ? 'warning' : 'critical',
          period: current.period,
          period_type: 'weekly'
        });

        // False positive rate signal
        const fprAnomaly = detectAnomaly(avgFPR, previous.ai_moat?.false_positive_rate || avgFPR, 0.15);
        signalsToCreate.push({
          signal_name: 'false_positive_rate',
          current_value: avgFPR,
          previous_value: previous.ai_moat?.false_positive_rate || 0,
          trend: avgFPR < (previous.ai_moat?.false_positive_rate || avgFPR) ? 'improving' : 'declining',
          health_status: avgFPR < 0.1 ? 'excellent' : avgFPR < 0.2 ? 'good' : 'warning',
          drift_detected: fprAnomaly.detected,
          drift_magnitude: fprAnomaly.magnitude,
          period: current.period,
          period_type: 'weekly'
        });

        // Global signal growth
        const signalCount = current.data_moat?.cross_merchant_signals || 0;
        const prevSignalCount = previous.data_moat?.cross_merchant_signals || 0;
        signalsToCreate.push({
          signal_name: 'global_signal_growth',
          current_value: signalCount,
          previous_value: prevSignalCount,
          change_pct: prevSignalCount ? ((signalCount - prevSignalCount) / prevSignalCount) * 100 : 0,
          trend: signalCount > prevSignalCount ? 'improving' : 'stable',
          health_status: signalCount > 20 ? 'excellent' : signalCount > 10 ? 'good' : 'warning',
          period: current.period,
          period_type: 'weekly'
        });

        // Model confidence
        const modelConfidence = current.ai_moat?.prediction_accuracy || 0;
        signalsToCreate.push({
          signal_name: 'model_confidence',
          current_value: modelConfidence,
          previous_value: previous.ai_moat?.prediction_accuracy || 0,
          trend: modelConfidence > (previous.ai_moat?.prediction_accuracy || 0) ? 'improving' : 'stable',
          health_status: modelConfidence > 85 ? 'excellent' : modelConfidence > 70 ? 'good' : 'warning',
          period: current.period,
          period_type: 'weekly'
        });

        // Create signals
        for (const signal of signalsToCreate) {
          await base44.asServiceRole.entities.MoatSignal.create(signal);
          results.signals_generated++;
          if (signal.drift_detected) results.drift_detected = true;
        }

        // Check if recalibration needed
        const needsRecalibration = avgAccuracy < 75 || avgFPR > 0.25 || results.drift_detected;
        
        if (needsRecalibration && config.autopilot_mode !== 'off') {
          // Trigger recalibration via existing function
          try {
            await base44.functions.invoke('adaptiveLearning', {
              action: 'update_cross_merchant_signals',
              days: 90
            });
            results.recalibration_triggered = true;
          } catch (e) {
            console.error('Recalibration trigger failed:', e.message);
          }

          // Create decision for review
          await base44.asServiceRole.entities.FounderDecision.create({
            decision_type: 'moat',
            title: 'Risk Model Recalibration Triggered',
            hypothesis: 'Model drift detected, recalibration will restore accuracy',
            risk_level: 'low',
            confidence_score: 0.9,
            status: config.autopilot_mode === 'full_auto' ? 'executed' : 'proposed',
            source_engine: 'moat_autopilot',
            requires_approval: config.autopilot_mode !== 'full_auto',
            executed_at: config.autopilot_mode === 'full_auto' ? new Date().toISOString() : null
          });
        }

        // Update config
        await base44.asServiceRole.entities.AutopilotConfig.update(config.id, {
          last_moat_run: new Date().toISOString()
        });

        return Response.json({ success: true, ...results });
      }

      // ==========================================
      // EXPERIMENT ENGINE
      // ==========================================
      case 'launch_experiment': {
        const { engine_type, experiment_name, hypothesis, variant_a, variant_b, metric_tracked } = params;

        // Check concurrent experiment limit
        const runningExperiments = await base44.asServiceRole.entities.AutopilotExperiment.filter({
          status: 'running'
        });

        if (runningExperiments.length >= (config.guardrails?.max_concurrent_experiments || 5)) {
          return Response.json({ 
            success: false, 
            message: 'Max concurrent experiments reached',
            limit: config.guardrails?.max_concurrent_experiments 
          });
        }

        const experiment = await base44.asServiceRole.entities.AutopilotExperiment.create({
          engine_type,
          experiment_name,
          hypothesis,
          status: 'running',
          variant_a: { name: 'Control', ...variant_a, is_control: true },
          variant_b: { name: 'Treatment', ...variant_b, is_control: false },
          metric_tracked,
          traffic_split: 50,
          min_sample_size: config.guardrails?.min_experiment_sample_size || 100,
          started_at: new Date().toISOString(),
          auto_stop_enabled: true
        });

        return Response.json({ success: true, experiment_id: experiment.id });
      }

      case 'check_experiment_results': {
        const { experiment_id } = params;

        const experiments = await base44.asServiceRole.entities.AutopilotExperiment.filter({
          id: experiment_id
        });

        if (!experiments.length) {
          return Response.json({ error: 'Experiment not found' }, { status: 404 });
        }

        const exp = experiments[0];

        // Check if we have enough samples
        const totalSamples = (exp.current_sample_a || 0) + (exp.current_sample_b || 0);
        if (totalSamples < exp.min_sample_size) {
          return Response.json({
            success: true,
            status: 'insufficient_data',
            samples_needed: exp.min_sample_size - totalSamples
          });
        }

        // Calculate statistical significance (simplified z-test)
        const convA = exp.results_a?.conversions || 0;
        const convB = exp.results_b?.conversions || 0;
        const nA = exp.current_sample_a || 1;
        const nB = exp.current_sample_b || 1;

        const pA = convA / nA;
        const pB = convB / nB;
        const pPool = (convA + convB) / (nA + nB);
        const se = Math.sqrt(pPool * (1 - pPool) * (1/nA + 1/nB));
        const zScore = se > 0 ? (pB - pA) / se : 0;
        const significance = Math.abs(zScore) > 1.96 ? 0.95 : Math.abs(zScore) > 1.645 ? 0.90 : 0;

        let winner = 'inconclusive';
        if (significance >= 0.95) {
          winner = pB > pA ? 'B' : 'A';
        } else if (significance >= 0.90 && Math.abs(pB - pA) > 0.05) {
          winner = pB > pA ? 'B' : 'A';
        }

        const lift = pA > 0 ? ((pB - pA) / pA) * 100 : 0;

        // Update experiment
        await base44.asServiceRole.entities.AutopilotExperiment.update(exp.id, {
          winner,
          statistical_significance: significance,
          lift_percentage: lift,
          status: winner !== 'inconclusive' ? 'completed' : exp.status
        });

        // Auto-deploy if enabled and significant
        if (winner !== 'inconclusive' && config.experiment_auto_deploy) {
          await base44.asServiceRole.entities.AutopilotExperiment.update(exp.id, {
            deployed_globally: true,
            deployed_at: new Date().toISOString(),
            status: 'winner_deployed'
          });

          // Record to strategic memory
          await recordMemory(base44, {
            memory_type: 'experiment_result',
            title: `${exp.experiment_name} - Winner: ${winner}`,
            insight: `${winner === 'B' ? 'Treatment' : 'Control'} won with ${lift.toFixed(1)}% lift`,
            confidence: significance,
            sample_size: totalSamples,
            source_experiment_id: exp.id,
            data_summary: { winner, lift, significance, pA, pB }
          });
        }

        return Response.json({
          success: true,
          winner,
          significance,
          lift_percentage: lift,
          deployed: config.experiment_auto_deploy && winner !== 'inconclusive'
        });
      }

      // ==========================================
      // DECISION MANAGEMENT
      // ==========================================
      case 'approve_decision': {
        const { decision_id } = params;

        const decisions = await base44.asServiceRole.entities.FounderDecision.filter({
          id: decision_id
        });

        if (!decisions.length) {
          return Response.json({ error: 'Decision not found' }, { status: 404 });
        }

        await base44.asServiceRole.entities.FounderDecision.update(decision_id, {
          status: 'approved',
          approved_by: user.email,
          approved_at: new Date().toISOString()
        });

        return Response.json({ success: true, status: 'approved' });
      }

      case 'reject_decision': {
        const { decision_id, reason } = params;

        await base44.asServiceRole.entities.FounderDecision.update(decision_id, {
          status: 'rejected',
          rollback_reason: reason
        });

        return Response.json({ success: true, status: 'rejected' });
      }

      case 'execute_decision': {
        const { decision_id } = params;

        const decisions = await base44.asServiceRole.entities.FounderDecision.filter({
          id: decision_id
        });

        if (!decisions.length) {
          return Response.json({ error: 'Decision not found' }, { status: 404 });
        }

        const decision = decisions[0];

        if (decision.status !== 'approved' && decision.requires_approval) {
          return Response.json({ error: 'Decision not approved' }, { status: 400 });
        }

        // Mark as executing
        await base44.asServiceRole.entities.FounderDecision.update(decision_id, {
          status: 'executing'
        });

        // Execute based on decision type
        // (In practice, this would trigger specific actions)
        
        await base44.asServiceRole.entities.FounderDecision.update(decision_id, {
          status: 'executed',
          executed_at: new Date().toISOString()
        });

        return Response.json({ success: true, status: 'executed' });
      }

      case 'rollback_decision': {
        const { decision_id, reason } = params;

        await base44.asServiceRole.entities.FounderDecision.update(decision_id, {
          status: 'rolled_back',
          rolled_back_at: new Date().toISOString(),
          rollback_reason: reason
        });

        return Response.json({ success: true, status: 'rolled_back' });
      }

      // ==========================================
      // CONFIG MANAGEMENT
      // ==========================================
      case 'get_config': {
        return Response.json({ success: true, config });
      }

      case 'update_config': {
        const { autopilot_mode, guardrails, growth_enabled, moat_enabled } = params;

        const updates = {};
        if (autopilot_mode) updates.autopilot_mode = autopilot_mode;
        if (guardrails) updates.guardrails = { ...config.guardrails, ...guardrails };
        if (growth_enabled !== undefined) updates.growth_autopilot_enabled = growth_enabled;
        if (moat_enabled !== undefined) updates.moat_autopilot_enabled = moat_enabled;

        await base44.asServiceRole.entities.AutopilotConfig.update(config.id, updates);

        return Response.json({ success: true });
      }

      // ==========================================
      // DASHBOARD DATA
      // ==========================================
      case 'get_autopilot_status': {
        // Get recent signals
        const growthSignals = await base44.asServiceRole.entities.GrowthSignal.filter({}, '-created_date', 10);
        const moatSignals = await base44.asServiceRole.entities.MoatSignal.filter({}, '-created_date', 10);

        // Get pending decisions
        const pendingDecisions = await base44.asServiceRole.entities.FounderDecision.filter({
          status: 'proposed'
        }, '-created_date', 10);

        // Get active experiments
        const activeExperiments = await base44.asServiceRole.entities.AutopilotExperiment.filter({
          status: 'running'
        });

        // Calculate scores
        const latestGrowthSignals = growthSignals.filter(s => s.period === growthSignals[0]?.period);
        const latestMoatSignals = moatSignals.filter(s => s.period === moatSignals[0]?.period);

        let growthScore = 50;
        for (const s of latestGrowthSignals) {
          if (s.trend === 'improving') growthScore += 10;
          if (s.trend === 'declining') growthScore -= 10;
          if (s.anomaly_detected && s.anomaly_severity === 'critical') growthScore -= 15;
        }
        growthScore = Math.max(0, Math.min(100, growthScore));

        let moatScore = 50;
        for (const s of latestMoatSignals) {
          if (s.health_status === 'excellent') moatScore += 15;
          if (s.health_status === 'good') moatScore += 5;
          if (s.health_status === 'warning') moatScore -= 10;
          if (s.health_status === 'critical') moatScore -= 20;
        }
        moatScore = Math.max(0, Math.min(100, moatScore));

        // AI confidence
        const avgConfidence = pendingDecisions.length > 0
          ? pendingDecisions.reduce((sum, d) => sum + (d.confidence_score || 0), 0) / pendingDecisions.length
          : 0.75;

        // Strategic risk
        const criticalAnomalies = growthSignals.filter(s => s.anomaly_severity === 'critical').length +
                                  moatSignals.filter(s => s.health_status === 'critical').length;
        const strategicRisk = criticalAnomalies > 2 ? 'high' : criticalAnomalies > 0 ? 'medium' : 'low';

        return Response.json({
          success: true,
          autopilot_mode: config.autopilot_mode,
          growth_velocity_score: growthScore,
          moat_strength_score: moatScore,
          ai_confidence_index: Math.round(avgConfidence * 100),
          strategic_risk_index: strategicRisk,
          active_experiments: activeExperiments.length,
          pending_decisions: pendingDecisions.length,
          last_growth_run: config.last_growth_run,
          last_moat_run: config.last_moat_run,
          last_strategy_review: config.last_strategy_review
        });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Founder Autopilot error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});