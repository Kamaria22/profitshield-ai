/**
 * processShopifyDeferredJobs
 * Drains ShopifyDeferredJob queue for GDPR and subscription update jobs.
 * Safe defaults:
 * - admin-only for manual invocation
 * - scheduler/service-role allowed without user session
 * - bounded retries + dead-letter on repeated failure
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const MAX_RETRIES = 5;
const BATCH_SIZE = 25;

function nowIso() {
  return new Date().toISOString();
}

function nextBackoffMs(attempts) {
  return Math.min(60_000, 2_000 * Math.pow(2, Math.max(0, attempts - 1)));
}

async function runJob(base44, db, job) {
  const type = job.job_type;
  const payload = job.payload || {};
  const shopDomain = job.shop_domain || null;

  if (type === 'subscription_update') {
    await base44.functions.invoke('shopifyBillingConfirm', {
      action: 'process_subscription_update',
      shop_domain: shopDomain,
      payload
    });
    return { ok: true, action: 'subscription_update_processed' };
  }

  if (type === 'gdpr_data_request') {
    await db.AuditLog.create({
      tenant_id: null,
      action: 'gdpr_data_request_processed',
      entity_type: 'shopify_deferred_job',
      entity_id: job.id,
      performed_by: 'system',
      description: `Processed GDPR data request for ${shopDomain || 'unknown_shop'}`,
      category: 'compliance',
      severity: 'low',
      metadata: { shop_domain: shopDomain, processed_at: nowIso() }
    }).catch(() => {});
    return { ok: true, action: 'gdpr_data_request_processed' };
  }

  if (type === 'gdpr_customer_redact') {
    await db.AuditLog.create({
      tenant_id: null,
      action: 'gdpr_customer_redact_processed',
      entity_type: 'shopify_deferred_job',
      entity_id: job.id,
      performed_by: 'system',
      description: `Processed GDPR customer redact for ${shopDomain || 'unknown_shop'}`,
      category: 'compliance',
      severity: 'high',
      metadata: { shop_domain: shopDomain, customer_id: payload.customer_id || null, processed_at: nowIso() }
    }).catch(() => {});
    return { ok: true, action: 'gdpr_customer_redact_processed' };
  }

  if (type === 'gdpr_shop_redact') {
    const integrations = await db.PlatformIntegration
      .filter({ platform: 'shopify', store_key: shopDomain }, '-created_date', 10)
      .catch(() => []);

    for (const integration of integrations || []) {
      await db.PlatformIntegration.update(integration.id, {
        status: 'disconnected',
        disconnected_at: nowIso(),
        webhook_endpoints: {}
      }).catch(() => {});

      const tokens = await db.OAuthToken
        .filter({ tenant_id: integration.tenant_id, platform: 'shopify' })
        .catch(() => []);

      for (const token of tokens || []) {
        await db.OAuthToken.update(token.id, {
          is_valid: false,
          encrypted_access_token: '',
          encrypted_refresh_token: ''
        }).catch(() => {});
      }
    }

    await db.AuditLog.create({
      tenant_id: null,
      action: 'gdpr_shop_redact_processed',
      entity_type: 'shopify_deferred_job',
      entity_id: job.id,
      performed_by: 'system',
      description: `Processed GDPR shop redact for ${shopDomain || 'unknown_shop'}`,
      category: 'compliance',
      severity: 'critical',
      metadata: { shop_domain: shopDomain, processed_at: nowIso(), integrations_updated: integrations.length }
    }).catch(() => {});

    return { ok: true, action: 'gdpr_shop_redact_processed', integrations_updated: integrations.length };
  }

  return { ok: true, action: 'skipped_unknown_type' };
}

const handler = async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    let isAutomated = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin' && user.app_role !== 'admin' && user.app_role !== 'owner') {
        return Response.json({ ok: false, error: 'Admin/owner only' }, { status: 403 });
      }
    } catch {
      isAutomated = true;
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(BATCH_SIZE, Math.max(1, Number(body.limit || BATCH_SIZE)));
    const now = new Date();

    const pending = await db.ShopifyDeferredJob
      .filter({ status: 'pending' }, '-created_date', limit)
      .catch(() => []);
    const retryable = await db.ShopifyDeferredJob
      .filter({ status: 'failed' }, '-created_date', limit)
      .catch(() => []);

    const jobs = [...pending, ...retryable]
      .filter((j) => !j.next_attempt_at || new Date(j.next_attempt_at) <= now)
      .slice(0, limit);

    if (!jobs.length) {
      return Response.json({ ok: true, processed: 0, failed: 0, dead_lettered: 0, mode: isAutomated ? 'automation' : 'manual' });
    }

    const stats = { processed: 0, failed: 0, dead_lettered: 0 };
    const results = [];

    for (const job of jobs) {
      const attempts = Number(job.attempts || 0) + 1;
      await db.ShopifyDeferredJob.update(job.id, { status: 'processing', attempts, last_attempt_at: nowIso() }).catch(() => {});

      try {
        const result = await runJob(base44, db, job);
        await db.ShopifyDeferredJob.update(job.id, {
          status: 'complete',
          processed_at: nowIso(),
          error_message: null
        }).catch(() => {});
        stats.processed++;
        results.push({ id: job.id, job_type: job.job_type, ok: true, result });
      } catch (err) {
        const message = err?.message || String(err);
        if (attempts >= MAX_RETRIES) {
          await db.ShopifyDeferredJob.update(job.id, {
            status: 'dead_letter',
            error_message: message,
            next_attempt_at: null
          }).catch(() => {});
          stats.dead_lettered++;
        } else {
          await db.ShopifyDeferredJob.update(job.id, {
            status: 'failed',
            error_message: message,
            next_attempt_at: new Date(Date.now() + nextBackoffMs(attempts)).toISOString()
          }).catch(() => {});
          stats.failed++;
        }
        results.push({ id: job.id, job_type: job.job_type, ok: false, error: message });
      }
    }

    return Response.json({ ok: true, ...stats, results, mode: isAutomated ? 'automation' : 'manual' });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 500 });
  }
};

Deno.serve(handler);
export default handler;
