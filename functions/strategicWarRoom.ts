import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, plan_id } = body;

    // Default to run_scan for scheduled automations
    if (!action || action === 'run_scan') {
      return await runWarRoomScan(base44);
    } else if (action === 'get_dashboard') {
      return await getWarRoomDashboard(base44);
    } else if (action === 'approve_response' && plan_id) {
      return await approveResponsePlan(base44, plan_id, user.email);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function runWarRoomScan(base44) {
  const signals_detected = [];
  const response_plans = [];

  // 1. Check for churn spikes
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
  const lockInSignals = await base44.asServiceRole.entities.LockInSignal.filter({});
  
  const atRiskTenants = lockInSignals.filter(s => s.churn_risk === 'high' || s.churn_risk === 'critical');
  if (atRiskTenants.length > tenants.length * 0.1) {
    const signal = await base44.asServiceRole.entities.StrategicThreatSignal.create({
      signal_type: 'churn_spike',
      source: 'internal_telemetry',
      title: 'Elevated Churn Risk Detected',
      description: `${atRiskTenants.length} tenants showing high/critical churn risk (${((atRiskTenants.length / tenants.length) * 100).toFixed(1)}% of base)`,
      severity_score: Math.min(90, atRiskTenants.length * 5),
      detection_confidence: 0.85,
      projected_revenue_impact: -atRiskTenants.length * 500 * 12,
      projected_churn_impact: atRiskTenants.length / tenants.length,
      time_to_impact: 'weeks',
      status: 'detected',
      detected_at: new Date().toISOString()
    });
    signals_detected.push(signal);

    // Auto-generate response plan
    const plan = await base44.asServiceRole.entities.StrategicResponsePlan.create({
      trigger_signal_id: signal.id,
      title: 'Churn Mitigation Campaign',
      recommended_actions: [
        { action: 'Launch retention outreach to at-risk accounts', priority: 1, estimated_impact: 0.3, timeline_days: 7 },
        { action: 'Accelerate feature requests from churning segments', priority: 2, estimated_impact: 0.2, timeline_days: 30 },
        { action: 'Offer loyalty pricing to high-value at-risk', priority: 3, estimated_impact: 0.15, timeline_days: 14 }
      ],
      execution_priority: 'high',
      capital_required: 25000,
      timeline_estimate_days: 30,
      projected_outcome: {
        revenue_recovery: atRiskTenants.length * 300 * 12,
        churn_mitigation: 0.4,
        market_share_impact: 0
      },
      owner_agent: 'CRO_AGENT',
      approval_required: true
    });
    response_plans.push(plan);
  }

  // 2. Check competitive signals
  const competitiveSignals = await base44.asServiceRole.entities.CompetitiveSignal.filter({ is_active: true });
  const highThreatSignals = competitiveSignals.filter(s => s.threat_level === 'high' || s.threat_level === 'critical');

  for (const cs of highThreatSignals.slice(0, 3)) {
    const existingSignal = await base44.asServiceRole.entities.StrategicThreatSignal.filter({
      source: cs.competitor_name,
      status: 'detected'
    });

    if (existingSignal.length === 0) {
      const signal = await base44.asServiceRole.entities.StrategicThreatSignal.create({
        signal_type: cs.signal_type === 'pricing_change' ? 'competitor_pricing' : 'competitor_feature',
        source: cs.competitor_name,
        title: `${cs.competitor_name} - ${cs.signal_type}`,
        description: cs.weakness_detected || cs.strength_detected || 'Competitive activity detected',
        severity_score: cs.threat_level === 'critical' ? 85 : 65,
        detection_confidence: 0.75,
        projected_revenue_impact: -50000,
        time_to_impact: 'months',
        status: 'detected',
        detected_at: new Date().toISOString()
      });
      signals_detected.push(signal);
    }
  }

  // 3. Check market signals
  const marketSignals = await base44.asServiceRole.entities.MarketSignal.filter({ requires_action: true, action_taken: false });
  
  for (const ms of marketSignals.slice(0, 3)) {
    if (ms.signal_type === 'regulatory_change') {
      const signal = await base44.asServiceRole.entities.StrategicThreatSignal.create({
        signal_type: 'regulatory_change',
        source: ms.region || 'global',
        title: ms.title,
        description: ms.description,
        severity_score: ms.impact_level === 'critical' ? 90 : ms.impact_level === 'high' ? 70 : 50,
        detection_confidence: 0.8,
        projected_revenue_impact: -100000,
        time_to_impact: 'months',
        status: 'detected',
        detected_at: new Date().toISOString()
      });
      signals_detected.push(signal);
    }
  }

  // 4. Escalate high-severity signals
  const highSeverity = signals_detected.filter(s => s.severity_score >= 75);
  for (const hs of highSeverity) {
    await base44.asServiceRole.entities.StrategicThreatSignal.update(hs.id, {
      escalated_to_founder: true,
      status: 'escalated'
    });
  }

  // Log to telemetry
  await base44.asServiceRole.entities.ClientTelemetry.create({
    level: 'info',
    message: `War Room scan completed: ${signals_detected.length} signals, ${response_plans.length} plans, ${highSeverity.length} escalated`,
    context_json: {
      event_type: 'war_room_scan',
      signals_detected: signals_detected.length,
      response_plans_created: response_plans.length,
      escalated: highSeverity.length
    },
    timestamp: new Date().toISOString()
  });

  return Response.json({
    success: true,
    signals_detected: signals_detected.length,
    response_plans_created: response_plans.length,
    escalated_to_founder: highSeverity.length,
    scan_timestamp: new Date().toISOString()
  });
}

async function getWarRoomDashboard(base44) {
  const activeSignals = await base44.asServiceRole.entities.StrategicThreatSignal.filter({ status: 'detected' });
  const escalatedSignals = await base44.asServiceRole.entities.StrategicThreatSignal.filter({ escalated_to_founder: true, status: 'escalated' });
  const pendingPlans = await base44.asServiceRole.entities.StrategicResponsePlan.filter({ status: 'proposed' });
  const executingPlans = await base44.asServiceRole.entities.StrategicResponsePlan.filter({ status: 'executing' });

  // Calculate threat radar
  const threatRadar = {
    competitor: activeSignals.filter(s => s.signal_type.includes('competitor')).length,
    churn: activeSignals.filter(s => s.signal_type === 'churn_spike').length,
    regulatory: activeSignals.filter(s => s.signal_type === 'regulatory_change').length,
    macro: activeSignals.filter(s => s.signal_type === 'macro_shift').length,
    other: activeSignals.filter(s => !['competitor_pricing', 'competitor_feature', 'churn_spike', 'regulatory_change', 'macro_shift'].includes(s.signal_type)).length
  };

  // Calculate risk meter
  const totalSeverity = activeSignals.reduce((sum, s) => sum + (s.severity_score || 0), 0);
  const avgSeverity = activeSignals.length > 0 ? totalSeverity / activeSignals.length : 0;
  const riskMeter = Math.min(100, avgSeverity + (escalatedSignals.length * 10));

  return Response.json({
    dashboard: {
      active_threats: activeSignals.length,
      escalated_threats: escalatedSignals.length,
      pending_responses: pendingPlans.length,
      executing_responses: executingPlans.length,
      threat_radar: threatRadar,
      risk_meter: riskMeter,
      top_threats: escalatedSignals.slice(0, 5).map(s => ({
        id: s.id,
        type: s.signal_type,
        title: s.title,
        severity: s.severity_score,
        source: s.source,
        impact: s.projected_revenue_impact
      })),
      pending_plans: pendingPlans.slice(0, 5).map(p => ({
        id: p.id,
        title: p.title,
        priority: p.execution_priority,
        capital: p.capital_required,
        owner: p.owner_agent
      }))
    }
  });
}

async function approveResponsePlan(base44, planId, approverEmail) {
  await base44.asServiceRole.entities.StrategicResponsePlan.update(planId, {
    status: 'approved',
    approved_by: approverEmail,
    approved_at: new Date().toISOString()
  });

  return Response.json({ success: true, plan_id: planId });
}