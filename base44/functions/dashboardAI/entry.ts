// redeploy trigger: force Base44 to republish dashboardAI runtime
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizeName(value) {
  const name = String(value || '').trim();
  return name || null;
}

function syntheticGuestEmail(order) {
  const name = normalizeName(order?.customer_name || order?.shipping_address?.name || order?.billing_address?.name);
  if (name) {
    return `guest_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}@guest.local`;
  }
  const platformOrderId = String(order?.platform_order_id || order?.id || crypto.randomUUID());
  return `guest_${platformOrderId.toLowerCase()}@guest.local`;
}

function projectedCustomerIdentity(order) {
  const email = normalizeEmail(order?.customer_email || order?.email) || syntheticGuestEmail(order);
  const name = normalizeName(order?.customer_name) || normalizeName(order?.shipping_address?.name) || 'Guest Customer';
  return { email, name };
}

function projectedRiskProfile(totalOrders, highRiskOrders) {
  const highRiskRatio = totalOrders > 0 ? highRiskOrders / totalOrders : 0;
  if (highRiskRatio >= 0.35) return 'high';
  if (highRiskRatio >= 0.15) return 'medium';
  return 'low';
}

function splitName(name) {
  const normalized = normalizeName(name) || '';
  if (!normalized) return { firstName: 'Guest', lastName: 'Customer' };
  const [firstName, ...rest] = normalized.split(/\s+/);
  return { firstName: firstName || 'Guest', lastName: rest.join(' ') || 'Customer' };
}

function buildCustomerPayload(tenantId, email, name, metrics) {
  const { firstName, lastName } = splitName(name);
  const totalOrders = Math.max(0, Number(metrics.totalOrders) || 0);
  const totalSpent = Number(metrics.totalSpent) || 0;
  const totalProfit = Number(metrics.totalProfit) || 0;
  const refundCount = Math.max(0, Number(metrics.refundCount) || 0);
  const highRiskOrders = Math.max(0, Number(metrics.highRiskOrders) || 0);
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
  const riskProfile = projectedRiskProfile(totalOrders, highRiskOrders);
  const riskScore = totalOrders > 0 ? Math.min(100, Math.round((highRiskOrders / totalOrders) * 100)) : 0;
  return {
    tenant_id: tenantId,
    email,
    name,
    first_name: firstName,
    last_name: lastName,
    total_orders: totalOrders,
    orders_count: totalOrders,
    total_spent: totalSpent,
    total_profit: totalProfit,
    ltv: totalSpent,
    avg_order_value: avgOrderValue,
    refund_count: refundCount,
    high_risk_orders: highRiskOrders,
    risk_profile: riskProfile,
    risk_score: riskScore,
    last_order_at: metrics.lastOrderAt || null,
  };
}

async function loadExistingCustomer(db, tenantId, email) {
  const byUpdated = await db.entities.Customer.filter({ tenant_id: tenantId, email }, '-updated_date', 1).catch(() => []);
  if (byUpdated?.[0]) return byUpdated[0];
  const byCreated = await db.entities.Customer.filter({ tenant_id: tenantId, email }, '-created_date', 1).catch(() => []);
  return byCreated?.[0] || null;
}

async function writeProjectedCustomer(db, current, payload) {
  const result = current?.id
    ? await db.entities.Customer.update(current.id, payload)
    : await db.entities.Customer.create(payload);
  if (!result || (!result?.id && !current?.id)) throw new Error('customer_projection_write_failed');
  return result;
}

