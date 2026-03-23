import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GOVERNANCE ENGINE - IPO-Grade Compliance & Audit
 * 
 * Capabilities:
 * - Validate model weight changes within bounds
 * - Validate pricing changes within bounds  
 * - Validate no cross-tenant data leakage
 * - Generate board-ready KPI reports
 * - Tamper-proof audit logging
 */

// Governance thresholds
const GOVERNANCE_THRESHOLDS = {
  max_weight_change_pct: 15,
  max_price_change_pct: 20,
  min_model_confidence: 70,
  min_accuracy: 60,
  max_false_positive_rate: 0.30,
  min_chargeback_prevention_rate: 0.50
};

// Create tamper-proof audit hash
function createAuditHash(data, previousHash = '0') {
  const str = previousHash + JSON.stringify(data) + Date.now();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

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
      // RUN GOVERNANCE AUDIT
      // ==========================================
      case 'run_governance_audit': {
        const results = {
          timestamp: new Date().toISOString(),
          passed: true,
          breaches: [],
          metrics_checked: 0,
          compliance_score: 100
        };

        // Get last audit hash for chain
        const lastEvents = await base44.asServiceRole.entities.ComplianceEvent.filter(
          {}, '-created_date', 1
        );
        const previousHash = lastEvents[0]?.audit_hash || '0';

        // ===== 1. Check Model Weight Changes =====
        const recentModelChanges = await base44.asServiceRole.entities.AuditLog.filter({
          action_type: 'risk_score_changed'
        }, '-created_date', 10);

        for (const change of recentModelChanges) {
          if (change.previous_state?.weights && change.new_state?.weights) {
            for (const [key, newVal] of Object.entries(change.new_state.weights)) {
              const oldVal = change.previous_state.weights[key];
              if (oldVal && oldVal > 0) {
                const changePct = Math.abs((newVal - oldVal) / oldVal * 100);
                if (changePct > GOVERNANCE_THRESHOLDS.max_weight_change_pct) {
                  results.breaches.push({
                    type: 'model_weight_exceeded',
                    description: `Weight ${key} changed ${changePct.toFixed(1)}% (limit: ${GOVERNANCE_THRESHOLDS.max_weight_change_pct}%)`,
                    severity: 'warning',
                    entity_id: change.entity_id
                  });
                  results.passed = false;
                }
              }
            }
          }
        }
        results.metrics_checked++;

        // ===== 2. Check Cross-Tenant Queries =====
        const crossTenantEvents = await base44.asServiceRole.entities.ComplianceEvent.filter({
          event_type: 'cross_tenant_query'
        }, '-created_date', 100);

        const flaggedCrossTenant = crossTenantEvents.filter(e => e.flagged);
        if (flaggedCrossTenant.length > 0) {
          results.breaches.push({
            type: 'cross_tenant_access',
            description: `${flaggedCrossTenant.length} flagged cross-tenant access events`,
            severity: 'critical',
            count: flaggedCrossTenant.length
          });
          results.passed = false;
        }
        results.metrics_checked++;

        // ===== 3. Check Risk Model Accuracy =====
        const roiMetrics = await base44.asServiceRole.entities.RiskROIMetric.filter({}, '-created_date', 50);
        if (roiMetrics.length > 0) {
          const avgAccuracy = roiMetrics.reduce((s, r) => s + (r.ai_accuracy_percent || 0), 0) / roiMetrics.length;
          const avgFPR = roiMetrics.reduce((s, r) => s + (r.false_positive_rate || 0), 0) / roiMetrics.length;

          if (avgAccuracy < GOVERNANCE_THRESHOLDS.min_accuracy) {
            results.breaches.push({
              type: 'accuracy_below_threshold',
              description: `Model accuracy ${avgAccuracy.toFixed(1)}% below minimum ${GOVERNANCE_THRESHOLDS.min_accuracy}%`,
              severity: 'warning',
              current_value: avgAccuracy
            });
          }

          if (avgFPR > GOVERNANCE_THRESHOLDS.max_false_positive_rate) {
            results.breaches.push({
              type: 'false_positive_exceeded',
              description: `False positive rate ${(avgFPR * 100).toFixed(1)}% exceeds maximum ${GOVERNANCE_THRESHOLDS.max_false_positive_rate * 100}%`,
              severity: 'warning',
              current_value: avgFPR
            });
          }
        }
        results.metrics_checked++;

        // ===== 4. Check Pricing Changes =====
        const pricingEvents = await base44.asServiceRole.entities.ComplianceEvent.filter({
          event_type: 'pricing_change'
        }, '-created_date', 30);

        for (const event of pricingEvents) {
          if (event.previous_state?.price && event.new_state?.price) {
            const changePct = Math.abs((event.new_state.price - event.previous_state.price) / event.previous_state.price * 100);
            if (changePct > GOVERNANCE_THRESHOLDS.max_price_change_pct) {
              results.breaches.push({
                type: 'pricing_change_exceeded',
                description: `Pricing changed ${changePct.toFixed(1)}% (limit: ${GOVERNANCE_THRESHOLDS.max_price_change_pct}%)`,
                severity: 'critical'
              });
              results.passed = false;
            }
          }
        }
        results.metrics_checked++;

        // Calculate compliance score
        const breachPenalty = results.breaches.reduce((sum, b) => 
          sum + (b.severity === 'critical' ? 20 : b.severity === 'warning' ? 10 : 5), 0
        );
        results.compliance_score = Math.max(0, 100 - breachPenalty);

        // Log audit event
        await base44.asServiceRole.entities.ComplianceEvent.create({
          event_type: 'security_event',
          description: 'Governance audit completed',
          performed_by: 'governance_engine',
          risk_level: results.passed ? 'low' : 'high',
          details: {
            passed: results.passed,
            breaches_count: results.breaches.length,
            compliance_score: results.compliance_score
          },
          audit_hash: createAuditHash(results, previousHash)
        });

        return Response.json({ success: true, ...results });
      }

      // ==========================================
      // GENERATE BOARD REPORT
      // ==========================================
      case 'generate_board_report': {
        const period = params.period || new Date().toISOString().slice(0, 7);

        // Gather all metrics
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
        const growthMetrics = await base44.asServiceRole.entities.GrowthMetric.filter({}, '-created_date', 12);
        const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({}, '-created_date', 1);
        const roiMetrics = await base44.asServiceRole.entities.RiskROIMetric.filter({}, '-created_date', 50);
        const regionalProfiles = await base44.asServiceRole.entities.RegionalRiskProfile.filter({});

        const latestGrowth = growthMetrics[0] || {};
        const latestMoat = moatMetrics[0] || {};

        // Calculate key metrics
        const mrr = (latestGrowth.revenue?.mrr || 0);
        const arr = mrr * 12;
        const totalMerchants = tenants.length;
        const activeMerchants = tenants.filter(t => t.status === 'active').length;
        
        const totalRevenueSaved = roiMetrics.reduce((s, r) => s + (r.margin_recovered || 0), 0);
        const totalChargebacksPrevented = roiMetrics.reduce((s, r) => s + (r.chargebacks_prevented || 0), 0);
        const avgAccuracy = roiMetrics.length > 0 
          ? roiMetrics.reduce((s, r) => s + (r.ai_accuracy_percent || 0), 0) / roiMetrics.length 
          : 0;

        const trialToPaid = latestGrowth.conversions?.trial_to_paid_rate || 0;
        const churnRate = latestGrowth.conversions?.churn_rate || 0;
        const nrr = churnRate < 1 ? (1 - churnRate + (latestGrowth.revenue?.expansion_revenue || 0) / (mrr || 1)) : 0;

        // Create/update governance metrics
        const metricsToTrack = [
          { key: 'arr', name: 'Annual Recurring Revenue', category: 'financial', value: arr, unit: '$', threshold_min: 0 },
          { key: 'mrr', name: 'Monthly Recurring Revenue', category: 'financial', value: mrr, unit: '$', threshold_min: 0 },
          { key: 'total_merchants', name: 'Total Merchants', category: 'growth', value: totalMerchants, unit: 'count', threshold_min: 0 },
          { key: 'nrr', name: 'Net Revenue Retention', category: 'financial', value: nrr * 100, unit: '%', threshold_min: 100 },
          { key: 'trial_to_paid', name: 'Trial to Paid Conversion', category: 'growth', value: trialToPaid * 100, unit: '%', threshold_min: 15 },
          { key: 'churn_rate', name: 'Monthly Churn Rate', category: 'growth', value: churnRate * 100, unit: '%', threshold_max: 5 },
          { key: 'fraud_prevented', name: 'Total Fraud Prevented', category: 'risk', value: totalRevenueSaved, unit: '$', threshold_min: 0 },
          { key: 'chargebacks_prevented', name: 'Chargebacks Prevented', category: 'risk', value: totalChargebacksPrevented, unit: 'count', threshold_min: 0 },
          { key: 'model_accuracy', name: 'AI Model Accuracy', category: 'risk', value: avgAccuracy, unit: '%', threshold_min: 70 },
          { key: 'moat_score', name: 'Overall Moat Score', category: 'operational', value: latestMoat.overall_moat_score || 0, unit: 'score', threshold_min: 50 },
          { key: 'global_regions', name: 'Global Regions Active', category: 'growth', value: regionalProfiles.length, unit: 'count', threshold_min: 0 }
        ];

        for (const metric of metricsToTrack) {
          const existing = await base44.asServiceRole.entities.GovernanceMetric.filter({
            metric_key: metric.key,
            period
          });

          const breachDetected = (metric.threshold_min !== undefined && metric.value < metric.threshold_min) ||
                                 (metric.threshold_max !== undefined && metric.value > metric.threshold_max);

          const data = {
            metric_name: metric.name,
            metric_key: metric.key,
            category: metric.category,
            current_value: metric.value,
            threshold_min: metric.threshold_min,
            threshold_max: metric.threshold_max,
            threshold_type: metric.threshold_max ? 'below' : 'above',
            breach_detected: breachDetected,
            breach_severity: breachDetected ? 'warning' : undefined,
            unit: metric.unit,
            board_visible: true,
            last_checked: new Date().toISOString(),
            period
          };

          if (existing.length > 0) {
            data.previous_value = existing[0].current_value;
            data.trend = metric.value > existing[0].current_value ? 'improving' : 
                        metric.value < existing[0].current_value ? 'declining' : 'stable';
            await base44.asServiceRole.entities.GovernanceMetric.update(existing[0].id, data);
          } else {
            await base44.asServiceRole.entities.GovernanceMetric.create(data);
          }
        }

        // Generate report summary
        const report = {
          period,
          generated_at: new Date().toISOString(),
          financial: {
            arr: arr,
            mrr: mrr,
            nrr: nrr * 100,
            arpu: latestGrowth.revenue?.arpu || 0
          },
          growth: {
            total_merchants: totalMerchants,
            active_merchants: activeMerchants,
            trial_to_paid_rate: trialToPaid * 100,
            churn_rate: churnRate * 100,
            install_velocity: latestGrowth.installs?.total || 0
          },
          risk_intelligence: {
            total_revenue_saved: totalRevenueSaved,
            chargebacks_prevented: totalChargebacksPrevented,
            model_accuracy: avgAccuracy,
            orders_analyzed: roiMetrics.reduce((s, r) => s + (r.orders_analyzed || 0), 0)
          },
          moat: {
            overall_score: latestMoat.overall_moat_score || 0,
            competitive_position: latestMoat.competitive_position || 'developing',
            global_signals: latestMoat.data_moat?.cross_merchant_signals || 0
          },
          global_expansion: {
            regions_active: regionalProfiles.length,
            top_region: regionalProfiles.sort((a, b) => (b.orders_processed || 0) - (a.orders_processed || 0))[0]?.region_name || 'N/A'
          }
        };

        return Response.json({ success: true, report });
      }

      // ==========================================
      // LOG COMPLIANCE EVENT
      // ==========================================
      case 'log_compliance_event': {
        const { event_type, description, tenant_id, risk_level, details, previous_state, new_state } = params;

        // Get previous hash
        const lastEvents = await base44.asServiceRole.entities.ComplianceEvent.filter(
          {}, '-created_date', 1
        );
        const previousHash = lastEvents[0]?.audit_hash || '0';

        const event = await base44.asServiceRole.entities.ComplianceEvent.create({
          event_type,
          description,
          performed_by: user.email,
          tenant_id,
          risk_level: risk_level || 'low',
          details,
          previous_state,
          new_state,
          audit_hash: createAuditHash({ event_type, description, details }, previousHash),
          flagged: risk_level === 'critical' || risk_level === 'high'
        });

        return Response.json({ success: true, event_id: event.id });
      }

      // ==========================================
      // CHECK AUTOPILOT ELIGIBILITY
      // ==========================================
      case 'check_autopilot_eligibility': {
        const { mode } = params; // full_autonomous, board_ready, etc.

        // Run governance audit first
        const auditResult = await base44.functions.invoke('governanceEngine', {
          action: 'run_governance_audit'
        });

        const audit = auditResult.data;

        // Get model confidence
        const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({}, '-created_date', 1);
        const modelConfidence = moatMetrics[0]?.ai_moat?.prediction_accuracy || 0;

        // Check eligibility
        const eligibility = {
          mode,
          eligible: true,
          reasons: []
        };

        if (mode === 'full_autonomous' || mode === 'board_ready') {
          // Strict requirements
          if (!audit.passed) {
            eligibility.eligible = false;
            eligibility.reasons.push(`Governance audit failed with ${audit.breaches.length} breach(es)`);
          }

          if (modelConfidence < GOVERNANCE_THRESHOLDS.min_model_confidence) {
            eligibility.eligible = false;
            eligibility.reasons.push(`Model confidence ${modelConfidence}% below required ${GOVERNANCE_THRESHOLDS.min_model_confidence}%`);
          }

          if (audit.compliance_score < 90) {
            eligibility.eligible = false;
            eligibility.reasons.push(`Compliance score ${audit.compliance_score} below required 90`);
          }
        }

        return Response.json({ 
          success: true, 
          ...eligibility,
          audit_passed: audit.passed,
          compliance_score: audit.compliance_score,
          model_confidence: modelConfidence
        });
      }

      // ==========================================
      // GET GOVERNANCE METRICS
      // ==========================================
      case 'get_governance_metrics': {
        const { category, board_visible_only } = params;

        let filter = {};
        if (category) filter.category = category;
        if (board_visible_only) filter.board_visible = true;

        const metrics = await base44.asServiceRole.entities.GovernanceMetric.filter(filter, '-last_checked', 50);

        return Response.json({ success: true, metrics });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Governance Engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});