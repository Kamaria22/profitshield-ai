import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      case 'generate_weekly_brief':
        return Response.json(await generateWeeklyBrief(base44));
      
      case 'revenue_forecast':
        return Response.json(await forecastRevenue(base44, params));
      
      case 'churn_analysis':
        return Response.json(await analyzeChurn(base44));
      
      case 'feature_roi':
        return Response.json(await analyzeFeatureROI(base44));
      
      case 'competitive_position':
        return Response.json(await assessCompetitivePosition(base44));
      
      case 'moat_strength':
        return Response.json(await calculateMoatStrength(base44));
      
      case 'growth_opportunities':
        return Response.json(await identifyGrowthOpportunities(base44));
      
      case 'ask':
        return Response.json(await answerFounderQuestion(base44, params.question));
      
      case 'auto_create_milestones':
        return Response.json(await autoCreateMilestones(base44));
      
      case 'link_insight_to_milestone':
        return Response.json(await linkInsightToMilestone(base44, params.insight_id, params.milestone_id));
      
      case 'send_critical_notifications':
        return Response.json(await sendCriticalNotifications(base44, params.founder_email));
      
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('FounderAI error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function generateWeeklyBrief(base44) {
  const insights = [];
  
  // Gather all metrics
  const tenants = await base44.asServiceRole.entities.Tenant.filter({});
  const orders = await base44.asServiceRole.entities.Order.filter({});
  const saasMetrics = await base44.asServiceRole.entities.SaaSMetrics.filter({});
  const alerts = await base44.asServiceRole.entities.Alert.filter({ status: 'pending' });
  
  // Calculate key metrics
  const activeTenants = tenants.filter(t => t.status === 'active').length;
  const trialTenants = tenants.filter(t => t.subscription_tier === 'trial').length;
  const paidTenants = tenants.filter(t => ['starter', 'growth', 'pro'].includes(t.subscription_tier)).length;
  
  const totalOrders = orders.length;
  const last7DaysOrders = orders.filter(o => {
    const date = new Date(o.order_date);
    return (Date.now() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
  }).length;
  
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || 0), 0);
  const highRiskOrders = orders.filter(o => o.risk_level === 'high').length;
  
  // Revenue insight
  const latestMetrics = saasMetrics.sort((a, b) => b.created_date?.localeCompare(a.created_date))[0];
  const mrr = latestMetrics?.mrr || (paidTenants * 49);
  const arr = mrr * 12;
  
  insights.push({
    insight_type: 'revenue_forecast',
    title: 'Weekly Revenue Summary',
    summary: `Current MRR: $${mrr.toLocaleString()}. ARR: $${arr.toLocaleString()}. ${paidTenants} paying customers.`,
    severity: mrr < 1000 ? 'high' : 'info',
    metrics: {
      current_value: mrr,
      trend: 'stable',
      forecast_30d: mrr * 1.05,
      forecast_90d: mrr * 1.15
    },
    recommendations: [
      { action: 'Focus on trial conversions', priority: 'high', estimated_impact: '+$500 MRR', effort: 'medium' },
      { action: 'Implement usage-based upsells', priority: 'medium', estimated_impact: '+20% expansion', effort: 'high' }
    ]
  });

  // Churn risk insight
  const churnRiskTenants = tenants.filter(t => {
    const daysSinceCreation = (Date.now() - new Date(t.created_date).getTime()) / (1000 * 60 * 60 * 24);
    return t.subscription_tier === 'trial' && daysSinceCreation > 10 && !t.onboarding_completed;
  });
  
  if (churnRiskTenants.length > 0) {
    insights.push({
      insight_type: 'churn_risk',
      title: 'Trial Conversion Risk',
      summary: `${churnRiskTenants.length} trials at risk of churning. They haven't completed onboarding.`,
      severity: 'high',
      affected_tenants: churnRiskTenants.length,
      recommendations: [
        { action: 'Send personalized onboarding emails', priority: 'critical', effort: 'low' },
        { action: 'Offer 1:1 setup calls', priority: 'high', effort: 'medium' }
      ]
    });
  }

  // System health insight
  const pendingAlerts = alerts.length;
  if (pendingAlerts > 10) {
    insights.push({
      insight_type: 'system_health',
      title: 'Alert Backlog Warning',
      summary: `${pendingAlerts} unresolved alerts across the platform.`,
      severity: 'medium',
      recommendations: [
        { action: 'Review high-severity alerts', priority: 'high', effort: 'low' }
      ]
    });
  }

  // Growth opportunity
  insights.push({
    insight_type: 'growth_opportunity',
    title: 'Platform Expansion Opportunity',
    summary: `${totalOrders.toLocaleString()} orders processed. Network effect potential: ${Math.round(totalOrders / 1000)}x data advantage.`,
    severity: 'info',
    metrics: {
      current_value: totalOrders,
      change_pct: 0
    },
    recommendations: [
      { action: 'Prioritize BigCommerce integration', priority: 'medium', effort: 'high' },
      { action: 'Launch referral program', priority: 'medium', effort: 'medium' }
    ]
  });

  // Strategic priority
  insights.push({
    insight_type: 'strategic_priority',
    title: 'This Week\'s Focus',
    summary: 'Based on current metrics, prioritize: 1) Trial conversions, 2) Feature adoption tracking, 3) Case study collection.',
    severity: 'info',
    recommendations: [
      { action: 'Schedule demos with active trials', priority: 'critical', effort: 'medium' },
      { action: 'Implement in-app feature usage tracking', priority: 'high', effort: 'medium' },
      { action: 'Reach out to power users for testimonials', priority: 'medium', effort: 'low' }
    ]
  });

  // Save insights
  for (const insight of insights) {
    await base44.asServiceRole.entities.FounderInsight.create({
      ...insight,
      period: new Date().toISOString().split('T')[0],
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  // Auto-create milestones from high-impact insights
  const milestoneResult = await autoCreateMilestones(base44);
  
  // Auto-link insights to existing milestones where relevant
  await autoLinkInsightsToMilestones(base44, insights);

  return {
    success: true,
    milestones_created: milestoneResult.milestones_created,
    brief: {
      summary: `Weekly Brief: $${mrr} MRR | ${activeTenants} active tenants | ${last7DaysOrders} orders this week | ${highRiskOrders} high-risk flagged`,
      key_metrics: {
        mrr, arr, activeTenants, trialTenants, paidTenants, totalOrders, highRiskOrders
      },
      insights,
      generated_at: new Date().toISOString()
    }
  };
}

async function forecastRevenue(base44, { months = 12 }) {
  const saasMetrics = await base44.asServiceRole.entities.SaaSMetrics.filter({});
  const tenants = await base44.asServiceRole.entities.Tenant.filter({});
  
  const paidTenants = tenants.filter(t => ['starter', 'growth', 'pro'].includes(t.subscription_tier)).length;
  const avgMRRPerTenant = 49; // Baseline
  const currentMRR = paidTenants * avgMRRPerTenant;
  
  // Simple growth projection (20% monthly for early stage)
  const forecast = [];
  let projectedMRR = currentMRR;
  const growthRate = 0.15; // 15% monthly
  
  for (let i = 1; i <= months; i++) {
    projectedMRR *= (1 + growthRate);
    forecast.push({
      month: i,
      mrr: Math.round(projectedMRR),
      arr: Math.round(projectedMRR * 12),
      projected_tenants: Math.round(projectedMRR / avgMRRPerTenant)
    });
  }

  return {
    current_mrr: currentMRR,
    current_arr: currentMRR * 12,
    forecast,
    assumptions: {
      growth_rate: growthRate,
      avg_mrr_per_tenant: avgMRRPerTenant,
      churn_rate: 0.05
    }
  };
}

async function analyzeChurn(base44) {
  const tenants = await base44.asServiceRole.entities.Tenant.filter({});
  const now = Date.now();
  
  const churnRiskSegments = {
    high_risk: [],
    medium_risk: [],
    low_risk: []
  };

  for (const tenant of tenants) {
    const daysSinceCreation = (now - new Date(tenant.created_date).getTime()) / (1000 * 60 * 60 * 24);
    const isTrial = tenant.subscription_tier === 'trial';
    const onboardingDone = tenant.onboarding_completed;
    
    let riskScore = 0;
    const riskFactors = [];

    if (isTrial && daysSinceCreation > 10 && !onboardingDone) {
      riskScore += 40;
      riskFactors.push('Trial > 10 days without onboarding');
    }
    
    if (isTrial && daysSinceCreation > 12) {
      riskScore += 30;
      riskFactors.push('Trial expiring soon');
    }

    if (!onboardingDone) {
      riskScore += 20;
      riskFactors.push('Incomplete onboarding');
    }

    if (riskScore >= 50) {
      churnRiskSegments.high_risk.push({ tenant_id: tenant.id, shop: tenant.shop_name, risk_score: riskScore, factors: riskFactors });
    } else if (riskScore >= 30) {
      churnRiskSegments.medium_risk.push({ tenant_id: tenant.id, shop: tenant.shop_name, risk_score: riskScore, factors: riskFactors });
    } else {
      churnRiskSegments.low_risk.push({ tenant_id: tenant.id, shop: tenant.shop_name, risk_score: riskScore });
    }
  }

  return {
    summary: {
      high_risk_count: churnRiskSegments.high_risk.length,
      medium_risk_count: churnRiskSegments.medium_risk.length,
      low_risk_count: churnRiskSegments.low_risk.length
    },
    segments: churnRiskSegments,
    recommendations: [
      churnRiskSegments.high_risk.length > 0 ? 'Immediately reach out to high-risk trials' : null,
      'Implement automated onboarding email sequence',
      'Add in-app progress indicators'
    ].filter(Boolean)
  };
}

async function analyzeFeatureROI(base44) {
  // Analyze which features drive conversions
  const tenants = await base44.asServiceRole.entities.Tenant.filter({});
  const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({});
  const rules = await base44.asServiceRole.entities.RiskRule.filter({});
  const alerts = await base44.asServiceRole.entities.AlertRule.filter({});

  const featureUsage = {
    risk_rules: { users: new Set(), total: rules.length },
    alert_rules: { users: new Set(), total: alerts.length },
    two_way_sync: { users: new Set(), total: 0 },
    multi_platform: { users: new Set(), total: 0 }
  };

  for (const rule of rules) featureUsage.risk_rules.users.add(rule.tenant_id);
  for (const alert of alerts) featureUsage.alert_rules.users.add(alert.tenant_id);
  
  for (const integration of integrations) {
    if (integration.two_way_sync?.enabled) {
      featureUsage.two_way_sync.users.add(integration.tenant_id);
      featureUsage.two_way_sync.total++;
    }
  }

  // Check for multi-platform users
  const tenantPlatforms = {};
  for (const integration of integrations) {
    if (!tenantPlatforms[integration.tenant_id]) tenantPlatforms[integration.tenant_id] = new Set();
    tenantPlatforms[integration.tenant_id].add(integration.platform);
  }
  for (const [tenantId, platforms] of Object.entries(tenantPlatforms)) {
    if (platforms.size > 1) featureUsage.multi_platform.users.add(tenantId);
  }

  return {
    feature_adoption: {
      risk_rules: { unique_tenants: featureUsage.risk_rules.users.size, total_created: featureUsage.risk_rules.total },
      alert_rules: { unique_tenants: featureUsage.alert_rules.users.size, total_created: featureUsage.alert_rules.total },
      two_way_sync: { unique_tenants: featureUsage.two_way_sync.users.size },
      multi_platform: { unique_tenants: featureUsage.multi_platform.users.size }
    },
    insights: [
      'Risk rules have highest engagement - consider featuring more prominently',
      'Two-way sync is underutilized - improve onboarding for this feature',
      'Multi-platform users likely have higher LTV - prioritize BigCommerce'
    ]
  };
}

async function calculateMoatStrength(base44) {
  const orders = await base44.asServiceRole.entities.Order.filter({});
  const signals = await base44.asServiceRole.entities.GlobalRiskSignal.filter({});
  const patterns = await base44.asServiceRole.entities.AnomalyPattern.filter({});
  const rules = await base44.asServiceRole.entities.RiskRule.filter({});
  const models = await base44.asServiceRole.entities.ModelVersion.filter({});
  const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({});
  const tenants = await base44.asServiceRole.entities.Tenant.filter({});
  const extensions = await base44.asServiceRole.entities.ExtensionInstall.filter({});

  const moatScores = {
    data_moat: Math.min(100, (orders.length / 100) + (signals.length * 5) + (patterns.length * 10)),
    workflow_moat: Math.min(100, (rules.length * 3) + (tenants.filter(t => t.onboarding_completed).length * 5)),
    network_moat: Math.min(100, tenants.length * 2 + (orders.length / 500)),
    ai_moat: Math.min(100, (models.length * 20) + (signals.length * 2)),
    platform_moat: Math.min(100, (new Set(integrations.map(i => i.platform)).size * 25) + extensions.length * 5),
    economic_moat: Math.min(100, tenants.filter(t => ['growth', 'pro'].includes(t.subscription_tier)).length * 10)
  };

  const overallScore = Object.values(moatScores).reduce((a, b) => a + b, 0) / 6;

  let position = 'weak';
  if (overallScore >= 80) position = 'dominant';
  else if (overallScore >= 60) position = 'strong';
  else if (overallScore >= 40) position = 'competitive';
  else if (overallScore >= 20) position = 'vulnerable';

  // Save metric
  await base44.asServiceRole.entities.MoatMetric.create({
    period: new Date().toISOString().split('T')[0],
    period_type: 'weekly',
    data_moat: { total_orders_processed: orders.length, unique_fraud_patterns: patterns.length, cross_merchant_signals: signals.length, data_uniqueness_score: moatScores.data_moat },
    workflow_moat: { automations_created: rules.length, workflow_depth_score: moatScores.workflow_moat },
    network_moat: { merchants_contributing: tenants.length, network_effect_score: moatScores.network_moat },
    ai_moat: { model_versions_deployed: models.length, prediction_accuracy: 0.85 },
    platform_moat: { platforms_supported: new Set(integrations.map(i => i.platform)).size, extensions_installed: extensions.length },
    economic_moat: { churn_rate: 0.05 },
    overall_moat_score: overallScore,
    competitive_position: position
  });

  return {
    moat_scores: moatScores,
    overall_score: Math.round(overallScore),
    competitive_position: position,
    recommendations: [
      moatScores.data_moat < 50 ? 'Accelerate order processing to build data advantage' : null,
      moatScores.network_moat < 50 ? 'Focus on merchant acquisition for network effects' : null,
      moatScores.platform_moat < 50 ? 'Prioritize additional platform integrations' : null
    ].filter(Boolean)
  };
}

async function identifyGrowthOpportunities(base44) {
  const tenants = await base44.asServiceRole.entities.Tenant.filter({});
  const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({});

  const opportunities = [];

  // Trial conversion opportunity
  const trials = tenants.filter(t => t.subscription_tier === 'trial');
  const activatedTrials = trials.filter(t => t.onboarding_completed);
  const conversionRate = trials.length > 0 ? activatedTrials.length / trials.length : 0;
  
  if (conversionRate < 0.5) {
    opportunities.push({
      type: 'conversion',
      title: 'Improve Trial Conversion',
      current_rate: conversionRate,
      target_rate: 0.5,
      potential_revenue: trials.length * 49 * 0.3,
      actions: ['Simplify onboarding', 'Add progress indicators', 'Send reminder emails']
    });
  }

  // Platform expansion
  const platformCounts = {};
  integrations.forEach(i => platformCounts[i.platform] = (platformCounts[i.platform] || 0) + 1);
  
  opportunities.push({
    type: 'expansion',
    title: 'Platform Distribution',
    current_state: platformCounts,
    recommendation: 'BigCommerce integration could capture underserved market segment'
  });

  // Upsell opportunity
  const starterTenants = tenants.filter(t => t.subscription_tier === 'starter');
  if (starterTenants.length > 0) {
    opportunities.push({
      type: 'upsell',
      title: 'Upgrade Path',
      target_segment: `${starterTenants.length} starter plan tenants`,
      potential_revenue: starterTenants.length * 50, // $50 additional per upgrade
      actions: ['Implement usage-based triggers', 'Create comparison page', 'Offer annual discounts']
    });
  }

  // Create insights for significant opportunities
  for (const opp of opportunities) {
    if (opp.potential_revenue >= 100 || opp.type === 'expansion') {
      await base44.asServiceRole.entities.FounderInsight.create({
        insight_type: 'growth_opportunity',
        title: opp.title,
        summary: opp.recommendation || `Potential revenue: $${opp.potential_revenue || 0}`,
        severity: opp.potential_revenue >= 500 ? 'high' : 'medium',
        impact_score: Math.min(100, (opp.potential_revenue || 50) / 10),
        recommendations: (opp.actions || []).map(a => ({ action: a, priority: 'medium', effort: 'medium' })),
        period: new Date().toISOString().split('T')[0],
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
  }

  return { opportunities };
}

async function autoLinkInsightsToMilestones(base44, insights) {
  const milestones = await base44.asServiceRole.entities.StrategicMilestone.filter({});
  
  for (const insight of insights) {
    if (insight.linked_milestone_id) continue;
    
    // Simple keyword matching for auto-linking
    const insightText = `${insight.title} ${insight.summary}`.toLowerCase();
    
    for (const milestone of milestones) {
      const milestoneText = `${milestone.name} ${milestone.description || ''}`.toLowerCase();
      
      // Check for significant overlap
      const insightWords = insightText.split(/\s+/).filter(w => w.length > 4);
      const matchCount = insightWords.filter(w => milestoneText.includes(w)).length;
      
      if (matchCount >= 2) {
        await base44.asServiceRole.entities.FounderInsight.update(insight.id, {
          linked_milestone_id: milestone.id
        });
        break;
      }
    }
  }
}

async function answerFounderQuestion(base44, question) {
  // Use LLM to answer strategic questions with context
  const tenants = await base44.asServiceRole.entities.Tenant.filter({});
  const orders = await base44.asServiceRole.entities.Order.filter({});
  const insights = await base44.asServiceRole.entities.FounderInsight.filter({});
  
  const context = `
ProfitShield Metrics:
- Total Tenants: ${tenants.length}
- Active Tenants: ${tenants.filter(t => t.status === 'active').length}
- Trial Tenants: ${tenants.filter(t => t.subscription_tier === 'trial').length}
- Paid Tenants: ${tenants.filter(t => ['starter', 'growth', 'pro'].includes(t.subscription_tier)).length}
- Total Orders Processed: ${orders.length}
- High Risk Orders: ${orders.filter(o => o.risk_level === 'high').length}
- Recent Insights: ${insights.slice(0, 3).map(i => i.title).join(', ')}
  `;

  const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are FounderAI, a strategic advisor for the founder of ProfitShield, a B2B SaaS for e-commerce fraud and profit protection.

Context:
${context}

Question: ${question}

Provide a concise, actionable answer focused on business strategy, growth, and competitive positioning. Be direct and specific.`,
    response_json_schema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        key_points: { type: 'array', items: { type: 'string' } },
        suggested_actions: { type: 'array', items: { type: 'string' } },
        metrics_to_watch: { type: 'array', items: { type: 'string' } }
      }
    }
  });

  return response;
}

async function autoCreateMilestones(base44) {
  const createdMilestones = [];
  
  // Get unactioned growth opportunity insights
  const insights = await base44.asServiceRole.entities.FounderInsight.filter({
    is_actioned: false
  });
  
  const growthInsights = insights.filter(i => 
    ['growth_opportunity', 'moat_alert', 'milestone_suggestion'].includes(i.insight_type) &&
    !i.auto_created_milestone_id &&
    (i.severity === 'critical' || i.severity === 'high' || i.impact_score >= 70)
  );

  // Get existing milestones to avoid duplicates
  const existingMilestones = await base44.asServiceRole.entities.StrategicMilestone.filter({});
  const existingNames = new Set(existingMilestones.map(m => m.name.toLowerCase()));

  for (const insight of growthInsights) {
    // Use AI to generate milestone from insight
    const milestoneData = await generateMilestoneFromInsight(base44, insight, existingNames);
    
    if (milestoneData && !existingNames.has(milestoneData.name.toLowerCase())) {
      const milestone = await base44.asServiceRole.entities.StrategicMilestone.create(milestoneData);
      
      // Link insight to milestone
      await base44.asServiceRole.entities.FounderInsight.update(insight.id, {
        auto_created_milestone_id: milestone.id,
        is_actioned: true
      });
      
      createdMilestones.push(milestone);
      existingNames.add(milestoneData.name.toLowerCase());
    }
  }

  return { 
    success: true, 
    milestones_created: createdMilestones.length,
    milestones: createdMilestones 
  };
}

async function generateMilestoneFromInsight(base44, insight, existingNames) {
  const prompt = `Based on this business insight, generate a strategic milestone for a SaaS roadmap.

Insight Type: ${insight.insight_type}
Title: ${insight.title}
Summary: ${insight.summary}
Severity: ${insight.severity}
Impact Score: ${insight.impact_score || 'N/A'}
Recommendations: ${JSON.stringify(insight.recommendations || [])}

Existing milestone names to avoid duplicating: ${Array.from(existingNames).slice(0, 20).join(', ')}

Generate a milestone that would address this insight. Be specific and actionable.`;

  try {
    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short, actionable milestone name' },
          description: { type: 'string', description: 'Detailed description of what to achieve' },
          category: { type: 'string', enum: ['product', 'growth', 'revenue', 'technical', 'market_expansion', 'enterprise', 'ai_capability', 'platform'] },
          phase: { type: 'string', enum: ['year_1_2', 'year_3_5', 'year_5_7', 'year_7_10'] },
          priority: { type: 'number', description: '1-100, higher = more critical' },
          moat_contribution: { type: 'array', items: { type: 'string', enum: ['data_moat', 'workflow_moat', 'network_moat', 'ai_moat', 'platform_moat', 'economic_moat'] } },
          estimated_revenue_impact: { type: 'number', description: 'Estimated monthly revenue impact in dollars' },
          should_create: { type: 'boolean', description: 'True if this is valuable enough to create as milestone' }
        }
      }
    });

    if (!response.should_create) return null;

    return {
      name: response.name,
      description: response.description,
      category: response.category || 'growth',
      phase: response.phase || 'year_1_2',
      status: 'planned',
      priority: response.priority || 50,
      moat_contribution: response.moat_contribution || [],
      estimated_revenue_impact: response.estimated_revenue_impact,
      notes: `Auto-generated from insight: ${insight.title}`
    };
  } catch (e) {
    console.error('Failed to generate milestone from insight:', e);
    return null;
  }
}

async function linkInsightToMilestone(base44, insightId, milestoneId) {
  await base44.asServiceRole.entities.FounderInsight.update(insightId, {
    linked_milestone_id: milestoneId
  });
  return { success: true };
}

async function sendCriticalNotifications(base44, founderEmail) {
  if (!founderEmail) {
    return { success: false, error: 'Founder email required' };
  }

  // Get critical unnotified insights
  const insights = await base44.asServiceRole.entities.FounderInsight.filter({
    notification_sent: false
  });

  const criticalInsights = insights.filter(i => 
    i.severity === 'critical' || 
    (i.severity === 'high' && i.impact_score >= 80)
  );

  if (criticalInsights.length === 0) {
    return { success: true, notifications_sent: 0 };
  }

  // Build email content
  const insightsList = criticalInsights.map(i => 
    `• [${i.severity.toUpperCase()}] ${i.title}\n  ${i.summary}`
  ).join('\n\n');

  const emailBody = `
ProfitShield Founder Alert

${criticalInsights.length} critical insight(s) require your attention:

${insightsList}

---
Recommended Actions:
${criticalInsights.flatMap(i => i.recommendations?.slice(0, 2) || []).map(r => `• ${r.action}`).join('\n')}

View full details in your Founder AI Dashboard.
  `.trim();

  // Send email
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: founderEmail,
      subject: `🚨 ProfitShield Alert: ${criticalInsights.length} Critical Insight(s)`,
      body: emailBody
    });

    // Mark as notified
    for (const insight of criticalInsights) {
      await base44.asServiceRole.entities.FounderInsight.update(insight.id, {
        notification_sent: true,
        notification_sent_at: new Date().toISOString()
      });
    }

    return { 
      success: true, 
      notifications_sent: criticalInsights.length,
      insights_notified: criticalInsights.map(i => i.id)
    };
  } catch (e) {
    console.error('Failed to send notification:', e);
    return { success: false, error: e.message };
  }
}

async function assessCompetitivePosition(base44) {
  return {
    position: 'emerging',
    strengths: [
      'Multi-platform support (Shopify, WooCommerce, BigCommerce)',
      'Self-improving AI risk scoring',
      'Two-way sync capability',
      'Unified platform resolver architecture'
    ],
    weaknesses: [
      'Early-stage data volume',
      'Limited enterprise features',
      'No SOC2 certification yet'
    ],
    opportunities: [
      'Cross-merchant intelligence network',
      'Automation marketplace',
      'White-label offering for platforms'
    ],
    threats: [
      'Platform-native solutions',
      'Established fraud detection players',
      'Economic downturn reducing e-commerce spend'
    ],
    strategic_priorities: [
      'Accelerate data flywheel',
      'Build network effects',
      'Deepen workflow integration'
    ]
  };
}