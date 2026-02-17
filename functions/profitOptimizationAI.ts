import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, action = 'full_analysis' } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Fetch data for analysis
    const [orders, products, profitLeaks, customers] = await Promise.all([
      base44.asServiceRole.entities.Order.filter({ tenant_id }, '-order_date', 500),
      base44.asServiceRole.entities.Product.filter({ tenant_id }),
      base44.asServiceRole.entities.ProfitLeak.filter({ tenant_id, is_resolved: false }),
      base44.asServiceRole.entities.Customer.filter({ tenant_id }, '-total_spent', 100)
    ]);

    // Calculate metrics
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || 0), 0);
    const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Product performance analysis
    const productSales = {};
    orders.forEach(order => {
      const productId = order.product_id || 'unknown';
      if (!productSales[productId]) {
        productSales[productId] = { units: 0, revenue: 0, profit: 0 };
      }
      productSales[productId].units += 1;
      productSales[productId].revenue += order.total_revenue || 0;
      productSales[productId].profit += order.net_profit || 0;
    });

    // Build analysis prompt
    const analysisPrompt = `
You are an AI profit optimization expert for e-commerce. Analyze this store data and provide actionable recommendations.

STORE METRICS:
- Total Orders: ${orders.length}
- Total Revenue: $${totalRevenue.toFixed(2)}
- Total Profit: $${totalProfit.toFixed(2)}
- Average Order Value: $${avgOrderValue.toFixed(2)}
- Average Margin: ${avgMargin.toFixed(1)}%
- Active Products: ${products.length}
- Active Profit Leaks: ${profitLeaks.length}
- Total Leak Impact: $${profitLeaks.reduce((sum, l) => sum + (l.impact_amount || 0), 0).toFixed(2)}

TOP PRODUCTS BY SALES:
${Object.entries(productSales)
  .sort((a, b) => b[1].revenue - a[1].revenue)
  .slice(0, 10)
  .map(([id, data]) => {
    const product = products.find(p => p.id === id);
    return `- ${product?.name || id}: ${data.units} units, $${data.revenue.toFixed(2)} revenue, ${data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(1) : 0}% margin`;
  }).join('\n')}

CURRENT PROFIT LEAKS:
${profitLeaks.slice(0, 5).map(l => `- ${l.leak_type}: $${l.impact_amount?.toFixed(2)} impact - ${l.description}`).join('\n') || 'None detected'}

TOP CUSTOMERS:
${customers.slice(0, 5).map(c => `- ${c.email}: $${c.total_spent?.toFixed(2)} spent, ${c.order_count} orders`).join('\n') || 'No customer data'}

Provide recommendations in these categories:
1. PRICING OPTIMIZATION: Suggest price adjustments based on margin analysis and demand patterns
2. DISCOUNT & BUNDLE STRATEGIES: Recommend personalized offers to increase AOV
3. PREDICTED PROFIT LEAKS: Identify potential future issues and preventative measures
4. QUICK WINS: Immediate actions that can boost profit within 7 days

Be specific with numbers and percentages. Focus on actionable, data-driven recommendations.
`;

    const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          pricing_recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                current_insight: { type: "string" },
                recommendation: { type: "string" },
                expected_impact: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                priority: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          },
          discount_strategies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                strategy_name: { type: "string" },
                target_segment: { type: "string" },
                recommendation: { type: "string" },
                expected_aov_increase: { type: "string" },
                implementation: { type: "string" }
              }
            }
          },
          predicted_leaks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                leak_type: { type: "string" },
                risk_level: { type: "string", enum: ["high", "medium", "low"] },
                prediction: { type: "string" },
                preventative_action: { type: "string" },
                estimated_savings: { type: "string" }
              }
            }
          },
          quick_wins: {
            type: "array",
            items: {
              type: "object",
              properties: {
                action: { type: "string" },
                effort: { type: "string", enum: ["low", "medium", "high"] },
                impact: { type: "string" },
                timeline: { type: "string" }
              }
            }
          },
          summary: {
            type: "object",
            properties: {
              health_score: { type: "number" },
              total_opportunity: { type: "string" },
              top_priority: { type: "string" },
              key_insight: { type: "string" }
            }
          }
        }
      }
    });

    // Store recommendations
    const recommendations = {
      tenant_id,
      generated_at: new Date().toISOString(),
      metrics_snapshot: {
        total_orders: orders.length,
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        avg_order_value: avgOrderValue,
        avg_margin: avgMargin
      },
      ...aiResponse
    };

    return Response.json({
      success: true,
      recommendations
    });

  } catch (error) {
    console.error('Profit optimization error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});