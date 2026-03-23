import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * AI-POWERED PREDICTIVE ANALYTICS
 * Advanced forecasting, trend prediction, and anomaly detection
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, prediction_type = 'revenue' } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Fetch historical data
    const [orders, products, customers] = await Promise.all([
      base44.asServiceRole.entities.Order.filter({ tenant_id }, '-order_date', 1000),
      base44.asServiceRole.entities.Product.filter({ tenant_id }),
      base44.asServiceRole.entities.Customer.filter({ tenant_id }, '-total_spent', 500)
    ]);

    // Build time series data
    const dailyMetrics = buildDailyTimeSeries(orders);
    const weeklyMetrics = buildWeeklyTimeSeries(orders);
    const monthlyMetrics = buildMonthlyTimeSeries(orders);

    // Revenue prediction
    if (prediction_type === 'revenue') {
      const revenuePrompt = `Analyze this e-commerce revenue data and predict future trends.

HISTORICAL DATA:
${monthlyMetrics.slice(-12).map(m => `${m.month}: $${m.revenue.toFixed(0)} revenue, ${m.orders} orders`).join('\n')}

RECENT TRENDS:
${weeklyMetrics.slice(-8).map(w => `Week ${w.week}: $${w.revenue.toFixed(0)}, ${w.orders} orders`).join('\n')}

Provide:
1. 30-day revenue forecast with confidence intervals
2. Growth rate prediction
3. Seasonal patterns identified
4. Risk factors that could impact forecast
5. Upside opportunities`;

      const prediction = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: revenuePrompt,
        response_json_schema: {
          type: "object",
          properties: {
            forecast_30d: {
              type: "object",
              properties: {
                predicted_revenue: { type: "number" },
                low_estimate: { type: "number" },
                high_estimate: { type: "number" },
                confidence: { type: "number" }
              }
            },
            growth_rate: { type: "string" },
            seasonal_pattern: { type: "string" },
            risk_factors: { type: "array", items: { type: "string" } },
            opportunities: { type: "array", items: { type: "string" } },
            key_insight: { type: "string" }
          }
        }
      });

      return Response.json({
        success: true,
        prediction_type: 'revenue',
        ...prediction,
        generated_at: new Date().toISOString()
      });
    }

    // Churn prediction
    if (prediction_type === 'churn') {
      const customerMetrics = customers.map(c => {
        const customerOrders = orders.filter(o => o.customer_email === c.email);
        const lastOrder = customerOrders[0];
        const daysSince = lastOrder ? 
          Math.floor((Date.now() - new Date(lastOrder.order_date).getTime()) / (1000 * 60 * 60 * 24)) : 999;
        
        return {
          email: c.email,
          orders: customerOrders.length,
          total: customerOrders.reduce((s, o) => s + (o.total_revenue || 0), 0),
          days_since_last: daysSince,
          avg_days_between: customerOrders.length > 1 ? daysSince / (customerOrders.length - 1) : 999
        };
      });

      const atRisk = customerMetrics.filter(c => 
        c.days_since_last > c.avg_days_between * 1.5 && c.avg_days_between < 90
      );

      const churnPrompt = `Analyze customer churn risk:

TOTAL CUSTOMERS: ${customers.length}
AT RISK: ${atRisk.length} (${((atRisk.length / Math.max(1, customers.length)) * 100).toFixed(1)}%)

AT-RISK BREAKDOWN:
${atRisk.slice(0, 20).map(c => `- ${c.orders} orders, $${c.total.toFixed(0)} spent, ${c.days_since_last} days since last order`).join('\n')}

Provide churn analysis with retention recommendations.`;

      const prediction = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: churnPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            churn_risk_score: { type: "number" },
            at_risk_count: { type: "number" },
            at_risk_revenue: { type: "string" },
            retention_recommendations: { type: "array", items: { type: "string" } },
            winback_strategy: { type: "string" }
          }
        }
      });

      return Response.json({
        success: true,
        prediction_type: 'churn',
        ...prediction,
        at_risk_customers: atRisk.slice(0, 10)
      });
    }

    // Product performance prediction
    if (prediction_type === 'products') {
      const productPerformance = products.map(p => {
        const productOrders = orders.filter(o => o.product_id === p.id);
        return {
          id: p.id,
          name: p.name,
          orders: productOrders.length,
          revenue: productOrders.reduce((s, o) => s + (o.total_revenue || 0), 0),
          profit: productOrders.reduce((s, o) => s + (o.net_profit || 0), 0)
        };
      }).sort((a, b) => b.revenue - a.revenue);

      const productPrompt = `Analyze product performance:

TOP PERFORMERS:
${productPerformance.slice(0, 10).map(p => `- ${p.name}: ${p.orders} orders, $${p.revenue.toFixed(0)} revenue, $${p.profit.toFixed(0)} profit`).join('\n')}

Predict which products will drive growth next month.`;

      const prediction = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: productPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            rising_stars: { type: "array", items: { type: "string" } },
            declining: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } }
          }
        }
      });

      return Response.json({
        success: true,
        prediction_type: 'products',
        ...prediction,
        product_count: products.length
      });
    }

    return Response.json({ error: 'Invalid prediction type' }, { status: 400 });

  } catch (error) {
    console.error('Predictive analytics error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildDailyTimeSeries(orders) {
  const daily = {};
  
  orders.forEach(o => {
    const day = o.order_date?.split('T')[0];
    if (!day) return;
    
    if (!daily[day]) {
      daily[day] = { date: day, revenue: 0, profit: 0, orders: 0 };
    }
    daily[day].revenue += o.total_revenue || 0;
    daily[day].profit += o.net_profit || 0;
    daily[day].orders += 1;
  });

  return Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));
}

function buildWeeklyTimeSeries(orders) {
  const weekly = {};
  
  orders.forEach(o => {
    if (!o.order_date) return;
    const date = new Date(o.order_date);
    const week = getWeekNumber(date);
    const key = `${date.getFullYear()}-W${week}`;
    
    if (!weekly[key]) {
      weekly[key] = { week: key, revenue: 0, profit: 0, orders: 0 };
    }
    weekly[key].revenue += o.total_revenue || 0;
    weekly[key].profit += o.net_profit || 0;
    weekly[key].orders += 1;
  });

  return Object.values(weekly).sort((a, b) => a.week.localeCompare(b.week));
}

function buildMonthlyTimeSeries(orders) {
  const monthly = {};
  
  orders.forEach(o => {
    if (!o.order_date) return;
    const date = new Date(o.order_date);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthly[month]) {
      monthly[month] = { month, revenue: 0, profit: 0, orders: 0 };
    }
    monthly[month].revenue += o.total_revenue || 0;
    monthly[month].profit += o.net_profit || 0;
    monthly[month].orders += 1;
  });

  return Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month));
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}