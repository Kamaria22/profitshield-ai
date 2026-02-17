import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'run_scan') {
      return await runAbsorptionScanner(base44);
    } else if (action === 'get_radar') {
      return await getAbsorptionRadar(base44);
    } else if (action === 'approve_play') {
      return await approvePlay(base44, body.play_id, user.email);
    } else if (action === 'create_profile') {
      return await createCompetitorProfile(base44, body);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function runAbsorptionScanner(base44) {
  const competitors = await base44.asServiceRole.entities.CompetitorProfile.filter({ status: 'monitoring' });
  const competitiveSignals = await base44.asServiceRole.entities.CompetitiveSignal.filter({ is_active: true });
  
  const scanned = [];
  const playsGenerated = [];

  for (const competitor of competitors) {
    // Aggregate weakness signals from CompetitiveSignal
    const signals = competitiveSignals.filter(s => 
      s.competitor_name?.toLowerCase() === competitor.name?.toLowerCase()
    );

    const weaknessSignals = [];
    let churnVulnerability = competitor.churn_vulnerability_score || 30;
    let absorptionPriority = competitor.absorption_priority_score || 30;

    // Detect weakness patterns
    for (const signal of signals) {
      if (signal.signal_type === 'review_trend' && signal.sentiment_score < 0) {
        weaknessSignals.push({ signal_type: 'negative_reviews', severity: 60, detected_at: new Date().toISOString() });
        churnVulnerability += 10;
      }
      if (signal.signal_type === 'pricing_change') {
        weaknessSignals.push({ signal_type: 'pricing_instability', severity: 50, detected_at: new Date().toISOString() });
        absorptionPriority += 15;
      }
      if (signal.signal_type === 'vulnerability') {
        weaknessSignals.push({ signal_type: signal.weakness_detected || 'general_weakness', severity: 70, detected_at: new Date().toISOString() });
        churnVulnerability += 15;
        absorptionPriority += 20;
      }
    }

    // Calculate scores
    const featureParity = competitor.feature_parity_score || 50;
    const growthVelocity = competitor.growth_velocity || 0;
    
    // Lower growth = higher vulnerability
    if (growthVelocity < 0.05) {
      weaknessSignals.push({ signal_type: 'growth_stagnation', severity: 55, detected_at: new Date().toISOString() });
      churnVulnerability += 10;
    }

    // Calculate acquisition probability based on funding status
    let acquisitionProbability = 30;
    if (competitor.funding_status === 'bootstrapped') acquisitionProbability = 60;
    else if (competitor.funding_status === 'seed') acquisitionProbability = 50;
    else if (competitor.funding_status === 'series_a') acquisitionProbability = 40;

    // Final absorption priority
    absorptionPriority = Math.min(100, absorptionPriority + (churnVulnerability * 0.3) + (100 - featureParity) * 0.2);

    // Update competitor profile
    await base44.asServiceRole.entities.CompetitorProfile.update(competitor.id, {
      weakness_signals: weaknessSignals,
      churn_vulnerability_score: Math.min(100, churnVulnerability),
      acquisition_probability_score: acquisitionProbability,
      absorption_priority_score: Math.min(100, absorptionPriority),
      last_analyzed: new Date().toISOString()
    });

    scanned.push(competitor.name);

    // Generate plays for high-priority targets
    if (absorptionPriority >= 60) {
      const plays = generateAbsorptionPlays(competitor, absorptionPriority, churnVulnerability, acquisitionProbability);
      
      for (const playData of plays) {
        // Check if similar play already exists
        const existing = await base44.asServiceRole.entities.AbsorptionPlay.filter({
          competitor_id: competitor.id,
          play_type: playData.play_type,
          execution_status: 'proposed'
        });

        if (existing.length === 0) {
          const play = await base44.asServiceRole.entities.AbsorptionPlay.create({
            competitor_id: competitor.id,
            competitor_name: competitor.name,
            ...playData
          });
          playsGenerated.push(play);
        }
      }
    }
  }

  // Log telemetry
  await base44.asServiceRole.entities.ClientTelemetry.create({
    event_type: 'absorption_scan',
    event_data: {
      competitors_scanned: scanned.length,
      plays_generated: playsGenerated.length
    },
    timestamp: new Date().toISOString()
  });

  return Response.json({
    success: true,
    competitors_scanned: scanned.length,
    plays_generated: playsGenerated.length,
    high_priority_targets: competitors.filter(c => (c.absorption_priority_score || 0) >= 70).length
  });
}

function generateAbsorptionPlays(competitor, absorptionPriority, churnVulnerability, acquisitionProbability) {
  const plays = [];
  const baseCapital = (competitor.estimated_arr || 100000) * 0.1;

  // Pricing attack if they have pricing instability
  if (churnVulnerability >= 50) {
    plays.push({
      play_type: 'pricing_attack',
      title: `Pricing Undercut: ${competitor.name}`,
      description: `Launch targeted pricing campaign to convert ${competitor.name} customers showing churn signals`,
      required_capital: baseCapital * 0.5,
      estimated_conversion_gain: Math.round((competitor.estimated_customers || 100) * 0.1),
      projected_market_share_shift: 0.5,
      projected_revenue_gain: baseCapital * 0.3,
      risk_score: 40,
      roi_projection: 2.5,
      time_to_impact_days: 90,
      execution_status: 'proposed',
      approval_required: true
    });
  }

  // Feature leap if feature parity is low
  if ((competitor.feature_parity_score || 50) < 70) {
    plays.push({
      play_type: 'feature_leap',
      title: `Feature Differentiation: ${competitor.name}`,
      description: `Accelerate features where ${competitor.name} is weak to capture migration interest`,
      required_capital: baseCapital * 1.5,
      estimated_conversion_gain: Math.round((competitor.estimated_customers || 100) * 0.15),
      projected_market_share_shift: 1.0,
      projected_revenue_gain: baseCapital * 0.5,
      risk_score: 30,
      roi_projection: 3.0,
      time_to_impact_days: 180,
      execution_status: 'proposed',
      approval_required: true
    });
  }

  // Acquisition offer for high probability targets
  if (acquisitionProbability >= 50 && absorptionPriority >= 70) {
    plays.push({
      play_type: 'acquisition_offer',
      title: `Acquisition Approach: ${competitor.name}`,
      description: `Initiate acquisition discussions with ${competitor.name} based on favorable conditions`,
      required_capital: (competitor.estimated_arr || 100000) * 5,
      estimated_conversion_gain: competitor.estimated_customers || 100,
      projected_market_share_shift: 3.0,
      projected_revenue_gain: competitor.estimated_arr || 100000,
      risk_score: 60,
      roi_projection: 2.0,
      time_to_impact_days: 365,
      execution_status: 'proposed',
      approval_required: true
    });
  }

  // Customer migration campaign
  if (churnVulnerability >= 60) {
    plays.push({
      play_type: 'customer_migration',
      title: `Migration Campaign: ${competitor.name}`,
      description: `Targeted outreach to ${competitor.name} customers with migration incentives`,
      required_capital: baseCapital * 0.3,
      estimated_conversion_gain: Math.round((competitor.estimated_customers || 100) * 0.05),
      projected_market_share_shift: 0.3,
      projected_revenue_gain: baseCapital * 0.15,
      risk_score: 25,
      roi_projection: 4.0,
      time_to_impact_days: 60,
      execution_status: 'proposed',
      approval_required: true
    });
  }

  return plays;
}

async function getAbsorptionRadar(base44) {
  const competitors = await base44.asServiceRole.entities.CompetitorProfile.filter({});
  const plays = await base44.asServiceRole.entities.AbsorptionPlay.filter({});

  const priorityRanking = competitors
    .sort((a, b) => (b.absorption_priority_score || 0) - (a.absorption_priority_score || 0))
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      name: c.name,
      segment: c.segment,
      absorption_priority: c.absorption_priority_score || 0,
      churn_vulnerability: c.churn_vulnerability_score || 0,
      acquisition_probability: c.acquisition_probability_score || 0,
      weakness_signals: (c.weakness_signals || []).length,
      estimated_arr: c.estimated_arr || 0
    }));

  const pendingPlays = plays
    .filter(p => p.execution_status === 'proposed')
    .map(p => ({
      id: p.id,
      competitor: p.competitor_name,
      type: p.play_type,
      capital: p.required_capital,
      conversion: p.estimated_conversion_gain,
      roi: p.roi_projection,
      risk: p.risk_score
    }));

  const vulnerabilityHeatmap = {
    high: competitors.filter(c => (c.churn_vulnerability_score || 0) >= 70).length,
    medium: competitors.filter(c => (c.churn_vulnerability_score || 0) >= 40 && (c.churn_vulnerability_score || 0) < 70).length,
    low: competitors.filter(c => (c.churn_vulnerability_score || 0) < 40).length
  };

  const totalCapitalRequired = pendingPlays.reduce((sum, p) => sum + (p.capital || 0), 0);
  const avgRoi = pendingPlays.length > 0 
    ? pendingPlays.reduce((sum, p) => sum + (p.roi || 0), 0) / pendingPlays.length 
    : 0;

  return Response.json({
    radar: {
      priority_ranking: priorityRanking,
      pending_plays: pendingPlays,
      vulnerability_heatmap: vulnerabilityHeatmap,
      total_capital_required: totalCapitalRequired,
      avg_roi_projection: avgRoi,
      high_priority_count: competitors.filter(c => (c.absorption_priority_score || 0) >= 70).length
    }
  });
}

async function approvePlay(base44, playId, approverEmail) {
  await base44.asServiceRole.entities.AbsorptionPlay.update(playId, {
    execution_status: 'approved',
    approved_by: approverEmail,
    approved_at: new Date().toISOString()
  });

  return Response.json({ success: true, play_id: playId });
}

async function createCompetitorProfile(base44, params) {
  const { name, segment, pricing_model, estimated_arr, estimated_customers, platforms } = params;
  
  const profile = await base44.asServiceRole.entities.CompetitorProfile.create({
    name,
    segment: segment || 'smb',
    pricing_model: pricing_model || 'tiered',
    estimated_arr: estimated_arr || 0,
    estimated_customers: estimated_customers || 0,
    platforms_supported: platforms || [],
    feature_parity_score: 50,
    growth_velocity: 0.1,
    funding_status: 'seed',
    churn_vulnerability_score: 30,
    acquisition_probability_score: 30,
    absorption_priority_score: 30,
    status: 'monitoring'
  });

  return Response.json({ success: true, profile_id: profile.id });
}