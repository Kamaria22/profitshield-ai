import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AI CAPITAL ALLOCATION ENGINE
 * 
 * Automatically decides where to invest resources for maximum enterprise value:
 * - Pull ARR, churn, CAC, LTV metrics
 * - Detect highest ROI growth lever
 * - Recommend capital shifts
 * - Simulate 12/24/36 month outcomes
 */

// Allocation type configurations
const ALLOCATION_CONFIGS = {
  feature_dev: { base_roi: 150, risk_base: 30, time_to_impact: 6 },
  marketing: { base_roi: 120, risk_base: 40, time_to_impact: 3 },
  acquisition: { base_roi: 200, risk_base: 60, time_to_impact: 12 },
  infra: { base_roi: 80, risk_base: 20, time_to_impact: 6 },
  hiring: { base_roi: 100, risk_base: 35, time_to_impact: 9 },
  region_expansion: { base_roi: 180, risk_base: 50, time_to_impact: 12 },
  network_growth: { base_roi: 250, risk_base: 45, time_to_impact: 18 },
  enterprise_sales: { base_roi: 300, risk_base: 55, time_to_impact: 9 }
};

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
      // RUN CAPITAL ALLOCATOR
      // ==========================================
      case 'run_allocation': {
        const results = {
          timestamp: new Date().toISOString(),
          recommendations: [],
          high_roi_move: null,
          defensive_move: null,
          moat_investment: null,
          total_budget_recommended: 0
        };

        // Gather current metrics
        const growthMetrics = await base44.asServiceRole.entities.GrowthMetric.filter({}, '-created_date', 4);
        const roiMetrics = await base44.asServiceRole.entities.RiskROIMetric.filter({}, '-created_date', 50);
        const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({}, '-created_date', 1);
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
        const opportunities = await base44.asServiceRole.entities.StrategicOpportunity.filter({ status: 'proposed' });
        const regionalProfiles = await base44.asServiceRole.entities.RegionalRiskProfile.filter({});

        const latestGrowth = growthMetrics[0] || {};
        const latestMoat = moatMetrics[0] || {};

        // Calculate key metrics
        const mrr = latestGrowth.revenue?.mrr || 10000;
        const arr = mrr * 12;
        const churnRate = latestGrowth.conversions?.churn_rate || 0.05;
        const trialToPaid = latestGrowth.conversions?.trial_to_paid_rate || 0.15;
        const totalMerchants = tenants.length || 10;
        const avgLTV = latestGrowth.revenue?.ltv_estimate || (mrr / Math.max(churnRate, 0.01));
        const fraudPrevented = roiMetrics.reduce((s, r) => s + (r.fraud_loss_avoided || 0), 0);
        const modelAccuracy = roiMetrics.length > 0 
          ? roiMetrics.reduce((s, r) => s + (r.ai_accuracy_percent || 0), 0) / roiMetrics.length 
          : 70;

        // Estimate resources
        const estimatedBudget = arr * 0.3; // 30% of ARR for growth

        // ===== ANALYZE EACH ALLOCATION TYPE =====
        const allocations = [];

        // 1. Feature Development - if model accuracy needs improvement
        if (modelAccuracy < 85) {
          allocations.push({
            type: 'feature_dev',
            title: 'AI Model Enhancement',
            description: `Improve risk model accuracy from ${modelAccuracy.toFixed(0)}% to 90%+`,
            budget: estimatedBudget * 0.25,
            expected_roi: 180,
            risk_score: 25,
            strategic_weight: 85,
            category: 'high_roi',
            time_horizon: 'mid',
            rationale: 'Higher accuracy directly increases fraud prevention value'
          });
        }

        // 2. Marketing - if conversion is strong but volume is low
        if (trialToPaid > 0.15 && totalMerchants < 100) {
          allocations.push({
            type: 'marketing',
            title: 'Acquisition Acceleration',
            description: 'Scale paid acquisition with strong conversion fundamentals',
            budget: estimatedBudget * 0.30,
            expected_roi: 140,
            risk_score: 40,
            strategic_weight: 70,
            category: 'high_roi',
            time_horizon: 'short',
            rationale: `${(trialToPaid * 100).toFixed(0)}% conversion supports aggressive acquisition`
          });
        }

        // 3. Referral Engine - if organic growth is working
        if (latestGrowth.referrals?.viral_coefficient > 0.3) {
          allocations.push({
            type: 'marketing',
            title: 'Referral Engine Investment',
            description: 'Double down on viral growth with referral rewards',
            budget: estimatedBudget * 0.15,
            expected_roi: 300,
            risk_score: 20,
            strategic_weight: 80,
            category: 'high_roi',
            time_horizon: 'short',
            rationale: 'Viral coefficient shows organic growth potential'
          });
        }

        // 4. Defensive - Churn Prevention if churn is high
        if (churnRate > 0.03) {
          allocations.push({
            type: 'feature_dev',
            title: 'Churn Prevention System',
            description: 'Build predictive churn detection and intervention',
            budget: estimatedBudget * 0.15,
            expected_roi: 200,
            risk_score: 30,
            strategic_weight: 90,
            category: 'defensive',
            time_horizon: 'mid',
            rationale: `${(churnRate * 100).toFixed(1)}% churn is bleeding ARR`
          });
        }

        // 5. Regional Expansion - if ready regions exist
        const readyRegions = regionalProfiles.filter(r => r.expansion_readiness === 'ready');
        if (readyRegions.length > 3) {
          allocations.push({
            type: 'region_expansion',
            title: 'Global Expansion Push',
            description: `Accelerate growth in ${readyRegions.length} ready regions`,
            budget: estimatedBudget * 0.20,
            expected_roi: 160,
            risk_score: 45,
            strategic_weight: 75,
            category: 'high_roi',
            time_horizon: 'mid',
            rationale: 'Regional infrastructure is ready for scale'
          });
        }

        // 6. Network Growth - Long-term moat
        allocations.push({
          type: 'network_growth',
          title: 'Commerce Data Network Investment',
          description: 'Build cross-merchant fraud intelligence network',
          budget: estimatedBudget * 0.20,
          expected_roi: 250,
          risk_score: 50,
          strategic_weight: 95,
          category: 'moat_investment',
          time_horizon: 'long',
          rationale: 'Network effects create insurmountable competitive moat'
        });

        // 7. Enterprise Sales - if product is mature
        if (modelAccuracy > 80 && totalMerchants > 50) {
          allocations.push({
            type: 'enterprise_sales',
            title: 'Enterprise Sales Motion',
            description: 'Build dedicated enterprise sales team',
            budget: estimatedBudget * 0.25,
            expected_roi: 350,
            risk_score: 55,
            strategic_weight: 85,
            category: 'high_roi',
            time_horizon: 'mid',
            rationale: 'Product maturity supports enterprise contracts'
          });
        }

        // 8. Acquisition - if strategic opportunities exist
        const acquisitionOpps = opportunities.filter(o => o.opportunity_type === 'acquisition');
        if (acquisitionOpps.length > 0) {
          const topOpp = acquisitionOpps[0];
          allocations.push({
            type: 'acquisition',
            title: `Acquire ${topOpp.target_company || 'Strategic Target'}`,
            description: topOpp.description || 'Strategic acquisition opportunity',
            budget: topOpp.estimated_market_size || estimatedBudget * 0.50,
            expected_roi: topOpp.expected_roi || 200,
            risk_score: 65,
            strategic_weight: topOpp.synergy_score || 75,
            category: 'high_roi',
            time_horizon: 'long',
            rationale: 'Strategic synergy opportunity identified'
          });
        }

        // Score and rank allocations
        allocations.forEach(a => {
          a.composite_score = (a.expected_roi * 0.4) + (a.strategic_weight * 0.3) - (a.risk_score * 0.3);
        });
        allocations.sort((a, b) => b.composite_score - a.composite_score);

        // Select top recommendations
        results.high_roi_move = allocations.find(a => a.category === 'high_roi');
        results.defensive_move = allocations.find(a => a.category === 'defensive');
        results.moat_investment = allocations.find(a => a.category === 'moat_investment');

        // Create allocation decisions
        const topAllocations = allocations.slice(0, 5);
        for (const alloc of topAllocations) {
          // Simulate projections
          const projections = {
            month_12: { arr_impact: arr * (alloc.expected_roi / 100) * 0.3, merchants_impact: Math.floor(totalMerchants * 0.2) },
            month_24: { arr_impact: arr * (alloc.expected_roi / 100) * 0.7, merchants_impact: Math.floor(totalMerchants * 0.5) },
            month_36: { arr_impact: arr * (alloc.expected_roi / 100), merchants_impact: Math.floor(totalMerchants * 0.8) }
          };

          await base44.asServiceRole.entities.CapitalAllocationDecision.create({
            allocation_type: alloc.type,
            title: alloc.title,
            description: alloc.description,
            budget_allocated: alloc.budget,
            expected_roi: alloc.expected_roi,
            risk_score: alloc.risk_score,
            strategic_weight: alloc.strategic_weight,
            time_horizon: alloc.time_horizon,
            confidence_score: 0.75,
            status: 'proposed',
            category: alloc.category,
            projected_outcomes: projections
          });

          results.total_budget_recommended += alloc.budget;
        }

        results.recommendations = topAllocations;

        return Response.json({ success: true, ...results });
      }

      // ==========================================
      // GET ALLOCATION BRIEF
      // ==========================================
      case 'get_allocation_brief': {
        const decisions = await base44.asServiceRole.entities.CapitalAllocationDecision.filter(
          { status: 'proposed' }, '-created_date', 10
        );
        const resourcePools = await base44.asServiceRole.entities.ResourcePool.filter({}, '-created_date', 1);

        return Response.json({
          success: true,
          decisions,
          resource_pool: resourcePools[0] || null
        });
      }

      // ==========================================
      // UPDATE RESOURCE POOL
      // ==========================================
      case 'update_resource_pool': {
        const { engineering_capacity, marketing_capacity, infra_capacity, runway_months, cash_reserves, burn_rate } = params;
        const period = new Date().toISOString().slice(0, 7);

        const existing = await base44.asServiceRole.entities.ResourcePool.filter({ period });

        const data = {
          period,
          engineering_capacity,
          marketing_capacity,
          infra_capacity,
          runway_months,
          cash_reserves,
          burn_rate
        };

        if (existing.length > 0) {
          await base44.asServiceRole.entities.ResourcePool.update(existing[0].id, data);
        } else {
          await base44.asServiceRole.entities.ResourcePool.create(data);
        }

        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Capital Allocator error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});