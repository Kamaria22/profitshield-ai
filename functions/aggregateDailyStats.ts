/**
 * NIGHTLY AGGREGATION JOB
 *
 * Precomputes DailyProfitSummary and DailyRiskSummary per tenant.
 * Runs on schedule (nightly) or manually by admin.
 * Enables sub-500ms AI Insights loads via cached summaries.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Allow both admin calls and scheduler (no session)
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    } catch {
      // Scheduled invocation — no session, allow
    }

    const body = await req.json().catch(() => ({}));
    // Default: aggregate yesterday + today
    const daysBack = Math.min(body.days_back || 2, 30);

    const allTenants = await db.entities.Tenant.filter({ status: 'active' }, '-created_date', 500);

    const stats = { tenants_processed: 0, profit_summaries: 0, risk_summaries: 0, errors: 0 };

    for (const tenant of allTenants) {
      try {
        for (let d = 0; d < daysBack; d++) {
          const date = new Date();
          date.setDate(date.getDate() - d);
          const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

          // Fetch orders for this tenant (we'll filter by date client-side)
          const orders = await db.entities.Order.filter({ tenant_id: tenant.id }, '-order_date', 500);
          const dayOrders = orders.filter(o => o.order_date && o.order_date.startsWith(dateStr));

          if (dayOrders.length === 0 && d > 0) continue; // Skip empty past days

          // ── Profit Summary ──
          const revenue = dayOrders.reduce((s, o) => s + (o.total_revenue || 0), 0);
          const cogs = dayOrders.reduce((s, o) => s + (o.total_cogs || 0), 0);
          const profit = dayOrders.reduce((s, o) => s + (o.net_profit || 0), 0);
          const margins = dayOrders.filter(o => o.margin_pct != null).map(o => o.margin_pct);
          const avgMargin = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
          const refundOrders = dayOrders.filter(o => o.status === 'refunded' || o.status === 'partially_refunded');
          const refundRate = dayOrders.length > 0 ? (refundOrders.length / dayOrders.length) * 100 : 0;
          const paymentFees = dayOrders.reduce((s, o) => s + (o.payment_fee || 0), 0);
          const shippingCost = dayOrders.reduce((s, o) => s + (o.shipping_cost || 0), 0);

          const profitSummary = {
            tenant_id: tenant.id,
            date: dateStr,
            order_count: dayOrders.length,
            revenue,
            total_cogs: cogs,
            net_profit: profit,
            avg_margin: avgMargin,
            refund_count: refundOrders.length,
            refund_rate: refundRate,
            payment_fees: paymentFees,
            shipping_cost: shippingCost,
            computed_at: new Date().toISOString()
          };

          // Upsert
          const existingP = await db.entities.DailyProfitSummary.filter({ tenant_id: tenant.id, date: dateStr });
          if (existingP.length > 0) {
            await db.entities.DailyProfitSummary.update(existingP[0].id, profitSummary);
          } else {
            await db.entities.DailyProfitSummary.create(profitSummary);
          }
          stats.profit_summaries++;

          // ── Risk Summary ──
          const highRisk = dayOrders.filter(o => o.risk_level === 'high').length;
          const medRisk = dayOrders.filter(o => o.risk_level === 'medium').length;
          const lowRisk = dayOrders.filter(o => o.risk_level === 'low').length;
          const avgFraud = dayOrders.length > 0
            ? dayOrders.reduce((s, o) => s + (o.fraud_score || 0), 0) / dayOrders.length : 0;
          const avgChargeback = dayOrders.length > 0
            ? dayOrders.reduce((s, o) => s + (o.chargeback_score || 0), 0) / dayOrders.length : 0;
          const avgRisk = (avgFraud + avgChargeback) / 2;

          const riskSummary = {
            tenant_id: tenant.id,
            date: dateStr,
            total_orders: dayOrders.length,
            high_risk_count: highRisk,
            medium_risk_count: medRisk,
            low_risk_count: lowRisk,
            avg_fraud_score: avgFraud,
            avg_chargeback_score: avgChargeback,
            avg_risk_score: avgRisk,
            alerts_generated: highRisk + Math.floor(medRisk * 0.3),
            computed_at: new Date().toISOString()
          };

          const existingR = await db.entities.DailyRiskSummary.filter({ tenant_id: tenant.id, date: dateStr });
          if (existingR.length > 0) {
            await db.entities.DailyRiskSummary.update(existingR[0].id, riskSummary);
          } else {
            await db.entities.DailyRiskSummary.create(riskSummary);
          }
          stats.risk_summaries++;
        }

        stats.tenants_processed++;
      } catch (err) {
        console.error(`[aggregateDailyStats] Tenant ${tenant.id} error:`, err.message);
        stats.errors++;
      }
    }

    console.log('[aggregateDailyStats] Complete:', stats);
    return Response.json({ success: true, ...stats, ran_at: new Date().toISOString() });

  } catch (error) {
    console.error('[aggregateDailyStats]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});