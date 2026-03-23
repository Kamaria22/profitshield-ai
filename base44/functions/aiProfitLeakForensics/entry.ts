import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, leak_id, action = 'full_forensics' } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Fetch comprehensive data for forensics
    const [orders, refunds, products, profitLeaks, alerts, customers] = await Promise.all([
      base44.asServiceRole.entities.Order.filter({ tenant_id }, '-order_date', 1000),
      base44.asServiceRole.entities.Refund.filter({ tenant_id }, '-created_date', 200),
      base44.asServiceRole.entities.Product.filter({ tenant_id }),
      base44.asServiceRole.entities.ProfitLeak.filter({ tenant_id }, '-impact_amount', 50),
      base44.asServiceRole.entities.Alert.filter({ tenant_id }, '-created_date', 100),
      base44.asServiceRole.entities.Customer.filter({ tenant_id }, '-total_spent', 200)
    ]);

    // Calculate detailed metrics
    const totalRevenue = orders.reduce((s, o) => s + (o.total_revenue || 0), 0);
    const totalProfit = orders.reduce((s, o) => s + (o.net_profit || 0), 0);
    const totalCOGS = orders.reduce((s, o) => s + (o.total_cogs || 0), 0);
    const totalFees = orders.reduce((s, o) => s + (o.payment_fee || 0) + (o.platform_fee || 0), 0);
    const totalRefunds = refunds.reduce((s, r) => s + (r.amount || 0), 0);
    const totalShipping = orders.reduce((s, o) => s + (o.shipping_cost || 0), 0);

    // Identify leak patterns
    const negativeMarginOrders = orders.filter(o => (o.net_profit || 0) < 0);
    const highRiskOrders = orders.filter(o => o.risk_level === 'high');
    const refundedOrders = orders.filter(o => o.status === 'refunded');
    
    // Product-level analysis
    const productAnalysis = {};
    orders.forEach(o => {
      const productId = o.product_id || 'unknown';
      if (!productAnalysis[productId]) {
        productAnalysis[productId] = { 
          revenue: 0, profit: 0, orders: 0, refunds: 0, negative_margin: 0 
        };
      }
      productAnalysis[productId].revenue += o.total_revenue || 0;
      productAnalysis[productId].profit += o.net_profit || 0;
      productAnalysis[productId].orders += 1;
      if ((o.net_profit || 0) < 0) productAnalysis[productId].negative_margin += 1;
    });

    // Customer risk analysis
    const customerRisk = {};
    orders.forEach(o => {
      const email = o.customer_email || 'unknown';
      if (!customerRisk[email]) {
        customerRisk[email] = { orders: 0, refunds: 0, high_risk: 0, total: 0 };
      }
      customerRisk[email].orders += 1;
      customerRisk[email].total += o.total_revenue || 0;
      if (o.risk_level === 'high') customerRisk[email].high_risk += 1;
    });
    refunds.forEach(r => {
      if (customerRisk[r.customer_email]) {
        customerRisk[r.customer_email].refunds += 1;
      }
    });

    const riskyCust = Object.entries(customerRisk)
      .filter(([_, d]) => d.refunds > 1 || d.high_risk > 0)
      .sort((a, b) => b[1].refunds - a[1].refunds);

    // Time-based analysis
    const dailyLeaks = {};
    orders.forEach(o => {
      const day = o.order_date?.split('T')[0];
      if (!day) return;
      if (!dailyLeaks[day]) dailyLeaks[day] = { revenue: 0, profit: 0, leaks: 0 };
      dailyLeaks[day].revenue += o.total_revenue || 0;
      dailyLeaks[day].profit += o.net_profit || 0;
      if ((o.net_profit || 0) < 0) dailyLeaks[day].leaks += 1;
    });

    // Build forensics prompt
    const forensicsPrompt = `
Perform deep forensic analysis of profit leaks for this e-commerce store.

FINANCIAL SUMMARY:
- Total Revenue: $${totalRevenue.toFixed(2)}
- Total Profit: $${totalProfit.toFixed(2)}
- Gross Margin: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
- Total COGS: $${totalCOGS.toFixed(2)}
- Total Fees: $${totalFees.toFixed(2)}
- Total Refunds: $${totalRefunds.toFixed(2)}
- Total Shipping: $${totalShipping.toFixed(2)}

LEAK INDICATORS:
- Negative margin orders: ${negativeMarginOrders.length} (${orders.length > 0 ? ((negativeMarginOrders.length / orders.length) * 100).toFixed(1) : 0}%)
- High risk orders: ${highRiskOrders.length}
- Refunded orders: ${refundedOrders.length}
- Active profit leaks: ${profitLeaks.length}
- Total leak impact: $${profitLeaks.reduce((s, l) => s + (l.impact_amount || 0), 0).toFixed(2)}

EXISTING LEAKS:
${profitLeaks.slice(0, 10).map(l => `- ${l.leak_type}: $${l.impact_amount?.toFixed(2)} - ${l.description}`).join('\n')}

HIGH-RISK CUSTOMERS:
${riskyCust.slice(0, 5).map(([email, d]) => `- ${email}: ${d.refunds} refunds, ${d.high_risk} high-risk orders, $${d.total.toFixed(0)} total`).join('\n')}

PROBLEM PRODUCTS:
${Object.entries(productAnalysis)
  .filter(([_, d]) => d.negative_margin > 0 || d.profit < 0)
  .slice(0, 5)
  .map(([id, d]) => `- ${id}: ${d.negative_margin} negative margin orders, $${d.profit.toFixed(0)} profit`)
  .join('\n')}

Provide:
1. Root cause analysis for each major leak category
2. Hidden leak patterns not yet detected
3. Specific remediation steps with priority
4. Prevention strategies
5. Estimated total recoverable profit
`;

    const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: forensicsPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          root_causes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                cause: { type: "string" },
                evidence: { type: "string" },
                impact: { type: "string" },
                severity: { type: "string", enum: ["critical", "high", "medium", "low"] }
              }
            }
          },
          hidden_patterns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                pattern_name: { type: "string" },
                description: { type: "string" },
                affected_orders: { type: "string" },
                potential_loss: { type: "string" },
                detection_method: { type: "string" }
              }
            }
          },
          remediation_plan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                target: { type: "string" },
                priority: { type: "string", enum: ["immediate", "this_week", "this_month"] },
                expected_savings: { type: "string" },
                implementation: { type: "string" }
              }
            }
          },
          prevention_strategies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                strategy: { type: "string" },
                description: { type: "string" },
                automation_possible: { type: "boolean" }
              }
            }
          },
          summary: {
            type: "object",
            properties: {
              total_identified_leaks: { type: "string" },
              recoverable_profit: { type: "string" },
              health_grade: { type: "string" },
              top_priority: { type: "string" }
            }
          }
        }
      }
    });

    // Auto-create tasks for immediate remediation items
    for (const item of (aiResponse.remediation_plan || []).filter(r => r.priority === 'immediate')) {
      await base44.asServiceRole.entities.Task.create({
        tenant_id,
        title: `[Forensics] ${item.action}`,
        description: `**Target:** ${item.target}\n\n**Implementation:** ${item.implementation}\n\n**Expected Savings:** ${item.expected_savings}`,
        priority: 'high',
        status: 'pending',
        category: 'profit_forensics',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'ai_forensics'
      });
    }

    return Response.json({
      success: true,
      metrics: {
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        total_refunds: totalRefunds,
        negative_margin_orders: negativeMarginOrders.length,
        high_risk_orders: highRiskOrders.length,
        active_leaks: profitLeaks.length
      },
      root_causes: aiResponse.root_causes,
      hidden_patterns: aiResponse.hidden_patterns,
      remediation_plan: aiResponse.remediation_plan,
      prevention_strategies: aiResponse.prevention_strategies,
      summary: aiResponse.summary,
      risky_customers: riskyCust.slice(0, 10).map(([email, d]) => ({ email, ...d }))
    });

  } catch (error) {
    console.error('AI Profit Leak Forensics error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});