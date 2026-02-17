import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, action = 'analyze' } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Fetch customer and order data
    const [customers, orders] = await Promise.all([
      base44.asServiceRole.entities.Customer.filter({ tenant_id }, '-total_spent', 500),
      base44.asServiceRole.entities.Order.filter({ tenant_id }, '-order_date', 1000)
    ]);

    // Build customer metrics
    const customerMetrics = customers.map(c => {
      const customerOrders = orders.filter(o => o.customer_email === c.email);
      const totalSpent = customerOrders.reduce((s, o) => s + (o.total_revenue || 0), 0);
      const totalProfit = customerOrders.reduce((s, o) => s + (o.net_profit || 0), 0);
      const avgOrderValue = customerOrders.length > 0 ? totalSpent / customerOrders.length : 0;
      const lastOrderDate = customerOrders[0]?.order_date;
      const daysSinceLastOrder = lastOrderDate ? 
        Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;
      
      return {
        email: c.email,
        name: c.full_name || c.email,
        order_count: customerOrders.length,
        total_spent: totalSpent,
        total_profit: totalProfit,
        avg_order_value: avgOrderValue,
        days_since_last_order: daysSinceLastOrder,
        refund_count: customerOrders.filter(o => o.status === 'refunded').length,
        high_risk_orders: customerOrders.filter(o => o.risk_level === 'high').length
      };
    });

    // Calculate RFM scores
    const maxSpent = Math.max(...customerMetrics.map(c => c.total_spent), 1);
    const maxFrequency = Math.max(...customerMetrics.map(c => c.order_count), 1);
    
    const scoredCustomers = customerMetrics.map(c => {
      const recencyScore = c.days_since_last_order <= 30 ? 5 : 
                          c.days_since_last_order <= 60 ? 4 :
                          c.days_since_last_order <= 90 ? 3 :
                          c.days_since_last_order <= 180 ? 2 : 1;
      const frequencyScore = Math.ceil((c.order_count / maxFrequency) * 5);
      const monetaryScore = Math.ceil((c.total_spent / maxSpent) * 5);
      const rfmScore = recencyScore + frequencyScore + monetaryScore;
      
      return { ...c, recencyScore, frequencyScore, monetaryScore, rfmScore };
    });

    // AI segmentation prompt
    const segmentationPrompt = `
Analyze these e-commerce customers and create intelligent segments for marketing.

CUSTOMER DATA SUMMARY:
- Total customers: ${customerMetrics.length}
- Total revenue: $${customerMetrics.reduce((s, c) => s + c.total_spent, 0).toFixed(2)}
- Avg customer value: $${(customerMetrics.reduce((s, c) => s + c.total_spent, 0) / Math.max(customerMetrics.length, 1)).toFixed(2)}

TOP 20 CUSTOMERS BY VALUE:
${scoredCustomers.sort((a, b) => b.total_spent - a.total_spent).slice(0, 20).map(c => 
  `- ${c.name}: $${c.total_spent.toFixed(0)} spent, ${c.order_count} orders, ${c.days_since_last_order}d ago, RFM: ${c.rfmScore}`
).join('\n')}

CUSTOMER DISTRIBUTION:
- High value (>$500): ${scoredCustomers.filter(c => c.total_spent > 500).length}
- Medium value ($100-$500): ${scoredCustomers.filter(c => c.total_spent >= 100 && c.total_spent <= 500).length}
- Low value (<$100): ${scoredCustomers.filter(c => c.total_spent < 100).length}
- At-risk (no order 60+ days): ${scoredCustomers.filter(c => c.days_since_last_order >= 60).length}
- Churned (no order 180+ days): ${scoredCustomers.filter(c => c.days_since_last_order >= 180).length}

Create 5-7 actionable customer segments with:
1. Clear segment name and description
2. Criteria for inclusion
3. Size estimate
4. Recommended marketing actions
5. Expected ROI/impact
`;

    const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: segmentationPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          segments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                criteria: { type: "string" },
                size: { type: "number" },
                percentage: { type: "string" },
                value_potential: { type: "string" },
                recommended_actions: { type: "array", items: { type: "string" } },
                priority: { type: "string", enum: ["high", "medium", "low"] },
                expected_roi: { type: "string" }
              }
            }
          },
          insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                insight: { type: "string" },
                impact: { type: "string" },
                action: { type: "string" }
              }
            }
          },
          health_score: { type: "number" },
          churn_risk_summary: { type: "string" }
        }
      }
    });

    // Store segments for use in campaigns
    for (const segment of aiResponse.segments || []) {
      await base44.asServiceRole.entities.CustomerSegment.create({
        tenant_id,
        name: segment.name,
        description: segment.description,
        criteria: segment.criteria,
        customer_count: segment.size,
        is_ai_generated: true,
        priority: segment.priority,
        recommended_actions: segment.recommended_actions,
        expected_roi: segment.expected_roi
      });
    }

    return Response.json({
      success: true,
      total_customers: customerMetrics.length,
      segments: aiResponse.segments,
      insights: aiResponse.insights,
      health_score: aiResponse.health_score,
      churn_risk_summary: aiResponse.churn_risk_summary,
      top_customers: scoredCustomers.sort((a, b) => b.rfmScore - a.rfmScore).slice(0, 10)
    });

  } catch (error) {
    console.error('AI Customer Segmentation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});