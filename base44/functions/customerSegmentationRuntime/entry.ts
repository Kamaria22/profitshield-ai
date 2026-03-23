import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const VERSION = '2026-03-17.customer-segmentation-runtime-v1';

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function logistic(x: number): number {
  if (!Number.isFinite(x)) return 0.5;
  if (x > 20) return 1;
  if (x < -20) return 0;
  return 1 / (1 + Math.exp(-x));
}

function churnProbability(features: {
  daysSinceLastOrder?: number;
  orderCount?: number;
  totalSpent?: number;
  refundRatePct?: number;
  highRiskOrders?: number;
}) {
  const days = Number(features.daysSinceLastOrder) || 0;
  const orders = Number(features.orderCount) || 0;
  const spent = Number(features.totalSpent) || 0;
  const refundRate = Number(features.refundRatePct) || 0;
  const highRiskOrders = Number(features.highRiskOrders) || 0;

  let score = -2.0;
  score += Math.min(2.0, days / 90);
  score -= Math.min(1.2, orders * 0.12);
  score -= Math.min(1.0, spent / 800);
  score += Math.min(1.0, refundRate / 35);
  score += Math.min(0.8, highRiskOrders * 0.15);

  return {
    probability: Number(clamp(logistic(score), 0.01, 0.99).toFixed(4)),
    score: Number(score.toFixed(4))
  };
}

async function safeUser(base44) {
  try {
    return await base44.auth.me();
  } catch {
    return null;
  }
}

async function loadTenantOrders(db, tenant_id: string) {
  const rows = await db.entities.Order.filter({ tenant_id }, '-order_date', 800).catch(() => []);
  return Array.isArray(rows) ? rows.filter((order) => order?.is_demo !== true) : [];
}

