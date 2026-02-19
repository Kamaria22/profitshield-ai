import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * DEMO DATA GENERATOR
 * Sanitizes real tenant data for public demo use
 * - Masks sensitive information
 * - Generates realistic demo dataset
 * - Zero out billing data
 * - Remove API keys/tokens
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only owner can generate demo data
    if (user.role !== 'admin' && user.role !== 'owner') {
      return Response.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
    }

    const { tenantId, daysBack = 30, demoMode = true } = await req.json();

    if (!tenantId) {
      return Response.json({ error: 'tenantId required' }, { status: 400 });
    }

    // Fetch tenant data
    const [tenant, orders, products, customers, leaks, anomalies, alerts, saasMetrics, recommendations] = await Promise.all([
      base44.asServiceRole.entities.Tenant.filter({ id: tenantId }).then(r => r[0]),
      base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 100),
      base44.asServiceRole.entities.Product.filter({ tenant_id: tenantId }, '-created_date', 50),
      base44.asServiceRole.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 50),
      base44.asServiceRole.entities.ProfitLeak.filter({ tenant_id: tenantId }, '-detected_at', 10),
      base44.asServiceRole.entities.DataAccessAnomaly.filter({ tenant_id: tenantId }, '-detected_at', 5),
      base44.asServiceRole.entities.Alert.filter({ tenant_id: tenantId }, '-created_date', 20),
      base44.asServiceRole.entities.SaaSMetrics.filter({ tenant_id: tenantId }, '-period', 1).then(r => r[0]),
      base44.asServiceRole.entities.MerchantRecommendation.filter({ tenant_id: tenantId }, '-created_date', 5)
    ]);

    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Calculate metrics
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const recentOrders = orders.filter(o => new Date(o.created_date) >= cutoffDate);
    
    const totalRevenue = recentOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalProfit = recentOrders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
    const totalCost = recentOrders.reduce((sum, o) => sum + (o.total_cost || 0), 0);
    const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    // Risk distribution
    const fraudScores = recentOrders.map(o => o.fraud_score || 0).filter(s => s > 0);
    const avgFraudScore = fraudScores.length > 0 ? fraudScores.reduce((a, b) => a + b, 0) / fraudScores.length : 0;

    const returnRisks = recentOrders.map(o => o.return_risk || 0).filter(s => s > 0);
    const avgReturnRisk = returnRisks.length > 0 ? returnRisks.reduce((a, b) => a + b, 0) / returnRisks.length : 0;

    const chargebackRisks = recentOrders.map(o => o.chargeback_risk || 0).filter(s => s > 0);
    const avgChargebackRisk = chargebackRisks.length > 0 ? chargebackRisks.reduce((a, b) => a + b, 0) / chargebackRisks.length : 0;

    // Sanitize function
    const sanitizeEmail = (email) => {
      if (!email) return 'demo@example.com';
      const [name] = email.split('@');
      return `${name.slice(0, 3)}***@demo.com`;
    };

    const sanitizePhone = (phone) => {
      if (!phone) return null;
      return phone.replace(/\d(?=\d{4})/g, '*');
    };

    const sanitizeAddress = (addr) => {
      if (!addr) return null;
      return {
        ...addr,
        address1: addr.address1 ? '*** Demo Street' : null,
        address2: null,
        phone: sanitizePhone(addr.phone)
      };
    };

    // Sanitized data
    const sanitizedTenant = demoMode ? {
      id: tenant.id,
      shop_name: 'Demo Store',
      shop_domain: 'demo-store.myshopify.com',
      platform: tenant.platform,
      status: tenant.status,
      profit_integrity_score: tenant.profit_integrity_score || 85,
      subscription_tier: tenant.subscription_tier,
      currency: tenant.currency || 'USD',
      // Zero out billing
      stripe_customer_id: null,
      stripe_subscription_id: null,
      billing_email: 'billing@demo.com'
    } : tenant;

    const sanitizedOrders = demoMode ? recentOrders.map((o, idx) => ({
      id: o.id,
      order_number: `DEMO-${1000 + idx}`,
      total_amount: o.total_amount,
      net_profit: o.net_profit,
      profit_margin: o.profit_margin,
      total_cost: o.total_cost,
      fraud_score: o.fraud_score ? Math.min(o.fraud_score, 65) : 0, // Cap for demo
      return_risk: o.return_risk,
      chargeback_risk: o.chargeback_risk,
      status: o.status,
      created_date: o.created_date,
      customer_email: sanitizeEmail(o.customer_email),
      // Remove sensitive fields
      shipping_address: sanitizeAddress(o.shipping_address),
      billing_address: sanitizeAddress(o.billing_address),
      payment_method: o.payment_method ? { type: o.payment_method.type } : null
    })) : recentOrders;

    const sanitizedCustomers = demoMode ? customers.map((c, idx) => ({
      id: c.id,
      email: sanitizeEmail(c.email),
      first_name: `Customer`,
      last_name: `${idx + 1}`,
      total_spent: c.total_spent,
      orders_count: c.orders_count,
      ltv: c.ltv,
      risk_score: c.risk_score ? Math.min(c.risk_score, 50) : 0,
      created_date: c.created_date
    })) : customers;

    const sanitizedProducts = demoMode ? products.map((p, idx) => ({
      id: p.id,
      name: p.name || `Product ${idx + 1}`,
      sku: `DEMO-SKU-${idx + 1}`,
      price: p.price,
      cost: p.cost,
      margin: p.margin,
      profit_margin_percentage: p.profit_margin_percentage,
      quantity_sold: p.quantity_sold,
      revenue: p.revenue
    })) : products;

    // Top profit leaks
    const topLeaks = leaks.slice(0, 5).map(l => ({
      type: l.leak_type,
      impact: l.monthly_impact,
      severity: l.severity,
      description: l.description,
      recommendation: l.recommendation
    }));

    // Alerts summary
    const alertsSummary = {
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      pending: alerts.filter(a => a.status === 'pending').length
    };

    // Profit Integrity Score trend (simulate)
    const scoreHistory = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - (i * 5));
      const baseScore = tenant.profit_integrity_score || 85;
      const variance = Math.random() * 10 - 5; // +/- 5 points
      scoreHistory.push({
        date: date.toISOString().split('T')[0],
        score: Math.max(60, Math.min(100, baseScore + variance))
      });
    }

    // Build demo dataset
    const demoDataset = {
      tenant: sanitizedTenant,
      metrics: {
        period: `Last ${daysBack} days`,
        totalRevenue,
        totalProfit,
        totalCost,
        margin: margin.toFixed(2),
        orders: recentOrders.length,
        averageOrderValue: recentOrders.length > 0 ? totalRevenue / recentOrders.length : 0,
        profitIntegrityScore: tenant.profit_integrity_score || 85,
        riskMetrics: {
          avgFraudScore: avgFraudScore.toFixed(2),
          avgReturnRisk: avgReturnRisk.toFixed(2),
          avgChargebackRisk: avgChargebackRisk.toFixed(2)
        }
      },
      topLeaks,
      alerts: alertsSummary,
      scoreHistory,
      sampleOrders: sanitizedOrders.slice(0, 10),
      sampleProducts: sanitizedProducts.slice(0, 10),
      sampleCustomers: sanitizedCustomers.slice(0, 10),
      recommendations: recommendations.slice(0, 3).map(r => ({
        title: r.recommendation_type,
        description: r.description,
        impact: r.projected_impact,
        priority: r.priority
      })),
      anomalies: anomalies.map(a => ({
        type: a.anomaly_type,
        severity: a.severity,
        description: `Detected ${a.anomaly_type} anomaly`
      })),
      generatedAt: new Date().toISOString(),
      demoMode
    };

    return Response.json({
      success: true,
      dataset: demoDataset
    });

  } catch (error) {
    console.error('Demo data generation error:', error);
    return Response.json({ 
      error: 'Failed to generate demo data',
      details: error.message 
    }, { status: 500 });
  }
});