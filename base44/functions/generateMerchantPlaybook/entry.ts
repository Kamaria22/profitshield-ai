import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Merchant Playbook Generator
 * 
 * AI-generated actionable insights for merchants:
 * - Top fraud patterns in your store
 * - Most profitable risk reductions
 * - Chargeback prevention checklist
 * - Monthly summary PDF
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      // ============================================
      // GENERATE FRAUD PATTERNS PLAYBOOK
      // ============================================
      case 'generate_fraud_patterns': {
        const { tenant_id, days = 90 } = params;

        // Get orders and outcomes
        const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
        const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({ tenant_id });
        const chargebacks = await base44.asServiceRole.entities.ChargebackOutcome.filter({ tenant_id });

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const recentOrders = orders.filter(o => new Date(o.order_date || o.created_date) >= startDate);
        const recentOutcomes = outcomes.filter(o => new Date(o.created_date) >= startDate);
        const recentChargebacks = chargebacks.filter(c => new Date(c.created_date) >= startDate);

        // Analyze fraud patterns
        const patternStats = {};
        const badOutcomes = recentOutcomes.filter(o => 
          o.outcome_type?.includes('chargeback') ||
          o.outcome_type?.includes('fraud') ||
          o.outcome_type?.includes('abuse')
        );

        for (const outcome of badOutcomes) {
          for (const factor of (outcome.contributing_factors || [])) {
            if (!patternStats[factor]) {
              patternStats[factor] = { 
                count: 0, 
                totalLoss: 0, 
                avgOrderValue: 0,
                examples: []
              };
            }
            patternStats[factor].count++;
            patternStats[factor].totalLoss += outcome.financial_impact?.net_loss || 0;
            if (patternStats[factor].examples.length < 3) {
              patternStats[factor].examples.push({
                order_id: outcome.order_id,
                outcome: outcome.outcome_type,
                loss: outcome.financial_impact?.net_loss || 0
              });
            }
          }
        }

        // Sort patterns by impact
        const topPatterns = Object.entries(patternStats)
          .map(([pattern, stats]) => ({
            pattern,
            ...stats,
            avgLoss: stats.totalLoss / stats.count
          }))
          .sort((a, b) => b.totalLoss - a.totalLoss)
          .slice(0, 5);

        const insights = topPatterns.map((p, i) => ({
          rank: i + 1,
          title: formatPatternName(p.pattern),
          description: `This pattern appeared in ${p.count} fraud/chargeback cases, causing $${Math.round(p.totalLoss)} in losses.`,
          impact_estimate: p.totalLoss,
          confidence: Math.min(p.count / 10, 0.95),
          action_items: getActionItemsForPattern(p.pattern),
          data_points: {
            occurrences: p.count,
            total_loss: p.totalLoss,
            avg_loss_per_case: Math.round(p.avgLoss)
          }
        }));

        const playbook = await base44.asServiceRole.entities.MerchantPlaybook.create({
          tenant_id,
          playbook_type: 'fraud_patterns',
          title: 'Top 5 Fraud Patterns in Your Store',
          period: `${startDate.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}`,
          generated_at: new Date().toISOString(),
          insights,
          summary_stats: {
            orders_analyzed: recentOrders.length,
            chargebacks_prevented: 0, // Would need more data
            estimated_savings: topPatterns.reduce((s, p) => s + p.totalLoss, 0) * 0.5, // Assume 50% could be prevented
            risk_accuracy: calculateAccuracy(recentOutcomes),
            top_risk_category: topPatterns[0]?.pattern || 'None identified'
          },
          recommendations: generateRecommendations(topPatterns)
        });

        return Response.json({ success: true, playbook_id: playbook.id, insights_count: insights.length });
      }

      // ============================================
      // GENERATE CHARGEBACK PREVENTION CHECKLIST
      // ============================================
      case 'generate_chargeback_checklist': {
        const { tenant_id } = params;

        // Get chargeback outcomes
        const chargebacks = await base44.asServiceRole.entities.ChargebackOutcome.filter({ tenant_id });
        
        // Analyze win/loss patterns
        const wonChargebacks = chargebacks.filter(c => c.outcome === 'won');
        const lostChargebacks = chargebacks.filter(c => c.outcome === 'lost');

        // What worked for winning
        const winningFactors = {};
        for (const cb of wonChargebacks) {
          if (cb.evidence_submitted) {
            winningFactors['evidence_submitted'] = (winningFactors['evidence_submitted'] || 0) + 1;
          }
          for (const evType of (cb.evidence_types || [])) {
            winningFactors[`evidence_${evType}`] = (winningFactors[`evidence_${evType}`] || 0) + 1;
          }
        }

        // Common reasons for losing
        const losingReasons = {};
        for (const cb of lostChargebacks) {
          losingReasons[cb.dispute_reason] = (losingReasons[cb.dispute_reason] || 0) + 1;
        }

        const insights = [
          {
            rank: 1,
            title: 'Always Submit Evidence',
            description: `${Math.round((wonChargebacks.filter(c => c.evidence_submitted).length / (wonChargebacks.length || 1)) * 100)}% of won chargebacks had evidence submitted.`,
            action_items: [
              'Respond to all chargebacks within 24 hours',
              'Keep shipping tracking for all orders',
              'Save customer communication records'
            ]
          },
          {
            rank: 2,
            title: 'Use Signature Confirmation for High-Value Orders',
            description: 'Orders over $250 should require signature confirmation to prevent "item not received" disputes.',
            action_items: [
              'Enable signature confirmation for orders over $250',
              'Add insurance for high-value shipments',
              'Use carriers with reliable tracking'
            ]
          },
          {
            rank: 3,
            title: 'Clear Product Descriptions',
            description: `${losingReasons['product_unacceptable'] || 0} chargebacks were due to product issues.`,
            action_items: [
              'Use accurate product photos from multiple angles',
              'Include detailed size/material specifications',
              'Set realistic delivery expectations'
            ]
          },
          {
            rank: 4,
            title: 'Proactive Customer Communication',
            description: 'Many chargebacks happen because customers forget or don\'t recognize charges.',
            action_items: [
              'Send order confirmation with clear business name',
              'Provide tracking updates proactively',
              'Make returns/refunds easy to reduce disputes'
            ]
          },
          {
            rank: 5,
            title: 'Monitor High-Risk Indicators',
            description: 'Orders with multiple risk factors should be verified before shipping.',
            action_items: [
              'Review orders flagged as high-risk',
              'Contact customers to verify large orders',
              'Require phone verification for first-time high-value orders'
            ]
          }
        ];

        const playbook = await base44.asServiceRole.entities.MerchantPlaybook.create({
          tenant_id,
          playbook_type: 'chargeback_prevention',
          title: 'Chargeback Prevention Checklist',
          generated_at: new Date().toISOString(),
          insights: insights.map((i, idx) => ({
            ...i,
            impact_estimate: 100 - idx * 15,
            confidence: 0.85
          })),
          summary_stats: {
            orders_analyzed: chargebacks.length,
            chargebacks_prevented: 0,
            estimated_savings: lostChargebacks.reduce((s, c) => s + (c.dispute_amount || 0), 0) * 0.3,
            risk_accuracy: wonChargebacks.length / (chargebacks.length || 1)
          }
        });

        return Response.json({ success: true, playbook_id: playbook.id });
      }

      // ============================================
      // GENERATE MONTHLY SUMMARY
      // ============================================
      case 'generate_monthly_summary': {
        const { tenant_id, month, year } = params;

        const targetMonth = month || new Date().getMonth() + 1;
        const targetYear = year || new Date().getFullYear();
        const period = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0);

        // Get all data for the month
        const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
        const monthOrders = orders.filter(o => {
          const d = new Date(o.order_date || o.created_date);
          return d >= startDate && d <= endDate;
        });

        const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({ tenant_id });
        const monthOutcomes = outcomes.filter(o => {
          const d = new Date(o.created_date);
          return d >= startDate && d <= endDate;
        });

        const roiMetrics = await base44.asServiceRole.entities.RiskROIMetric.filter({
          tenant_id,
          period
        });
        const roi = roiMetrics[0] || {};

        // Calculate key metrics
        const totalRevenue = monthOrders.reduce((s, o) => s + (o.total_revenue || 0), 0);
        const totalProfit = monthOrders.reduce((s, o) => s + (o.net_profit || 0), 0);
        const highRiskOrders = monthOrders.filter(o => o.risk_level === 'high').length;
        const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        const insights = [
          {
            rank: 1,
            title: 'Revenue Performance',
            description: `Total revenue: $${Math.round(totalRevenue).toLocaleString()} | Net profit: $${Math.round(totalProfit).toLocaleString()} | Margin: ${avgMargin.toFixed(1)}%`,
            data_points: { revenue: totalRevenue, profit: totalProfit, margin: avgMargin }
          },
          {
            rank: 2,
            title: 'Risk Overview',
            description: `${highRiskOrders} high-risk orders detected out of ${monthOrders.length} total orders (${((highRiskOrders / (monthOrders.length || 1)) * 100).toFixed(1)}%)`,
            data_points: { high_risk: highRiskOrders, total: monthOrders.length }
          },
          {
            rank: 3,
            title: 'AI Performance',
            description: `AI accuracy: ${roi.ai_accuracy_percent || 0}% | False positive rate: ${((roi.false_positive_rate || 0) * 100).toFixed(1)}%`,
            data_points: { accuracy: roi.ai_accuracy_percent, fpr: roi.false_positive_rate }
          },
          {
            rank: 4,
            title: 'Protection Value',
            description: `Estimated loss prevented: $${Math.round(roi.margin_recovered || 0).toLocaleString()} | ROI multiple: ${roi.roi_multiple || 0}x`,
            data_points: { prevented: roi.margin_recovered, roi: roi.roi_multiple }
          }
        ];

        const playbook = await base44.asServiceRole.entities.MerchantPlaybook.create({
          tenant_id,
          playbook_type: 'monthly_summary',
          title: `Monthly Summary - ${period}`,
          period,
          generated_at: new Date().toISOString(),
          insights,
          summary_stats: {
            orders_analyzed: monthOrders.length,
            chargebacks_prevented: roi.chargebacks_prevented || 0,
            estimated_savings: roi.margin_recovered || 0,
            risk_accuracy: (roi.ai_accuracy_percent || 0) / 100,
            top_risk_category: 'See fraud patterns report'
          },
          recommendations: [
            {
              priority: avgMargin < 20 ? 'high' : 'medium',
              recommendation: avgMargin < 20 
                ? 'Review pricing and COGS - margin is below healthy threshold'
                : 'Maintain current operations - margins are healthy',
              expected_impact: avgMargin < 20 ? 'Could improve margins by 5-10%' : 'Sustained profitability'
            }
          ]
        });

        return Response.json({ success: true, playbook_id: playbook.id, period });
      }

      // ============================================
      // LIST PLAYBOOKS
      // ============================================
      case 'list': {
        const { tenant_id, playbook_type, limit = 10 } = params;

        const filter = { tenant_id };
        if (playbook_type) filter.playbook_type = playbook_type;

        const playbooks = await base44.asServiceRole.entities.MerchantPlaybook.filter(
          filter,
          '-generated_at',
          limit
        );

        return Response.json({ success: true, playbooks });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Playbook generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatPatternName(pattern) {
  const names = {
    'new_customer': 'New Customer Orders',
    'high_order_value': 'High Order Value',
    'address_mismatch': 'Address Mismatch',
    'heavy_discount': 'Heavy Discount Usage',
    'suspicious_email': 'Suspicious Email Domain',
    'high_refund_history': 'High Refund History Customer',
    'velocity': 'Rapid Order Velocity'
  };
  return names[pattern] || pattern.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getActionItemsForPattern(pattern) {
  const actions = {
    'new_customer': [
      'Require phone verification for first-time orders over $200',
      'Send order confirmation with tracking',
      'Consider adding a "new customer" review step'
    ],
    'high_order_value': [
      'Enable signature confirmation for high-value shipments',
      'Call to verify orders over $500',
      'Split large orders into separate shipments'
    ],
    'address_mismatch': [
      'Verify shipping address matches billing',
      'Flag orders with different country billing/shipping',
      'Use address verification services'
    ],
    'heavy_discount': [
      'Limit discount code usage per customer',
      'Review orders with >30% discount',
      'Monitor discount code sharing'
    ],
    'suspicious_email': [
      'Flag disposable email domains',
      'Require email verification',
      'Cross-reference with known fraud lists'
    ],
    'high_refund_history': [
      'Review order history before processing',
      'Limit refunds for repeat returners',
      'Consider banning serial abusers'
    ],
    'velocity': [
      'Add CAPTCHA for rapid checkout',
      'Limit orders per email in 24h',
      'Review multiple orders from same IP'
    ]
  };
  return actions[pattern] || [
    'Monitor this pattern closely',
    'Review flagged orders manually',
    'Consider adding verification step'
  ];
}

function generateRecommendations(patterns) {
  if (patterns.length === 0) {
    return [{
      priority: 'low',
      recommendation: 'No significant fraud patterns detected. Continue monitoring.',
      expected_impact: 'Maintain low fraud rates',
      implementation_effort: 'low'
    }];
  }

  return patterns.slice(0, 3).map((p, i) => ({
    priority: i === 0 ? 'critical' : i === 1 ? 'high' : 'medium',
    recommendation: `Address "${formatPatternName(p.pattern)}" pattern - causing $${Math.round(p.totalLoss)} in losses`,
    expected_impact: `Could prevent up to $${Math.round(p.totalLoss * 0.5)} in future losses`,
    implementation_effort: 'medium'
  }));
}

function calculateAccuracy(outcomes) {
  if (outcomes.length === 0) return 0;
  const correct = outcomes.filter(o => 
    o.prediction_analysis === 'true_positive' || 
    o.prediction_analysis === 'true_negative'
  ).length;
  return correct / outcomes.length;
}