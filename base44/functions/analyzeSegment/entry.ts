import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { segment_id, customers_summary } = await req.json();

    if (!segment_id || !customers_summary) {
      return Response.json({ error: 'Missing segment_id or customers_summary' }, { status: 400 });
    }

    const prompt = `You are a marketing and customer analytics AI assistant for an e-commerce business.

Analyze this customer segment and provide actionable insights:

SEGMENT DATA:
- Segment Name: ${customers_summary.segment_name}
- Total Customers: ${customers_summary.total_customers}
- Average Order Value: $${customers_summary.avg_order_value?.toFixed(2) || 0}
- Average Total Spent: $${customers_summary.avg_total_spent?.toFixed(2) || 0}
- Average Profit per Customer: $${customers_summary.avg_profit?.toFixed(2) || 0}
- High Risk Customers: ${customers_summary.high_risk_count} (${customers_summary.high_risk_pct?.toFixed(1)}%)
- Average Orders per Customer: ${customers_summary.avg_orders?.toFixed(1) || 0}
- Refund Rate: ${(customers_summary.refund_rate * 100)?.toFixed(1) || 0}%
- Days Since Last Order (avg): ${customers_summary.avg_days_since_order || 'N/A'}

Based on this data, provide:
1. Three personalized email campaign ideas with subject lines
2. A discount/offer strategy tailored to this segment
3. Churn risk assessment (low/medium/high) with reasoning
4. Three specific retention strategies
5. Upsell/cross-sell opportunities
6. Overall segment health score (1-10)

Be specific and actionable. Consider the segment's profitability, risk profile, and engagement level.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          email_campaigns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject_line: { type: "string" },
                description: { type: "string" },
                best_send_time: { type: "string" },
                expected_open_rate: { type: "string" }
              }
            }
          },
          discount_strategy: {
            type: "object",
            properties: {
              offer_type: { type: "string" },
              discount_amount: { type: "string" },
              conditions: { type: "string" },
              reasoning: { type: "string" }
            }
          },
          churn_analysis: {
            type: "object",
            properties: {
              risk_level: { type: "string" },
              risk_score: { type: "number" },
              key_indicators: { type: "array", items: { type: "string" } },
              reasoning: { type: "string" }
            }
          },
          retention_strategies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                strategy: { type: "string" },
                implementation: { type: "string" },
                expected_impact: { type: "string" }
              }
            }
          },
          upsell_opportunities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                opportunity: { type: "string" },
                approach: { type: "string" },
                potential_revenue_increase: { type: "string" }
              }
            }
          },
          segment_health_score: { type: "number" },
          segment_summary: { type: "string" }
        }
      }
    });

    return Response.json({ 
      success: true, 
      analysis: result,
      segment_id 
    });

  } catch (error) {
    console.error('Segment analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});