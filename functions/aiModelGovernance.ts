import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Thresholds for model deployment safety
const DRIFT_THRESHOLD = 15;
const BIAS_THRESHOLD = 20;
const MIN_EVALUATION_SCORE = 75;

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

  // Log telemetry
  await base44.asServiceRole.entities.ClientTelemetry.create({
    event_type: 'model_drift_detection',
    event_data: {
      models_checked: models.length,
      drift_events: driftEvents.length,
      retraining_proposals: retrainingProposals.length
    },
    timestamp: new Date().toISOString()
  });

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