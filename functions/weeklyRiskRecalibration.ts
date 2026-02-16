import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Weekly Risk Recalibration Scheduled Job
 * 
 * This function is designed to be run weekly via automation.
 * It triggers the adaptive learning engine to:
 * 1. Recalibrate tenant-specific risk models
 * 2. Update cross-merchant signals
 * 3. Calculate ROI metrics for all tenants
 * 4. Update global moat metrics
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin only for scheduled jobs
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
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

    // Log to audit
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: 'system',
      user_email: 'system@profitshield.ai',
      action_type: 'sync_completed',
      entity_type: 'WeeklyRecalibration',
      details: results
    });

    return Response.json(results);

  } catch (error) {
    console.error('Weekly recalibration error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});