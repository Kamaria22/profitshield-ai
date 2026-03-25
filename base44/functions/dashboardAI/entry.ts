// redeploy trigger: rewritten dashboardAI runtime for Base44 republish
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { rebuildProjectedCustomersFromOrders } from '../helpers/customerProjection/entry.ts';

const VERSION = '2026-03-24.dashboard-rewrite-v1';

function json(data, status = 200) {
  return Response.json(data, { status });
}

function withEndpointGuard(name, handler) {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }
    try {
      const res = await handler(req);
      return res instanceof Response ? res : json({ error: `${name}_invalid_response`, version: VERSION }, 500);
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return json({ error: 'internal_error', endpoint: name, message: error?.message || String(error), version: VERSION }, 500);
    }
  };
}

async function safeFilter(filterFn, fallback = []) {
  try {
    const rows = await filterFn();
    return Array.isArray(rows) ? rows : fallback;
  } catch {
    return fallback;
  }
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function calcStats(values) {
  if (!values.length) return { mean: 0, std: 0 };
  const mean = sum(values) / values.length;
  const std = Math.sqrt(sum(values.map((value) => Math.pow(value - mean, 2))) / values.length);
  return { mean, std };
}

function buildMetrics(orders) {
  const revenue = sum(orders.map((order) => Number(order?.total_revenue || order?.total_price || 0) || 0));
  const profit = sum(orders.map((order) => Number(order?.net_profit || 0) || 0));
  return {
    revenue,
    profit,
    orders: orders.length,
    avgOrderValue: orders.length ? revenue / orders.length : 0,
    refunds: orders.filter((order) => String(order?.status || '').includes('refund')).length,
    refundAmount: sum(orders.filter((order) => String(order?.status || '').includes('refund')).map((order) => Number(order?.total_revenue || 0) || 0))
  };
}

function buildTrend(current, previous, dateRange) {
  const revenueChange = previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : 0;
  const profitChange = previous.profit > 0 ? ((current.profit - previous.profit) / previous.profit) * 100 : 0;
  const orderChange = previous.orders > 0 ? ((current.orders - previous.orders) / previous.orders) * 100 : 0;

  const key_trends = [
    {
      title: 'Revenue trend',
      description: `Revenue is ${revenueChange >= 0 ? 'up' : 'down'} ${Math.abs(revenueChange).toFixed(1)}% over the previous ${dateRange} days.`,
      trend_direction: revenueChange > 1 ? 'up' : revenueChange < -1 ? 'down' : 'stable',
      sentiment: revenueChange > 1 ? 'positive' : revenueChange < -1 ? 'negative' : 'neutral',
      change_value: `${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}%`
    },
    {
      title: 'Profit trend',
      description: `Profit is ${profitChange >= 0 ? 'up' : 'down'} ${Math.abs(profitChange).toFixed(1)}% over the previous ${dateRange} days.`,
      trend_direction: profitChange > 1 ? 'up' : profitChange < -1 ? 'down' : 'stable',
      sentiment: profitChange > 1 ? 'positive' : profitChange < -1 ? 'negative' : 'neutral',
      change_value: `${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)}%`
    },
    {
      title: 'Order volume',
      description: `Order count changed by ${orderChange.toFixed(1)}% compared with the previous period.`,
      trend_direction: orderChange > 1 ? 'up' : orderChange < -1 ? 'down' : 'stable',
      sentiment: orderChange > 1 ? 'positive' : orderChange < -1 ? 'negative' : 'neutral',
      change_value: `${orderChange >= 0 ? '+' : ''}${orderChange.toFixed(1)}%`
    }
  ];

  const recommendation = profitChange < 0
    ? {
        title: 'Investigate margin compression',
        description: 'Profit dropped versus the previous period. Review discounts, shipping, and product-level cost mappings.',
        priority: 'high'
      }
    : {
        title: 'Maintain current operating rhythm',
        description: 'Core profitability remains stable. Continue monitoring anomalies and customer quality.',
        priority: 'low'
      };

  return { key_trends, recommendation };
}

function buildDailyValues(orders, currentPeriodStart) {
  const buckets = new Map();
  for (const order of orders) {
    const orderDate = order?.order_date ? new Date(order.order_date) : null;
    if (!orderDate || Number.isNaN(orderDate.getTime()) || orderDate < currentPeriodStart) continue;
    const key = orderDate.toISOString().slice(0, 10);
    const bucket = buckets.get(key) || { date: key, revenue: 0, profit: 0, orders: 0 };
    bucket.revenue += Number(order?.total_revenue || 0) || 0;
    bucket.profit += Number(order?.net_profit || 0) || 0;
    bucket.orders += 1;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildAnomalies(dailyValues) {
  const revenueStats = calcStats(dailyValues.map((item) => item.revenue));
  const profitStats = calcStats(dailyValues.map((item) => item.profit));
  const orderStats = calcStats(dailyValues.map((item) => item.orders));
  const anomalies = [];
  const anomaly_explanations = [];

  for (const item of dailyValues) {
    const checks = [
      { metric: 'revenue', value: item.revenue, stats: revenueStats },
      { metric: 'profit', value: item.profit, stats: profitStats },
      { metric: 'orders', value: item.orders, stats: orderStats }
    ];
    for (const check of checks) {
      if (check.stats.std <= 0) continue;
      const deviation = (check.value - check.stats.mean) / check.stats.std;
      if (Math.abs(deviation) <= 2) continue;
      const type = deviation > 0 ? 'spike' : 'drop';
      anomalies.push({
        date: item.date,
        metric: check.metric,
        value: check.value,
        expected: check.stats.mean,
        deviation: deviation.toFixed(1),
        type
      });
      anomaly_explanations.push({
        date: item.date,
        metric: check.metric,
        explanation: `${check.metric} showed a ${type} compared with the recent baseline.`
      });
    }
  }

  return { anomalies, anomaly_explanations };
}

async function repairProjectedCustomers(base44, tenantId, alerts) {
  const orders = await safeFilter(() => base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 250), []);
  const customers = await safeFilter(() => base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 10), []);
  if (!orders.length || customers.length > 0) {
    return { attempted: false, repaired: customers.length > 0, customerCount: customers.length };
  }

  try {
    const counts = await rebuildProjectedCustomersFromOrders(base44.asServiceRole, tenantId, 500);
    const refreshedCustomers = await safeFilter(() => base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 10), []);
    if (refreshedCustomers.length > 0) {
      const projectionAlerts = (alerts || []).filter((alert) => String(alert?.title || '').includes('Customer Data Projection Active'));
      await Promise.all(projectionAlerts.map((alert) =>
        base44.asServiceRole.entities.Alert.update(alert.id, {
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Resolved automatically by dashboardAI projection repair.'
        }).catch(() => {})
      ));
    }
    return { attempted: true, repaired: refreshedCustomers.length > 0, customerCount: refreshedCustomers.length, ...counts };
  } catch (error) {
    return { attempted: true, repaired: false, customerCount: 0, repairError: String(error?.message || error || 'customer_projection_repair_failed') };
  }
}

