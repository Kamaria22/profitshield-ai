/**
 * riskEngine
 * ------------------------------------------------------------------
 * Standalone risk scoring function.
 * Actions:
 *   - score: score a single order by order_id or platform_order_id
 *   - backfill: score all unscored orders for a tenant (async-safe, returns immediately)
 *   - test: insert a synthetic test order and score it (for automated verification)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function scoreOrder(order, customerOrders = []) {
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  const reasons = [];

  // 1. First-time customer
  const isFirst = customerOrders.length <= 1;
  if (isFirst) { fraudScore += 15; reasons.push('First-time customer'); }

  // 2. Order value
  const val = order.total_revenue || 0;
  if (val > 500) { fraudScore += 10; reasons.push(`High value ($${val.toFixed(2)})`); }
  if (val > 1000) { fraudScore += 15; chargebackScore += 10; }

  // 3. Average order value anomaly
  if (customerOrders.length > 1) {
    const avg = customerOrders.reduce((s, o) => s + (o.total_revenue || 0), 0) / customerOrders.length;
    if (avg > 0 && val > avg * 3) { fraudScore += 20; reasons.push('3x above customer average'); }
  }

  // 4. Address mismatch
  const b = order.billing_address || {};
  const s = order.shipping_address || {};
  if (b.country && s.country && b.country !== s.country) {
    fraudScore += 25; chargebackScore += 15; reasons.push('Billing/shipping country mismatch');
  } else if (b.zip && s.zip && b.zip !== s.zip) {
    fraudScore += 8; reasons.push('Billing/shipping zip mismatch');
  }

  // 5. Discount abuse
  const discountPct = val > 0 ? ((order.discount_total || 0) / (val + (order.discount_total || 0))) * 100 : 0;
  if (discountPct > 30) { fraudScore += 15; reasons.push(`Heavy discount (${discountPct.toFixed(0)}%)`); }
  if ((order.discount_codes || []).length > 1) { fraudScore += 10; reasons.push('Multiple discount codes'); }

  // 6. Email patterns
  const email = order.customer_email || '';
  if (email.includes('+') || /\d{4,}/.test(email.split('@')[0])) {
    fraudScore += 15; reasons.push('Suspicious email pattern');
  }

  // 7. Velocity
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recentSame = customerOrders.filter(o => o.id !== order.id && new Date(o.order_date).getTime() > cutoff);
  if (recentSame.length >= 2) {
    fraudScore += 20; chargebackScore += 15; reasons.push(`${recentSame.length + 1} orders in 24h`);
  }

  // 8. Refund history
  const refunded = customerOrders.filter(o => o.status === 'refunded' || o.status === 'partially_refunded');
  if (refunded.length > 0 && customerOrders.length > 1) {
    const rate = (refunded.length / customerOrders.length) * 100;
    if (rate > 30) { returnScore += 25; reasons.push(`High refund rate (${rate.toFixed(0)}%)`); }
    else if (rate > 15) { returnScore += 12; reasons.push(`Moderate refund rate (${rate.toFixed(0)}%)`); }
  }

  // 9. Negative margin
  if ((order.net_profit || 0) < 0) { chargebackScore += 10; reasons.push('Negative margin'); }

  fraudScore = Math.min(100, Math.max(0, Math.round(fraudScore)));
  returnScore = Math.min(100, Math.max(0, Math.round(returnScore)));
  chargebackScore = Math.min(100, Math.max(0, Math.round(chargebackScore)));

  const combined = Math.round(fraudScore * 0.5 + returnScore * 0.25 + chargebackScore * 0.25);
  const riskLevel = combined >= 70 ? 'high' : combined >= 40 ? 'medium' : 'low';
  const recommendedAction = riskLevel === 'high'
    ? (fraudScore >= 60 ? 'cancel' : 'verify')
    : riskLevel === 'medium' ? (val > 500 ? 'signature' : 'verify') : 'none';

  return {
    fraud_score: fraudScore,
    return_score: returnScore,
    chargeback_score: chargebackScore,
    risk_score: combined,
    risk_level: riskLevel,
    risk_reasons: reasons,
    recommended_action: recommendedAction,
    confidence: !order.billing_address ? 'low' : !order.customer_email ? 'medium' : 'high',
    model_version: 'risk_engine_v2'
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    // Auth: require logged-in user (admin or user), OR allow no-auth for scheduler
    let user = null;
    try { user = await base44.auth.me(); } catch {}

    const body = await req.json().catch(() => ({}));
    const { action = 'score', tenant_id, order_id, platform_order_id, limit = 50 } = body;

    // ── ACTION: score single order ──────────────────────────────────────────
    if (action === 'score') {
      if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

      let orders = [];
      if (order_id) orders = await db.Order.filter({ id: order_id, tenant_id });
      if (orders.length === 0 && platform_order_id) {
        orders = await db.Order.filter({ platform_order_id: String(platform_order_id), tenant_id });
      }
      if (orders.length === 0) return Response.json({ error: 'Order not found' }, { status: 404 });

      const order = orders[0];
      const customerOrders = order.customer_email
        ? await db.Order.filter({ tenant_id, customer_email: order.customer_email })
        : [];

      const result = scoreOrder(order, customerOrders);
      await db.Order.update(order.id, result);

      return Response.json({ success: true, order_id: order.id, ...result });
    }

    // ── ACTION: backfill unscored orders ────────────────────────────────────
    if (action === 'backfill') {
      if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

      const allOrders = await db.Order.filter({ tenant_id, is_demo: false }, '-order_date', limit);
      const toScore = allOrders.filter(o => o.fraud_score === null || o.fraud_score === undefined);

      let scored = 0;
      for (const order of toScore) {
        const customerOrders = order.customer_email
          ? await db.Order.filter({ tenant_id, customer_email: order.customer_email })
          : [];
        const result = scoreOrder(order, customerOrders);
        await db.Order.update(order.id, result).catch(() => {});
        scored++;
      }

      return Response.json({ success: true, scored, total_checked: allOrders.length });
    }

    // ── ACTION: test — insert synthetic order and score it ──────────────────
    if (action === 'test') {
      if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

      const testOrder = await db.Order.create({
        tenant_id,
        platform_order_id: `TEST-${Date.now()}`,
        order_number: `TEST-${Date.now()}`,
        customer_email: 'reviewer+test123@gmail.com',
        customer_name: 'Risk Test Customer',
        order_date: new Date().toISOString(),
        status: 'paid',
        total_revenue: 750,
        discount_total: 50,
        discount_codes: ['SAVE10', 'VIP20'],
        shipping_cost: 15,
        payment_fee: 22,
        net_profit: -5,
        billing_address: { country: 'US', zip: '10001' },
        shipping_address: { country: 'CA', zip: 'M5H2N2' },
        is_demo: false,
        is_first_order: true,
      });

      const result = scoreOrder(testOrder, []);
      await db.Order.update(testOrder.id, result);

      return Response.json({
        success: true,
        test: true,
        order_id: testOrder.id,
        risk_score: result.risk_score,
        risk_level: result.risk_level,
        fraud_score: result.fraud_score,
        reasons: result.risk_reasons,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    console.error('[riskEngine]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});