import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'create_view') {
      return await createMultiStoreView(base44, body);
    } else if (action === 'get_consolidated') {
      return await getConsolidatedDashboard(base44, body.view_id);
    } else if (action === 'detect_cross_store_fraud') {
      return await detectCrossStoreFraud(base44, body.view_id);
    } else if (action === 'list_views') {
      return await listViews(base44, body.parent_tenant_id);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function createMultiStoreView(base44, data) {
  const { parent_tenant_id, view_name, child_tenant_ids } = data;

  // Get child tenant details
  const childStores = [];
  for (const tenantId of child_tenant_ids) {
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
    if (tenants.length > 0) {
      childStores.push({
        tenant_id: tenantId,
        store_name: tenants[0].shop_name,
        platform: tenants[0].platform,
        status: tenants[0].status
      });
    }
  }

  const view = await base44.asServiceRole.entities.MultiStoreView.create({
    parent_tenant_id,
    view_name,
    child_stores: childStores,
    aggregated_metrics: {
      total_revenue: 0,
      total_orders: 0,
      total_profit: 0,
      avg_margin: 0,
      total_chargebacks: 0,
      combined_fraud_rate: 0
    },
    period: new Date().toISOString().slice(0, 7),
    last_updated: new Date().toISOString()
  });

  return Response.json({
    success: true,
    view_id: view.id,
    stores_added: childStores.length
  });
}

async function getConsolidatedDashboard(base44, viewId) {
  const views = await base44.asServiceRole.entities.MultiStoreView.filter({ id: viewId });
  if (views.length === 0) {
    return Response.json({ error: 'View not found' }, { status: 404 });
  }

  const view = views[0];
  const storeBreakdown = [];
  let totalRevenue = 0, totalOrders = 0, totalProfit = 0, totalChargebacks = 0, totalFraud = 0;

  for (const store of view.child_stores || []) {
    const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: store.tenant_id });
    
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const profit = orders.reduce((sum, o) => sum + (o.profit || 0), 0);
    const chargebacks = orders.filter(o => o.chargeback_status === 'lost').length;
    const fraudOrders = orders.filter(o => (o.risk_score || 0) > 70).length;

    storeBreakdown.push({
      tenant_id: store.tenant_id,
      store_name: store.store_name,
      revenue,
      orders: orders.length,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      fraud_rate: orders.length > 0 ? (fraudOrders / orders.length) * 100 : 0
    });

    totalRevenue += revenue;
    totalOrders += orders.length;
    totalProfit += profit;
    totalChargebacks += chargebacks;
    totalFraud += fraudOrders;
  }

  const aggregated = {
    total_revenue: totalRevenue,
    total_orders: totalOrders,
    total_profit: totalProfit,
    avg_margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    total_chargebacks: totalChargebacks,
    combined_fraud_rate: totalOrders > 0 ? (totalFraud / totalOrders) * 100 : 0
  };

  // Update the view
  await base44.asServiceRole.entities.MultiStoreView.update(viewId, {
    aggregated_metrics: aggregated,
    store_breakdown: storeBreakdown,
    last_updated: new Date().toISOString()
  });

  return Response.json({
    view_name: view.view_name,
    stores_count: view.child_stores.length,
    aggregated_metrics: aggregated,
    store_breakdown: storeBreakdown.sort((a, b) => b.revenue - a.revenue),
    period: view.period
  });
}

async function detectCrossStoreFraud(base44, viewId) {
  const views = await base44.asServiceRole.entities.MultiStoreView.filter({ id: viewId });
  if (views.length === 0) {
    return Response.json({ error: 'View not found' }, { status: 404 });
  }

  const view = views[0];
  const allOrders = [];
  
  // Collect all orders from all stores
  for (const store of view.child_stores || []) {
    const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: store.tenant_id });
    allOrders.push(...orders.map(o => ({ ...o, store_name: store.store_name })));
  }

  // Group by customer email
  const emailGroups = {};
  for (const order of allOrders) {
    const email = order.customer_email?.toLowerCase();
    if (email) {
      emailGroups[email] = emailGroups[email] || [];
      emailGroups[email].push(order);
    }
  }

  // Detect cross-store patterns
  const patterns = [];
  for (const [email, orders] of Object.entries(emailGroups)) {
    const uniqueStores = [...new Set(orders.map(o => o.tenant_id))];
    if (uniqueStores.length >= 2) {
      const avgRiskScore = orders.reduce((sum, o) => sum + (o.risk_score || 0), 0) / orders.length;
      
      if (avgRiskScore > 50 || orders.length > 5) {
        patterns.push({
          pattern_type: 'multi_store_customer',
          stores_affected: orders.map(o => o.store_name).filter((v, i, a) => a.indexOf(v) === i),
          orders_linked: orders.length,
          total_value: orders.reduce((sum, o) => sum + (o.total || 0), 0),
          avg_risk_score: avgRiskScore,
          risk_level: avgRiskScore > 70 ? 'high' : avgRiskScore > 50 ? 'medium' : 'low',
          customer_email: email.slice(0, 3) + '***' + email.slice(email.indexOf('@'))
        });
      }
    }
  }

  // Update view with patterns
  await base44.asServiceRole.entities.MultiStoreView.update(viewId, {
    cross_store_fraud_patterns: patterns.slice(0, 50)
  });

  return Response.json({
    patterns_detected: patterns.length,
    high_risk_patterns: patterns.filter(p => p.risk_level === 'high').length,
    patterns: patterns.sort((a, b) => b.avg_risk_score - a.avg_risk_score).slice(0, 20),
    total_value_at_risk: patterns.reduce((sum, p) => sum + p.total_value, 0)
  });
}

async function listViews(base44, parentTenantId) {
  const filter = parentTenantId ? { parent_tenant_id: parentTenantId } : {};
  const views = await base44.asServiceRole.entities.MultiStoreView.filter(filter);

  return Response.json({
    views: views.map(v => ({
      id: v.id,
      view_name: v.view_name,
      stores_count: (v.child_stores || []).length,
      total_revenue: v.aggregated_metrics?.total_revenue || 0,
      last_updated: v.last_updated
    }))
  });
}