import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { withEndpointGuard, safeFilter } from './helpers/endpointSafety.ts';

const handler = withEndpointGuard('dashboardAI', async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { tenant_id, action, query, date_range = 30 } = body;
    const requestedAction = action || 'analyze';
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { user = null; }

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Embedded dashboard bootstrap path: no Base44 login required.
    if (requestedAction === 'embedded_summary') {
      const safeFetch = async (fn, fallback) => {
        try {
          const value = await fn();
          return value ?? fallback;
        } catch {
          return fallback;
        }
      };

      const [orders, alerts, leaks, tenant, integration] = await Promise.all([
        safeFetch(() => base44.asServiceRole.entities.Order.filter({ tenant_id }, '-order_date', 50), []),
        safeFetch(() => base44.asServiceRole.entities.Alert.filter({ tenant_id, status: 'pending' }, '-created_date', 10), []),
        safeFetch(() => base44.asServiceRole.entities.ProfitLeak.filter({ tenant_id, is_resolved: false }, '-impact_amount', 5), []),
        safeFetch(() => base44.asServiceRole.entities.Tenant.filter({ id: tenant_id }).then((r) => r[0] || null), null),
        safeFetch(() => base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id, platform: 'shopify', status: 'connected' }).then((r) => r[0] || null), null)
      ]);

      const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || o.total_price || 0), 0);
      const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
      const highRiskOrders = orders.filter((o) => (o.risk_score || o.fraud_score || 0) > 70).length;

      return Response.json({
        success: true,
        metrics: {
          totalRevenue,
          totalProfit,
          avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
          highRiskOrders,
          totalOrders: orders.length,
          pendingAlerts: alerts.length
        },
        profitScore: tenant?.profit_integrity_score || 0,
        alertsCount: alerts.length,
        isDemoMode: !integration,
        orders: orders.slice(0, 5),
        alerts,
        profitLeaks: leaks
      });
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch orders for analysis
    const orders = await safeFilter(
      () => base44.asServiceRole.entities.Order.filter(
        { tenant_id },
        '-order_date',
        1000
      ),
      [],
      'dashboardAI.orders'
    );

    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - date_range * 24 * 60 * 60 * 1000);
    const previousPeriodStart = new Date(currentPeriodStart.getTime() - date_range * 24 * 60 * 60 * 1000);

    // Split orders into periods
    const currentPeriodOrders = orders.filter(o => new Date(o.order_date) >= currentPeriodStart);
    const previousPeriodOrders = orders.filter(o => {
      const d = new Date(o.order_date);
      return d >= previousPeriodStart && d < currentPeriodStart;
    });

    // Calculate metrics
    const calcMetrics = (orderList) => ({
      revenue: orderList.reduce((s, o) => s + (o.total_revenue || 0), 0),
      profit: orderList.reduce((s, o) => s + (o.net_profit || 0), 0),
      orders: orderList.length,
      avgOrderValue: orderList.length > 0 ? orderList.reduce((s, o) => s + (o.total_revenue || 0), 0) / orderList.length : 0,
      refunds: orderList.filter(o => o.status === 'refunded').length,
      refundAmount: orderList.filter(o => o.status === 'refunded').reduce((s, o) => s + (o.total_revenue || 0), 0)
    });

    const current = calcMetrics(currentPeriodOrders);
    const previous = calcMetrics(previousPeriodOrders);

    // Calculate daily data for anomaly detection
    const dailyData = {};
    currentPeriodOrders.forEach(o => {
      const day = o.order_date?.split('T')[0];
      if (!day) return;
      if (!dailyData[day]) dailyData[day] = { revenue: 0, profit: 0, orders: 0 };
      dailyData[day].revenue += o.total_revenue || 0;
      dailyData[day].profit += o.net_profit || 0;
      dailyData[day].orders += 1;
    });

    const dailyValues = Object.entries(dailyData).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date));

    // Calculate stats for anomaly detection
    const calcStats = (values) => {
      if (values.length < 3) return { mean: 0, std: 0 };
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
      return { mean, std };
    };

    const revenueStats = calcStats(dailyValues.map(d => d.revenue));
    const profitStats = calcStats(dailyValues.map(d => d.profit));
    const ordersStats = calcStats(dailyValues.map(d => d.orders));

    // Detect anomalies (values > 2 std deviations)
    const anomalies = [];
    dailyValues.forEach(day => {
      if (revenueStats.std > 0 && Math.abs(day.revenue - revenueStats.mean) > 2 * revenueStats.std) {
        anomalies.push({
          date: day.date,
          metric: 'revenue',
          value: day.revenue,
          expected: revenueStats.mean,
          deviation: ((day.revenue - revenueStats.mean) / revenueStats.std).toFixed(1),
          type: day.revenue > revenueStats.mean ? 'spike' : 'drop'
        });
      }
      if (profitStats.std > 0 && Math.abs(day.profit - profitStats.mean) > 2 * profitStats.std) {
        anomalies.push({
          date: day.date,
          metric: 'profit',
          value: day.profit,
          expected: profitStats.mean,
          deviation: ((day.profit - profitStats.mean) / profitStats.std).toFixed(1),
          type: day.profit > profitStats.mean ? 'spike' : 'drop'
        });
      }
      if (ordersStats.std > 0 && Math.abs(day.orders - ordersStats.mean) > 2 * ordersStats.std) {
        anomalies.push({
          date: day.date,
          metric: 'orders',
          value: day.orders,
          expected: ordersStats.mean,
          deviation: ((day.orders - ordersStats.mean) / ordersStats.std).toFixed(1),
          type: day.orders > ordersStats.mean ? 'spike' : 'drop'
        });
      }
    });

    if (requestedAction === 'natural_query') {
      // Natural language query
      const queryPrompt = `
You are an AI analytics assistant for an e-commerce dashboard. Answer the user's question based on this data:

CURRENT PERIOD (Last ${date_range} days):
- Total Revenue: $${current.revenue.toFixed(2)}
- Total Profit: $${current.profit.toFixed(2)}
- Total Orders: ${current.orders}
- Average Order Value: $${current.avgOrderValue.toFixed(2)}
- Profit Margin: ${current.revenue > 0 ? ((current.profit / current.revenue) * 100).toFixed(1) : 0}%
- Refunds: ${current.refunds} orders ($${current.refundAmount.toFixed(2)})

PREVIOUS PERIOD (${date_range} days before):
- Total Revenue: $${previous.revenue.toFixed(2)}
- Total Profit: $${previous.profit.toFixed(2)}
- Total Orders: ${previous.orders}
- Average Order Value: $${previous.avgOrderValue.toFixed(2)}
- Profit Margin: ${previous.revenue > 0 ? ((previous.profit / previous.revenue) * 100).toFixed(1) : 0}%

CHANGES:
- Revenue: ${previous.revenue > 0 ? (((current.revenue - previous.revenue) / previous.revenue) * 100).toFixed(1) : 'N/A'}%
- Profit: ${previous.profit > 0 ? (((current.profit - previous.profit) / previous.profit) * 100).toFixed(1) : 'N/A'}%
- Orders: ${previous.orders > 0 ? (((current.orders - previous.orders) / previous.orders) * 100).toFixed(1) : 'N/A'}%

DAILY AVERAGES (Current Period):
- Revenue: $${revenueStats.mean.toFixed(2)}/day
- Profit: $${profitStats.mean.toFixed(2)}/day
- Orders: ${ordersStats.mean.toFixed(1)}/day

DETECTED ANOMALIES:
${anomalies.length > 0 ? anomalies.map(a => `- ${a.date}: ${a.metric} ${a.type} (${a.deviation}σ from average)`).join('\n') : 'None detected'}

USER QUESTION: ${query}

Provide a concise, helpful answer. Use specific numbers when possible. If the question cannot be answered with the available data, say so politely.
`;

      const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: queryPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            related_metrics: { type: "array", items: { type: "string" } }
          }
        }
      });

      return Response.json({ success: true, ...(response || { answer: 'No response available', confidence: 'low', related_metrics: [] }) });
    }

    // Generate AI trends and insights
    const trendsPrompt = `
Analyze this e-commerce data and provide key trends and insights:

CURRENT PERIOD (Last ${date_range} days):
- Revenue: $${current.revenue.toFixed(2)}
- Profit: $${current.profit.toFixed(2)}
- Orders: ${current.orders}
- AOV: $${current.avgOrderValue.toFixed(2)}
- Margin: ${current.revenue > 0 ? ((current.profit / current.revenue) * 100).toFixed(1) : 0}%
- Refunds: ${current.refunds} ($${current.refundAmount.toFixed(2)})

PREVIOUS PERIOD:
- Revenue: $${previous.revenue.toFixed(2)}
- Profit: $${previous.profit.toFixed(2)}
- Orders: ${previous.orders}
- AOV: $${previous.avgOrderValue.toFixed(2)}

DETECTED ANOMALIES:
${anomalies.slice(0, 5).map(a => `- ${a.date}: ${a.metric} ${a.type} ($${a.value.toFixed(2)} vs avg $${a.expected.toFixed(2)})`).join('\n') || 'None'}

Provide:
1. 3-4 key trends with specific numbers and percentage changes
2. For each anomaly, a possible explanation
3. One actionable recommendation
`;

    const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: trendsPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          key_trends: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                change_value: { type: "string" },
                trend_direction: { type: "string", enum: ["up", "down", "stable"] },
                sentiment: { type: "string", enum: ["positive", "negative", "neutral"] }
              }
            }
          },
          anomaly_explanations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                metric: { type: "string" },
                explanation: { type: "string" }
              }
            }
          },
          recommendation: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "string", enum: ["high", "medium", "low"] }
            }
          }
        }
      }
    });

    return Response.json({
      success: true,
      metrics: { current, previous },
      anomalies: anomalies.slice(0, 10),
      daily_stats: { revenue: revenueStats, profit: profitStats, orders: ordersStats },
      ...(aiResponse || {})
    });

  } catch (error) {
    console.error('Dashboard AI error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

Deno.serve(handler);
export default handler;
