// redeploy trigger: rewritten processWebhookQueue runtime for Base44 republish
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { upsertProjectedCustomer } from '../helpers/customerProjection/entry.ts';

const VERSION = '2026-03-24.webhook-queue-rewrite-v1';
const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

function json(data, status = 200) {
  return Response.json(data, { status });
}

function withEndpointGuard(name, handler) {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }
    try {
      const res = await handler(req);
      return res instanceof Response ? res : json({ error: `${name}_invalid_response`, version: VERSION }, 500);
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return json({ error: 'internal_error', endpoint: name, message: error?.message || String(error), version: VERSION }, 500);
    }
  };
}

function normalizeQueueJob(job) {
  const topic = String(job?.event_type || job?.topic || '').trim();
  let payload = job?.payload ?? null;
  if (typeof payload === 'string') payload = JSON.parse(payload);
  if (!topic || !payload || typeof payload !== 'object') throw new Error('invalid webhook payload');
  return {
    ...job,
    event_type: topic,
    payload,
    retry_count: Number(job?.retry_count ?? job?.attempts ?? 0) || 0,
  };
}

function mapOrderStatus(order) {
  if (order?.cancelled_at) return 'cancelled';
  if (order?.refunds?.length > 0) return 'refunded';
  if (order?.fulfillment_status === 'fulfilled') return 'fulfilled';
  if (order?.financial_status === 'paid' || order?.financial_status === 'partially_paid') return 'paid';
  return 'pending';
}

async function processOrderJob(base44, tenantId, job, payload) {
  const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' }, '-created_date', 1).catch(() => []);
  const integration = integrations[0] || null;
  const shopDomain = integration?.store_key || null;
  const platformOrderId = String(payload?.id || '').trim();
  if (!platformOrderId) return;
  const record = {
    tenant_id: tenantId,
    integration_id: job?.integration_id || integration?.id || null,
    shop_domain: shopDomain,
    platform_order_id: platformOrderId,
    order_number: String(payload?.order_number || payload?.name || platformOrderId),
    customer_email: payload?.email || payload?.customer?.email || null,
    customer_name: payload?.customer?.first_name ? `${payload.customer.first_name} ${payload?.customer?.last_name || ''}`.trim() : payload?.shipping_address?.name || null,
    order_date: payload?.created_at || new Date().toISOString(),
    processed_at: payload?.processed_at || payload?.created_at || new Date().toISOString(),
    financial_status: payload?.financial_status || null,
    fulfillment_status: payload?.fulfillment_status || 'unfulfilled',
    status: mapOrderStatus(payload),
    billing_address: payload?.billing_address || null,
    shipping_address: payload?.shipping_address || null,
    discount_codes: Array.isArray(payload?.discount_codes) ? payload.discount_codes.map((item) => item?.code).filter(Boolean) : [],
    is_first_order: !payload?.customer || Number(payload?.customer?.orders_count || 0) <= 1,
    is_demo: false,
    total_revenue: Number(payload?.total_price || 0) || 0,
    platform_data: payload
  };
  const existing = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId, platform_order_id: platformOrderId }, '-created_date', 1).catch(() => []);
  if (existing[0]?.id) {
    const saved = await base44.asServiceRole.entities.Order.update(existing[0].id, record);
    await upsertProjectedCustomer(base44.asServiceRole, tenantId, { ...saved, ...record }).catch(() => {});
  } else {
    const saved = await base44.asServiceRole.entities.Order.create(record);
    await upsertProjectedCustomer(base44.asServiceRole, tenantId, { ...saved, ...record }).catch(() => {});
  }
}

