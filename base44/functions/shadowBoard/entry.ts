import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * SHADOW BOARD AI GOVERNANCE COUNCIL
 * 
 * Internal strategic oversight board with AI agents:
 * - CFO Agent (margin + capital efficiency)
 * - CTO Agent (scalability + risk)
 * - CRO Agent (growth + sales velocity)
 * - Risk Agent (fraud accuracy + exposure)
 * - Governance Agent (regulatory + compliance)
 */

// Shadow Board Agents
const AGENTS = {
  CFO: {
    name: 'CFO Agent',
    focus: ['margin', 'capital_efficiency', 'burn_rate', 'runway'],
    weight: { financial: 1.0, growth: 0.3, risk: 0.5, tech: 0.2 }
  },
  CTO: {
    name: 'CTO Agent',
    focus: ['scalability', 'technical_risk', 'integration', 'architecture'],
    weight: { financial: 0.3, growth: 0.4, risk: 0.6, tech: 1.0 }
  },
  CRO: {
    name: 'CRO Agent',
    focus: ['growth', 'sales_velocity', 'market_expansion', 'customer_acquisition'],
    weight: { financial: 0.5, growth: 1.0, risk: 0.3, tech: 0.3 }
  },
  RISK: {
    name: 'Risk Agent',
    focus: ['fraud_accuracy', 'exposure', 'compliance', 'security'],
    weight: { financial: 0.4, growth: 0.2, risk: 1.0, tech: 0.5 }
  },
  GOVERNANCE: {
    name: 'Governance Agent',
    focus: ['regulatory', 'compliance', 'audit', 'ethics'],
    weight: { financial: 0.3, growth: 0.2, risk: 0.8, tech: 0.3 }
  }
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
      // RUN SHADOW BOARD SESSION
      // ==========================================
      case 'run_session': {
        const results = {
          timestamp: new Date().toISOString(),
          session_id: `session_${Date.now()}`,
          scenarios_analyzed: 0,
          votes_recorded: 0,
          strategic_health_score: 0
        };

        // Get current state
        const growthMetrics = await base44.asServiceRole.entities.GrowthMetric.filter({}, '-created_date', 1);
        const moatMetrics = await base44.asServiceRole.entities.MoatMetric.filter({}, '-created_date', 1);
        const governanceMetrics = await base44.asServiceRole.entities.GovernanceMetric.filter({});
        const capitalDecisions = await base44.asServiceRole.entities.CapitalAllocationDecision.filter({ status: 'proposed' });
        const acquisitionTargets = await base44.asServiceRole.entities.AcquisitionTarget.filter({ status: 'shortlisted' });

        const latestGrowth = growthMetrics[0] || {};
        const latestMoat = moatMetrics[0] || {};

        // Generate scenarios to analyze
        const scenarios = [];

        // Scenario 1: Regulatory change risk
        scenarios.push({
          scenario_type: 'regulatory_change',
          title: 'GDPR/CCPA Compliance Strengthening',
          description: 'Increased regulatory scrutiny on data handling',
          projected_revenue_impact: -(latestGrowth.revenue?.mrr || 10000) * 0.1 * 12,
          risk_exposure_score: 60,
          probability_score: 0.4,
          time_horizon: 'medium_term',
          mitigation_options: [
            { action: 'Hire compliance officer', cost: 150000, effectiveness: 80 },
            { action: 'Implement data audit system', cost: 50000, effectiveness: 60 },
            { action: 'External compliance audit', cost: 30000, effectiveness: 50 }
          ]
        });

        // Scenario 2: Mass churn risk
        if ((latestGrowth.conversions?.churn_rate || 0) > 0.03) {
          scenarios.push({
            scenario_type: 'mass_churn',
            title: 'Elevated Churn Risk',
            description: 'Current churn rate above healthy threshold',
            projected_revenue_impact: -(latestGrowth.revenue?.mrr || 10000) * 0.3 * 12,
            risk_exposure_score: 75,
            probability_score: 0.3,
            time_horizon: 'short_term',
            mitigation_options: [
              { action: 'Launch retention campaign', cost: 20000, effectiveness: 70 },
              { action: 'Add customer success team', cost: 100000, effectiveness: 85 },
              { action: 'Improve onboarding', cost: 30000, effectiveness: 60 }
            ]
          });
        }

        // Scenario 3: Competitive threat
        scenarios.push({
          scenario_type: 'competitive_threat',
          title: 'Enterprise Competitor Entry',
          description: 'Major fraud prevention player entering SMB market',
          projected_revenue_impact: -(latestGrowth.revenue?.mrr || 10000) * 0.15 * 12,
          risk_exposure_score: 55,
          probability_score: 0.5,
          time_horizon: 'medium_term',
          mitigation_options: [
            { action: 'Accelerate feature development', cost: 100000, effectiveness: 75 },
            { action: 'Strengthen CDNP moat', cost: 50000, effectiveness: 85 },
            { action: 'Price leadership strategy', cost: 30000, effectiveness: 50 }
          ]
        });

        // Save scenarios
        for (const scenario of scenarios) {
          const resilience = scenario.mitigation_options.reduce((max, m) => Math.max(max, m.effectiveness), 0);
          scenario.strategic_resilience_rating = resilience > 80 ? 'strong' : resilience > 60 ? 'moderate' : 'weak';
          
          await base44.asServiceRole.entities.GovernanceScenario.create({
            ...scenario,
            status: 'active'
          });
          results.scenarios_analyzed++;
        }

        // Run Shadow Board votes on pending decisions
        const pendingDecisions = [
          ...capitalDecisions.map(d => ({ category: 'capital', title: d.title, data: d })),
          ...acquisitionTargets.map(t => ({ category: 'acquisition', title: `Acquire ${t.company_name}`, data: t }))
        ];

        for (const decision of pendingDecisions) {
          const votes = [];
          let approveCount = 0;
          let rejectCount = 0;

          // Each agent votes
          for (const [key, agent] of Object.entries(AGENTS)) {
            // Simulate agent reasoning based on focus areas
            let score = 50;
            
            if (decision.category === 'capital') {
              if (key === 'CFO') score = decision.data.expected_roi > 100 ? 80 : decision.data.expected_roi > 50 ? 60 : 40;
              if (key === 'CRO') score = decision.data.category === 'high_roi' ? 85 : 50;
              if (key === 'CTO') score = decision.data.allocation_type === 'feature_dev' || decision.data.allocation_type === 'infra' ? 75 : 45;
              if (key === 'RISK') score = decision.data.risk_score < 50 ? 70 : 40;
              if (key === 'GOVERNANCE') score = 60;
            } else if (decision.category === 'acquisition') {
              if (key === 'CFO') score = decision.data.valuation_multiple < 5 ? 75 : 40;
              if (key === 'CRO') score = decision.data.customer_overlap_score > 60 ? 80 : 50;
              if (key === 'CTO') score = decision.data.integration_complexity === 'low' ? 80 : decision.data.integration_complexity === 'medium' ? 60 : 35;
              if (key === 'RISK') score = decision.data.strategic_moat_score > 70 ? 75 : 45;
              if (key === 'GOVERNANCE') score = 55;
            }

            const vote = score > 60 ? 'approve' : score < 40 ? 'reject' : 'abstain';
            if (vote === 'approve') approveCount++;
            if (vote === 'reject') rejectCount++;

            votes.push({
              agent: agent.name,
              vote,
              confidence: score / 100,
              reasoning: generateReasoning(key, decision, score)
            });
          }

          // Determine majority
          const majorityRec = approveCount > rejectCount ? 'approve' : 
                            rejectCount > approveCount ? 'reject' : 'split';
          
          // Find minority view
          const minorityAgent = votes.find(v => 
            (majorityRec === 'approve' && v.vote === 'reject') ||
            (majorityRec === 'reject' && v.vote === 'approve')
          );

          // Check for divergence warning
          const divergenceWarning = approveCount > 0 && rejectCount > 0 && 
                                   Math.abs(approveCount - rejectCount) <= 1;

          await base44.asServiceRole.entities.StrategicVote.create({
            session_id: results.session_id,
            decision_category: decision.category,
            decision_title: decision.title,
            decision_description: `Analysis of ${decision.title}`,
            votes,
            majority_recommendation: majorityRec,
            minority_view: minorityAgent?.reasoning,
            supporting_models: votes.filter(v => v.vote === majorityRec).map(v => v.agent),
            confidence_score: Math.max(...votes.map(v => v.confidence)),
            risk_flags: divergenceWarning ? ['Strategic divergence detected'] : [],
            strategic_divergence_warning: divergenceWarning,
            status: 'pending'
          });

          results.votes_recorded++;
        }

        // Calculate strategic health score
        const breaches = governanceMetrics.filter(m => m.breach_detected).length;
        const moatScore = latestMoat.overall_moat_score || 50;
        const growthHealth = (1 - (latestGrowth.conversions?.churn_rate || 0.05)) * 100;
        
        results.strategic_health_score = (
          moatScore * 0.4 +
          growthHealth * 0.3 +
          (100 - breaches * 10) * 0.3
        );

        return Response.json({ success: true, ...results });
      }

      // ==========================================
      // GET SHADOW BOARD SUMMARY
      // ==========================================
      case 'get_summary': {
        const scenarios = await base44.asServiceRole.entities.GovernanceScenario.filter({ status: 'active' }, '-risk_exposure_score', 10);
        const votes = await base44.asServiceRole.entities.StrategicVote.filter({}, '-created_date', 20);
        
        // Get latest session
        const latestSession = votes[0]?.session_id;
        const sessionVotes = votes.filter(v => v.session_id === latestSession);

        return Response.json({
          success: true,
          summary: {
            active_scenarios: scenarios.map(s => ({
              type: s.scenario_type,
              title: s.title,
              risk_score: s.risk_exposure_score,
              probability: s.probability_score,
              resilience: s.strategic_resilience_rating
            })),
            latest_session: {
              session_id: latestSession,
              votes: sessionVotes.map(v => ({
                category: v.decision_category,
                title: v.decision_title,
                recommendation: v.majority_recommendation,
                divergence_warning: v.strategic_divergence_warning,
                confidence: v.confidence_score
              })),
              divergence_count: sessionVotes.filter(v => v.strategic_divergence_warning).length
            },
            high_risk_decisions: sessionVotes.filter(v => v.strategic_divergence_warning || v.majority_recommendation === 'reject')
          }
        });
      }

      // ==========================================
      // APPROVE/REJECT DECISION
      // ==========================================
      case 'resolve_vote': {
        const { vote_id, decision } = params;

        await base44.asServiceRole.entities.StrategicVote.update(vote_id, {
          status: decision
        });

        // Log compliance event
        await base44.asServiceRole.entities.ComplianceEvent.create({
          event_type: 'admin_override',
          description: `Shadow Board decision ${decision}: ${vote_id}`,
          performed_by: user.email,
          risk_level: 'medium'
        });

        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Shadow Board error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function generateReasoning(agentKey, decision, score) {
  const reasonings = {
    CFO: score > 60 ? 'Financial metrics support this decision with acceptable ROI' : 'Financial risk exceeds acceptable thresholds',
    CTO: score > 60 ? 'Technical integration is feasible within acceptable complexity' : 'Technical complexity and integration risk are concerns',
    CRO: score > 60 ? 'Growth potential and market opportunity are compelling' : 'Growth impact does not justify the investment',
    RISK: score > 60 ? 'Risk profile is acceptable with proper mitigation' : 'Risk exposure is above acceptable levels',
    GOVERNANCE: score > 60 ? 'Compliant with governance and regulatory requirements' : 'Potential compliance or governance concerns'
  };
  return reasonings[agentKey] || 'Analysis complete';
}