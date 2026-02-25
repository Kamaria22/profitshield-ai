import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Thresholds for model deployment safety
const DRIFT_THRESHOLD = 15;
const BIAS_THRESHOLD = 20;
const MIN_EVALUATION_SCORE = 75;
const FAIRNESS_THRESHOLD = 70;
const EXPLAINABILITY_THRESHOLD = 60;
const DISPARATE_IMPACT_MIN = 0.8; // 80% rule
const EQUALIZED_ODDS_MAX = 0.1; // Max 10% difference

// Demographic segments for fairness analysis
const DEMOGRAPHIC_SEGMENTS = [
  { name: 'small_merchant', type: 'business_size', filter: 'orders < 100' },
  { name: 'medium_merchant', type: 'business_size', filter: '100 <= orders < 1000' },
  { name: 'large_merchant', type: 'business_size', filter: 'orders >= 1000' },
  { name: 'us_region', type: 'geography', filter: 'region = US' },
  { name: 'eu_region', type: 'geography', filter: 'region = EU' },
  { name: 'apac_region', type: 'geography', filter: 'region = APAC' },
  { name: 'new_customer', type: 'tenure', filter: 'tenure < 30 days' },
  { name: 'established_customer', type: 'tenure', filter: 'tenure >= 30 days' }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'run_drift_detection') {
      return await runModelDriftDetection(base44);
    } else if (action === 'deploy_if_safe') {
      return await deployModelIfSafe(base44, body.version_id);
    } else if (action === 'get_evolution_dashboard') {
      return await getEvolutionDashboard(base44);
    } else if (action === 'create_experiment') {
      return await createModelExperiment(base44, body);
    } else if (action === 'rollback') {
      return await rollbackModel(base44, body.model_name);
    } else if (action === 'run_fairness_audit') {
      return await runFairnessAudit(base44, body.version_id);
    } else if (action === 'run_explainability_check') {
      return await runExplainabilityCheck(base44, body.version_id);
    } else if (action === 'generate_compliance_report') {
      return await generateComplianceReport(base44, body);
    } else if (action === 'get_fairness_dashboard') {
      return await getFairnessDashboard(base44);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function runModelDriftDetection(base44) {
  const models = await base44.asServiceRole.entities.AIModelVersion.filter({ is_deployed: true });
  const driftEvents = [];
  const retrainingProposals = [];

  for (const model of models) {
    // Simulate drift detection (in production, would compare against baseline metrics)
    const currentDrift = simulateDriftScore(model);
    const currentBias = simulateBiasScore(model);
    
    const driftDetected = currentDrift > DRIFT_THRESHOLD;
    const biasDetected = currentBias > BIAS_THRESHOLD;

    // Update model with current scores
    await base44.asServiceRole.entities.AIModelVersion.update(model.id, {
      drift_score: currentDrift,
      bias_score: currentBias
    });

    if (driftDetected || biasDetected) {
      // Log governance audit event
      await base44.asServiceRole.entities.GovernanceAuditEvent.create({
        event_type: driftDetected ? 'anomaly_detected' : 'compliance_check',
        entity_affected: 'AIModelVersion',
        entity_id: model.id,
        before_value: { drift: model.drift_score, bias: model.bias_score },
        after_value: { drift: currentDrift, bias: currentBias },
        changed_by: 'ai_model_governance',
        severity: (driftDetected && biasDetected) ? 'critical' : 'warning',
        compliance_frameworks: ['AI_GOVERNANCE'],
        requires_review: true
      });

      driftEvents.push({
        model_name: model.model_name,
        version: model.version,
        drift_score: currentDrift,
        bias_score: currentBias,
        drift_detected: driftDetected,
        bias_detected: biasDetected
      });

      // Propose retraining if severe
      if (currentDrift > DRIFT_THRESHOLD * 1.5 || currentBias > BIAS_THRESHOLD * 1.5) {
        retrainingProposals.push({
          model_name: model.model_name,
          current_version: model.version,
          reason: driftDetected ? 'performance_drift' : 'bias_amplification',
          priority: 'high',
          estimated_improvement: Math.min(20, currentDrift - DRIFT_THRESHOLD + 5)
        });
      }
    }
  }

  // Log telemetry with required fields
  try {
    await base44.asServiceRole.entities.ClientTelemetry.create({
      level: driftEvents.length > 2 ? 'error' : driftEvents.length > 0 ? 'warn' : 'info',
      message: `AI Model Drift Detection: ${models.length} models checked, ${driftEvents.length} drift events detected, ${retrainingProposals.length} retraining proposals`,
      context_json: {
        event_type: 'model_drift_detection',
        models_checked: models.length,
        drift_events: driftEvents.length,
        retraining_proposals: retrainingProposals.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (telemetryError) {
    console.error('[AIModelGovernance] Telemetry logging failed:', telemetryError.message);
  }

  return Response.json({
    success: true,
    models_checked: models.length,
    drift_events: driftEvents,
    retraining_proposals: retrainingProposals,
    overall_health: driftEvents.length === 0 ? 'healthy' : driftEvents.length <= 2 ? 'warning' : 'critical'
  });
}

function simulateDriftScore(model) {
  // Simulate drift based on model age
  const deployedAt = model.deployed_at ? new Date(model.deployed_at) : new Date();
  const daysDeployed = (Date.now() - deployedAt.getTime()) / (1000 * 60 * 60 * 24);
  const baseDrift = model.drift_score || 5;
  return Math.min(100, baseDrift + (daysDeployed * 0.1) + (Math.random() * 5));
}

function simulateBiasScore(model) {
  // Simulate bias score
  const baseBias = model.bias_score || 10;
  return Math.min(100, baseBias + (Math.random() * 3));
}

async function deployModelIfSafe(base44, versionId) {
  const versions = await base44.asServiceRole.entities.AIModelVersion.filter({ id: versionId });
  if (versions.length === 0) {
    return Response.json({ error: 'Model version not found' }, { status: 404 });
  }

  const model = versions[0];

  // Validate deployment safety
  const validations = {
    drift_ok: (model.drift_score || 0) < DRIFT_THRESHOLD,
    bias_ok: (model.bias_score || 0) < BIAS_THRESHOLD,
    evaluation_ok: (model.evaluation_score || 0) >= MIN_EVALUATION_SCORE,
    compliance_ok: model.compliance_status === 'approved'
  };

  const allValid = Object.values(validations).every(v => v);

  if (!allValid) {
    // Log failed deployment attempt
    await base44.asServiceRole.entities.GovernanceAuditEvent.create({
      event_type: 'compliance_check',
      entity_affected: 'AIModelVersion',
      entity_id: model.id,
      changed_by: 'ai_model_governance',
      severity: 'warning',
      compliance_frameworks: ['AI_GOVERNANCE'],
      requires_review: true
    });

    return Response.json({
      success: false,
      deployed: false,
      validations,
      reason: 'Model failed safety checks'
    });
  }

  // Find current deployed version to mark as rollback target
  const currentDeployed = await base44.asServiceRole.entities.AIModelVersion.filter({
    model_name: model.model_name,
    is_deployed: true
  });

  for (const current of currentDeployed) {
    await base44.asServiceRole.entities.AIModelVersion.update(current.id, {
      is_deployed: false,
      is_rollback_target: true
    });
  }

  // Deploy new version
  await base44.asServiceRole.entities.AIModelVersion.update(model.id, {
    is_deployed: true,
    deployed_at: new Date().toISOString(),
    is_rollback_target: false
  });

  // Log deployment event
  await base44.asServiceRole.entities.GovernanceAuditEvent.create({
    event_type: 'config_change',
    entity_affected: 'AIModelVersion',
    entity_id: model.id,
    before_value: { is_deployed: false },
    after_value: { is_deployed: true },
    changed_by: 'ai_model_governance',
    severity: 'info',
    compliance_frameworks: ['AI_GOVERNANCE'],
    requires_review: false
  });

  return Response.json({
    success: true,
    deployed: true,
    validations,
    model_name: model.model_name,
    version: model.version
  });
}

async function rollbackModel(base44, modelName) {
  const rollbackTarget = await base44.asServiceRole.entities.AIModelVersion.filter({
    model_name: modelName,
    is_rollback_target: true
  });

  if (rollbackTarget.length === 0) {
    return Response.json({ error: 'No rollback target found' }, { status: 404 });
  }

  const target = rollbackTarget[0];

  // Undeploy current
  const currentDeployed = await base44.asServiceRole.entities.AIModelVersion.filter({
    model_name: modelName,
    is_deployed: true
  });

  for (const current of currentDeployed) {
    await base44.asServiceRole.entities.AIModelVersion.update(current.id, {
      is_deployed: false,
      is_rollback_target: false
    });
  }

  // Deploy rollback target
  await base44.asServiceRole.entities.AIModelVersion.update(target.id, {
    is_deployed: true,
    deployed_at: new Date().toISOString(),
    is_rollback_target: false
  });

  // Log rollback
  await base44.asServiceRole.entities.GovernanceAuditEvent.create({
    event_type: 'config_change',
    entity_affected: 'AIModelVersion',
    entity_id: target.id,
    changed_by: 'ai_model_governance',
    change_reason: 'Model rollback initiated',
    severity: 'warning',
    compliance_frameworks: ['AI_GOVERNANCE'],
    requires_review: true
  });

  return Response.json({
    success: true,
    rolled_back_to: target.version,
    model_name: modelName
  });
}

async function getEvolutionDashboard(base44) {
  const allModels = await base44.asServiceRole.entities.AIModelVersion.filter({});
  const experiments = await base44.asServiceRole.entities.ModelExperiment.filter({});
  const auditEvents = await base44.asServiceRole.entities.GovernanceAuditEvent.filter({
    entity_affected: 'AIModelVersion'
  });

  // Build model lineage tree
  const modelTypes = [...new Set(allModels.map(m => m.model_type))];
  const lineageTree = {};
  
  for (const type of modelTypes) {
    const typeModels = allModels
      .filter(m => m.model_type === type)
      .sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    
    lineageTree[type] = typeModels.map(m => ({
      version: m.version,
      evaluation_score: m.evaluation_score,
      drift_score: m.drift_score,
      bias_score: m.bias_score,
      is_deployed: m.is_deployed,
      compliance_status: m.compliance_status,
      deployed_at: m.deployed_at
    }));
  }

  // Calculate drift risk
  const deployedModels = allModels.filter(m => m.is_deployed);
  const avgDrift = deployedModels.length > 0 
    ? deployedModels.reduce((sum, m) => sum + (m.drift_score || 0), 0) / deployedModels.length 
    : 0;
  const driftRisk = avgDrift > DRIFT_THRESHOLD * 1.5 ? 'high' : avgDrift > DRIFT_THRESHOLD ? 'medium' : 'low';

  // Retraining proposals
  const retrainingProposals = deployedModels
    .filter(m => (m.drift_score || 0) > DRIFT_THRESHOLD || (m.bias_score || 0) > BIAS_THRESHOLD)
    .map(m => ({
      model_name: m.model_name,
      version: m.version,
      drift: m.drift_score,
      bias: m.bias_score,
      priority: (m.drift_score || 0) > DRIFT_THRESHOLD * 1.5 ? 'high' : 'medium'
    }));

  return Response.json({
    dashboard: {
      total_models: allModels.length,
      deployed_models: deployedModels.length,
      experiments: experiments.length,
      lineage_tree: lineageTree,
      drift_risk: driftRisk,
      avg_drift_score: avgDrift,
      retraining_proposals: retrainingProposals,
      recent_deployments: deployedModels
        .filter(m => m.deployed_at)
        .sort((a, b) => new Date(b.deployed_at) - new Date(a.deployed_at))
        .slice(0, 5)
        .map(m => ({
          model: m.model_name,
          version: m.version,
          deployed_at: m.deployed_at,
          evaluation: m.evaluation_score
        })),
      active_experiments: experiments
        .filter(e => e.status === 'running')
        .map(e => ({
          name: e.experiment_name,
          hypothesis: e.hypothesis,
          confidence: e.confidence_score
        }))
    }
  });
}

async function createModelExperiment(base44, params) {
  const { experiment_name, hypothesis, model_type, variant_a_version, variant_b_version, traffic_split } = params;
  
  const experiment = await base44.asServiceRole.entities.ModelExperiment.create({
    experiment_name,
    hypothesis,
    model_type: model_type || 'fraud_detection',
    variant_a_version,
    variant_b_version,
    traffic_split: traffic_split || 50,
    status: 'draft',
    winner: 'pending'
  });

  return Response.json({ success: true, experiment_id: experiment.id });
}

// Fairness Audit - Analyze model performance across demographic segments
async function runFairnessAudit(base44, versionId) {
  let models = [];
  if (versionId) {
    models = await base44.asServiceRole.entities.AIModelVersion.filter({ id: versionId });
  } else {
    models = await base44.asServiceRole.entities.AIModelVersion.filter({ is_deployed: true });
  }

  const audits = [];

  for (const model of models) {
    const segmentResults = [];
    let totalFairnessScore = 0;
    const violations = [];
    const recommendations = [];

    // Analyze each demographic segment
    for (const segment of DEMOGRAPHIC_SEGMENTS) {
      const segmentMetrics = simulateSegmentMetrics(model, segment);
      segmentResults.push({
        segment_name: segment.name,
        segment_type: segment.type,
        sample_size: segmentMetrics.sample_size,
        accuracy: segmentMetrics.accuracy,
        false_positive_rate: segmentMetrics.fpr,
        false_negative_rate: segmentMetrics.fnr,
        disparate_impact_ratio: segmentMetrics.disparate_impact,
        equalized_odds_diff: segmentMetrics.equalized_odds_diff
      });

      // Check for disparate impact violation (80% rule)
      if (segmentMetrics.disparate_impact < DISPARATE_IMPACT_MIN) {
        violations.push({
          violation_type: 'disparate_impact',
          severity: segmentMetrics.disparate_impact < 0.6 ? 'critical' : 'warning',
          segment_affected: segment.name,
          metric: 'disparate_impact_ratio',
          threshold: DISPARATE_IMPACT_MIN,
          actual_value: segmentMetrics.disparate_impact,
          remediation: `Retrain model with balanced sampling for ${segment.name} segment`
        });
      }

      // Check for equalized odds violation
      if (segmentMetrics.equalized_odds_diff > EQUALIZED_ODDS_MAX) {
        violations.push({
          violation_type: 'equalized_odds',
          severity: segmentMetrics.equalized_odds_diff > 0.2 ? 'critical' : 'warning',
          segment_affected: segment.name,
          metric: 'equalized_odds_difference',
          threshold: EQUALIZED_ODDS_MAX,
          actual_value: segmentMetrics.equalized_odds_diff,
          remediation: `Apply post-processing calibration for ${segment.name} segment`
        });
      }

      totalFairnessScore += segmentMetrics.segment_fairness;
    }

    const avgFairnessScore = totalFairnessScore / DEMOGRAPHIC_SEGMENTS.length;

    // Generate recommendations
    if (avgFairnessScore < 60) {
      recommendations.push('Consider retraining with adversarial debiasing techniques');
    }
    if (violations.filter(v => v.violation_type === 'disparate_impact').length > 2) {
      recommendations.push('Implement reweighting or resampling for underrepresented segments');
    }
    if (violations.some(v => v.severity === 'critical')) {
      recommendations.push('Halt deployment until critical fairness violations are resolved');
    }

    // Determine compliance status
    let complianceStatus = 'compliant';
    if (violations.some(v => v.severity === 'critical')) {
      complianceStatus = 'non_compliant';
    } else if (violations.length > 0) {
      complianceStatus = 'warning';
    }

    // Create fairness audit record
    const audit = await base44.asServiceRole.entities.ModelFairnessAudit.create({
      model_version_id: model.id,
      model_name: model.model_name,
      audit_type: 'fairness',
      demographic_segments: segmentResults,
      fairness_score: avgFairnessScore,
      compliance_status: complianceStatus,
      violations,
      recommendations,
      audited_at: new Date().toISOString(),
      next_audit_due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    // Log governance event
    await base44.asServiceRole.entities.GovernanceAuditEvent.create({
      event_type: 'compliance_check',
      entity_affected: 'AIModelVersion',
      entity_id: model.id,
      changed_by: 'ai_model_governance',
      severity: complianceStatus === 'non_compliant' ? 'critical' : complianceStatus === 'warning' ? 'warning' : 'info',
      compliance_frameworks: ['AI_GOVERNANCE', 'FAIRNESS'],
      requires_review: complianceStatus !== 'compliant'
    });

    audits.push({
      model_name: model.model_name,
      version: model.version,
      fairness_score: avgFairnessScore,
      compliance_status: complianceStatus,
      violations_count: violations.length,
      critical_violations: violations.filter(v => v.severity === 'critical').length
    });
  }

  return Response.json({
    success: true,
    models_audited: audits.length,
    audits,
    overall_fairness: audits.length > 0 ? audits.reduce((sum, a) => sum + a.fairness_score, 0) / audits.length : 0
  });
}

function simulateSegmentMetrics(model, segment) {
  // Simulate metrics based on model and segment (in production, would use real evaluation data)
  const baseAccuracy = model.evaluation_score || 85;
  const baseFpr = 0.05 + Math.random() * 0.1;
  const baseFnr = 0.03 + Math.random() * 0.08;
  
  // Add segment-specific variance
  let segmentVariance = 0;
  if (segment.type === 'business_size' && segment.name === 'small_merchant') {
    segmentVariance = -5 + Math.random() * 10;
  } else if (segment.type === 'geography' && segment.name === 'apac_region') {
    segmentVariance = -3 + Math.random() * 8;
  } else if (segment.type === 'tenure' && segment.name === 'new_customer') {
    segmentVariance = -4 + Math.random() * 6;
  }

  const accuracy = Math.max(60, Math.min(100, baseAccuracy + segmentVariance));
  const fpr = Math.max(0.01, baseFpr + (segmentVariance < 0 ? 0.02 : -0.01));
  const fnr = Math.max(0.01, baseFnr + (segmentVariance < 0 ? 0.015 : -0.01));
  
  // Disparate impact ratio (favorable outcome rate for segment vs overall)
  const disparate_impact = 0.7 + Math.random() * 0.35;
  
  // Equalized odds difference
  const equalized_odds_diff = Math.abs(fpr - baseFpr) + Math.abs(fnr - baseFnr);
  
  // Calculate segment fairness score
  const segment_fairness = Math.max(0, Math.min(100, 
    50 + (disparate_impact - 0.5) * 50 + (0.2 - equalized_odds_diff) * 100
  ));

  return {
    sample_size: Math.floor(1000 + Math.random() * 5000),
    accuracy,
    fpr,
    fnr,
    disparate_impact,
    equalized_odds_diff,
    segment_fairness
  };
}

// Explainability Check - Verify model decisions are interpretable
async function runExplainabilityCheck(base44, versionId) {
  let models = [];
  if (versionId) {
    models = await base44.asServiceRole.entities.AIModelVersion.filter({ id: versionId });
  } else {
    models = await base44.asServiceRole.entities.AIModelVersion.filter({ is_deployed: true });
  }

  const results = [];

  for (const model of models) {
    // Simulate explainability analysis
    const explainabilityMetrics = {
      feature_importance_available: true,
      shap_values_computed: Math.random() > 0.3,
      lime_explanations_available: Math.random() > 0.4,
      decision_path_transparency: 60 + Math.random() * 40,
      avg_explanation_fidelity: 70 + Math.random() * 25,
      top_features: generateTopFeatures(model.model_type)
    };

    // Calculate explainability score
    let explainabilityScore = 0;
    if (explainabilityMetrics.feature_importance_available) explainabilityScore += 20;
    if (explainabilityMetrics.shap_values_computed) explainabilityScore += 25;
    if (explainabilityMetrics.lime_explanations_available) explainabilityScore += 15;
    explainabilityScore += (explainabilityMetrics.decision_path_transparency / 100) * 20;
    explainabilityScore += (explainabilityMetrics.avg_explanation_fidelity / 100) * 20;

    const violations = [];
    const recommendations = [];

    if (!explainabilityMetrics.shap_values_computed) {
      violations.push({
        violation_type: 'missing_shap',
        severity: 'warning',
        metric: 'shap_values',
        remediation: 'Compute SHAP values for global and local explanations'
      });
      recommendations.push('Implement SHAP explainer for feature attribution');
    }

    if (explainabilityMetrics.decision_path_transparency < 70) {
      violations.push({
        violation_type: 'low_transparency',
        severity: 'warning',
        metric: 'decision_path_transparency',
        threshold: 70,
        actual_value: explainabilityMetrics.decision_path_transparency,
        remediation: 'Simplify model or add decision path logging'
      });
    }

    if (explainabilityScore < EXPLAINABILITY_THRESHOLD) {
      recommendations.push('Consider using more interpretable model architecture');
      recommendations.push('Add local explanation generation for high-stakes decisions');
    }

    // Get existing audit or create new one
    const existingAudits = await base44.asServiceRole.entities.ModelFairnessAudit.filter({
      model_version_id: model.id,
      audit_type: 'explainability'
    });

    if (existingAudits.length > 0) {
      await base44.asServiceRole.entities.ModelFairnessAudit.update(existingAudits[0].id, {
        explainability_metrics: explainabilityMetrics,
        explainability_score: explainabilityScore,
        violations: [...(existingAudits[0].violations || []), ...violations],
        recommendations: [...new Set([...(existingAudits[0].recommendations || []), ...recommendations])],
        audited_at: new Date().toISOString()
      });
    } else {
      await base44.asServiceRole.entities.ModelFairnessAudit.create({
        model_version_id: model.id,
        model_name: model.model_name,
        audit_type: 'explainability',
        explainability_metrics: explainabilityMetrics,
        explainability_score: explainabilityScore,
        compliance_status: explainabilityScore >= EXPLAINABILITY_THRESHOLD ? 'compliant' : 'warning',
        violations,
        recommendations,
        audited_at: new Date().toISOString(),
        next_audit_due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });
    }

    results.push({
      model_name: model.model_name,
      version: model.version,
      explainability_score: explainabilityScore,
      has_shap: explainabilityMetrics.shap_values_computed,
      has_lime: explainabilityMetrics.lime_explanations_available,
      transparency: explainabilityMetrics.decision_path_transparency,
      top_features: explainabilityMetrics.top_features.slice(0, 5)
    });
  }

  return Response.json({
    success: true,
    models_checked: results.length,
    results,
    avg_explainability: results.length > 0 ? results.reduce((sum, r) => sum + r.explainability_score, 0) / results.length : 0
  });
}

function generateTopFeatures(modelType) {
  const featureSets = {
    fraud_detection: [
      { feature: 'transaction_velocity', importance: 0.25, direction: 'positive' },
      { feature: 'device_fingerprint_match', importance: 0.18, direction: 'negative' },
      { feature: 'billing_shipping_distance', importance: 0.15, direction: 'positive' },
      { feature: 'order_amount_zscore', importance: 0.12, direction: 'positive' },
      { feature: 'customer_tenure_days', importance: 0.10, direction: 'negative' },
      { feature: 'email_domain_risk', importance: 0.08, direction: 'positive' },
      { feature: 'payment_method_risk', importance: 0.07, direction: 'positive' },
      { feature: 'time_of_day_risk', importance: 0.05, direction: 'positive' }
    ],
    risk_scoring: [
      { feature: 'historical_chargeback_rate', importance: 0.22, direction: 'positive' },
      { feature: 'customer_ltv', importance: 0.18, direction: 'negative' },
      { feature: 'order_frequency', importance: 0.14, direction: 'mixed' },
      { feature: 'avg_order_value', importance: 0.12, direction: 'mixed' },
      { feature: 'payment_failures', importance: 0.11, direction: 'positive' },
      { feature: 'account_age', importance: 0.10, direction: 'negative' },
      { feature: 'shipping_address_changes', importance: 0.08, direction: 'positive' },
      { feature: 'promo_code_usage', importance: 0.05, direction: 'positive' }
    ],
    churn_prediction: [
      { feature: 'days_since_last_order', importance: 0.28, direction: 'positive' },
      { feature: 'order_frequency_decline', importance: 0.20, direction: 'positive' },
      { feature: 'support_tickets', importance: 0.15, direction: 'positive' },
      { feature: 'nps_score', importance: 0.12, direction: 'negative' },
      { feature: 'feature_usage_depth', importance: 0.10, direction: 'negative' },
      { feature: 'contract_end_proximity', importance: 0.08, direction: 'positive' },
      { feature: 'competitor_mentions', importance: 0.07, direction: 'positive' }
    ]
  };

  return featureSets[modelType] || featureSets.fraud_detection;
}

// Generate Compliance Report from Audit Logs
async function generateComplianceReport(base44, params) {
  const { report_type, period_days, frameworks } = params;
  const periodDays = period_days || 30;
  const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();

  // Fetch all relevant data
  const auditEvents = await base44.asServiceRole.entities.GovernanceAuditEvent.filter({});
  const modelVersions = await base44.asServiceRole.entities.AIModelVersion.filter({});
  const fairnessAudits = await base44.asServiceRole.entities.ModelFairnessAudit.filter({});
  const dataRegions = await base44.asServiceRole.entities.DataRegion.filter({});
  const complianceEvents = await base44.asServiceRole.entities.RegionalComplianceEvent.filter({});

  // Filter events by period
  const periodEvents = auditEvents.filter(e => new Date(e.created_date) >= periodStart);

  // Model Governance Summary
  const deployedModels = modelVersions.filter(m => m.is_deployed);
  const recentAudits = fairnessAudits.filter(a => new Date(a.audited_at) >= periodStart);
  const compliantAudits = recentAudits.filter(a => a.compliance_status === 'compliant');
  const driftIncidents = periodEvents.filter(e => e.event_type === 'anomaly_detected').length;
  const deployments = periodEvents.filter(e => e.event_type === 'config_change' && e.entity_affected === 'AIModelVersion').length;
  const rollbacks = periodEvents.filter(e => e.change_reason?.includes('rollback')).length;

  const avgFairness = recentAudits.length > 0 
    ? recentAudits.reduce((sum, a) => sum + (a.fairness_score || 0), 0) / recentAudits.length 
    : 0;
  const avgExplainability = recentAudits.length > 0 
    ? recentAudits.reduce((sum, a) => sum + (a.explainability_score || 0), 0) / recentAudits.length 
    : 0;

  // Data Governance Summary
  const activeRegions = dataRegions.filter(r => r.is_active);
  const compliantRegions = activeRegions.filter(r => (r.compliance_score || 0) >= 90);
  const periodComplianceEvents = complianceEvents.filter(e => new Date(e.created_date) >= periodStart);
  const resolvedEvents = periodComplianceEvents.filter(e => e.resolved_status === 'resolved');
  const avgResolutionDays = resolvedEvents.length > 0
    ? resolvedEvents.reduce((sum, e) => {
        const created = new Date(e.created_date);
        const resolved = new Date(e.resolved_at || e.updated_date);
        return sum + (resolved - created) / (1000 * 60 * 60 * 24);
      }, 0) / resolvedEvents.length
    : 0;

  // Audit Events Summary
  const criticalEvents = periodEvents.filter(e => e.severity === 'critical');
  const warningEvents = periodEvents.filter(e => e.severity === 'warning');
  const eventsRequiringReview = periodEvents.filter(e => e.requires_review);
  const reviewedEvents = periodEvents.filter(e => e.reviewed_by);

  // Generate Findings
  const findings = [];
  
  if (avgFairness < FAIRNESS_THRESHOLD) {
    findings.push({
      finding_id: `FIND-${Date.now()}-001`,
      category: 'AI Fairness',
      severity: avgFairness < 50 ? 'high' : 'medium',
      description: `Average model fairness score (${avgFairness.toFixed(1)}) below threshold (${FAIRNESS_THRESHOLD})`,
      affected_systems: deployedModels.map(m => m.model_name),
      remediation_status: 'open',
      remediation_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  if (driftIncidents > 3) {
    findings.push({
      finding_id: `FIND-${Date.now()}-002`,
      category: 'Model Stability',
      severity: driftIncidents > 5 ? 'high' : 'medium',
      description: `${driftIncidents} model drift incidents detected in reporting period`,
      affected_systems: ['AI Model Pipeline'],
      remediation_status: 'in_progress',
      remediation_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  if (compliantRegions.length < activeRegions.length) {
    findings.push({
      finding_id: `FIND-${Date.now()}-003`,
      category: 'Data Sovereignty',
      severity: 'medium',
      description: `${activeRegions.length - compliantRegions.length} regions below compliance threshold`,
      affected_systems: activeRegions.filter(r => (r.compliance_score || 0) < 90).map(r => r.region_code),
      remediation_status: 'open',
      remediation_deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  // Generate Recommendations
  const recommendations = [];
  
  if (avgFairness < 80) {
    recommendations.push({
      priority: 'high',
      recommendation: 'Implement continuous fairness monitoring with automated alerts',
      impact: 'Reduce bias incidents by 40%',
      effort: 'medium'
    });
  }

  if (!recentAudits.some(a => a.explainability_metrics?.shap_values_computed)) {
    recommendations.push({
      priority: 'medium',
      recommendation: 'Deploy SHAP explainer for all production models',
      impact: 'Improve model transparency and regulatory compliance',
      effort: 'high'
    });
  }

  if (avgResolutionDays > 15) {
    recommendations.push({
      priority: 'medium',
      recommendation: 'Automate common data subject request workflows',
      impact: 'Reduce average resolution time by 50%',
      effort: 'medium'
    });
  }

  // Calculate overall compliance score
  const modelGovernanceScore = (compliantAudits.length / Math.max(1, recentAudits.length)) * 100;
  const dataGovernanceScore = (compliantRegions.length / Math.max(1, activeRegions.length)) * 100;
  const auditScore = ((periodEvents.length - criticalEvents.length) / Math.max(1, periodEvents.length)) * 100;
  const overallScore = (modelGovernanceScore * 0.4 + dataGovernanceScore * 0.35 + auditScore * 0.25);

  // Generate executive summary
  const executiveSummary = `During the ${periodDays}-day reporting period, ${deployedModels.length} AI models were in production with an average fairness score of ${avgFairness.toFixed(1)}%. ${driftIncidents} drift incidents were detected. Data governance maintained ${compliantRegions.length}/${activeRegions.length} compliant regions. ${periodComplianceEvents.length} compliance events were processed with an average resolution time of ${avgResolutionDays.toFixed(1)} days. Overall compliance score: ${overallScore.toFixed(0)}%.`;

  // Create the report
  const report = await base44.asServiceRole.entities.ComplianceReport.create({
    report_type: report_type || 'ai_governance',
    report_title: `${report_type === 'comprehensive' ? 'Comprehensive' : 'AI Governance'} Compliance Report - ${periodEnd.toISOString().slice(0, 10)}`,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    frameworks_covered: frameworks || ['AI_GOVERNANCE', 'GDPR', 'SOC2'],
    executive_summary: executiveSummary,
    overall_compliance_score: overallScore,
    model_governance_summary: {
      models_audited: recentAudits.length,
      models_compliant: compliantAudits.length,
      avg_fairness_score: avgFairness,
      avg_explainability_score: avgExplainability,
      drift_incidents: driftIncidents,
      bias_incidents: recentAudits.filter(a => a.violations?.some(v => v.violation_type === 'disparate_impact')).length,
      deployments,
      rollbacks
    },
    data_governance_summary: {
      regions_compliant: compliantRegions.length,
      total_regions: activeRegions.length,
      data_requests_processed: periodComplianceEvents.length,
      avg_request_resolution_days: avgResolutionDays,
      retention_violations: periodComplianceEvents.filter(e => e.event_type === 'retention_enforcement').length,
      cross_region_incidents: 0
    },
    audit_events_summary: {
      total_events: periodEvents.length,
      critical_events: criticalEvents.length,
      warning_events: warningEvents.length,
      events_requiring_review: eventsRequiringReview.length,
      events_reviewed: reviewedEvents.length
    },
    findings,
    recommendations,
    attestations: [
      { control: 'Model Version Control', status: 'compliant', evidence: 'All models tracked with version history' },
      { control: 'Bias Testing', status: recentAudits.length > 0 ? 'compliant' : 'partial', evidence: `${recentAudits.length} fairness audits conducted` },
      { control: 'Data Residency', status: compliantRegions.length === activeRegions.length ? 'compliant' : 'partial', evidence: `${compliantRegions.length}/${activeRegions.length} regions compliant` },
      { control: 'Audit Logging', status: 'compliant', evidence: `${periodEvents.length} events logged` }
    ],
    generated_by: 'ai_model_governance',
    status: 'draft'
  });

  return Response.json({
    success: true,
    report_id: report.id,
    overall_score: overallScore,
    findings_count: findings.length,
    recommendations_count: recommendations.length,
    executive_summary: executiveSummary
  });
}

// Get Fairness Dashboard Data
async function getFairnessDashboard(base44) {
  const audits = await base44.asServiceRole.entities.ModelFairnessAudit.filter({});
  const models = await base44.asServiceRole.entities.AIModelVersion.filter({ is_deployed: true });
  const reports = await base44.asServiceRole.entities.ComplianceReport.filter({});

  // Latest audits per model
  const latestAudits = {};
  for (const audit of audits) {
    if (!latestAudits[audit.model_version_id] || new Date(audit.audited_at) > new Date(latestAudits[audit.model_version_id].audited_at)) {
      latestAudits[audit.model_version_id] = audit;
    }
  }

  const auditsList = Object.values(latestAudits);
  const avgFairness = auditsList.length > 0 ? auditsList.reduce((sum, a) => sum + (a.fairness_score || 0), 0) / auditsList.length : 0;
  const avgExplainability = auditsList.length > 0 ? auditsList.reduce((sum, a) => sum + (a.explainability_score || 0), 0) / auditsList.length : 0;

  // Segment performance heatmap
  const segmentHeatmap = {};
  for (const audit of auditsList) {
    for (const seg of (audit.demographic_segments || [])) {
      if (!segmentHeatmap[seg.segment_name]) {
        segmentHeatmap[seg.segment_name] = { accuracies: [], fprs: [], disparate_impacts: [] };
      }
      segmentHeatmap[seg.segment_name].accuracies.push(seg.accuracy);
      segmentHeatmap[seg.segment_name].fprs.push(seg.false_positive_rate);
      segmentHeatmap[seg.segment_name].disparate_impacts.push(seg.disparate_impact_ratio);
    }
  }

  const segmentSummary = Object.entries(segmentHeatmap).map(([name, data]) => ({
    segment: name,
    avg_accuracy: data.accuracies.reduce((a, b) => a + b, 0) / data.accuracies.length,
    avg_fpr: data.fprs.reduce((a, b) => a + b, 0) / data.fprs.length,
    avg_disparate_impact: data.disparate_impacts.reduce((a, b) => a + b, 0) / data.disparate_impacts.length
  }));

  // All violations
  const allViolations = auditsList.flatMap(a => (a.violations || []).map(v => ({
    ...v,
    model: a.model_name
  })));

  return Response.json({
    dashboard: {
      total_models: models.length,
      models_audited: auditsList.length,
      avg_fairness_score: avgFairness,
      avg_explainability_score: avgExplainability,
      fairness_status: avgFairness >= FAIRNESS_THRESHOLD ? 'compliant' : avgFairness >= 50 ? 'warning' : 'non_compliant',
      segment_summary: segmentSummary,
      violations: allViolations.slice(0, 20),
      critical_violations: allViolations.filter(v => v.severity === 'critical').length,
      recent_reports: reports.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 5).map(r => ({
        id: r.id,
        title: r.report_title,
        score: r.overall_compliance_score,
        status: r.status,
        date: r.created_date
      })),
      model_audits: auditsList.map(a => ({
        model: a.model_name,
        fairness: a.fairness_score,
        explainability: a.explainability_score,
        status: a.compliance_status,
        violations: (a.violations || []).length
      }))
    }
  });
}