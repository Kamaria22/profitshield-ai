import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { tenant_id } = body;
    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const db = base44.asServiceRole;

    // Fetch all real orders for this tenant
    const orders = await db.entities.Order.filter({ tenant_id, is_demo: false }, '-order_date', 500);

    if (!orders || orders.length === 0) {
      return Response.json({
        success: true,
        total_customers: 0,
        segments: [],
        insights: [],
        health_score: 0,
        churn_risk_summary: 'No order data available yet.',
        top_customers: []
      });
    }

    const now = Date.now();

    // Build customer map from orders
    const customerMap = {};
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
      if (!c.last_order_date || d > new Date(c.last_order_date)) {
        c.last_order_date = order.order_date;
      }
    }

    const customerMetrics = Object.values(customerMap).map(c => {
      const daysSince = c.last_order_date
        ? Math.floor((now - new Date(c.last_order_date).getTime()) / 86400000)
        : 999;
      const avgOrderValue = c.orders.length > 0 ? c.total_spent / c.orders.length : 0;
      return {
        ...c,
        order_count: c.orders.length,
        avg_order_value: avgOrderValue,
        days_since_last_order: daysSince
      };
    });

    const totalCustomers = customerMetrics.length;
    const maxSpent = Math.max(...customerMetrics.map(c => c.total_spent), 1);
    const maxFrequency = Math.max(...customerMetrics.map(c => c.order_count), 1);

    // RFM scoring
    const scored = customerMetrics.map(c => {
      const r = c.days_since_last_order <= 30 ? 5 :
                c.days_since_last_order <= 60 ? 4 :
                c.days_since_last_order <= 90 ? 3 :
                c.days_since_last_order <= 180 ? 2 : 1;
      const f = Math.ceil((c.order_count / maxFrequency) * 5);
      const m = Math.ceil((c.total_spent / maxSpent) * 5);
      return { ...c, r, f, m, rfm: r + f + m };
    });

    // RFM-based segments
    const segments = [
      {
        name: 'High Value Champions',
        customers: scored.filter(c => c.rfm >= 12 || c.total_spent > 500),
        priority: 'high',
        description: 'Top spenders who order frequently and recently',
        risk_level: 'low'
      },
      {
        name: 'Loyal Customers',
        customers: scored.filter(c => c.order_count >= 3 && c.days_since_last_order <= 90 && c.total_spent <= 500),
        priority: 'high',
        description: 'Regular buyers with strong repeat purchase behavior',
        risk_level: 'low'
      },
      {
        name: 'Potential Loyalists',
        customers: scored.filter(c => c.order_count === 2 && c.days_since_last_order <= 60),
        priority: 'medium',
        description: 'Customers who bought twice recently — ready to convert to loyal',
        risk_level: 'low'
      },
      {
        name: 'New Customers',
        customers: scored.filter(c => c.order_count === 1 && c.days_since_last_order <= 30),
        priority: 'medium',
        description: 'First-time buyers in the last 30 days',
        risk_level: 'medium'
      },
      {
        name: 'At Risk',
        customers: scored.filter(c => c.days_since_last_order >= 60 && c.days_since_last_order < 180 && c.order_count >= 2),
        priority: 'high',
        description: 'Previously active customers who have gone quiet',
        risk_level: 'high'
      },
      {
        name: 'Churn Risk',
        customers: scored.filter(c => c.days_since_last_order >= 180),
        priority: 'medium',
        description: 'Customers who have not ordered in 6+ months',
        risk_level: 'high'
      },
      {
        name: 'Low Value',
        customers: scored.filter(c => c.total_spent < 50 && c.order_count === 1 && c.days_since_last_order > 30),
        priority: 'low',
        description: 'Single low-value purchase, no repeat activity',
        risk_level: 'medium'
      }
    ];

    const totalRevenue = customerMetrics.reduce((s, c) => s + c.total_spent, 0);
    const avgLTV = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
    const atRiskCount = segments.find(s => s.name === 'At Risk')?.customers.length || 0;
    const churnCount = segments.find(s => s.name === 'Churn Risk')?.customers.length || 0;

    const formattedSegments = segments
      .filter(s => s.customers.length > 0)
      .map(s => {
        const segRevenue = s.customers.reduce((sum, c) => sum + c.total_spent, 0);
        const avgLTVSeg = s.customers.length > 0 ? segRevenue / s.customers.length : 0;
        return {
          name: s.name,
          description: s.description,
          size: s.customers.length,
          percentage: `${((s.customers.length / totalCustomers) * 100).toFixed(0)}%`,
          avg_lifetime_value: Math.round(avgLTVSeg * 100) / 100,
          value_potential: `$${segRevenue.toFixed(0)}`,
          priority: s.priority,
          risk_level: s.risk_level,
          expected_roi: s.priority === 'high' ? 'High' : s.priority === 'medium' ? 'Medium' : 'Low',
          recommended_actions: getActions(s.name)
        };
      });

    const healthScore = Math.round(Math.min(100, Math.max(0,
      50
      + (totalCustomers > 5 ? 10 : 0)
      + (atRiskCount / Math.max(totalCustomers, 1) < 0.2 ? 20 : -10)
      + (churnCount / Math.max(totalCustomers, 1) < 0.1 ? 20 : -5)
    )));

    const insights = [
      atRiskCount > 0 && {
        insight: `${atRiskCount} customers are at risk of churning`,
        impact: 'High',
        action: 'Send a win-back campaign with a discount offer'
      },
      scored.filter(c => c.rfm >= 12).length > 0 && {
        insight: `${scored.filter(c => c.rfm >= 12).length} high-value champions drive the most revenue`,
        impact: 'High',
        action: 'Offer VIP perks and early access to new products'
      },
      scored.filter(c => c.order_count === 1 && c.days_since_last_order <= 30).length > 0 && {
        insight: `${scored.filter(c => c.order_count === 1 && c.days_since_last_order <= 30).length} new customers need nurturing`,
        impact: 'Medium',
        action: 'Send a follow-up email with related products within 7 days'
      }
    ].filter(Boolean).slice(0, 4);

    // Store snapshot
    const snapshot = {
      tenant_id,
      computed_at: new Date().toISOString(),
      window_days: 365,
      row_count: totalCustomers,
      segments: formattedSegments
    };
    await db.entities.CustomerSegmentSnapshot.create(snapshot);

    return Response.json({
      success: true,
      total_customers: totalCustomers,
      segments: formattedSegments,
      insights,
      health_score: healthScore,
      churn_risk_summary: `${atRiskCount} at-risk, ${churnCount} churned out of ${totalCustomers} total customers.`,
      top_customers: scored.sort((a, b) => b.rfm - a.rfm).slice(0, 10).map(c => ({
        name: c.name,
        email: c.email,
        total_spent: c.total_spent,
        order_count: c.order_count,
        rfm: c.rfm
      }))
    });

  } catch (error) {
    console.error('[aiCustomerSegmentation] error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getActions(segmentName) {
  const map = {
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