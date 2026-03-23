import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, tenant_id, ...params } = await req.json();

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    switch (action) {
      case 'ask':
        return Response.json(await answerQuestion(base44, tenant_id, params.question, params.context));
      
      case 'diagnose_profit_drop':
        return Response.json(await diagnoseProfitDrop(base44, tenant_id, params));
      
      case 'suggest_automations':
        return Response.json(await suggestAutomations(base44, tenant_id));
      
      case 'orders_to_review':
        return Response.json(await getOrdersToReview(base44, tenant_id));
      
      case 'generate_recommendations':
        return Response.json(await generateRecommendations(base44, tenant_id));
      
      case 'explain_risk':
        return Response.json(await explainOrderRisk(base44, tenant_id, params.order_id));
      
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('MerchantAI error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function answerQuestion(base44, tenantId, question, context = {}) {
  // Gather merchant data for context
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 100);
  const rules = await base44.asServiceRole.entities.RiskRule.filter({ tenant_id: tenantId });
  const alerts = await base44.asServiceRole.entities.Alert.filter({ tenant_id: tenantId, status: 'pending' });
  
  // Calculate key metrics
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + (o.total_revenue || 0), 0);
  const totalProfit = orders.reduce((s, o) => s + (o.net_profit || 0), 0);
  const highRiskOrders = orders.filter(o => o.risk_level === 'high');
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0;

  const merchantContext = `
Merchant Data (Last 100 Orders):
- Total Orders: ${totalOrders}
- Total Revenue: $${totalRevenue.toLocaleString()}
- Total Profit: $${totalProfit.toLocaleString()}
- Average Margin: ${avgMargin.toFixed(1)}%
- High Risk Orders: ${highRiskOrders.length}
- Active Risk Rules: ${rules.filter(r => r.is_active).length}
- Pending Alerts: ${alerts.length}
${context.current_page ? `- Current Page: ${context.current_page}` : ''}
${context.selected_order_id ? `- Selected Order: ${context.selected_order_id}` : ''}
`;

  const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are MerchantAI, an intelligent assistant for e-commerce merchants using ProfitShield.
Your job is to help merchants understand their profit, manage risk, and optimize their business.

${merchantContext}

Merchant Question: ${question}

