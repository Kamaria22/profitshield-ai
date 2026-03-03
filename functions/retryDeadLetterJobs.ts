/**
 * retryDeadLetterJobs
 * 
 * Manual retry / discard for WebhookQueue dead-letter jobs.
 * 
 * Actions:
 *   retry_one   — reset a single job back to pending (retry_count = 0)
 *   discard_one — permanently mark a single job as discarded
 *   retry_all   — reset ALL dead-letter jobs for a tenant back to pending
 *   discard_all — permanently discard ALL dead-letter jobs for a tenant
 * 
 * Admin/owner only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const role = (user?.role || user?.app_role || '').toLowerCase();
    if (!user || (role !== 'admin' && role !== 'owner')) {
      return Response.json({ error: 'Admin/owner only' }, { status: 403 });
    }

    const body = await req.json();
    const { action, job_id, tenant_id } = body;
    const db = base44.asServiceRole;
    const now = new Date().toISOString();

    if (action === 'retry_one') {
      if (!job_id) return Response.json({ error: 'Missing job_id' }, { status: 400 });
      const jobs = await db.entities.WebhookQueue.filter({ id: job_id });
      if (!jobs.length) return Response.json({ error: 'Job not found' }, { status: 404 });
      const job = jobs[0];
      if (job.status !== 'dead_letter') {
        return Response.json({ error: `Job status is '${job.status}', not dead_letter` }, { status: 400 });
      }
      await db.entities.WebhookQueue.update(job_id, {
        status: 'pending',
        retry_count: 0,
        error_message: null,
        next_attempt_at: null,
        last_attempt_at: null
      });
      await db.entities.AuditLog.create({
        tenant_id: job.tenant_id,
        action: 'dead_letter_retry',
        entity_type: 'webhook_queue',
        entity_id: job_id,
        performed_by: user.email,
        description: `Manual retry of dead-letter job ${job_id} (topic: ${job.event_type})`,
        severity: 'low',
        category: 'integration'
      }).catch(() => {});
      return Response.json({ ok: true, action: 'retry_one', job_id });
    }

    if (action === 'discard_one') {
      if (!job_id) return Response.json({ error: 'Missing job_id' }, { status: 400 });
      const jobs = await db.entities.WebhookQueue.filter({ id: job_id });
      if (!jobs.length) return Response.json({ error: 'Job not found' }, { status: 404 });
      const job = jobs[0];
      await db.entities.WebhookQueue.update(job_id, {
        status: 'dead_letter',
        error_message: (job.error_message || '') + ' [DISCARDED by ' + user.email + ' at ' + now + ']'
      });
      await db.entities.AuditLog.create({
        tenant_id: job.tenant_id,
        action: 'dead_letter_discard',
        entity_type: 'webhook_queue',
        entity_id: job_id,
        performed_by: user.email,
        description: `Discarded dead-letter job ${job_id} (topic: ${job.event_type})`,
        severity: 'low',
        category: 'integration'
      }).catch(() => {});
      return Response.json({ ok: true, action: 'discard_one', job_id });
    }

    if (action === 'retry_all') {
      if (!tenant_id) return Response.json({ error: 'Missing tenant_id' }, { status: 400 });
      const deadJobs = await db.entities.WebhookQueue.filter({ tenant_id, status: 'dead_letter' }, '-created_date', 200);
      let retried = 0;
      for (const job of deadJobs) {
        // Skip already-discarded ones
        if (job.error_message?.includes('[DISCARDED')) continue;
        await db.entities.WebhookQueue.update(job.id, {
          status: 'pending',
          retry_count: 0,
          error_message: null,
          next_attempt_at: null,
          last_attempt_at: null
        }).catch(() => {});
        retried++;
      }
      await db.entities.AuditLog.create({
        tenant_id,
        action: 'dead_letter_retry_all',
        entity_type: 'webhook_queue',
        entity_id: tenant_id,
        performed_by: user.email,
        description: `Bulk retry of ${retried} dead-letter jobs for tenant ${tenant_id}`,
        severity: 'low',
        category: 'integration',
        metadata: { retried_count: retried }
      }).catch(() => {});
      return Response.json({ ok: true, action: 'retry_all', retried });
    }

    if (action === 'discard_all') {
      if (!tenant_id) return Response.json({ error: 'Missing tenant_id' }, { status: 400 });
      const deadJobs = await db.entities.WebhookQueue.filter({ tenant_id, status: 'dead_letter' }, '-created_date', 200);
      let discarded = 0;
      for (const job of deadJobs) {
        if (job.error_message?.includes('[DISCARDED')) continue;
        await db.entities.WebhookQueue.update(job.id, {
          error_message: (job.error_message || '') + ' [DISCARDED by ' + user.email + ' at ' + now + ']'
        }).catch(() => {});
        discarded++;
      }
      await db.entities.AuditLog.create({
        tenant_id,
        action: 'dead_letter_discard_all',
        entity_type: 'webhook_queue',
        entity_id: tenant_id,
        performed_by: user.email,
        description: `Bulk discard of ${discarded} dead-letter jobs for tenant ${tenant_id}`,
        severity: 'medium',
        category: 'integration',
        metadata: { discarded_count: discarded }
      }).catch(() => {});
      return Response.json({ ok: true, action: 'discard_all', discarded });
    }

    return Response.json({ error: 'Invalid action. Allowed: retry_one, discard_one, retry_all, discard_all' }, { status: 400 });

  } catch (error) {
    console.error('[retryDeadLetterJobs]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});