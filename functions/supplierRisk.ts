import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, tenant_id } = body;

    if (action === 'evaluate_suppliers') {
      return await evaluateSuppliers(base44, tenant_id);
    } else if (action === 'get_risk_dashboard') {
      return await getSupplierRiskDashboard(base44, tenant_id);
    } else if (action === 'add_supplier') {
      return await addSupplier(base44, body);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function evaluateSuppliers(base44, tenantId) {
  const suppliers = await base44.asServiceRole.entities.SupplierRisk.filter({ tenant_id: tenantId });
  const evaluations = [];

  for (const supplier of suppliers) {
    // Simulate reliability metrics
    const reliability = {
      on_time_delivery_rate: 80 + Math.random() * 20,
      quality_score: 70 + Math.random() * 30,
      order_accuracy_rate: 85 + Math.random() * 15,
      avg_lead_time_days: 5 + Math.floor(Math.random() * 10),
      lead_time_variance: Math.random() * 3
    };

    // Simulate financial health
    const financial = {
      payment_terms_days: [30, 45, 60][Math.floor(Math.random() * 3)],
      credit_rating: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
      price_stability_score: 60 + Math.random() * 40,
      cost_trend: ['decreasing', 'stable', 'increasing'][Math.floor(Math.random() * 3)]
    };

    // Calculate concentration risk
    const products = await base44.asServiceRole.entities.Product.filter({ tenant_id: tenantId });
    const supplierProducts = products.filter(p => p.vendor === supplier.supplier_name);
    const concentration = {
      revenue_dependency_pct: (supplierProducts.length / Math.max(1, products.length)) * 100,
      product_count: supplierProducts.length,
      alternative_suppliers: Math.floor(Math.random() * 5)
    };

    // Calculate overall risk score
    let riskScore = 0;
    const alerts = [];

    // Delivery risk
    if (reliability.on_time_delivery_rate < 90) {
      riskScore += 20;
      alerts.push({ alert_type: 'delivery_risk', message: `On-time delivery below 90%: ${reliability.on_time_delivery_rate.toFixed(1)}%`, severity: 'warning', created_at: new Date().toISOString() });
    }

    // Quality risk
    if (reliability.quality_score < 80) {
      riskScore += 25;
      alerts.push({ alert_type: 'quality_risk', message: `Quality score below 80: ${reliability.quality_score.toFixed(1)}`, severity: 'high', created_at: new Date().toISOString() });
    }

    // Financial risk
    if (financial.credit_rating === 'C') {
      riskScore += 20;
      alerts.push({ alert_type: 'financial_risk', message: 'Supplier has C credit rating', severity: 'high', created_at: new Date().toISOString() });
    }

    // Cost risk
    if (financial.cost_trend === 'increasing') {
      riskScore += 15;
      alerts.push({ alert_type: 'cost_risk', message: 'Supplier costs trending upward', severity: 'warning', created_at: new Date().toISOString() });
    }

    // Concentration risk
    if (concentration.revenue_dependency_pct > 30 && concentration.alternative_suppliers < 2) {
      riskScore += 20;
      alerts.push({ alert_type: 'concentration_risk', message: `High dependency (${concentration.revenue_dependency_pct.toFixed(1)}%) with few alternatives`, severity: 'critical', created_at: new Date().toISOString() });
    }

    const riskLevel = riskScore >= 60 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low';

    await base44.asServiceRole.entities.SupplierRisk.update(supplier.id, {
      risk_score: riskScore,
      risk_level: riskLevel,
      reliability_metrics: reliability,
      financial_health: financial,
      concentration_risk: concentration,
      alerts,
      last_evaluated: new Date().toISOString()
    });

    evaluations.push({
      supplier_name: supplier.supplier_name,
      risk_score: riskScore,
      risk_level: riskLevel,
      alerts_count: alerts.length
    });
  }

  return Response.json({
    success: true,
    suppliers_evaluated: evaluations.length,
    evaluations,
    summary: {
      critical: evaluations.filter(e => e.risk_level === 'critical').length,
      high: evaluations.filter(e => e.risk_level === 'high').length,
      medium: evaluations.filter(e => e.risk_level === 'medium').length,
      low: evaluations.filter(e => e.risk_level === 'low').length
    }
  });
}

async function getSupplierRiskDashboard(base44, tenantId) {
  const suppliers = await base44.asServiceRole.entities.SupplierRisk.filter({ tenant_id: tenantId });

  const atRisk = suppliers.filter(s => s.risk_level === 'critical' || s.risk_level === 'high');
  const allAlerts = suppliers.flatMap(s => (s.alerts || []).map(a => ({ ...a, supplier: s.supplier_name })));

  return Response.json({
    dashboard: {
      total_suppliers: suppliers.length,
      at_risk_suppliers: atRisk.length,
      risk_breakdown: {
        critical: suppliers.filter(s => s.risk_level === 'critical').length,
        high: suppliers.filter(s => s.risk_level === 'high').length,
        medium: suppliers.filter(s => s.risk_level === 'medium').length,
        low: suppliers.filter(s => s.risk_level === 'low').length
      },
      total_alerts: allAlerts.length,
      critical_alerts: allAlerts.filter(a => a.severity === 'critical'),
      suppliers: suppliers.map(s => ({
        name: s.supplier_name,
        risk_score: s.risk_score,
        risk_level: s.risk_level,
        alerts: (s.alerts || []).length,
        last_evaluated: s.last_evaluated
      }))
    }
  });
}

async function addSupplier(base44, data) {
  const supplier = await base44.asServiceRole.entities.SupplierRisk.create({
    tenant_id: data.tenant_id,
    supplier_name: data.supplier_name,
    supplier_id: data.supplier_id || `SUP-${Date.now()}`,
    risk_score: 0,
    risk_level: 'low',
    total_spend_30d: data.total_spend || 0
  });

  return Response.json({ success: true, supplier_id: supplier.id });
}