import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { tenant_id, period = 'last_30_days' } = await req.json();
    
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }
    
    // Get date range
    const daysMap = { last_7_days: 7, last_30_days: 30, last_90_days: 90, all_time: 365 };
    const days = daysMap[period] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get orders
    const orders = await base44.asServiceRole.entities.Order.filter({ 
      tenant_id 
    }, '-order_date', 2000);
    
    const recentOrders = orders.filter(o => 
      o.order_date && new Date(o.order_date) >= startDate
    );
    
    // Get products and cost mappings
    const [products, costMappings, orderItems] = await Promise.all([
      base44.asServiceRole.entities.Product.filter({ tenant_id }),
      base44.asServiceRole.entities.CostMapping.filter({ tenant_id }),
      base44.asServiceRole.entities.OrderItem.filter({ tenant_id }, '-created_date', 5000)
    ]);
    
    const leaks = [];
    
    // 1. Shipping Loss Detection
    const shippingLossOrders = recentOrders.filter(o => 
      (o.shipping_cost || 0) > (o.shipping_charged || 0)
    );
    
    if (shippingLossOrders.length > 0) {
      const totalShippingLoss = shippingLossOrders.reduce((sum, o) => 
        sum + ((o.shipping_cost || 0) - (o.shipping_charged || 0)), 0
      );
      
      leaks.push({
        type: 'shipping_loss',
        title: 'Shipping Undercharging',
        description: `${shippingLossOrders.length} orders charged less than actual shipping cost`,
        impact_amount: totalShippingLoss,
        affected_orders: shippingLossOrders.length,
        period,
        recommendation: 'Review shipping rates or add a handling fee to cover costs'
      });
    }
    
    // 2. Negative Margin SKUs
    const skuProfitability = {};
    const recentItems = orderItems.filter(item => {
      const order = orders.find(o => o.platform_order_id === item.order_id);
      return order && new Date(order.order_date) >= startDate;
    });
    
    for (const item of recentItems) {
      const sku = item.sku;
      if (!sku) continue;
      
      if (!skuProfitability[sku]) {
        skuProfitability[sku] = { revenue: 0, cost: 0, profit: 0, quantity: 0 };
      }
      
      skuProfitability[sku].revenue += item.total_price || 0;
      skuProfitability[sku].cost += item.total_cost || 0;
      skuProfitability[sku].profit += item.line_profit || 0;
      skuProfitability[sku].quantity += item.quantity || 0;
    }
    
    const negativeSKUs = Object.entries(skuProfitability)
      .filter(([_, data]) => data.profit < 0)
      .sort((a, b) => a[1].profit - b[1].profit);
    
    if (negativeSKUs.length > 0) {
      const totalNegativeProfit = negativeSKUs.reduce((sum, [_, data]) => sum + Math.abs(data.profit), 0);
      const affectedOrderIds = new Set();
      
      for (const item of recentItems) {
        if (negativeSKUs.some(([sku]) => sku === item.sku)) {
          affectedOrderIds.add(item.order_id);
        }
      }
      
      leaks.push({
        type: 'negative_margin_sku',
        title: 'Unprofitable Products',
        description: `${negativeSKUs.length} SKUs are selling below cost after fees`,
        impact_amount: totalNegativeProfit,
        affected_orders: affectedOrderIds.size,
        affected_skus: negativeSKUs.slice(0, 5).map(([sku]) => sku),
        period,
        recommendation: 'Raise prices or discontinue these products'
      });
    }
    
    // 3. Discount Abuse
    const multiDiscountOrders = recentOrders.filter(o => 
      (o.discount_codes?.length || 0) >= 2
    );
    
    if (multiDiscountOrders.length > 0) {
      const excessDiscount = multiDiscountOrders.reduce((sum, o) => 
        sum + (o.discount_total || 0) * 0.3, 0 // Estimate 30% is excessive
      );
      
      leaks.push({
        type: 'discount_abuse',
        title: 'Excessive Discounting',
        description: `${multiDiscountOrders.length} orders had multiple discount codes stacked`,
        impact_amount: excessDiscount,
        affected_orders: multiDiscountOrders.length,
        period,
        recommendation: 'Enable discount protection to prevent code stacking'
      });
    }
    
    // 4. Missing Cost Data
    const ordersMissingCosts = recentOrders.filter(o => o.confidence === 'low');
    
    if (ordersMissingCosts.length > recentOrders.length * 0.2) {
      // Estimate potential hidden losses (5% of revenue from orders with missing data)
      const potentialHiddenLoss = ordersMissingCosts.reduce((sum, o) => 
        sum + (o.total_revenue || 0) * 0.05, 0
      );
      
      leaks.push({
        type: 'missing_costs',
        title: 'Missing Cost Data',
        description: `${ordersMissingCosts.length} orders have incomplete cost information`,
        impact_amount: potentialHiddenLoss,
        affected_orders: ordersMissingCosts.length,
        period,
        recommendation: 'Add product costs in Settings → Costs to improve profit accuracy'
      });
    }
    
    // 5. Payment Fee Impact
    const totalPaymentFees = recentOrders.reduce((sum, o) => sum + (o.payment_fee || 0), 0);
    const avgFeePerOrder = recentOrders.length > 0 ? totalPaymentFees / recentOrders.length : 0;
    
    if (avgFeePerOrder > 5) { // Flag if average fee is high
      leaks.push({
        type: 'payment_fees',
        title: 'High Payment Processing Costs',
        description: `Average payment fee of $${avgFeePerOrder.toFixed(2)} per order`,
        impact_amount: totalPaymentFees,
        affected_orders: recentOrders.length,
        period,
        recommendation: 'Consider negotiating lower rates or alternative payment processors'
      });
    }
    
    // 6. Refund Losses
    const refundedOrders = recentOrders.filter(o => (o.refund_amount || 0) > 0);
    
    if (refundedOrders.length > 0) {
      const totalRefunds = refundedOrders.reduce((sum, o) => sum + (o.refund_amount || 0), 0);
      const refundRate = (refundedOrders.length / recentOrders.length) * 100;
      
      if (refundRate > 5) {
        leaks.push({
          type: 'refund_losses',
          title: 'High Refund Rate',
          description: `${refundRate.toFixed(1)}% of orders refunded (${refundedOrders.length} orders)`,
          impact_amount: totalRefunds,
          affected_orders: refundedOrders.length,
          period,
          recommendation: 'Analyze refund reasons and improve product quality or descriptions'
        });
      }
    }
    
    // Sort by impact
    leaks.sort((a, b) => b.impact_amount - a.impact_amount);
    
    // Clear old leaks and save new ones
    const existingLeaks = await base44.asServiceRole.entities.ProfitLeak.filter({ 
      tenant_id, 
      period,
      is_resolved: false 
    });
    
    for (const leak of existingLeaks) {
      await base44.asServiceRole.entities.ProfitLeak.delete(leak.id);
    }
    
    for (const leak of leaks) {
      await base44.asServiceRole.entities.ProfitLeak.create({
        tenant_id,
        ...leak,
        is_resolved: false
      });
    }
    
    return Response.json({
      leaks,
      total_impact: leaks.reduce((sum, l) => sum + l.impact_amount, 0),
      period
    });
    
  } catch (error) {
    console.error('Error detecting leaks:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});