const handler = withEndpointGuard('dashboardAI', async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const tenantId = String(body?.tenant_id || '').trim();
  const requestedAction = String(body?.action || 'analyze').trim();
  const query = String(body?.query || '').trim();
  const dateRange = Math.max(1, Math.min(365, Number(body?.date_range || 30) || 30));

  if (!tenantId) return json({ error: 'tenant_id required', version: VERSION }, 400);

  if (requestedAction === 'embedded_summary') {
    const [orders, alerts, leaks, tenant, integration] = await Promise.all([
      safeFilter(() => base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 50), []),
      safeFilter(() => base44.asServiceRole.entities.Alert.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 10), []),
      safeFilter(() => base44.asServiceRole.entities.ProfitLeak.filter({ tenant_id: tenantId, is_resolved: false }, '-impact_amount', 5), []),
      base44.asServiceRole.entities.Tenant.filter({ id: tenantId }).then((rows) => rows?.[0] || null).catch(() => null),
      base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify', status: 'connected' }).then((rows) => rows?.[0] || null).catch(() => null)
    ]);

    const projectionRepair = await repairProjectedCustomers(base44, tenantId, alerts);
    const refreshedAlerts = projectionRepair.repaired
      ? await safeFilter(() => base44.asServiceRole.entities.Alert.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 10), alerts)
      : alerts;

    const totalRevenue = sum(orders.map((order) => Number(order?.total_revenue || order?.total_price || 0) || 0));
    const totalProfit = sum(orders.map((order) => Number(order?.net_profit || 0) || 0));
    const highRiskOrders = orders.filter((order) => (Number(order?.risk_score || order?.fraud_score || 0) || 0) > 70).length;

    return json({
      success: true,
      version: VERSION,
      metrics: {
        totalRevenue,
        totalProfit,
        avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        highRiskOrders,
        totalOrders: orders.length,
        pendingAlerts: refreshedAlerts.length
      },
      profitScore: tenant?.profit_integrity_score || 0,
      alertsCount: refreshedAlerts.length,
      isDemoMode: !integration,
      integrationStatus: integration?.status || null,
      lastSyncAt: integration?.last_sync_at || null,
      bootstrapRecommended: !integration || !integration?.last_sync_at || orders.length === 0,
      projectionRepair,
      orders: orders.slice(0, 5),
      alerts: refreshedAlerts,
      profitLeaks: leaks
    });
  }

  let user = null;
  try { user = await base44.auth.me(); } catch (_) { user = null; }
  if (!user) return json({ error: 'Unauthorized', version: VERSION }, 401);

  const orders = await safeFilter(() => base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 1000), []);
  const now = new Date();
  const currentPeriodStart = new Date(now.getTime() - dateRange * 24 * 60 * 60 * 1000);
  const previousPeriodStart = new Date(currentPeriodStart.getTime() - dateRange * 24 * 60 * 60 * 1000);
  const currentPeriodOrders = orders.filter((order) => new Date(order?.order_date || 0) >= currentPeriodStart);
  const previousPeriodOrders = orders.filter((order) => {
    const d = new Date(order?.order_date || 0);
    return d >= previousPeriodStart && d < currentPeriodStart;
  });
  const current = buildMetrics(currentPeriodOrders);
  const previous = buildMetrics(previousPeriodOrders);
  const dailyValues = buildDailyValues(orders, currentPeriodStart);
  const { anomalies, anomaly_explanations } = buildAnomalies(dailyValues);
  const { key_trends, recommendation } = buildTrend(current, previous, dateRange);

  if (requestedAction === 'natural_query') {
    const answer = query
      ? `Over the last ${dateRange} days, revenue was $${current.revenue.toFixed(2)}, profit was $${current.profit.toFixed(2)}, and order volume was ${current.orders}.`
      : 'Ask about revenue, profit, orders, or refunds for the selected period.';
    return json({
      success: true,
      version: VERSION,
      answer,
      confidence: 'medium',
      related_metrics: ['revenue', 'profit', 'orders', 'refunds']
    });
  }

  return json({
    success: true,
    version: VERSION,
    current,
    previous,
    key_trends,
    recommendation,
    anomalies,
    anomaly_explanations
  });
});

Deno.serve(handler);