async function rebuildProjectedCustomersFromOrders(db, tenantId, limit = 500) {
  if (!db?.entities?.Customer || !db?.entities?.Order || !tenantId) return { created: 0, updated: 0, projected: 0 };
  const orders = await db.entities.Order.filter({ tenant_id: tenantId }, '-order_date', limit).catch(() => []);
  if (!Array.isArray(orders) || orders.length === 0) return { created: 0, updated: 0, projected: 0 };

  const groups = new Map();
  for (const order of orders) {
    const { email, name } = projectedCustomerIdentity(order);
    const current = groups.get(email) || { email, name, total_orders: 0, total_spent: 0, total_profit: 0, refund_count: 0, high_risk_orders: 0, last_order_at: null };
    current.total_orders += 1;
    current.total_spent += Number(order?.total_revenue || 0) || 0;
    current.total_profit += Number(order?.net_profit || 0) || 0;
    if (String(order?.status || '').toLowerCase().includes('refund')) current.refund_count += 1;
    if (String(order?.risk_level || '').toLowerCase() === 'high' || Number(order?.fraud_score || 0) >= 70) current.high_risk_orders += 1;
    if (!current.last_order_at || new Date(order?.order_date || 0).getTime() > new Date(current.last_order_at || 0).getTime()) {
      current.last_order_at = order?.order_date || current.last_order_at;
    }
    groups.set(email, current);
  }

  let created = 0;
  let updated = 0;
  for (const customer of groups.values()) {
    const existing = await loadExistingCustomer(db, tenantId, customer.email);
    const payload = buildCustomerPayload(tenantId, customer.email, customer.name, {
      totalOrders: customer.total_orders,
      totalSpent: customer.total_spent,
      totalProfit: customer.total_profit,
      refundCount: customer.refund_count,
      highRiskOrders: customer.high_risk_orders,
      lastOrderAt: customer.last_order_at,
    });
    if (existing?.id) {
      await writeProjectedCustomer(db, existing, payload);
      updated++;
    } else {
      await writeProjectedCustomer(db, null, payload);
      created++;
    }
  }
  return { created, updated, projected: groups.size };
}

const VERSION = '2026-03-24.dashboard-projection-v2';

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
      return res instanceof Response ? res : Response.json({ error: `${name}_invalid_response` }, { status: 500 });
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return Response.json({ error: 'internal_error', endpoint: name, message: error?.message || String(error) }, { status: 500 });
    }
  };
}

async function safeFilter(filterFn, fallback = [], _context = 'safeFilter') {
  try {
    const rows = await filterFn();
    return Array.isArray(rows) ? rows : fallback;
  } catch {
    return fallback;
  }
}

async function repairProjectedCustomers(base44, tenantId, alerts) {
  const [orders, customers] = await Promise.all([
    safeFilter(() => base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 250), [], 'dashboardAI.projection_orders'),
    safeFilter(() => base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 10), [], 'dashboardAI.projection_customers')
  ]);

  if (!orders.length || customers.length > 0) {
    return { attempted: false, repaired: customers.length > 0, customerCount: customers.length };
  }

  let counts = { created: 0, updated: 0, projected: 0 };
  try {
    counts = await rebuildProjectedCustomersFromOrders(base44.asServiceRole, tenantId, 500);
  } catch (error) {
    return {
      attempted: true,
      repaired: false,
      customerCount: 0,
      repairError: String(error?.message || error || 'customer_projection_repair_failed')
    };
  }

  const refreshedCustomers = await safeFilter(
    () => base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 10),
    [],
    'dashboardAI.projection_customers_refreshed'
  );

  if (refreshedCustomers.length > 0) {
    const projectionAlerts = (alerts || []).filter((alert) =>
      String(alert?.title || '').includes('Customer Data Projection Active')
    );
    await Promise.all(
      projectionAlerts.map((alert) =>
        base44.asServiceRole.entities.Alert.update(alert.id, {
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Resolved automatically by dashboardAI projection repair.'
        }).catch(() => {})
      )
    );
  }

  return {
    attempted: true,
    repaired: refreshedCustomers.length > 0,
    customerCount: refreshedCustomers.length,
    ...counts
  };
}

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

      const projectionRepair = await repairProjectedCustomers(base44, tenant_id, alerts);
      const refreshedAlerts = projectionRepair.repaired
        ? await safeFetch(() => base44.asServiceRole.entities.Alert.filter({ tenant_id, status: 'pending' }, '-created_date', 10), alerts)
        : alerts;

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
          pendingAlerts: refreshedAlerts.length
        },
        profitScore: tenant?.profit_integrity_score || 0,
        alertsCount: refreshedAlerts.length,
        isDemoMode: !integration,
        integrationStatus: integration?.status || null,
        lastSyncAt: integration?.last_sync_at || null,
        bootstrapRecommended: !integration || !integration?.last_sync_at || orders.length === 0,
        version: VERSION,
        projectionRepair,
        orders: orders.slice(0, 5),
        alerts: refreshedAlerts,
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
