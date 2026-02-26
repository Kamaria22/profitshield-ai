/**
 * Automated Model Deployment - CI/CD pipeline for ML models
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { model_id, deployment_config = {} } = body;

    // Pre-deployment validation
    const model = await base44.entities.AIModelVersion.get(model_id);
    
    const validationResults = {
      compliance_check: model.compliance_status === 'approved',
      drift_check: model.drift_score < 75,
      bias_check: model.bias_score < 75,
      performance_check: model.precision >= 0.80 && model.f1_score >= 0.75,
    };

    const allChecksPassed = Object.values(validationResults).every(v => v);

    if (!allChecksPassed) {
      await base44.entities.GovernanceAuditEvent.create({
        event_type: 'deployment_blocked',
        entity_affected: 'AIModelVersion',
        entity_id: model_id,
        level: 'warn',
        message: `Deployment blocked for ${model.model_name}: validation failed`,
        changed_by: user.email,
        severity: 'high',
        requires_review: true,
      });

      return Response.json({
        ok: false,
        error: 'Deployment validation failed',
        validation_results: validationResults,
      }, { status: 400 });
    }

    // Start deployment process
    await base44.entities.GovernanceAuditEvent.create({
      event_type: 'deployment_started',
      entity_affected: 'AIModelVersion',
      entity_id: model_id,
      level: 'info',
      message: `Starting deployment for ${model.model_name} v${model.version}`,
      changed_by: user.email,
    });

    // Canary deployment (simulate gradual rollout)
    const deploymentStages = [
      { stage: 'canary', traffic_percentage: 5, duration_seconds: 60 },
      { stage: 'staging', traffic_percentage: 25, duration_seconds: 120 },
      { stage: 'production', traffic_percentage: 100, duration_seconds: 0 },
    ];

    const deploymentLog = [];

    for (const stage of deploymentStages) {
      deploymentLog.push({
        stage: stage.stage,
        started_at: new Date().toISOString(),
        traffic: stage.traffic_percentage,
        status: 'completed',
      });

      if (stage.stage === 'production') {
        // Undeploy old models
        const oldModels = await base44.entities.AIModelVersion.filter({
          model_name: model.model_name,
          is_deployed: true,
        });

        for (const old of oldModels) {
          await base44.entities.AIModelVersion.update(old.id, {
            is_deployed: false,
            is_rollback_target: true,
          });
        }

        // Deploy new model
        await base44.entities.AIModelVersion.update(model_id, {
          is_deployed: true,
          deployed_at: new Date().toISOString(),
        });
      }
    }

    // Create success audit event
    await base44.entities.GovernanceAuditEvent.create({
      event_type: 'deployment_completed',
      entity_affected: 'AIModelVersion',
      entity_id: model_id,
      level: 'info',
      message: `Successfully deployed ${model.model_name} v${model.version}`,
      changed_by: user.email,
      severity: 'high',
    });

    // Create success alert
    await base44.entities.Alert.create({
      type: 'system',
      severity: 'low',
      title: 'Model Deployed Successfully',
      message: `${model.model_name} v${model.version} is now in production`,
      entity_type: 'AIModelVersion',
      entity_id: model_id,
      status: 'reviewed',
      metadata: {
        deployment_stages: deploymentLog,
        validation_results: validationResults,
      },
    });

    return Response.json({
      ok: true,
      model_id,
      model_name: model.model_name,
      version: model.version,
      validation_results: validationResults,
      deployment_log: deploymentLog,
      deployed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Automated deployment error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});