Provide a helpful, specific answer. If the merchant asks about specific orders, risk, or profit issues, give concrete insights.
If they ask what to do, give actionable recommendations.
Be concise but thorough.`,
    response_json_schema: {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        insights: { type: 'array', items: { type: 'string' } },
        suggested_actions: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, reason: { type: 'string' } } } },
        related_orders: { type: 'array', items: { type: 'string' } }
      }
    }
  });

  // Log conversation
  await base44.asServiceRole.entities.MerchantConversation.create({
    tenant_id: tenantId,
    user_id: (await base44.auth.me())?.id,
    context,
    messages: [
      { role: 'user', content: question, timestamp: new Date().toISOString() },
      { role: 'assistant', content: response.answer, timestamp: new Date().toISOString() }
    ],
    insights_generated: response.insights || []
  });

  return response;
}

async function diagnoseProfitDrop(base44, tenantId, { period_days = 30 }) {
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
  const now = Date.now();
  const periodMs = period_days * 24 * 60 * 60 * 1000;
  
  const currentPeriod = orders.filter(o => (now - new Date(o.order_date).getTime()) < periodMs);
  const previousPeriod = orders.filter(o => {
    const age = now - new Date(o.order_date).getTime();
    return age >= periodMs && age < periodMs * 2;
  });

  const currentMetrics = calculatePeriodMetrics(currentPeriod);
  const previousMetrics = calculatePeriodMetrics(previousPeriod);

  const diagnosis = {
    period_days,
    current: currentMetrics,
    previous: previousMetrics,
    changes: {
      revenue_change_pct: previousMetrics.revenue > 0 ? ((currentMetrics.revenue - previousMetrics.revenue) / previousMetrics.revenue * 100) : 0,
      profit_change_pct: previousMetrics.profit > 0 ? ((currentMetrics.profit - previousMetrics.profit) / previousMetrics.profit * 100) : 0,
      margin_change: currentMetrics.margin - previousMetrics.margin,
      high_risk_change: currentMetrics.high_risk_count - previousMetrics.high_risk_count
    },
    issues: [],
    recommendations: []
  };

  // Identify issues
  if (diagnosis.changes.margin_change < -5) {
    diagnosis.issues.push('Significant margin decline detected');
    
    // Check for COGS increase
    const avgCOGS = currentMetrics.orders > 0 ? currentPeriod.reduce((s, o) => s + (o.total_cogs || 0), 0) / currentMetrics.orders : 0;
    const prevAvgCOGS = previousMetrics.orders > 0 ? previousPeriod.reduce((s, o) => s + (o.total_cogs || 0), 0) / previousMetrics.orders : 0;
    
    if (avgCOGS > prevAvgCOGS * 1.1) {
      diagnosis.issues.push('Product costs (COGS) increased by more than 10%');
      diagnosis.recommendations.push({ action: 'Review supplier pricing', priority: 'high' });
    }
    
    // Check for discount increase
    const avgDiscount = currentMetrics.orders > 0 ? currentPeriod.reduce((s, o) => s + (o.discount_total || 0), 0) / currentMetrics.orders : 0;
    const prevAvgDiscount = previousMetrics.orders > 0 ? previousPeriod.reduce((s, o) => s + (o.discount_total || 0), 0) / previousMetrics.orders : 0;
    
    if (avgDiscount > prevAvgDiscount * 1.2) {
      diagnosis.issues.push('Average discount per order increased');
      diagnosis.recommendations.push({ action: 'Review discount code usage', priority: 'high' });
    }
  }

  if (diagnosis.changes.high_risk_change > 5) {
    diagnosis.issues.push(`High-risk orders increased by ${diagnosis.changes.high_risk_change}`);
    diagnosis.recommendations.push({ action: 'Review risk rules and consider tightening thresholds', priority: 'medium' });
  }

  if (diagnosis.issues.length === 0) {
    diagnosis.summary = 'No significant profit issues detected in this period.';
  } else {
    diagnosis.summary = `Found ${diagnosis.issues.length} issue(s) affecting profitability.`;
  }

  return diagnosis;
}

function calculatePeriodMetrics(orders) {
  return {
    orders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.total_revenue || 0), 0),
    profit: orders.reduce((s, o) => s + (o.net_profit || 0), 0),
    margin: orders.length > 0 
      ? (orders.reduce((s, o) => s + (o.net_profit || 0), 0) / orders.reduce((s, o) => s + (o.total_revenue || 0), 0) * 100) 
      : 0,
    high_risk_count: orders.filter(o => o.risk_level === 'high').length,
    refunds: orders.reduce((s, o) => s + (o.refund_amount || 0), 0)
  };
}

async function suggestAutomations(base44, tenantId) {
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
  const existingRules = await base44.asServiceRole.entities.RiskRule.filter({ tenant_id: tenantId });
  
  const suggestions = [];
  
  // Analyze order patterns
  const highValueOrders = orders.filter(o => o.total_revenue > 500);
  const highValueFirstOrders = highValueOrders.filter(o => o.is_first_order);
  
  if (highValueFirstOrders.length > 5 && !existingRules.some(r => r.name.toLowerCase().includes('first order'))) {
    suggestions.push({
      type: 'risk_rule',
      title: 'Flag High-Value First Orders',
      description: `${highValueFirstOrders.length} high-value first orders detected. Consider adding verification.`,
      config: {
        name: 'High Value First Orders',
        conditions: [
          { field: 'is_first_order', operator: 'equals', value: 'true' },
          { field: 'order_value', operator: 'greater_than', value: '500' }
        ],
        risk_adjustment: 25,
        action: 'verify'
      },
      one_click_apply: true
    });
  }

  // Check for discount patterns
  const heavyDiscountOrders = orders.filter(o => {
    const discountPct = o.total_revenue > 0 ? (o.discount_total || 0) / (o.total_revenue + (o.discount_total || 0)) * 100 : 0;
    return discountPct > 30;
  });

  if (heavyDiscountOrders.length > 10 && !existingRules.some(r => r.name.toLowerCase().includes('discount'))) {
    suggestions.push({
      type: 'risk_rule',
      title: 'Monitor Heavy Discounts',
      description: `${heavyDiscountOrders.length} orders with >30% discount. Could indicate discount abuse.`,
      config: {
        name: 'Heavy Discount Alert',
        conditions: [{ field: 'discount_pct', operator: 'greater_than', value: '30' }],
        risk_adjustment: 15,
        action: 'flag'
      },
      one_click_apply: true
    });
  }

  // Save as recommendations
  for (const suggestion of suggestions) {
    await base44.asServiceRole.entities.MerchantRecommendation.create({
      tenant_id: tenantId,
      recommendation_type: suggestion.type,
      title: suggestion.title,
      description: suggestion.description,
      action_config: suggestion.config,
      one_click_apply: suggestion.one_click_apply,
      priority: 'medium',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  return { suggestions };
}

async function getOrdersToReview(base44, tenantId) {
  const orders = await base44.asServiceRole.entities.Order.filter({ 
    tenant_id: tenantId,
    risk_level: 'high'
  }, '-order_date', 20);

  const pendingReview = orders.filter(o => 
    o.status === 'pending' || o.status === 'paid'
  );

  const recommendations = pendingReview.map(order => {
    const actions = [];
    
    if (order.fraud_score >= 70) {
      actions.push({ action: 'Consider cancelling', reason: 'Very high fraud risk' });
    } else if (order.fraud_score >= 50) {
      actions.push({ action: 'Verify with customer', reason: 'Elevated risk - confirm legitimacy' });
    }
    
    if (order.total_revenue > 1000) {
      actions.push({ action: 'Require signature', reason: 'High-value shipment protection' });
    }

    return {
      order_id: order.id,
      order_number: order.order_number,
      customer: order.customer_name,
      value: order.total_revenue,
      risk_score: order.fraud_score,
      risk_level: order.risk_level,
      reasons: order.risk_reasons || [],
      recommended_actions: actions
    };
  });

  return {
    summary: `${pendingReview.length} high-risk orders need review`,
    orders: recommendations.slice(0, 10)
  };
}

async function generateRecommendations(base44, tenantId) {
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
  const settings = await base44.asServiceRole.entities.TenantSettings.filter({ tenant_id: tenantId });
  
  const recommendations = [];

  // Check if risk alerts are enabled
  if (!settings[0]?.enable_risk_alerts) {
    recommendations.push({
      recommendation_type: 'fraud_prevention',
      title: 'Enable Risk Alerts',
      description: 'Turn on risk alerts to get notified of high-risk orders automatically.',
      priority: 'high',
      one_click_apply: true
    });
  }

  // Calculate metrics
  const totalRefunds = orders.reduce((s, o) => s + (o.refund_amount || 0), 0);
  const totalRevenue = orders.reduce((s, o) => s + (o.total_revenue || 0), 0);
  const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue * 100) : 0;

  if (refundRate > 5) {
    recommendations.push({
      recommendation_type: 'refund_prevention',
      title: 'High Refund Rate Detected',
      description: `Your refund rate is ${refundRate.toFixed(1)}%. Consider reviewing product descriptions and adding verification for high-risk orders.`,
      priority: 'high',
      estimated_impact: { metric: 'refund_rate', current_value: refundRate, projected_value: refundRate * 0.7, confidence: 0.7 }
    });
  }

  // Save recommendations
  for (const rec of recommendations) {
    await base44.asServiceRole.entities.MerchantRecommendation.create({
      tenant_id: tenantId,
      ...rec,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    });
  }

  return { recommendations };
}

async function explainOrderRisk(base44, tenantId, orderId) {
  const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId, tenant_id: tenantId });
  if (orders.length === 0) return { error: 'Order not found' };
  
  const order = orders[0];
  const audits = await base44.asServiceRole.entities.RiskScoreAudit.filter({ order_id: orderId });
  const audit = audits[0];

  const explanation = {
    order_id: orderId,
    order_number: order.order_number,
    risk_score: order.fraud_score,
    risk_level: order.risk_level,
    factors: [],
    recommendation: order.recommended_action
  };

  if (audit?.feature_contributions) {
    explanation.factors = audit.feature_contributions.slice(0, 5).map(f => ({
      factor: f.feature,
      value: f.value,
      impact: f.contribution > 0 ? `+${f.contribution} points` : `${f.contribution} points`,
      direction: f.contribution > 0 ? 'increases_risk' : 'decreases_risk'
    }));
  } else {
    // Fallback to basic explanation
    if (order.is_first_order) explanation.factors.push({ factor: 'New Customer', value: 'Yes', impact: '+15 points', direction: 'increases_risk' });
    if (order.total_revenue > 500) explanation.factors.push({ factor: 'High Order Value', value: `$${order.total_revenue}`, impact: '+10 points', direction: 'increases_risk' });
    if (order.risk_reasons) {
      order.risk_reasons.forEach(reason => {
        explanation.factors.push({ factor: reason.split(':')[0], value: reason.split(':')[1] || 'Yes', impact: 'Varies', direction: 'increases_risk' });
      });
    }
  }

  // Generate natural language explanation
  const factorSummary = explanation.factors.slice(0, 3).map(f => f.factor).join(', ');
  explanation.summary = `This order scored ${order.fraud_score}/100 (${order.risk_level} risk) primarily due to: ${factorSummary}.`;

  return explanation;
}