async function processRefundJob(base44, tenantId, payload) {
  const refundId = String(payload?.id || '').trim();
  const platformOrderId = String(payload?.order_id || '').trim();
  if (!refundId || !platformOrderId) return;
  const existingRefunds = await base44.asServiceRole.entities.Refund.filter({ tenant_id: tenantId, platform_refund_id: refundId }, '-created_date', 1).catch(() => []);
  if (!existingRefunds.length) {
    const amount = (payload?.transactions || []).reduce((sum, txn) => sum + (parseFloat(txn?.amount || 0) || 0), 0);
    await base44.asServiceRole.entities.Refund.create({
      tenant_id: tenantId,
      order_id: platformOrderId,
      platform_refund_id: refundId,
      amount,
      reason: payload?.note || 'No reason provided',
      refunded_at: payload?.created_at || new Date().toISOString()
    }).catch(() => {});
  }
}

const handler = withEndpointGuard('processWebhookQueue', async (req) => {
  const base44 = createClientFromRequest(req);

  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}
  const role = String(user?.role || user?.app_role || '').toLowerCase();
  if (user && role !== 'admin' && role !== 'owner') {
    return json({ error: 'Admin/owner only', version: VERSION }, 403);
  }

  const pending = await base44.asServiceRole.entities.WebhookQueue.filter({ status: 'pending' }, '-created_date', BATCH_SIZE).catch(() => []);
  const retryable = await base44.asServiceRole.entities.WebhookQueue.filter({ status: 'failed' }, 'next_attempt_at', BATCH_SIZE).catch(() => []);
  const now = new Date();
  const jobs = [
    ...pending,
    ...retryable.filter((job) => !job?.next_attempt_at || new Date(job.next_attempt_at) <= now)
  ].slice(0, BATCH_SIZE);

  if (!jobs.length) return json({ processed: 0, failed: 0, dead_lettered: 0, total_jobs: 0, version: VERSION });

  const stats = { processed: 0, failed: 0, dead_lettered: 0, total_jobs: jobs.length, version: VERSION };
  for (const job of jobs) {
    let normalized = job;
    try {
      normalized = normalizeQueueJob(job);
      await base44.asServiceRole.entities.WebhookQueue.update(job.id, { status: 'processing', last_attempt_at: new Date().toISOString() }).catch(() => {});

      if (normalized.event_type === 'orders/create' || normalized.event_type === 'orders/updated' || normalized.event_type === 'orders/paid') {
        await processOrderJob(base44, normalized.tenant_id, job, normalized.payload);
      } else if (normalized.event_type === 'refunds/create') {
        await processRefundJob(base44, normalized.tenant_id, normalized.payload);
      } else if (normalized.event_type === 'orders/cancelled') {
        const existing = await base44.asServiceRole.entities.Order.filter({ tenant_id: normalized.tenant_id, platform_order_id: String(normalized.payload?.id || '') }, '-created_date', 1).catch(() => []);
        if (existing[0]?.id) {
          await base44.asServiceRole.entities.Order.update(existing[0].id, {
            status: 'cancelled',
            cancelled_at: normalized.payload?.cancelled_at || new Date().toISOString(),
            cancel_reason: normalized.payload?.cancel_reason || null
          }).catch(() => {});
        }
      }

      await base44.asServiceRole.entities.WebhookQueue.update(job.id, { status: 'complete', processed_at: new Date().toISOString() }).catch(() => {});
      stats.processed++;
    } catch (error) {
      const retries = (Number(normalized?.retry_count ?? normalized?.attempts ?? 0) || 0) + 1;
      const deadLetter = retries >= MAX_RETRIES;
      await base44.asServiceRole.entities.WebhookQueue.update(job.id, {
        status: deadLetter ? 'dead_letter' : 'failed',
        retry_count: retries,
        attempts: retries,
        error_message: String(error?.message || error || 'process_webhook_queue_failed'),
        last_attempt_at: new Date().toISOString(),
        next_attempt_at: deadLetter ? null : new Date(Date.now() + 30000 * Math.pow(2, retries - 1)).toISOString()
      }).catch(() => {});
      if (deadLetter) stats.dead_lettered++;
      else stats.failed++;
    }
  }

  return json(stats);
});

Deno.serve(handler);
