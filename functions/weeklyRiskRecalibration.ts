import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  let level = "info";
  let message = "Initializing";
  let status = "success";
  let data = {};

  try {
    const base44 = createClientFromRequest(req);
    
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      user = null;
    }
    
    if (user && user.role !== 'admin') {
      level = "error";
      message = "Admin access required";
      status = "error";
      return Response.json({ level, message, status, data }, { status: 403 });
    }

    const results = {
      started_at: new Date().toISOString(),
      steps: [],
      errors: []
    };

    // Step 1: Update cross-merchant signals
    try {
      const signalResult = await base44.functions.invoke('adaptiveLearning', {
        action: 'update_cross_merchant_signals',
        signal_type: 'all',
        days: 90
      });
      results.steps.push({
        step: 'cross_merchant_signals',
        success: signalResult.data?.success,
        signals_created: signalResult.data?.signals_created || 0
      });
    } catch (err) {
      results.errors.push({ step: 'cross_merchant_signals', error: err.message });
    }

    // Step 2: Run weekly recalibration for all tenants
    try {
      const recalResult = await base44.functions.invoke('adaptiveLearning', {
        action: 'weekly_risk_recalibration'
      });
      results.steps.push({
        step: 'tenant_recalibration',
        success: recalResult.data?.success,
        tenants_processed: recalResult.data?.tenants_processed || 0,
        models_updated: recalResult.data?.models_updated || 0
      });
    } catch (err) {
      results.errors.push({ step: 'tenant_recalibration', error: err.message });
    }

    // Step 3: Calculate ROI metrics for each active tenant
    try {
      const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
      let roiCalculated = 0;

      for (const tenant of tenants) {
        try {
          await base44.functions.invoke('adaptiveLearning', {
            action: 'calculate_risk_roi',
            tenant_id: tenant.id,
            period_type: 'monthly'
          });
          roiCalculated++;
        } catch (tenantErr) {
          results.errors.push({ 
            step: 'roi_calculation', 
            tenant_id: tenant.id, 
            error: tenantErr.message 
          });
        }
      }

      results.steps.push({
        step: 'roi_calculation',
        success: true,
        tenants_processed: roiCalculated
      });
    } catch (err) {
      results.errors.push({ step: 'roi_calculation', error: err.message });
    }

    // Step 4: Generate founder insight if significant changes
    const modelsUpdated = results.steps.find(s => s.step === 'tenant_recalibration')?.models_updated || 0;
    const signalsCreated = results.steps.find(s => s.step === 'cross_merchant_signals')?.signals_created || 0;

    if (modelsUpdated > 0 || signalsCreated > 0) {
      try {
        await base44.asServiceRole.entities.FounderInsight.create({
          insight_type: 'system_health',
          title: 'Weekly Risk Model Recalibration Complete',
          summary: `Updated ${modelsUpdated} tenant models and created ${signalsCreated} new cross-merchant signals.`,
          severity: 'info',
          impact_score: modelsUpdated * 10 + signalsCreated * 5,
          confidence: 0.95,
          recommendations: [
            {
              action: 'Review model performance in Founder Dashboard',
              priority: 'medium',
              estimated_impact: 'Improved risk detection accuracy'
            }
          ],
          data_sources: ['OrderOutcome', 'TenantRiskModel', 'CrossMerchantSignal']
        });
        results.steps.push({ step: 'founder_insight', success: true });
      } catch (err) {
        results.errors.push({ step: 'founder_insight', error: err.message });
      }
    }

    results.finished_at = new Date().toISOString();
    results.success = results.errors.length === 0;

    // Log to audit with required fields
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: 'system',
        performed_by: 'system@profitshield.ai',
        action: 'weekly_risk_recalibration',
        entity_type: 'WeeklyRecalibration',
        description: 'Weekly risk model recalibration completed',
        changes: results
      });
    } catch (auditErr) {
      results.errors.push({ step: 'audit_log', error: auditErr.message });
    }

    level = results.success ? "info" : "warn";
    message = `Recalibration: ${results.steps.length} steps completed, ${results.errors.length} errors`;
    data = results;

    return Response.json({ level, message, status, data });

  } catch (error) {
    level = "error";
    message = `Execution failed: ${error.message}`;
    status = "error";
    data = { error: error.message };
    return Response.json({ level, message, status, data }, { status: 500 });
  }
});