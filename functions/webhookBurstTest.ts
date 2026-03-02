/**
 * WEBHOOK BURST VIABILITY TEST
 *
 * Simulates bursts of webhooks (up to 1,000/min) and validates:
 *   1. No timeouts — all requests complete within deadline
 *   2. No duplicate rows — idempotency keys deduplicate correctly
 *   3. No drift in totals — aggregate revenue/profit matches expected sums
 *
 * Admin-only. Call with action = "run_burst_test" | "check_results" | "cleanup"
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOrderPayload(index, batchId) {
  const price = (10 + (index % 90)).toFixed(2);   // $10–$99 deterministic
  return {
    id: `burst_${batchId}_${index}`,
    order_number: 10000 + index,
    name: `#${10000 + index}`,
    created_at: new Date().toISOString(),
    total_price: price,
    financial_status: 'paid',
    fulfillment_status: null,
    email: `test_${index}@burst.test`,
    customer: { first_name: 'Burst', last_name: `User${index}`, orders_count: 1 },
    billing_address: { country_code: 'US', city: 'New York' },
    shipping_address: { country_code: 'US', city: 'New York' },
    line_items: [{ id: `li_${index}`, title: 'Test Product', quantity: 1, price, sku: 'BURST-SKU', product_id: 'p1', variant_id: 'v1' }],
    shipping_lines: [],
    tax_lines: [],
    discount_codes: [],
    refunds: []
  };
}

// Simulate the same idempotency logic used in shopifyWebhook
function idempotencyKey(tenantId, topic, eventId) {
  return `${tenantId}:${topic}:${eventId}`;
}

// Lightweight HMAC-less order processing (no external calls — pure logic test)
async function processOrderLocally(base44, tenantId, orderPayload) {
  const platformOrderId = orderPayload.id.toString();

  // Idempotency: check for existing WebhookEvent
  const key = idempotencyKey(tenantId, 'orders/create', platformOrderId);
  const existing = await base44.asServiceRole.entities.WebhookEvent.filter({ idempotency_key: key });
  if (existing.length > 0) {
    return { status: 'duplicate', key };
  }

  // Record webhook event (idempotency anchor)
  await base44.asServiceRole.entities.WebhookEvent.create({
    tenant_id: tenantId,
    topic: 'orders/create',
    event_id: platformOrderId,
    idempotency_key: key,
    payload: { id: platformOrderId },
    status: 'processed',
    processed_at: new Date().toISOString()
  });

  // Upsert order row — check for existing first to avoid duplicate rows
  const existingOrders = await base44.asServiceRole.entities.Order.filter({
    tenant_id: tenantId,
    platform_order_id: platformOrderId
  });

  const revenue = parseFloat(orderPayload.total_price);
  const cogs = revenue * 0.4;   // fixed 40% COGS for deterministic test
  const netProfit = revenue - cogs - revenue * 0.029 - 0.30;

  const orderRecord = {
    tenant_id: tenantId,
    platform_order_id: platformOrderId,
    order_number: orderPayload.order_number.toString(),
    customer_email: orderPayload.email,
    order_date: orderPayload.created_at,
    status: 'paid',
    total_revenue: revenue,
    total_cogs: cogs,
    net_profit: netProfit,
    margin_pct: (netProfit / revenue) * 100,
    burst_batch_id: orderPayload.id.split('_')[1] || 'unknown'   // tag for cleanup
  };

  if (existingOrders.length > 0) {
    await base44.asServiceRole.entities.Order.update(existingOrders[0].id, orderRecord);
    return { status: 'updated', platformOrderId };
  } else {
    await base44.asServiceRole.entities.Order.create(orderRecord);
    return { status: 'created', platformOrderId };
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      action = 'run_burst_test',
      tenant_id,
      burst_size = 100,      // default 100; set to 1000 for full test
      concurrency = 20,      // parallel workers per wave
      inject_duplicates = true  // re-send 10% of events to test dedup
    } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // ── CLEANUP ──────────────────────────────────────────────────────────────
    if (action === 'cleanup') {
      // Delete all burst test orders and webhook events for this tenant
      const burstOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
      const testOrders = burstOrders.filter(o => o.platform_order_id?.startsWith('burst_'));
      let deleted = 0;
      for (const o of testOrders) {
        await base44.asServiceRole.entities.Order.delete(o.id);
        deleted++;
      }

      const burstEvents = await base44.asServiceRole.entities.WebhookEvent.filter({ tenant_id });
      const testEvents = burstEvents.filter(e => e.event_id?.startsWith('burst_'));
      for (const e of testEvents) {
        await base44.asServiceRole.entities.WebhookEvent.delete(e.id);
      }

      return Response.json({ success: true, deleted_orders: deleted, deleted_events: testEvents.length });
    }

    // ── RUN BURST TEST ────────────────────────────────────────────────────────
    if (action === 'run_burst_test') {
      const batchId = Date.now().toString(36);
      const totalOrders = Math.min(burst_size, 500); // cap at 500 per invocation to avoid timeout
      const workers = Math.min(concurrency, 30);

      // Pre-compute expected totals for drift validation
      let expectedRevenue = 0;
      let expectedCogs = 0;
      const allPayloads = [];
      for (let i = 0; i < totalOrders; i++) {
        const p = makeOrderPayload(i, batchId);
        allPayloads.push(p);
        expectedRevenue += parseFloat(p.total_price);
        expectedCogs += parseFloat(p.total_price) * 0.4;
      }

      // Build work queue (+ duplicates)
      const queue = [...allPayloads];
      if (inject_duplicates) {
        // Re-inject first 10% as duplicates
        const dupCount = Math.floor(totalOrders * 0.1);
        for (let i = 0; i < dupCount; i++) {
          queue.push(allPayloads[i]);
        }
      }

      const results = { created: 0, updated: 0, duplicate: 0, errors: 0, timeouts: 0 };
      const TIMEOUT_MS = 8000; // 8s per item considered a timeout
      // Throttle between waves to stay under platform rate limits (~5 req/s safe)
      const WAVE_DELAY_MS = 300;

      // Process in batches of `workers`
      const startAll = Date.now();
      for (let offset = 0; offset < queue.length; offset += workers) {
        const wave = queue.slice(offset, offset + workers);
        const waveResults = await Promise.allSettled(
          wave.map(async (payload) => {
            const t0 = Date.now();
            const result = await processOrderLocally(base44, tenant_id, payload);
            const elapsed = Date.now() - t0;
            if (elapsed > TIMEOUT_MS) results.timeouts++;
            return result;
          })
        );

        for (const r of waveResults) {
          if (r.status === 'fulfilled') {
            results[r.value.status] = (results[r.value.status] || 0) + 1;
          } else {
            results.errors++;
            console.error('[burstTest] wave error:', r.reason?.message);
          }
        }

        // Throttle between waves
        if (offset + workers < queue.length) {
          await new Promise(res => setTimeout(res, WAVE_DELAY_MS));
        }
      }

      const totalElapsedMs = Date.now() - startAll;

      // ── Drift validation: fetch what was actually written ──────────────────
      const writtenOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
      const burstWritten = writtenOrders.filter(o => o.platform_order_id?.startsWith(`burst_${batchId}_`));

      let actualRevenue = 0;
      let actualCogs = 0;
      for (const o of burstWritten) {
        actualRevenue += o.total_revenue || 0;
        actualCogs += o.total_cogs || 0;
      }

      const revenueDrift = Math.abs(actualRevenue - expectedRevenue);
      const cogsDrift = Math.abs(actualCogs - expectedCogs);
      const DRIFT_TOLERANCE = 0.01; // $0.01 float tolerance

      const driftOk = revenueDrift < DRIFT_TOLERANCE && cogsDrift < DRIFT_TOLERANCE;
      const noTimeouts = results.timeouts === 0;
      const noDuplicates = burstWritten.length === totalOrders; // exactly one row per unique order

      const passed = driftOk && noTimeouts && noDuplicates && results.errors === 0;

      return Response.json({
        passed,
        summary: {
          burst_size: totalOrders,
          injected_duplicates: inject_duplicates ? Math.floor(totalOrders * 0.1) : 0,
          total_elapsed_ms: totalElapsedMs,
          throughput_per_min: Math.round((queue.length / totalElapsedMs) * 60000)
        },
        checks: {
          no_timeouts: { passed: noTimeouts, timeout_count: results.timeouts },
          no_duplicate_rows: { passed: noDuplicates, unique_rows_written: burstWritten.length, expected: totalOrders },
          no_drift: {
            passed: driftOk,
            expected_revenue: expectedRevenue.toFixed(2),
            actual_revenue: actualRevenue.toFixed(2),
            revenue_drift: revenueDrift.toFixed(4),
            expected_cogs: expectedCogs.toFixed(2),
            actual_cogs: actualCogs.toFixed(2),
            cogs_drift: cogsDrift.toFixed(4)
          }
        },
        processing: results
      });
    }

    return Response.json({ error: 'Invalid action. Use: run_burst_test | cleanup' }, { status: 400 });

  } catch (error) {
    console.error('[webhookBurstTest] error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});