function getActions(segmentName: string) {
  const map: Record<string, string[]> = {
    'High Value Champions': ['Send VIP loyalty rewards', 'Offer early product access', 'Personalized thank-you gifts'],
    'Loyal Customers': ['Cross-sell complementary products', 'Offer a loyalty program', 'Request reviews'],
    'Potential Loyalists': ['Send a second-purchase discount', 'Product recommendation emails'],
    'New Customers': ['Welcome series email flow', 'First-purchase follow-up', 'Related product suggestions'],
    'At Risk': ['Win-back campaign with 15% discount', 'Re-engagement email series', 'Survey to understand drop-off'],
    'Churn Risk': ['Last-chance discount offer', 'Re-introduction email', 'Survey for feedback'],
    'Low Value': ['Bundle deals to increase AOV', 'Upsell to premium products']
  };
  return map[segmentName] || ['Send targeted campaign'];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { tenant_id, force_refresh = false } = body;
    if (!tenant_id) return Response.json({ error: 'tenant_id required', version: VERSION }, { status: 400 });

    const user = await safeUser(base44);
    if (user) {
      const userRole = String(user?.role || user?.app_role || '').toLowerCase();
      const userTenant = String(user?.tenant_id || '').trim();
      if (userRole !== 'owner' && userRole !== 'admin' && userTenant && userTenant !== tenant_id) {
        return Response.json({ error: 'Forbidden tenant access', version: VERSION }, { status: 403 });
      }
    }

    const db = base44.asServiceRole;

    if (!force_refresh) {
      const snapshots = await db.entities.CustomerSegmentSnapshot.filter({ tenant_id }, '-computed_at', 1).catch(() => []);
      const latestSnapshot = snapshots?.[0] || null;
      const computedAtMs = latestSnapshot?.computed_at ? new Date(latestSnapshot.computed_at).getTime() : 0;
      if (latestSnapshot && computedAtMs && (Date.now() - computedAtMs) < SNAPSHOT_TTL_MS) {
        return Response.json({
          success: true,
          cached: true,
          version: VERSION,
          total_customers: latestSnapshot.row_count || 0,
          segments: latestSnapshot.segments || [],
          insights: latestSnapshot.insights || [],
          health_score: latestSnapshot.health_score || 0,
          churn_risk_summary: latestSnapshot.churn_risk_summary || 'Customer segmentation loaded from cache.',
          top_customers: latestSnapshot.top_customers || [],
          computed_at: latestSnapshot.computed_at
        });
      }
    }

    const orders = await loadTenantOrders(db, tenant_id);
    if (!orders.length) {
      return Response.json({
        success: true,
        version: VERSION,
        total_customers: 0,
        segments: [],
        insights: [],
        health_score: 0,
        churn_risk_summary: 'No order data available yet.',
        top_customers: []
      });
    }

    const now = Date.now();
    const customerMap: Record<string, any> = {};
    for (const order of orders) {
      const email = order.customer_email || order.customer_name || `anon_${order.platform_order_id}`;
      if (!customerMap[email]) {
        customerMap[email] = {
          email,
          name: order.customer_name || email,
          orders: [],
          total_spent: 0,
          total_profit: 0,
          refund_count: 0,
          high_risk_orders: 0,
          last_order_date: null
        };
      }
      const c = customerMap[email];
      c.orders.push(order);
      c.total_spent += order.total_revenue || 0;
      c.total_profit += order.net_profit || 0;
      if (order.status === 'refunded' || order.status === 'partially_refunded') c.refund_count++;
      if (order.risk_level === 'high') c.high_risk_orders++;
      const d = new Date(order.order_date);
      if (!c.last_order_date || d > new Date(c.last_order_date)) c.last_order_date = order.order_date;
    }

    const customerMetrics = Object.values(customerMap).map((c: any) => {
      const daysSince = c.last_order_date ? Math.floor((now - new Date(c.last_order_date).getTime()) / 86400000) : 999;
      return {
        ...c,
        order_count: c.orders.length,
        avg_order_value: c.orders.length > 0 ? c.total_spent / c.orders.length : 0,
        days_since_last_order: daysSince
      };
    });

    const totalCustomers = customerMetrics.length;
    const maxSpent = Math.max(...customerMetrics.map((c: any) => c.total_spent), 1);
    const maxFrequency = Math.max(...customerMetrics.map((c: any) => c.order_count), 1);

    const scored = customerMetrics.map((c: any) => {
      const r = c.days_since_last_order <= 30 ? 5 : c.days_since_last_order <= 60 ? 4 : c.days_since_last_order <= 90 ? 3 : c.days_since_last_order <= 180 ? 2 : 1;
      const f = Math.ceil((c.order_count / maxFrequency) * 5);
      const m = Math.ceil((c.total_spent / maxSpent) * 5);
      const refundRatePct = c.order_count > 0 ? (c.refund_count / c.order_count) * 100 : 0;
      const churn = churnProbability({
        daysSinceLastOrder: c.days_since_last_order,
        orderCount: c.order_count,
        totalSpent: c.total_spent,
        refundRatePct,
        highRiskOrders: c.high_risk_orders
      });
      return { ...c, r, f, m, rfm: r + f + m, churn_probability: churn.probability };
    });

    const segments = [
      { name: 'High Value Champions', customers: scored.filter((c: any) => c.rfm >= 12 || c.total_spent > 500), priority: 'high', description: 'Top spenders who order frequently and recently', risk_level: 'low' },
      { name: 'Loyal Customers', customers: scored.filter((c: any) => c.order_count >= 3 && c.days_since_last_order <= 90 && c.total_spent <= 500), priority: 'high', description: 'Regular buyers with strong repeat purchase behavior', risk_level: 'low' },
      { name: 'Potential Loyalists', customers: scored.filter((c: any) => c.order_count === 2 && c.days_since_last_order <= 60), priority: 'medium', description: 'Customers who bought twice recently — ready to convert to loyal', risk_level: 'low' },
      { name: 'New Customers', customers: scored.filter((c: any) => c.order_count === 1 && c.days_since_last_order <= 30), priority: 'medium', description: 'First-time buyers in the last 30 days', risk_level: 'medium' },
      { name: 'At Risk', customers: scored.filter((c: any) => c.days_since_last_order >= 60 && c.days_since_last_order < 180 && c.order_count >= 2), priority: 'high', description: 'Previously active customers who have gone quiet', risk_level: 'high' },
      { name: 'Churn Risk', customers: scored.filter((c: any) => c.days_since_last_order >= 180), priority: 'medium', description: 'Customers who have not ordered in 6+ months', risk_level: 'high' },
      { name: 'Low Value', customers: scored.filter((c: any) => c.total_spent < 50 && c.order_count === 1 && c.days_since_last_order > 30), priority: 'low', description: 'Single low-value purchase, no repeat activity', risk_level: 'medium' }
    ];

    const atRiskCount = segments.find((s) => s.name === 'At Risk')?.customers.length || 0;
    const churnCount = segments.find((s) => s.name === 'Churn Risk')?.customers.length || 0;
    const avgChurnProbability = scored.length > 0 ? scored.reduce((sum: number, c: any) => sum + (c.churn_probability || 0), 0) / scored.length : 0;

    const formattedSegments = segments
      .filter((s) => s.customers.length > 0)
      .map((s) => {
        const segRevenue = s.customers.reduce((sum: number, c: any) => sum + c.total_spent, 0);
        const avgLtv = s.customers.length > 0 ? segRevenue / s.customers.length : 0;
        return {
          name: s.name,
          description: s.description,
          size: s.customers.length,
          percentage: `${((s.customers.length / totalCustomers) * 100).toFixed(0)}%`,
          avg_lifetime_value: Math.round(avgLtv * 100) / 100,
          value_potential: `$${segRevenue.toFixed(0)}`,
          priority: s.priority,
          risk_level: s.risk_level,
          expected_roi: s.priority === 'high' ? 'High' : s.priority === 'medium' ? 'Medium' : 'Low',
          recommended_actions: getActions(s.name)
        };
      });

    const healthScore = Math.round(Math.min(100, Math.max(0, 50 + (totalCustomers > 5 ? 10 : 0) + (atRiskCount / Math.max(totalCustomers, 1) < 0.2 ? 20 : -10) + (churnCount / Math.max(totalCustomers, 1) < 0.1 ? 20 : -5))));

    const insights = [
      atRiskCount > 0 && { insight: `${atRiskCount} customers are at risk of churning`, impact: 'High', action: 'Send a win-back campaign with a discount offer' },
      scored.filter((c: any) => c.rfm >= 12).length > 0 && { insight: `${scored.filter((c: any) => c.rfm >= 12).length} high-value champions drive the most revenue`, impact: 'High', action: 'Offer VIP perks and early access to new products' },
      scored.filter((c: any) => c.order_count === 1 && c.days_since_last_order <= 30).length > 0 && { insight: `${scored.filter((c: any) => c.order_count === 1 && c.days_since_last_order <= 30).length} new customers need nurturing`, impact: 'Medium', action: 'Send a follow-up email with related products within 7 days' }
    ].filter(Boolean);

    const snapshot = {
      tenant_id,
      computed_at: new Date().toISOString(),
      window_days: 365,
      row_count: totalCustomers,
      segments: formattedSegments,
      insights,
      health_score: healthScore,
      churn_risk_summary: `${atRiskCount} at-risk, ${churnCount} churned out of ${totalCustomers} total customers. Avg churn probability ${(avgChurnProbability * 100).toFixed(1)}%.`,
      top_customers: scored
        .sort((a: any, b: any) => b.rfm - a.rfm)
        .slice(0, 10)
        .map((c: any) => ({
          name: c.name,
          email: c.email,
          total_spent: c.total_spent,
          order_count: c.order_count,
          rfm: c.rfm,
          churn_probability: Number(((c.churn_probability || 0) * 100).toFixed(1))
        }))
    };

    await db.entities.CustomerSegmentSnapshot.create(snapshot).catch(() => {});

    return Response.json({
      success: true,
      cached: false,
      version: VERSION,
      total_customers: totalCustomers,
      segments: formattedSegments,
      insights,
      health_score: healthScore,
      churn_risk_summary: snapshot.churn_risk_summary,
      top_customers: snapshot.top_customers,
      computed_at: snapshot.computed_at
    });
  } catch (error) {
    console.error('[customerSegmentationRuntime] error:', error);
    return Response.json({ error: error?.message || String(error), version: VERSION }, { status: 500 });
  }
});
