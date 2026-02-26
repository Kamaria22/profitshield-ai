/**
 * AI Model Governance - Drift Detection
 * CRITICAL: MUST return level + message in ALL code paths
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const runId = `drift-${Date.now()}`;
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    if (user && user.role !== 'admin') {
      return Response.json({ 
        level: "error",
        message: "Forbidden: Admin access required",
        status: "error"
      }, { status: 403 });
    }

    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (e) {}

    const tenantId = body?.tenant_id ?? null;

    let models = [];
    try {
      models = await base44.asServiceRole.entities.AIModelVersion.filter({ is_deployed: true });
    } catch (e) {
      console.warn('Models fetch failed:', e.message);
    }

    const highDrift = models.filter(m => m.drift_score >= 75).length;
    const highBias = models.filter(m => m.bias_score >= 75).length;
    const hasIssues = highDrift > 0 || highBias > 0;

    // Log telemetry
    try {
      await base44.asServiceRole.entities.ClientTelemetry.create({
        tenant_id: tenantId,
        run_id: runId,
        kind: "AI_MODEL_DRIFT_DETECTION",
        level: hasIssues ? "warn" : "info",
        message: hasIssues ? `Models need attention: drift=${highDrift}, bias=${highBias}` : "All models healthy",
        context_json: { models_checked: models.length, high_drift: highDrift, high_bias: highBias },
      });
    } catch (e) {
      console.error('Telemetry failed:', e.message);
    }

    // Log audit
    try {
      await base44.asServiceRole.entities.GovernanceAuditEvent.create({
        tenant_id: tenantId,
        event_type: "compliance_check",
        entity_affected: "AIModelVersion",
        changed_by: "ai_model_governance",
        level: hasIssues ? "warn" : "info",
        message: hasIssues ? "AI models need attention" : "AI models healthy",
        severity: hasIssues ? "high" : "low",
        requires_review: hasIssues,
      });
    } catch (e) {
      console.error('Audit failed:', e.message);
    }

    // Create alerts
    if (hasIssues) {
      for (const model of models) {
        if (model.drift_score >= 75 || model.bias_score >= 75) {
          try {
            await base44.asServiceRole.entities.Alert.create({
              tenant_id: tenantId,
              type: "system",
              severity: "high",
              title: `AI Model Alert: ${model.model_name}`,
              message: `Drift: ${model.drift_score}, Bias: ${model.bias_score}`,
              entity_type: "AIModelVersion",
              entity_id: model.id,
              status: "pending",
            });
          } catch (e) {
            console.error('Alert failed:', e.message);
          }
        }
      }
    }

    return Response.json({
      level: hasIssues ? "warn" : "info",
      message: hasIssues ? `AI governance: ${highDrift + highBias} models need attention` : "AI governance: All models healthy",
      status: "success",
      data: {
        run_id: runId,
        models_checked: models.length,
        high_drift: highDrift,
        high_bias: highBias,
      }
    });

  } catch (err) {
    console.error('ERROR:', err.message, err.stack);
    
    return Response.json({ 
      level: "error",
      message: `AI governance failed: ${err.message}`,
      status: "error",
      data: { run_id: runId, error: err.message }
    }, { status: 500 });
  }
});