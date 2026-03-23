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

    // AUTO-EXECUTE HIGH-CONFIDENCE ACTIONS
    const autoActions = [];
    
    // Get tenant and token for Shopify actions
    const [tenants, tokens] = await Promise.all([
      base44.asServiceRole.entities.Tenant.filter({ id: tenant_id }),
      base44.asServiceRole.entities.OAuthToken.filter({ tenant_id, platform: 'shopify', is_valid: true })
    ]);
    const tenant = tenants[0];
    const token = tokens[0];
    const shopDomain = tenant?.shop_domain;
    const accessToken = token?.access_token;

    // 1. Auto-propose price updates for high confidence + high priority
    if (aiResponse.pricing_recommendations && accessToken) {
      for (const rec of aiResponse.pricing_recommendations) {
        if (rec.confidence === 'high' && rec.priority === 'high') {
          // Log the auto-action for user review (don't execute yet - just propose)
          const logEntry = await base44.asServiceRole.entities.AuditLog.create({
            tenant_id,
            action: 'ai_auto_price_proposal',
            entity_type: 'product',
            entity_id: rec.product_name,
            is_auto_action: true,
            auto_action_type: 'price_update',
            changes: {
              product_name: rec.product_name,
              recommendation: rec.recommendation,
              expected_impact: rec.expected_impact,
              confidence: rec.confidence,
              priority: rec.priority
            },
            performed_by: 'ProfitShield AI',
            description: `AI proposes price adjustment for ${rec.product_name}: ${rec.recommendation}`
          });
          
          autoActions.push({
            type: 'price_proposal',
            log_id: logEntry.id,
            product: rec.product_name,
            recommendation: rec.recommendation,
            impact: rec.expected_impact
          });
        }
      }
    }

    // 2. Auto-create draft discounts for high impact + low effort
    if (aiResponse.discount_strategies && accessToken) {
      for (const strategy of aiResponse.discount_strategies) {
        const isHighImpact = strategy.expected_aov_increase && 
          (strategy.expected_aov_increase.includes('15%') || 
           strategy.expected_aov_increase.includes('20%') ||
           strategy.expected_aov_increase.includes('25%') ||
           parseFloat(strategy.expected_aov_increase) >= 15);
        
        if (isHighImpact) {
          try {
            // Create draft discount in Shopify
            const discountTitle = `AI_${strategy.strategy_name?.replace(/\s+/g, '_').substring(0, 20)}_${Date.now()}`;
            const discountValue = 10; // Default 10% for AI-created discounts
            
            const priceRuleResponse = await fetch(
              `https://${shopDomain}/admin/api/2024-01/price_rules.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  price_rule: {
                    title: discountTitle,
                    target_type: 'line_item',
                    target_selection: 'all',
                    allocation_method: 'across',
                    value_type: 'percentage',
                    value: `-${discountValue}`,
                    customer_selection: 'all',
                    starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Starts tomorrow
                    ends_at: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
                    usage_limit: 100
                  }
                })
              }
            );

            if (priceRuleResponse.ok) {
              const priceRule = await priceRuleResponse.json();
              const code = `AI${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
              
              const discountResponse = await fetch(
                `https://${shopDomain}/admin/api/2024-01/price_rules/${priceRule.price_rule.id}/discount_codes.json`,
                {
                  method: 'POST',
                  headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ discount_code: { code } })
                }
              );

              if (discountResponse.ok) {
                const discount = await discountResponse.json();
                
                const logEntry = await base44.asServiceRole.entities.AuditLog.create({
                  tenant_id,
                  action: 'ai_auto_discount_created',
                  entity_type: 'discount',
                  entity_id: discount.discount_code.id.toString(),
                  is_auto_action: true,
                  auto_action_type: 'discount_creation',
                  changes: {
                    strategy_name: strategy.strategy_name,
                    discount_code: code,
                    value: discountValue,
                    price_rule_id: priceRule.price_rule.id,
                    target_segment: strategy.target_segment,
                    expected_aov_increase: strategy.expected_aov_increase
                  },
                  performed_by: 'ProfitShield AI',
                  description: `AI created draft discount "${code}" (${discountValue}% off) for: ${strategy.strategy_name}`
                });

                autoActions.push({
                  type: 'discount_created',
                  log_id: logEntry.id,
                  code,
                  value: discountValue,
                  strategy: strategy.strategy_name,
                  starts: 'Tomorrow'
                });
              }
            }
          } catch (e) {
            console.error('Failed to auto-create discount:', e);
          }
        }
      }
    }

    // 3. Auto-create critical alerts and tasks for high-risk predicted leaks
    if (aiResponse.predicted_leaks) {
      for (const leak of aiResponse.predicted_leaks) {
        const isHighSavings = leak.estimated_savings && 
          (leak.estimated_savings.includes('$1') || 
           leak.estimated_savings.includes('$2') ||
           parseFloat(leak.estimated_savings.replace(/[^0-9.]/g, '')) >= 500);
        
        if (leak.risk_level === 'high' && isHighSavings) {
          // Create critical alert
          const alert = await base44.asServiceRole.entities.Alert.create({
            tenant_id,
            alert_type: 'predicted_profit_leak',
            severity: 'critical',
            title: `🤖 AI Predicted: ${leak.leak_type}`,
            message: `${leak.prediction}\n\nPreventative Action: ${leak.preventative_action}\nEstimated savings: ${leak.estimated_savings}`,
            status: 'pending',
            action_url: '/Tasks',
            action_label: 'Review Task',
            source: 'ai_auto_detection',
            is_auto_generated: true
          });

          // Create high priority task
          const task = await base44.asServiceRole.entities.Task.create({
            tenant_id,
            title: `[AI] Prevent: ${leak.leak_type}`,
            description: `**AI-Generated Task**\n\n${leak.preventative_action}\n\n**Prediction:** ${leak.prediction}\n\n**Estimated savings:** ${leak.estimated_savings}`,
            priority: 'high',
            status: 'pending',
            category: 'ai_leak_prevention',
            due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'ai_auto_detection',
            is_auto_generated: true
          });

          const logEntry = await base44.asServiceRole.entities.AuditLog.create({
            tenant_id,
            action: 'ai_auto_leak_detection',
            entity_type: 'alert_task',
            entity_id: alert.id,
            is_auto_action: true,
            auto_action_type: 'leak_prevention',
            changes: {
              leak_type: leak.leak_type,
              risk_level: leak.risk_level,
              estimated_savings: leak.estimated_savings,
              alert_id: alert.id,
              task_id: task.id
            },
            performed_by: 'ProfitShield AI',
            description: `AI detected high-risk profit leak: ${leak.leak_type}`
          });

          autoActions.push({
            type: 'leak_detection',
            log_id: logEntry.id,
            leak_type: leak.leak_type,
            savings: leak.estimated_savings,
            alert_id: alert.id,
            task_id: task.id
          });
        }
      }
    }

    return Response.json({
      success: true,
      recommendations,
      auto_actions: autoActions.length > 0 ? autoActions : null,
      auto_actions_count: autoActions.length
    });

  } catch (error) {
    console.error('Profit optimization error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});