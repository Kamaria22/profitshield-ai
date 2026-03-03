/**
 * WEBHOOK QUEUE PROCESSOR
 *
 * Pulls pending jobs from WebhookQueue, processes them with idempotency,
 * exponential backoff on failure, max 5 retries then dead_letter.
 *
 * Designed to run on a schedule (every 30s via automation) OR be called directly.
 * Admin-only when called directly. Automation uses service role.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

// Classify errors: transient = worth retrying, permanent = dead-letter immediately
function classifyError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnreset') || msg.includes('503') || msg.includes('rate limit')) {
    return 'transient';
  }
  if (msg.includes('not found') || msg.includes('tenant') || msg.includes('invalid') || msg.includes('unknown topic')) {
    return 'permanent';
  }
  return 'transient'; // default: retry
}

// ─── Profit Calculation (mirror of shopifyWebhook) ───────────────────────────
function calculateOrderProfit(order, costMappings, settings) {
  const revenue = parseFloat(order.total_price) || 0;
  const shippingCharged = order.shipping_lines?.reduce((s, l) => s + parseFloat(l.price || 0), 0) || 0;
  const discountTotal = order.discount_codes?.reduce((s, d) => s + parseFloat(d.amount || 0), 0) || 0;

  let totalCogs = 0;
  let hasAllCosts = true;
  for (const item of order.line_items || []) {
    const sku = item.sku || item.variant_id?.toString();
    const cm = costMappings.find(m => m.sku === sku);
    if (cm) totalCogs += (cm.cost_per_unit || 0) * (item.quantity || 1);
    else hasAllCosts = false;
  }

  const paymentFee = (revenue * ((settings?.default_payment_fee_pct || 2.9) / 100)) + (settings?.default_payment_fee_fixed || 0.30);
  const platformFee = revenue * ((settings?.default_platform_fee_pct || 0) / 100);
  const shippingCost = shippingCharged * 0.8;
  const netProfit = revenue - totalCogs - paymentFee - platformFee - shippingCost;

  return {
    total_revenue: revenue,
    shipping_charged: shippingCharged,
    discount_total: discountTotal,
    total_cogs: totalCogs,
    payment_fee: paymentFee,
    platform_fee: platformFee,
    shipping_cost: shippingCost,
    net_profit: netProfit,
    margin_pct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    confidence: !hasAllCosts ? 'medium' : 'high'
  };
}

// ─── Risk Scoring ────────────────────────────────────────────────────────────
function calculateRiskScores(order, settings) {
  let fraudScore = 0;
  const riskReasons = [];
  const orderTotal = parseFloat(order.total_price || 0);
  const isFirst = !order.customer || order.customer.orders_count <= 1;

  if (isFirst && orderTotal > 200) { fraudScore += 25; riskReasons.push('New customer, high value'); }
  const b = order.billing_address, s = order.shipping_address;
  if (b && s && b.country_code !== s.country_code) { fraudScore += 30; riskReasons.push('Country mismatch'); }
  if ((order.discount_codes?.length || 0) >= 2) { fraudScore += 10; riskReasons.push('Multiple discounts'); }
  if (isFirst && orderTotal > 500) { fraudScore += 20; riskReasons.push('First order > $500'); }

  fraudScore = Math.min(fraudScore, 100);
  const high = settings?.high_risk_threshold || 70;
  const med = settings?.medium_risk_threshold || 40;
  return {
    fraud_score: fraudScore,
    return_score: isFirst ? 20 : 0,
    chargeback_score: Math.min(fraudScore * 0.5, 100),
    risk_level: fraudScore >= high ? 'high' : fraudScore >= med ? 'medium' : 'low',
    risk_reasons: riskReasons,
    recommended_action: fraudScore >= high ? 'hold' : fraudScore >= med ? 'verify' : 'none'
  };
}

function mapStatus(order) {
  if (order.cancelled_at) return 'cancelled';
  if (order.fulfillment_status === 'fulfilled') return 'fulfilled';
  if (order.financial_status === 'paid') return 'paid';
  return 'pending';
}

// ─── Process a single order job ──────────────────────────────────────────────
async function processOrderJob(db, tenant, payload, job) {
  const [costMappings, settingsData] = await Promise.all([
    db.entities.CostMapping.filter({ tenant_id: tenant.id }),
    db.entities.TenantSettings.filter({ tenant_id: tenant.id })
  ]);
  const settings = settingsData[0] || {};
  const profitData = calculateOrderProfit(payload, costMappings, settings);
  const riskData = calculateRiskScores(payload, settings);

  const existing = await db.entities.Order.filter({
    tenant_id: tenant.id,
    platform_order_id: payload.id.toString()
  });

  // Resolve integration_id for this job
  let integrationId = job.integration_id || null;
  if (!integrationId) {
    try {
      const integrations = await db.entities.PlatformIntegration.filter({ tenant_id: tenant.id, platform: 'shopify' });
      integrationId = integrations[0]?.id || null;
    } catch (_) {}
  }

  const rec = {
    tenant_id: tenant.id,
    integration_id: integrationId,
    shop_domain: tenant.shop_domain,
    platform_order_id: payload.id.toString(),
    order_number: payload.order_number?.toString() || payload.name,
    customer_email: payload.email,
    customer_name: payload.customer?.first_name
      ? `${payload.customer.first_name} ${payload.customer.last_name || ''}`.trim()
      : payload.shipping_address?.name,
    order_date: payload.created_at,
    processed_at: payload.processed_at || payload.created_at,
    financial_status: payload.financial_status,
    fulfillment_status: payload.fulfillment_status || 'unfulfilled',
    status: mapStatus(payload),
    billing_address: payload.billing_address,
    shipping_address: payload.shipping_address,
    discount_codes: payload.discount_codes?.map(d => d.code) || [],
    is_first_order: !payload.customer || payload.customer.orders_count <= 1,
    is_demo: false,
    ...profitData,
    ...riskData,
    platform_data: payload
  };

  if (existing.length > 0) {
    await db.entities.Order.update(existing[0].id, rec);
  } else {
    const created = await db.entities.Order.create(rec);
    if (riskData.risk_level === 'high') {
      await db.entities.Alert.create({
        tenant_id: tenant.id,
        type: 'high_risk_order',
        severity: 'high',
        title: `High Risk Order #${rec.order_number}`,
        message: `Order flagged: ${riskData.risk_reasons.join(', ')}`,
        entity_type: 'order',
        entity_id: payload.id.toString(),
        recommended_action: riskData.recommended_action,
        metadata: { fraud_score: riskData.fraud_score, order_total: profitData.total_revenue }
      }).catch(() => {});
    }
    if (profitData.net_profit < 0) {
      await db.entities.Alert.create({
        tenant_id: tenant.id,
        type: 'negative_margin',
        severity: 'medium',
        title: `Negative Margin on Order #${rec.order_number}`,
        message: `Lost $${Math.abs(profitData.net_profit).toFixed(2)}`,
        entity_type: 'order',
        entity_id: payload.id.toString(),
        metadata: { net_profit: profitData.net_profit }
      }).catch(() => {});
    }
  }
}

// ─── Process a single refund job ─────────────────────────────────────────────
async function processRefundJob(db, tenant, payload) {
  const exists = await db.entities.Refund.filter({
    tenant_id: tenant.id,
    platform_refund_id: payload.id.toString()
  });
  if (exists.length > 0) return;

  const total = payload.transactions?.reduce((s, t) => s + parseFloat(t.amount || 0), 0) || 0;
  await db.entities.Refund.create({
    tenant_id: tenant.id,
    order_id: payload.order_id.toString(),
    platform_refund_id: payload.id.toString(),
    amount: total,
    reason: payload.note || 'No reason provided',
    refunded_at: payload.created_at
  });

  const orders = await db.entities.Order.filter({ tenant_id: tenant.id, platform_order_id: payload.order_id.toString() });
  if (orders.length > 0) {
    const cur = orders[0].refund_amount || 0;
    await db.entities.Order.update(orders[0].id, {
      refund_amount: cur + total,
      status: (cur + total) >= orders[0].total_revenue ? 'refunded' : 'partially_refunded'
    });
  }
}

// ─── Process products/update ─────────────────────────────────────────────────
async function processProductUpdateJob(db, tenant, payload) {
  const productId = payload.id?.toString();
  if (!productId) return;

  const existing = await db.entities.Product.filter({
    tenant_id: tenant.id,
    platform_product_id: productId
  });

  const variants = (payload.variants || []).map(v => ({
    variant_id: v.id?.toString(),
    title: v.title,
    sku: v.sku,
    price: parseFloat(v.price || 0),
    inventory_quantity: v.inventory_quantity ?? null,
    compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null
  }));

  const rec = {
    tenant_id: tenant.id,
    platform_product_id: productId,
    title: payload.title,
    handle: payload.handle,
    product_type: payload.product_type,
    vendor: payload.vendor,
    status: payload.status || 'active',
    tags: typeof payload.tags === 'string' ? payload.tags.split(',').map(t => t.trim()).filter(Boolean) : (payload.tags || []),
    variants,
    images: (payload.images || []).map(img => img.src),
    updated_at_platform: payload.updated_at
  };

  if (existing.length > 0) {
    console.log(`[processProductUpdateJob] Updating product ${productId} for tenant ${tenant.id}`);
    await db.entities.Product.update(existing[0].id, rec);
  } else {
    console.log(`[processProductUpdateJob] Creating product ${productId} for tenant ${tenant.id}`);
    await db.entities.Product.create(rec);
  }
}

// ─── Process orders/cancelled ─────────────────────────────────────────────────
async function processOrderCancelledJob(db, tenant, payload) {
  const platformOrderId = payload.id?.toString();
  if (!platformOrderId) return;

  const existing = await db.entities.Order.filter({
    tenant_id: tenant.id,
    platform_order_id: platformOrderId
  });

  if (existing.length > 0) {
    console.log(`[processOrderCancelledJob] Marking order ${platformOrderId} cancelled for tenant ${tenant.id}`);
    await db.entities.Order.update(existing[0].id, {
      status: 'cancelled',
      fulfillment_status: payload.fulfillment_status || existing[0].fulfillment_status,
      cancelled_at: payload.cancelled_at || new Date().toISOString(),
      cancel_reason: payload.cancel_reason || null
    });
  } else {
    console.log(`[processOrderCancelledJob] Order ${platformOrderId} not found locally — skipping cancellation`);
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;

    // Auth check: admin user OR automated (no auth = service role caller from scheduler)
    let isAutomated = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
    } catch {
      // No session = called from scheduler automation — allow
      isAutomated = true;
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Fetch pending jobs that are ready to process (next_attempt_at <= now or null)
    const pending = await db.entities.WebhookQueue.filter({ status: 'pending' }, '-created_date', BATCH_SIZE);
    const retryable = await db.entities.WebhookQueue.filter({ status: 'failed' }, 'next_attempt_at', BATCH_SIZE);

    const jobs = [
      ...pending,
      ...retryable.filter(j => !j.next_attempt_at || new Date(j.next_attempt_at) <= now)
    ].slice(0, BATCH_SIZE);

    if (jobs.length === 0) {
      return Response.json({ processed: 0, message: 'Queue empty' });
    }

    console.log(`[processWebhookQueue] Processing ${jobs.length} jobs`);

    const stats = { processed: 0, failed: 0, dead_lettered: 0 };

    for (const job of jobs) {
      const t0 = Date.now();
      // Mark as processing
      await db.entities.WebhookQueue.update(job.id, {
        status: 'processing',
        last_attempt_at: nowIso
      }).catch(() => {});

      try {
        // Resolve tenant
        const tenants = await db.entities.Tenant.filter({ id: job.tenant_id });
        if (!tenants[0]) throw new Error(`Tenant not found: ${job.tenant_id}`);
        const tenant = tenants[0];

        const topic = job.event_type;
        const payload = job.payload;

        if (topic === 'orders/create' || topic === 'orders/updated' || topic === 'orders/paid') {
          await processOrderJob(db, tenant, payload, job);
        } else if (topic === 'refunds/create') {
          await processRefundJob(db, tenant, payload);
        } else if (topic === 'products/update') {
          await processProductUpdateJob(db, tenant, payload);
        } else if (topic === 'orders/cancelled') {
          await processOrderCancelledJob(db, tenant, payload);
        } else {
          console.log(`[processWebhookQueue] Unhandled topic: ${topic} — marking complete`);
        }

        const duration = Date.now() - t0;
        await db.entities.WebhookQueue.update(job.id, {
          status: 'complete',
          processed_at: new Date().toISOString(),
          processing_duration_ms: duration
        });
        stats.processed++;

      } catch (err) {
        const retries = (job.retry_count || 0) + 1;
        console.error(`[processWebhookQueue] Job ${job.id} failed (attempt ${retries}):`, err.message);

        if (retries >= MAX_RETRIES) {
          await db.entities.WebhookQueue.update(job.id, {
            status: 'dead_letter',
            retry_count: retries,
            error_message: err.message,
            last_attempt_at: nowIso
          });
          stats.dead_lettered++;
        } else {
          // Exponential backoff: 30s * 2^retries
          const backoffMs = 30000 * Math.pow(2, retries - 1);
          const nextAttempt = new Date(Date.now() + backoffMs).toISOString();
          await db.entities.WebhookQueue.update(job.id, {
            status: 'failed',
            retry_count: retries,
            error_message: err.message,
            last_attempt_at: nowIso,
            next_attempt_at: nextAttempt
          });
          stats.failed++;
        }
      }
    }

    console.log(`[processWebhookQueue] Done: processed=${stats.processed} failed=${stats.failed} dead_lettered=${stats.dead_lettered}`);
    return Response.json({ ...stats, total_jobs: jobs.length });

  } catch (error) {
    console.error('[processWebhookQueue] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});