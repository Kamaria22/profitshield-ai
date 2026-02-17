import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Institutional investor preferences
const INSTITUTIONAL_METRICS = [
  { key: 'arr_growth', name: 'ARR Growth Rate', weight: 20, benchmark: 100, multiplier_impact: 0.5 },
  { key: 'nrr', name: 'Net Revenue Retention', weight: 18, benchmark: 120, multiplier_impact: 0.4 },
  { key: 'gross_margin', name: 'Gross Margin', weight: 15, benchmark: 75, multiplier_impact: 0.3 },
  { key: 'ltv_cac', name: 'LTV/CAC Ratio', weight: 12, benchmark: 4, multiplier_impact: 0.25 },
  { key: 'burn_multiple', name: 'Burn Multiple', weight: 10, benchmark: 1.5, multiplier_impact: 0.2, inverse: true },
  { key: 'lock_in_index', name: 'Customer Lock-In Index', weight: 8, benchmark: 70, multiplier_impact: 0.15 },
  { key: 'network_effect', name: 'Network Effect Score', weight: 7, benchmark: 60, multiplier_impact: 0.1 },
  { key: 'governance_score', name: 'Governance Score', weight: 5, benchmark: 85, multiplier_impact: 0.05 },
  { key: 'market_share', name: 'Market Share', weight: 5, benchmark: 10, multiplier_impact: 0.05 }
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'run_optimization_scan') {
      return await runCapitalOptimizationScan(base44);
    } else if (action === 'get_readiness_console') {
      return await getReadinessConsole(base44);
    } else if (action === 'match_investors') {
      return await matchInvestors(base44);
    } else if (action === 'create_investor_profile') {
      return await createInvestorProfile(base44, body);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function runCapitalOptimizationScan(base44) {
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
  const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({});
  const lockInSignals = await base44.asServiceRole.entities.LockInSignal.filter({});
  const ipoMetrics = await base44.asServiceRole.entities.IPOReadinessMetric.filter({});
  const existingSignals = await base44.asServiceRole.entities.CapitalSignal.filter({});

  // Calculate current metrics
  const estimatedARR = tenants.length * 500 * 12;
  const latestMoat = moatMetrics.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
  const avgLockIn = lockInSignals.length > 0 
    ? lockInSignals.reduce((sum, s) => sum + (s.lock_in_index || 0), 0) / lockInSignals.length 
    : 0;

  const currentMetrics = {
    arr_growth: 85, // Would be calculated from historical data
    nrr: 115,
    gross_margin: 75,
    ltv_cac: 4.0,
    burn_multiple: 1.8,
    lock_in_index: avgLockIn,
    network_effect: latestMoat?.network_moat?.network_effect_score || 50,
    governance_score: ipoMetrics.length > 0 
      ? ipoMetrics.reduce((sum, m) => sum + (m.current_value || 0), 0) / ipoMetrics.length 
      : 70,
    market_share: 5
  };

  const signalsCreated = [];
  const suggestions = [];

  for (const metricConfig of INSTITUTIONAL_METRICS) {
    const currentValue = currentMetrics[metricConfig.key] || 0;
    const benchmark = metricConfig.benchmark;
    const previousSignal = existingSignals.find(s => s.metric_key === metricConfig.key);
    const previousValue = previousSignal?.current_value || currentValue;

    // Calculate trend
    let trend = 'stable';
    if (currentValue > previousValue * 1.05) trend = 'improving';
    else if (currentValue < previousValue * 0.95) trend = 'declining';

    // Calculate attractiveness score
    let attractiveness = 0;
    if (metricConfig.inverse) {
      attractiveness = Math.min(100, (benchmark / Math.max(0.1, currentValue)) * 50);
    } else {
      attractiveness = Math.min(100, (currentValue / benchmark) * 50 + 25);
    }

    // Calculate valuation multiplier impact
    const multiplierImpact = (attractiveness / 100) * metricConfig.multiplier_impact;

    // Generate optimization suggestion
    let suggestion = null;
    if (attractiveness < 60) {
      if (metricConfig.key === 'arr_growth') {
        suggestion = 'Accelerate customer acquisition and expansion revenue programs';
      } else if (metricConfig.key === 'nrr') {
        suggestion = 'Focus on upsell motions and reduce churn through lock-in initiatives';
      } else if (metricConfig.key === 'gross_margin') {
        suggestion = 'Optimize infrastructure costs and increase automation';
      } else if (metricConfig.key === 'ltv_cac') {
        suggestion = 'Improve sales efficiency and focus on higher-value segments';
      } else if (metricConfig.key === 'burn_multiple') {
        suggestion = 'Reduce discretionary spend and prioritize capital-efficient growth';
      } else if (metricConfig.key === 'lock_in_index') {
        suggestion = 'Accelerate workflow integration and data compounding features';
      }
      suggestions.push({ metric: metricConfig.name, suggestion, priority: attractiveness < 40 ? 'high' : 'medium' });
    }

    // Create or update signal
    const signalData = {
      metric_name: metricConfig.name,
      metric_key: metricConfig.key,
      category: metricConfig.key.includes('margin') || metricConfig.key.includes('ltv') ? 'margin' : 
                metricConfig.key.includes('growth') || metricConfig.key.includes('nrr') ? 'growth' :
                metricConfig.key.includes('lock') || metricConfig.key.includes('network') ? 'moat' : 'efficiency',
      current_value: currentValue,
      previous_value: previousValue,
      benchmark_value: benchmark,
      trend_direction: trend,
      institutional_attractiveness_score: attractiveness,
      valuation_multiplier_impact: multiplierImpact,
      investor_priority: attractiveness >= 80 ? 'low' : attractiveness >= 60 ? 'medium' : attractiveness >= 40 ? 'high' : 'critical',
      optimization_suggestion: suggestion,
      period: new Date().toISOString().slice(0, 7),
      last_updated: new Date().toISOString()
    };

    if (previousSignal) {
      await base44.asServiceRole.entities.CapitalSignal.update(previousSignal.id, signalData);
    } else {
      const signal = await base44.asServiceRole.entities.CapitalSignal.create(signalData);
      signalsCreated.push(signal);
    }
  }

  // Calculate overall capital readiness
  const signals = await base44.asServiceRole.entities.CapitalSignal.filter({});
  const totalAttractiveness = signals.reduce((sum, s) => {
    const config = INSTITUTIONAL_METRICS.find(m => m.metric_key === s.metric_key);
    return sum + (s.institutional_attractiveness_score || 0) * (config?.weight || 1);
  }, 0);
  const totalWeight = INSTITUTIONAL_METRICS.reduce((sum, m) => sum + m.weight, 0);
  const capitalReadinessScore = totalAttractiveness / totalWeight;

  // Calculate valuation band
  const baseMultiple = 10;
  const totalMultiplierImpact = signals.reduce((sum, s) => sum + (s.valuation_multiplier_impact || 0), 0);
  const adjustedMultiple = baseMultiple + totalMultiplierImpact;
  const valuationLow = estimatedARR * (adjustedMultiple * 0.8);
  const valuationHigh = estimatedARR * (adjustedMultiple * 1.2);

  return Response.json({
    success: true,
    capital_readiness_score: capitalReadinessScore,
    valuation_band: {
      low: valuationLow,
      mid: estimatedARR * adjustedMultiple,
      high: valuationHigh,
      multiple: adjustedMultiple
    },
    signals_updated: INSTITUTIONAL_METRICS.length,
    suggestions: suggestions,
    critical_metrics: signals.filter(s => s.investor_priority === 'critical').map(s => s.metric_name)
  });
}

async function getReadinessConsole(base44) {
  const signals = await base44.asServiceRole.entities.CapitalSignal.filter({});
  const investors = await base44.asServiceRole.entities.InvestorProfile.filter({});
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });

  // Calculate scores
  const totalWeight = INSTITUTIONAL_METRICS.reduce((sum, m) => sum + m.weight, 0);
  const totalAttractiveness = signals.reduce((sum, s) => {
    const config = INSTITUTIONAL_METRICS.find(m => m.metric_key === s.metric_key);
    return sum + (s.institutional_attractiveness_score || 0) * (config?.weight || 1);
  }, 0);
  const capitalReadinessScore = totalWeight > 0 ? totalAttractiveness / totalWeight : 0;

  // Valuation projection
  const estimatedARR = tenants.length * 500 * 12;
  const totalMultiplierImpact = signals.reduce((sum, s) => sum + (s.valuation_multiplier_impact || 0), 0);
  const baseMultiple = 10;
  const adjustedMultiple = baseMultiple + totalMultiplierImpact;

  // Capital efficiency
  const burnMultiple = signals.find(s => s.metric_key === 'burn_multiple')?.current_value || 2;
  const capitalEfficiency = 100 - (burnMultiple * 20);

  // IPO vs Acquisition trajectory
  const ipoReadiness = capitalReadinessScore >= 75 && (signals.find(s => s.metric_key === 'arr_growth')?.current_value || 0) >= 50;
  
  return Response.json({
    console: {
      capital_readiness_score: capitalReadinessScore,
      valuation_projection: {
        low: estimatedARR * (adjustedMultiple * 0.8),
        mid: estimatedARR * adjustedMultiple,
        high: estimatedARR * (adjustedMultiple * 1.2),
        multiple: adjustedMultiple
      },
      capital_efficiency_score: Math.max(0, capitalEfficiency),
      trajectory: ipoReadiness ? 'ipo_ready' : capitalReadinessScore >= 60 ? 'acquisition_attractive' : 'growth_stage',
      metrics: signals.map(s => ({
        name: s.metric_name,
        current: s.current_value,
        benchmark: s.benchmark_value,
        attractiveness: s.institutional_attractiveness_score,
        trend: s.trend_direction,
        priority: s.investor_priority
      })),
      matched_investors: investors
        .filter(i => i.strategic_alignment_score >= 60)
        .sort((a, b) => (b.strategic_alignment_score || 0) - (a.strategic_alignment_score || 0))
        .slice(0, 5)
        .map(i => ({
          firm: i.firm_name,
          alignment: i.strategic_alignment_score,
          check_size: `$${(i.target_check_size_min / 1e6).toFixed(0)}M - $${(i.target_check_size_max / 1e6).toFixed(0)}M`,
          status: i.contact_status
        })),
      optimization_priorities: signals
        .filter(s => s.investor_priority === 'critical' || s.investor_priority === 'high')
        .map(s => ({
          metric: s.metric_name,
          suggestion: s.optimization_suggestion,
          priority: s.investor_priority
        }))
    }
  });
}

