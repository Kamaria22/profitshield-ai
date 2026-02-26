/**
 * Model Performance Monitor - Automated alerting for model degradation
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const ALERT_THRESHOLDS = {
  drift: {
    critical: 90,
    high: 75,
    medium: 50,
  },
  bias: {
    critical: 90,
    high: 75,
    medium: 50,
  },
  precision: {
    critical: 0.60,
    high: 0.70,
    medium: 0.80,
  },
  f1_score: {
    critical: 0.65,
    high: 0.75,
    medium: 0.85,
  },
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    // Allow scheduled automations
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'check_performance') {
      // Get all deployed models
      const deployedModels = await base44.asServiceRole.entities.AIModelVersion.filter({
        is_deployed: true,
      });

      const alerts = [];
      const findings = [];

      for (const model of deployedModels) {
        const issues = [];

        // Check drift
        if (model.drift_score >= ALERT_THRESHOLDS.drift.critical) {
          issues.push({ type: 'drift', severity: 'critical', value: model.drift_score });
        } else if (model.drift_score >= ALERT_THRESHOLDS.drift.high) {
          issues.push({ type: 'drift', severity: 'high', value: model.drift_score });
        } else if (model.drift_score >= ALERT_THRESHOLDS.drift.medium) {
          issues.push({ type: 'drift', severity: 'medium', value: model.drift_score });
        }

        // Check bias
        if (model.bias_score >= ALERT_THRESHOLDS.bias.critical) {
          issues.push({ type: 'bias', severity: 'critical', value: model.bias_score });
        } else if (model.bias_score >= ALERT_THRESHOLDS.bias.high) {
          issues.push({ type: 'bias', severity: 'high', value: model.bias_score });
        } else if (model.bias_score >= ALERT_THRESHOLDS.bias.medium) {
          issues.push({ type: 'bias', severity: 'medium', value: model.bias_score });
        }

        // Check precision (low is bad)
        if (model.precision && model.precision < ALERT_THRESHOLDS.precision.critical) {
          issues.push({ type: 'precision', severity: 'critical', value: model.precision });
        } else if (model.precision && model.precision < ALERT_THRESHOLDS.precision.high) {
          issues.push({ type: 'precision', severity: 'high', value: model.precision });
        } else if (model.precision && model.precision < ALERT_THRESHOLDS.precision.medium) {
          issues.push({ type: 'precision', severity: 'medium', value: model.precision });
        }

        // Check F1 score (low is bad)
        if (model.f1_score && model.f1_score < ALERT_THRESHOLDS.f1_score.critical) {
          issues.push({ type: 'f1_score', severity: 'critical', value: model.f1_score });
        } else if (model.f1_score && model.f1_score < ALERT_THRESHOLDS.f1_score.high) {
          issues.push({ type: 'f1_score', severity: 'high', value: model.f1_score });
        } else if (model.f1_score && model.f1_score < ALERT_THRESHOLDS.f1_score.medium) {
          issues.push({ type: 'f1_score', severity: 'medium', value: model.f1_score });
        }

        if (issues.length > 0) {
          findings.push({ model, issues });

          // Create alerts for critical and high severity issues
          for (const issue of issues) {
            if (issue.severity === 'critical' || issue.severity === 'high') {
              const alert = await base44.asServiceRole.entities.Alert.create({
                type: 'system',
                severity: issue.severity,
                title: `AI Model ${issue.type} alert`,
                message: `Model ${model.model_name} v${model.version} has ${issue.type} score of ${issue.value}`,
                entity_type: 'AIModelVersion',
                entity_id: model.id,
                recommended_action: issue.severity === 'critical' 
                  ? 'Immediate retraining required' 
                  : 'Schedule retraining',
                status: 'pending',
                metadata: {
                  model_id: model.id,
                  model_name: model.model_name,
                  version: model.version,
                  issue_type: issue.type,
                  threshold_breached: issue.value,
                },
              });

              alerts.push(alert);

              // Log governance event
              await base44.asServiceRole.entities.GovernanceAuditEvent.create({
                event_type: 'model_performance_alert',
                entity_affected: 'AIModelVersion',
                entity_id: model.id,
                level: issue.severity === 'critical' ? 'error' : 'warn',
                message: `Performance alert: ${model.model_name} ${issue.type} = ${issue.value}`,
                changed_by: 'model_performance_monitor',
                severity: issue.severity,
                requires_review: true,
              });
            }
          }
        }
      }

      return Response.json({
        ok: true,
        checked: deployedModels.length,
        findings: findings.length,
        alerts_created: alerts.length,
        details: findings.map(f => ({
          model: `${f.model.model_name} v${f.model.version}`,
          issues: f.issues,
        })),
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Model performance monitor error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});