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

    if (action === 'run_simulation') {
      return await runMarketSimulation(base44, body);
    } else if (action === 'get_scenarios') {
      return await getScenarios(base44);
    } else if (action === 'create_scenario') {
      return await createScenario(base44, body);
    } else if (action === 'get_simulation_lab') {
      return await getSimulationLab(base44);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function runMarketSimulation(base44, params) {
  const { scenario_id, response_strategies, iterations = 1000 } = params;

  // Invariant: scenario must exist
  const scenarios = await base44.asServiceRole.entities.CompetitiveScenario.filter({ id: scenario_id });
  if (scenarios.length === 0) {
    return Response.json({ error: 'Scenario not found' }, { status: 404 });
  }
  const scenario = scenarios[0];

  // Get current metrics for baseline
  const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({});
  const latestMoat = moatMetrics.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
  
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
  const baselineARR = tenants.length * 500 * 12; // Estimate

  const simulations = [];
  const strategies = response_strategies || ['price_match', 'feature_acceleration', 'marketing_blitz', 'do_nothing'];

  for (const strategy of strategies) {
    // Monte Carlo simulation
    const results = runMonteCarloSimulation(scenario, strategy, iterations, baselineARR, latestMoat);
    
    // Detect overreaction risk
    const overreactionRisk = strategy !== 'do_nothing' && 
      results.roi_projection < 0.5 && 
      scenario.probability_score < 0.4;

    // Generate recommendation
    let recommendation = 'neutral';
    if (results.roi_projection > 2 && results.risk_score < 40) recommendation = 'strongly_recommend';
    else if (results.roi_projection > 1.2 && results.risk_score < 60) recommendation = 'recommend';
    else if (results.roi_projection < 0.5 || results.risk_score > 80) recommendation = 'avoid';
    else if (overreactionRisk) recommendation = 'caution';

    const simulation = await base44.asServiceRole.entities.StrategySimulation.create({
      scenario_id,
      simulation_name: `${scenario.competitor_name} - ${strategy}`,
      response_strategy: strategy,
      simulation_parameters: {
        iterations,
        confidence_interval: 0.95,
        risk_tolerance: 0.5
      },
      revenue_projection_12m: results.revenue_12m,
      revenue_projection_24m: results.revenue_24m,
      margin_projection: results.margin,
      churn_projection: results.churn,
      acquisition_impact: results.acquisition,
      dominance_score: results.dominance,
      capital_required: results.capital,
      roi_projection: results.roi_projection,
      risk_score: results.risk_score,
      overreaction_risk: overreactionRisk,
      recommendation,
      majority_view: getMajorityView(results, strategy),
      minority_view: getMinorityView(results, strategy),
      simulation_date: new Date().toISOString()
    });
    
    simulations.push(simulation);
  }

  // Log to telemetry
  await base44.asServiceRole.entities.ClientTelemetry.create({
    event_type: 'market_simulation',
    event_data: {
      scenario_id,
      strategies_simulated: strategies.length,
      iterations,
      best_strategy: simulations.sort((a, b) => b.roi_projection - a.roi_projection)[0]?.response_strategy
    },
    timestamp: new Date().toISOString()
  });

  // Find optimal path
  const sortedByROI = [...simulations].sort((a, b) => b.roi_projection - a.roi_projection);
  const optimal = sortedByROI.find(s => !s.overreaction_risk) || sortedByROI[0];

  return Response.json({
    success: true,
    scenario: {
      competitor: scenario.competitor_name,
      type: scenario.scenario_type,
      probability: scenario.probability_score
    },
    simulations: simulations.map(s => ({
      strategy: s.response_strategy,
      revenue_12m: s.revenue_projection_12m,
      roi: s.roi_projection,
      risk: s.risk_score,
      recommendation: s.recommendation,
      overreaction_risk: s.overreaction_risk
    })),
    optimal_path: {
      strategy: optimal.response_strategy,
      roi: optimal.roi_projection,
      recommendation: optimal.recommendation
    }
  });
}

function runMonteCarloSimulation(scenario, strategy, iterations, baselineARR, moat) {
  // Simplified Monte Carlo - in production would be more sophisticated
  const scenarioImpact = scenario.revenue_projection_delta || -baselineARR * 0.1;
  const probability = scenario.probability_score || 0.5;
  
  // Strategy modifiers
  const strategyModifiers = {
    price_match: { cost: 0.15, recovery: 0.6, risk: 0.3 },
    feature_acceleration: { cost: 0.2, recovery: 0.5, risk: 0.4 },
    marketing_blitz: { cost: 0.25, recovery: 0.4, risk: 0.5 },
    acquisition_counter: { cost: 0.5, recovery: 0.7, risk: 0.6 },
    partnership_defense: { cost: 0.1, recovery: 0.3, risk: 0.2 },
    geographic_pivot: { cost: 0.3, recovery: 0.4, risk: 0.5 },
    segment_focus: { cost: 0.1, recovery: 0.35, risk: 0.25 },
    do_nothing: { cost: 0, recovery: 0, risk: 0.1 }
  };

  const mod = strategyModifiers[strategy] || strategyModifiers.do_nothing;
  
  // Simulate outcomes
  let totalRevenue = 0;
  let totalChurn = 0;
  
  for (let i = 0; i < iterations; i++) {
    const scenarioHappens = Math.random() < probability;
    const recoverySuccess = Math.random() < mod.recovery;
    
    let revenue = baselineARR;
    let churn = 0.05; // baseline
    
    if (scenarioHappens) {
      revenue += scenarioImpact;
      churn += 0.03;
      
      if (recoverySuccess && strategy !== 'do_nothing') {
        revenue -= scenarioImpact * mod.recovery;
        churn -= 0.02;
      }
    }
    
    revenue -= baselineARR * mod.cost;
    totalRevenue += revenue;
    totalChurn += churn;
  }

  const avgRevenue = totalRevenue / iterations;
  const avgChurn = totalChurn / iterations;
  const capital = baselineARR * mod.cost;
  const roi = capital > 0 ? (avgRevenue - baselineARR + capital) / capital : 1;

  return {
    revenue_12m: avgRevenue,
    revenue_24m: avgRevenue * 1.8,
    margin: 0.7 - mod.cost * 0.5,
    churn: avgChurn,
    acquisition: mod.recovery * 0.5,
    dominance: (moat?.overall_moat_score || 50) + (mod.recovery - mod.risk) * 20,
    capital,
    roi_projection: Math.max(0, roi),
    risk_score: mod.risk * 100 + (1 - probability) * 20
  };
}

function getMajorityView(results, strategy) {
  if (results.roi_projection > 1.5) {
    return `${strategy} shows strong ROI potential with acceptable risk profile`;
  } else if (results.roi_projection > 1) {
    return `${strategy} offers moderate returns but execution risk remains`;
  } else {
    return `${strategy} may not justify the capital investment given current projections`;
  }
}

function getMinorityView(results, strategy) {
  if (strategy === 'do_nothing') {
    return 'Inaction may signal weakness to competitors and erode market position';
  } else if (results.risk_score > 60) {
    return 'High execution risk could lead to worse outcomes than baseline';
  } else {
    return 'Market conditions may shift before strategy can be fully executed';
  }
}

async function getScenarios(base44) {
  const scenarios = await base44.asServiceRole.entities.CompetitiveScenario.filter({});
  return Response.json({
    scenarios: scenarios.map(s => ({
      id: s.id,
      competitor: s.competitor_name,
      type: s.scenario_type,
      probability: s.probability_score,
      impact: s.revenue_projection_delta,
      status: s.status
    }))
  });
}

async function createScenario(base44, params) {
  const { competitor_name, scenario_type, probability_score, revenue_impact, description } = params;
  
  const scenario = await base44.asServiceRole.entities.CompetitiveScenario.create({
    competitor_name,
    scenario_type,
    title: `${competitor_name} - ${scenario_type}`,
    description: description || `Simulated ${scenario_type} scenario for ${competitor_name}`,
    probability_score: probability_score || 0.5,
    revenue_projection_delta: revenue_impact || -100000,
    status: 'hypothetical'
  });

  return Response.json({ success: true, scenario_id: scenario.id });
}

async function getSimulationLab(base44) {
  const scenarios = await base44.asServiceRole.entities.CompetitiveScenario.filter({});
  const simulations = await base44.asServiceRole.entities.StrategySimulation.filter({});
  
  // Group simulations by scenario
  const simulationsByScenario = {};
  for (const sim of simulations) {
    if (!simulationsByScenario[sim.scenario_id]) {
      simulationsByScenario[sim.scenario_id] = [];
    }
    simulationsByScenario[sim.scenario_id].push(sim);
  }

  return Response.json({
    lab: {
      total_scenarios: scenarios.length,
      total_simulations: simulations.length,
      scenarios: scenarios.slice(0, 10).map(s => ({
        id: s.id,
        competitor: s.competitor_name,
        type: s.scenario_type,
        probability: s.probability_score,
        simulations: (simulationsByScenario[s.id] || []).map(sim => ({
          strategy: sim.response_strategy,
          roi: sim.roi_projection,
          recommendation: sim.recommendation
        }))
      })),
      recent_simulations: simulations
        .sort((a, b) => new Date(b.simulation_date) - new Date(a.simulation_date))
        .slice(0, 5)
        .map(s => ({
          scenario_id: s.scenario_id,
          strategy: s.response_strategy,
          roi: s.roi_projection,
          recommendation: s.recommendation,
          date: s.simulation_date
        }))
    }
  });
}