async function matchInvestors(base44) {
  const signals = await base44.asServiceRole.entities.CapitalSignal.filter({});
  const investors = await base44.asServiceRole.entities.InvestorProfile.filter({});
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });

  const estimatedARR = tenants.length * 500 * 12;
  const arrGrowth = signals.find(s => s.metric_key === 'arr_growth')?.current_value || 50;

  // Determine our stage
  let ourStage = 'seed';
  if (estimatedARR > 10000000) ourStage = 'late_stage';
  else if (estimatedARR > 5000000) ourStage = 'growth';
  else if (estimatedARR > 1000000) ourStage = 'series_b';
  else if (estimatedARR > 500000) ourStage = 'series_a';

  const matches = [];

  for (const investor of investors) {
    let alignmentScore = 50;

    // Stage match
    if (investor.focus_stage === ourStage) alignmentScore += 20;
    else if (
      (investor.focus_stage === 'growth' && ['series_b', 'late_stage'].includes(ourStage)) ||
      (investor.focus_stage === 'series_a' && ourStage === 'seed')
    ) alignmentScore += 10;

    // Check size match
    const targetRaise = estimatedARR * 0.3;
    if (targetRaise >= (investor.target_check_size_min || 0) && targetRaise <= (investor.target_check_size_max || Infinity)) {
      alignmentScore += 15;
    }

    // Thesis keyword match
    const thesisKeywords = investor.thesis_keywords || [];
    const ourKeywords = ['fraud', 'commerce', 'saas', 'fintech', 'ai', 'shopify', 'ecommerce'];
    const keywordMatches = thesisKeywords.filter(k => ourKeywords.some(ok => k.toLowerCase().includes(ok))).length;
    alignmentScore += keywordMatches * 5;

    // Sector match
    const sectorFocus = investor.sector_focus || [];
    if (sectorFocus.some(s => ['fintech', 'commerce', 'saas', 'b2b'].includes(s.toLowerCase()))) {
      alignmentScore += 10;
    }

    alignmentScore = Math.min(100, alignmentScore);

    // Update investor profile
    await base44.asServiceRole.entities.InvestorProfile.update(investor.id, {
      strategic_alignment_score: alignmentScore
    });

    matches.push({
      investor_id: investor.id,
      firm_name: investor.firm_name,
      alignment_score: alignmentScore,
      stage_fit: investor.focus_stage === ourStage,
      check_size_fit: targetRaise >= (investor.target_check_size_min || 0) && targetRaise <= (investor.target_check_size_max || Infinity)
    });
  }

  return Response.json({
    success: true,
    matches: matches.sort((a, b) => b.alignment_score - a.alignment_score),
    our_stage: ourStage,
    estimated_arr: estimatedARR
  });
}

async function createInvestorProfile(base44, params) {
  const { firm_name, firm_type, focus_stage, check_size_min, check_size_max, thesis_keywords, sector_focus } = params;
  
  const profile = await base44.asServiceRole.entities.InvestorProfile.create({
    firm_name,
    firm_type: firm_type || 'vc',
    focus_stage: focus_stage || 'growth',
    target_check_size_min: check_size_min || 1000000,
    target_check_size_max: check_size_max || 10000000,
    thesis_keywords: thesis_keywords || [],
    sector_focus: sector_focus || [],
    contact_status: 'not_contacted',
    interest_level: 'unknown'
  });

  return Response.json({ success: true, profile_id: profile.id });
}