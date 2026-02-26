/**
 * Model Retraining Workflow - Automated ML model retraining and deployment
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
    const { action, model_id, model_name, version, config } = body;

    switch (action) {
      case 'propose_retraining': {
        // Create a retraining proposal
        const model = await base44.entities.AIModelVersion.get(model_id);
        
        const experiment = await base44.entities.ModelExperiment.create({
          model_name: model.model_name,
          experiment_type: 'retraining',
          status: 'proposed',
          parent_version_id: model_id,
          reason: `Automated retraining due to drift=${model.drift_score}, bias=${model.bias_score}`,
          proposed_by: user.email,
          config: {
            training_window_days: config?.training_window_days || 90,
            validation_split: config?.validation_split || 0.2,
            target_metrics: {
              min_precision: 0.85,
              min_recall: 0.80,
              max_bias: 30,
              max_drift: 40,
            },
          },
        });

        await base44.entities.GovernanceAuditEvent.create({
          event_type: 'model_retraining_proposed',
          entity_affected: 'AIModelVersion',
          entity_id: model_id,
          level: 'info',
          message: `Retraining proposed for ${model.model_name}`,
          changed_by: user.email,
          requires_review: true,
        });

        return Response.json({ ok: true, experiment });
      }

      case 'start_retraining': {
        // Start the retraining process
        const experiment = await base44.entities.ModelExperiment.get(model_id);
        
        await base44.entities.ModelExperiment.update(experiment.id, {
          status: 'training',
          started_at: new Date().toISOString(),
        });

        // Simulate training process - in production, this would trigger actual ML pipeline
        const newVersion = await base44.entities.AIModelVersion.create({
          model_name: experiment.model_name,
          version: `${version || '2.0'}-retrain-${Date.now()}`,
          model_type: 'fraud_detection',
          training_sample_size: Math.floor(Math.random() * 10000) + 50000,
          evaluation_score: 85 + Math.random() * 10,
          precision: 0.85 + Math.random() * 0.1,
          recall: 0.80 + Math.random() * 0.15,
          f1_score: 0.82 + Math.random() * 0.12,
          bias_score: 15 + Math.random() * 20,
          drift_score: 10 + Math.random() * 25,
          compliance_status: 'pending_review',
          parent_version_id: experiment.parent_version_id,
          changelog: 'Automated retraining to address drift/bias',
        });

        await base44.entities.ModelExperiment.update(experiment.id, {
          status: 'completed',
          result_version_id: newVersion.id,
          completed_at: new Date().toISOString(),
        });

        return Response.json({ ok: true, newVersion, experiment });
      }

      case 'deploy_model': {
        // Deploy a newly trained model
        const newModel = await base44.entities.AIModelVersion.get(model_id);
        
        // Mark old models as not deployed
        const oldModels = await base44.entities.AIModelVersion.filter({
          model_name: newModel.model_name,
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
          compliance_status: 'approved',
        });

        await base44.entities.GovernanceAuditEvent.create({
          event_type: 'model_deployed',
          entity_affected: 'AIModelVersion',
          entity_id: model_id,
          level: 'info',
          message: `Model ${newModel.model_name} v${newModel.version} deployed`,
          changed_by: user.email,
          severity: 'high',
        });

        return Response.json({ ok: true, deployed: newModel });
      }

      case 'rollback': {
        // Rollback to previous version
        const rollbackTargets = await base44.entities.AIModelVersion.filter({
          model_name: model_name,
          is_rollback_target: true,
        });

        if (rollbackTargets.length === 0) {
          return Response.json({ error: 'No rollback target available' }, { status: 400 });
        }

        const target = rollbackTargets[0];
        
        // Undeploy current
        const current = await base44.entities.AIModelVersion.filter({
          model_name: model_name,
          is_deployed: true,
        });

        for (const c of current) {
          await base44.entities.AIModelVersion.update(c.id, {
            is_deployed: false,
            deprecated_at: new Date().toISOString(),
          });
        }

        // Redeploy target
        await base44.entities.AIModelVersion.update(target.id, {
          is_deployed: true,
          is_rollback_target: false,
          deployed_at: new Date().toISOString(),
        });

        await base44.entities.GovernanceAuditEvent.create({
          event_type: 'model_rollback',
          entity_affected: 'AIModelVersion',
          entity_id: target.id,
          level: 'warn',
          message: `Rolled back to ${target.model_name} v${target.version}`,
          changed_by: user.email,
          severity: 'high',
        });

        return Response.json({ ok: true, rolledBack: target });
      }

      case 'get_explainability': {
        // Get model explainability data
        const model = await base44.entities.AIModelVersion.get(model_id);
        
        // Generate SHAP-like feature importance (simulated)
        const features = [
          { name: 'Transaction Amount', importance: 0.28, trend: 'increasing' },
          { name: 'Customer History', importance: 0.22, trend: 'stable' },
          { name: 'IP Reputation', importance: 0.18, trend: 'increasing' },
          { name: 'Device Fingerprint', importance: 0.15, trend: 'stable' },
          { name: 'Time of Day', importance: 0.10, trend: 'decreasing' },
          { name: 'Geographic Location', importance: 0.07, trend: 'stable' },
        ];

        const decisionPaths = [
          {
            rule: 'High Transaction Amount (>$500)',
            threshold: 500,
            impact: 0.35,
            direction: 'increase_risk',
          },
          {
            rule: 'New Customer (<30 days)',
            threshold: 30,
            impact: 0.25,
            direction: 'increase_risk',
          },
          {
            rule: 'Known Good IP',
            threshold: null,
            impact: -0.20,
            direction: 'decrease_risk',
          },
        ];

        return Response.json({
          ok: true,
          model_id,
          model_name: model.model_name,
          version: model.version,
          feature_importance: features,
          decision_paths: decisionPaths,
          global_metrics: {
            bias_score: model.bias_score,
            drift_score: model.drift_score,
            precision: model.precision,
            recall: model.recall,
          },
        });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Model retraining error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});