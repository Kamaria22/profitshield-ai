import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PLATFORM LOCK-IN ARCHITECTURE
 * 
 * Calculate and track lock-in metrics:
 * - Embedded workflow depth
 * - Data compounding dependency
 * - Network dependence
 * - Economic lock factors
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      // ==========================================
      // CALCULATE LOCK-IN INDEX FOR ALL TENANTS
      // ==========================================
      case 'calculate_all': {
        const results = {
          timestamp: new Date().toISOString(),
          tenants_analyzed: 0,
          avg_lock_in_index: 0,
          high_lock_in_count: 0,
          at_risk_count: 0
        };

        const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
        let totalLockIn = 0;

        for (const tenant of tenants) {
          // Get tenant data
          const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenant.id });
          const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenant.id }, '-order_date', 100);
          const alerts = await base44.asServiceRole.entities.Alert.filter({ tenant_id: tenant.id });
          const roiMetrics = await base44.asServiceRole.entities.RiskROIMetric.filter({ tenant_id: tenant.id }, '-created_date', 3);
          const trustScores = await base44.asServiceRole.entities.NetworkTrustScore.filter({ tenant_id: tenant.id });

          // Calculate lock-in components
          
          // 1. Integrations depth (0-100)
          const integrationsCount = integrations.filter(i => i.status === 'connected').length;
          const integrationsScore = Math.min(100, integrationsCount * 25);

          // 2. Workflow embedding (automations, alerts, rules)
          const automationsEnabled = alerts.filter(a => a.auto_generated).length;
          const workflowScore = Math.min(100, automationsEnabled * 10 + (tenant.settings?.alert_rules?.length || 0) * 15);

          // 3. Fraud accuracy dependency
          const avgAccuracy = roiMetrics.length > 0 
            ? roiMetrics.reduce((s, r) => s + (r.ai_accuracy_percent || 0), 0) / roiMetrics.length 
            : 50;
          const fraudDependencyScore = avgAccuracy; // Higher accuracy = higher dependency

          // 4. API usage depth (based on orders processed)
          const apiDepth = Math.min(100, orders.length);

          // 5. Historical model training dependency
          const modelDependency = Math.min(100, orders.length / 10 + (tenant.profit_integrity_score || 0));

          // 6. Network tier benefits
          const networkTier = trustScores[0]?.trust_tier || 'bronze';
          const tierScores = { bronze: 20, silver: 40, gold: 70, platinum: 100 };
          const networkScore = tierScores[networkTier] || 20;

          // 7. Economic lock (based on value delivered)
          const totalSaved = roiMetrics.reduce((s, r) => s + (r.margin_recovered || 0), 0);
          const economicScore = Math.min(100, totalSaved / 100);

          // Calculate composite lock-in index
          const lockInIndex = (
            integrationsScore * 0.15 +
            workflowScore * 0.20 +
            fraudDependencyScore * 0.20 +
            apiDepth * 0.10 +
            modelDependency * 0.15 +
            networkScore * 0.10 +
            economicScore * 0.10
          );

          // Estimate switching cost in months of ROI
          const monthlyValue = totalSaved / 3; // Avg over 3 months
          const switchingCostMonths = monthlyValue > 0 ? Math.round(lockInIndex / 10 * 1.5) : 0;

          // Determine churn risk (inverse of lock-in)
          const churnRisk = lockInIndex > 70 ? 'very_low' :
                          lockInIndex > 50 ? 'low' :
                          lockInIndex > 30 ? 'medium' :
                          lockInIndex > 15 ? 'high' : 'critical';

          // Update/create lock-in signal
          const existingSignal = await base44.asServiceRole.entities.LockInSignal.filter({ tenant_id: tenant.id });

          const signalData = {
            tenant_id: tenant.id,
            tenant_name: tenant.shop_name || tenant.shop_domain,
            integrations_count: integrationsCount,
            automations_enabled: automationsEnabled,
            fraud_accuracy_dependency_score: fraudDependencyScore,
            workflow_embedding_score: workflowScore,
            api_usage_depth: apiDepth,
            historical_model_training_dependency: modelDependency,
            network_tier: networkTier,
            cdnp_contribution_score: trustScores[0]?.contribution_quality || 0,
            economic_lock_score: economicScore,
            lock_in_index: lockInIndex,
            switching_cost_months: switchingCostMonths,
            churn_risk: churnRisk,
            last_calculated: new Date().toISOString()
          };

          if (existingSignal.length > 0) {
            await base44.asServiceRole.entities.LockInSignal.update(existingSignal[0].id, signalData);
          } else {
            await base44.asServiceRole.entities.LockInSignal.create(signalData);
          }

          totalLockIn += lockInIndex;
          results.tenants_analyzed++;
          if (lockInIndex > 60) results.high_lock_in_count++;
          if (churnRisk === 'high' || churnRisk === 'critical') results.at_risk_count++;
        }

        results.avg_lock_in_index = results.tenants_analyzed > 0 ? totalLockIn / results.tenants_analyzed : 0;

        return Response.json({ success: true, ...results });
      }

      // ==========================================
      // GET LOCK-IN DASHBOARD DATA
      // ==========================================
      case 'get_dashboard': {
        const signals = await base44.asServiceRole.entities.LockInSignal.filter({}, '-lock_in_index', 50);

        // Aggregate stats
        const totalTenants = signals.length;
        const avgLockIn = signals.length > 0 
          ? signals.reduce((s, sig) => s + sig.lock_in_index, 0) / signals.length 
          : 0;

        const riskDistribution = {
          very_low: signals.filter(s => s.churn_risk === 'very_low').length,
          low: signals.filter(s => s.churn_risk === 'low').length,
          medium: signals.filter(s => s.churn_risk === 'medium').length,
          high: signals.filter(s => s.churn_risk === 'high').length,
          critical: signals.filter(s => s.churn_risk === 'critical').length
        };

        const tierDistribution = {
          bronze: signals.filter(s => s.network_tier === 'bronze').length,
          silver: signals.filter(s => s.network_tier === 'silver').length,
          gold: signals.filter(s => s.network_tier === 'gold').length,
          platinum: signals.filter(s => s.network_tier === 'platinum').length
        };

        return Response.json({
          success: true,
          dashboard: {
            total_tenants: totalTenants,
            avg_lock_in_index: avgLockIn,
            risk_distribution: riskDistribution,
            tier_distribution: tierDistribution,
            top_locked_in: signals.slice(0, 10),
            at_risk: signals.filter(s => s.churn_risk === 'high' || s.churn_risk === 'critical')
          }
        });
      }

      // ==========================================
      // GET TENANT LOCK-IN DETAILS
      // ==========================================
      case 'get_tenant_details': {
        const { tenant_id } = params;

        const signals = await base44.asServiceRole.entities.LockInSignal.filter({ tenant_id });
        
        if (!signals.length) {
          return Response.json({ error: 'Tenant not found' }, { status: 404 });
        }

        return Response.json({ success: true, lock_in: signals[0] });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Lock-In Calculator error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});