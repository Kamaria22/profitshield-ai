import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { tenant_id } = await req.json();
    
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }
    
    // Get orders from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const orders = await base44.asServiceRole.entities.Order.filter({ 
      tenant_id 
    }, '-order_date', 1000);
    
    const recentOrders = orders.filter(o => 
      o.order_date && new Date(o.order_date) >= thirtyDaysAgo
    );
    
    if (recentOrders.length === 0) {
      return Response.json({ 
        score: 50, 
        factors: { message: 'No recent orders to analyze' } 
      });
    }
    
    // Calculate score factors (0-100 scale)
    let score = 100;
    const factors = {};
    
    // 1. Margin health (40 points max)
    const totalRevenue = recentOrders.reduce((sum, o) => sum + (o.total_revenue || 0), 0);
    const totalProfit = recentOrders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    if (avgMargin < 0) {
      score -= 40;
      factors.margin = { impact: -40, reason: 'Negative overall margin' };
    } else if (avgMargin < 10) {
      score -= 30;
      factors.margin = { impact: -30, reason: 'Margin below 10%' };
    } else if (avgMargin < 20) {
      score -= 15;
      factors.margin = { impact: -15, reason: 'Margin below 20%' };
    } else if (avgMargin < 30) {
      score -= 5;
      factors.margin = { impact: -5, reason: 'Margin below 30%' };
    }
    
    // 2. Negative margin orders (20 points max)
    const negativeMarginCount = recentOrders.filter(o => (o.net_profit || 0) < 0).length;
    const negativeMarginPct = (negativeMarginCount / recentOrders.length) * 100;
    
    if (negativeMarginPct > 20) {
      score -= 20;
      factors.negative_orders = { impact: -20, reason: `${negativeMarginPct.toFixed(0)}% orders losing money` };
    } else if (negativeMarginPct > 10) {
      score -= 10;
      factors.negative_orders = { impact: -10, reason: `${negativeMarginPct.toFixed(0)}% orders losing money` };
    } else if (negativeMarginPct > 5) {
      score -= 5;
      factors.negative_orders = { impact: -5, reason: `${negativeMarginPct.toFixed(0)}% orders losing money` };
    }
    
    // 3. Risk level (15 points max)
    const highRiskCount = recentOrders.filter(o => o.risk_level === 'high').length;
    const highRiskPct = (highRiskCount / recentOrders.length) * 100;
    
    if (highRiskPct > 10) {
      score -= 15;
      factors.risk = { impact: -15, reason: `${highRiskPct.toFixed(0)}% high risk orders` };
    } else if (highRiskPct > 5) {
      score -= 8;
      factors.risk = { impact: -8, reason: `${highRiskPct.toFixed(0)}% high risk orders` };
    }
    
    // 4. Data confidence (15 points max)
    const lowConfidenceCount = recentOrders.filter(o => o.confidence === 'low').length;
    const lowConfidencePct = (lowConfidenceCount / recentOrders.length) * 100;
    
    if (lowConfidencePct > 50) {
      score -= 15;
      factors.data_quality = { impact: -15, reason: 'Most orders missing cost data' };
    } else if (lowConfidencePct > 25) {
      score -= 8;
      factors.data_quality = { impact: -8, reason: 'Many orders missing cost data' };
    }
    
    // 5. Refunds (10 points max)
    const refundedOrders = recentOrders.filter(o => (o.refund_amount || 0) > 0).length;
    const refundPct = (refundedOrders / recentOrders.length) * 100;
    
    if (refundPct > 10) {
      score -= 10;
      factors.refunds = { impact: -10, reason: `${refundPct.toFixed(0)}% refund rate` };
    } else if (refundPct > 5) {
      score -= 5;
      factors.refunds = { impact: -5, reason: `${refundPct.toFixed(0)}% refund rate` };
    }
    
    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));
    
    // Update tenant score
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    if (tenants.length > 0) {
      await base44.asServiceRole.entities.Tenant.update(tenants[0].id, {
        profit_integrity_score: Math.round(score)
      });
    }
    
    return Response.json({
      score: Math.round(score),
      factors,
      stats: {
        total_orders: recentOrders.length,
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        avg_margin: avgMargin,
        negative_margin_orders: negativeMarginCount,
        high_risk_orders: highRiskCount,
        low_confidence_orders: lowConfidenceCount,
        refunded_orders: refundedOrders
      }
    });
    
  } catch (error) {
    console.error('Error calculating score:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});