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

    if (action === 'analyze_inventory') {
      return await analyzeInventory(base44, tenant_id);
    } else if (action === 'get_dead_stock') {
      return await getDeadStock(base44, tenant_id);
    } else if (action === 'get_liquidation_plan') {
      return await getLiquidationPlan(base44, tenant_id);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function analyzeInventory(base44, tenantId) {
  const products = await base44.asServiceRole.entities.Product.filter({ tenant_id: tenantId });
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
  
  const analysis = [];

  for (const product of products) {
    const productOrders = orders.filter(o => 
      (o.line_items || []).some(li => li.product_id === product.platform_product_id)
    );
    
    const salesLast30d = productOrders.filter(o => 
      new Date(o.created_date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ).length;

    const currentInventory = product.inventory_quantity || 0;
    const cost = product.cost || product.price * 0.6;
    const inventoryValue = currentInventory * cost;
    
    // Calculate velocity
    const avgDailySales = salesLast30d / 30;
    const daysOfSupply = avgDailySales > 0 ? currentInventory / avgDailySales : 999;
    const velocityScore = Math.min(100, (avgDailySales / 2) * 100); // Normalize to 0-100

    // Determine inventory status
    let status = 'optimal';
    let deadStockRisk = 0;

    if (daysOfSupply > 180 || (currentInventory > 0 && salesLast30d === 0)) {
      status = 'dead_stock';
      deadStockRisk = 90;
    } else if (daysOfSupply > 90) {
      status = 'overstock';
      deadStockRisk = 60;
    } else if (daysOfSupply < 7 && currentInventory > 0) {
      status = 'low_stock';
      deadStockRisk = 0;
    } else if (currentInventory === 0) {
      status = 'stockout';
      deadStockRisk = 0;
    }

    // Calculate costs and recommendations
    const holdingCostRate = 0.02; // 2% per month
    const holdingCostMonthly = inventoryValue * holdingCostRate;
    const opportunityCost = status === 'overstock' || status === 'dead_stock' 
      ? inventoryValue * 0.1 // 10% opportunity cost for tied up capital
      : 0;

    const recommendations = [];
    if (status === 'dead_stock') {
      recommendations.push({
        action: 'liquidate',
        reason: 'No sales in 30+ days with high inventory',
        potential_savings: inventoryValue * 0.3,
        urgency: 'high'
      });
    } else if (status === 'overstock') {
      recommendations.push({
        action: 'discount_promotion',
        reason: 'Excess inventory relative to sales velocity',
        potential_savings: holdingCostMonthly * 3,
        urgency: 'medium'
      });
    } else if (status === 'low_stock') {
      recommendations.push({
        action: 'reorder',
        reason: 'Less than 7 days of supply remaining',
        potential_savings: 0,
        urgency: 'high'
      });
    }

    // Calculate liquidation recommendation for dead/overstock
    const liquidation = (status === 'dead_stock' || status === 'overstock') ? {
      suggested_discount: status === 'dead_stock' ? 50 : 25,
      min_acceptable_price: cost * 0.8,
      expected_clearance_days: status === 'dead_stock' ? 30 : 60,
      recovery_amount: currentInventory * cost * (status === 'dead_stock' ? 0.5 : 0.75)
    } : null;

    const inventoryData = {
      tenant_id: tenantId,
      product_id: product.id,
      product_name: product.title,
      sku: product.sku,
      current_inventory: currentInventory,
      inventory_value: inventoryValue,
      days_of_supply: Math.round(daysOfSupply),
      velocity_score: velocityScore,
      profit_contribution: productOrders.reduce((sum, o) => sum + (o.profit || 0), 0),
      margin_percentage: product.price > 0 ? ((product.price - cost) / product.price) * 100 : 0,
      inventory_status: status,
      dead_stock_risk: deadStockRisk,
      holding_cost_monthly: holdingCostMonthly,
      opportunity_cost: opportunityCost,
      recommendations,
      liquidation_recommendation: liquidation,
      last_sale_date: productOrders.length > 0 
        ? productOrders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0].created_date 
        : null,
      last_analyzed: new Date().toISOString()
    };

    // Upsert
    const existing = await base44.asServiceRole.entities.InventoryProfit.filter({
      tenant_id: tenantId,
      product_id: product.id
    });

    if (existing.length > 0) {
      await base44.asServiceRole.entities.InventoryProfit.update(existing[0].id, inventoryData);
    } else {
      await base44.asServiceRole.entities.InventoryProfit.create(inventoryData);
    }

    analysis.push({
      product_id: product.id,
      product_name: product.title,
      status,
      inventory_value: inventoryValue,
      days_of_supply: Math.round(daysOfSupply),
      holding_cost: holdingCostMonthly
    });
  }

  const totalValue = analysis.reduce((sum, a) => sum + a.inventory_value, 0);
  const deadStockValue = analysis.filter(a => a.status === 'dead_stock').reduce((sum, a) => sum + a.inventory_value, 0);
  const overstockValue = analysis.filter(a => a.status === 'overstock').reduce((sum, a) => sum + a.inventory_value, 0);

  return Response.json({
    success: true,
    products_analyzed: analysis.length,
    summary: {
      total_inventory_value: totalValue,
      dead_stock_value: deadStockValue,
      overstock_value: overstockValue,
      capital_at_risk: deadStockValue + overstockValue,
      monthly_holding_cost: analysis.reduce((sum, a) => sum + a.holding_cost, 0),
      status_breakdown: {
        optimal: analysis.filter(a => a.status === 'optimal').length,
        overstock: analysis.filter(a => a.status === 'overstock').length,
        low_stock: analysis.filter(a => a.status === 'low_stock').length,
        dead_stock: analysis.filter(a => a.status === 'dead_stock').length,
        stockout: analysis.filter(a => a.status === 'stockout').length
      }
    }
  });
}

async function getDeadStock(base44, tenantId) {
  const inventory = await base44.asServiceRole.entities.InventoryProfit.filter({ tenant_id: tenantId });
  const deadStock = inventory.filter(i => i.inventory_status === 'dead_stock' || i.dead_stock_risk > 70);

  return Response.json({
    dead_stock: deadStock.map(d => ({
      product_id: d.product_id,
      product_name: d.product_name,
      sku: d.sku,
      inventory: d.current_inventory,
      value: d.inventory_value,
      days_since_sale: d.last_sale_date 
        ? Math.floor((Date.now() - new Date(d.last_sale_date).getTime()) / (1000 * 60 * 60 * 24))
        : 'never',
      liquidation: d.liquidation_recommendation
    })),
    total_dead_stock_value: deadStock.reduce((sum, d) => sum + d.inventory_value, 0),
    recovery_potential: deadStock.reduce((sum, d) => sum + (d.liquidation_recommendation?.recovery_amount || 0), 0)
  });
}

async function getLiquidationPlan(base44, tenantId) {
  const inventory = await base44.asServiceRole.entities.InventoryProfit.filter({ tenant_id: tenantId });
  const toLiquidate = inventory.filter(i => i.liquidation_recommendation);

  const plan = toLiquidate.map(item => ({
    product_name: item.product_name,
    current_inventory: item.current_inventory,
    original_value: item.inventory_value,
    suggested_discount: item.liquidation_recommendation.suggested_discount,
    sale_price: item.current_inventory > 0 
      ? (item.inventory_value / item.current_inventory) * (1 - item.liquidation_recommendation.suggested_discount / 100)
      : 0,
    expected_recovery: item.liquidation_recommendation.recovery_amount,
    clearance_days: item.liquidation_recommendation.expected_clearance_days,
    priority: item.inventory_status === 'dead_stock' ? 'high' : 'medium'
  })).sort((a, b) => (a.priority === 'high' ? -1 : 1));

  return Response.json({
    liquidation_plan: plan,
    summary: {
      total_products: plan.length,
      total_original_value: plan.reduce((sum, p) => sum + p.original_value, 0),
      total_expected_recovery: plan.reduce((sum, p) => sum + p.expected_recovery, 0),
      capital_freed: plan.reduce((sum, p) => sum + p.original_value, 0),
      avg_discount: plan.length > 0 
        ? plan.reduce((sum, p) => sum + p.suggested_discount, 0) / plan.length 
        : 0
    }
  });
}