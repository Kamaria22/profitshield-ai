// redeploy trigger: ensure Base44 rebuilds function registry
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import {
  startAgentExecution,
  finishAgentExecution,
  ensureTenantIsolation,
  allowRole
} from './helpers/agentRuntime.ts';

const VERSION = 'supportGuardian_v2026_03_05';
const DEFAULT_SUPPORT_EMAIL = 'support@profitshield-ai.com';

function pct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

async function ensureSupportEmail(db, tenantId) {
  if (!tenantId) return DEFAULT_SUPPORT_EMAIL;
  const settings = await db.TenantSettings.filter({ tenant_id: tenantId }).catch(() => []);
  const row = settings[0];
  if (!row) {
    await db.TenantSettings.create({ tenant_id: tenantId, support_email: DEFAULT_SUPPORT_EMAIL }).catch(() => {});
    return DEFAULT_SUPPORT_EMAIL;
  }
  if (!row.support_email) {
    await db.TenantSettings.update(row.id, { support_email: DEFAULT_SUPPORT_EMAIL }).catch(() => {});
    return DEFAULT_SUPPORT_EMAIL;
  }
  return row.support_email;
}

async function runWatchdog(db, tenantId, observeOnly = false) {
  const q = tenantId ? { tenant_id: tenantId } : {};
  const rows = await db.SupportConversation.filter(q, '-created_date', 500).catch(() => []);
  const open = rows.filter(r => r.status !== 'closed').length;
  const unread = rows.filter(r => r.status !== 'closed' && r.status !== 'ai_resolved').length;
  const aiResolved = rows.filter(r => r.status === 'ai_resolved').length;
  const escalated = rows.filter(r => r.needs_owner_attention).length;

  const audits = await db.AuditLog.filter({ action: 'support_email_sent' }, '-created_date', 200).catch(() => []);
  const deliveryFailures = audits.filter(a => a.severity === 'high').length;

  let selfHealTriggered = false;
  if (unread > 100 || deliveryFailures > 0) {
    if (observeOnly) {
      selfHealTriggered = false;
    } else {
      const stale = await db.SupportConversation.filter({ status: 'owner_replied' }, '-created_date', 200).catch(() => []);
      for (const c of stale) {
        const updated = c.updated_date ? new Date(c.updated_date).getTime() : 0;
        if (updated && Date.now() - updated > 14 * 24 * 60 * 60 * 1000) {
          await db.SupportConversation.update(c.id, { status: 'closed' }).catch(() => {});
        }
      }
      selfHealTriggered = true;
    }
  }

  return {
    ok: true,
    version: VERSION,
    observe_only: !!observeOnly,
    inbox_health: open > 150 ? 'degraded' : 'healthy',
    unread_count: unread,
    escalated_count: escalated,
    ai_resolution_rate: pct(aiResolved, rows.length),
    email_delivery_health: deliveryFailures > 0 ? 'degraded' : 'healthy',
    self_heal_triggered: selfHealTriggered
  };
}

Deno.serve(async (req) => {
  let exec = null;
  let execDb = null;
  let execMeta = { action: 'run_watchdog', tenantId: null, userRole: null, isScheduler: true };
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    execDb = db;
    let body = {};
    try { body = await req.json(); } catch {}

    const action = body.action || 'run_watchdog';
    const tenantId = body.tenant_id || null;
    const observeOnly = body.observe_only === true || body.mode === 'observe';
    execMeta = { action, tenantId, userRole: null, isScheduler: action === 'run_watchdog' };
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const role = (user?.role || user?.app_role || '').toLowerCase();
    execMeta.userRole = role || null;
    execMeta.isScheduler = !user;
    if (user && !allowRole(role, ['admin', 'owner'])) {
      return Response.json({ ok: false, error: 'Admin/owner only' }, { status: 403 });
    }

    exec = await startAgentExecution({
      db,
      agentName: 'supportGuardian',
      action,
      tenantId,
      userRole: execMeta.userRole,
      isScheduler: execMeta.isScheduler,
      policy: { max_executions_per_window: 60, max_failures_per_window: 20, version: VERSION }
    });
    if (!exec.ok) {
      return Response.json({ ok: false, error: 'Execution blocked by safety policy', reason: exec.blockReason }, { status: 429 });
    }

    if (action === 'run_watchdog') {
      const isolation = ensureTenantIsolation({ tenantId, allowSystem: true });
      if (!isolation.ok) {
        await finishAgentExecution({
          db, agentName: 'supportGuardian', action, tenantId,
          startedAt: exec.startedAt, success: false, error: isolation.error, isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
        });
        return Response.json({ ok: false, error: isolation.error }, { status: 400 });
      }
      const data = await runWatchdog(db, tenantId, observeOnly);
      await finishAgentExecution({
        db, agentName: 'supportGuardian', action, tenantId,
        startedAt: exec.startedAt, success: true, repairActions: data.self_heal_triggered ? ['self_heal_repair'] : [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
      });
      return Response.json(data);
    }

    if (action === 'guardian_apply') {
      const supportEmail = await ensureSupportEmail(db, tenantId);
      await finishAgentExecution({
        db, agentName: 'supportGuardian', action, tenantId,
        startedAt: exec.startedAt, success: true, repairActions: ['ensure_support_email'], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
      });
      return Response.json({ ok: true, version: VERSION, support_email: supportEmail, guardian: 'applied' });
    }

    if (action === 'self_heal_repair') {
      const stale = await db.SupportConversation.filter({ status: 'owner_replied' }, '-created_date', 200).catch(() => []);
      let repaired = 0;
      for (const c of stale) {
        const updated = c.updated_date ? new Date(c.updated_date).getTime() : 0;
        if (updated && Date.now() - updated > 14 * 24 * 60 * 60 * 1000) {
          await db.SupportConversation.update(c.id, { status: 'closed' }).catch(() => {});
          repaired++;
        }
      }
      await finishAgentExecution({
        db, agentName: 'supportGuardian', action, tenantId,
        startedAt: exec.startedAt, success: true, repairActions: repaired > 0 ? ['close_stale_conversations'] : [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
      });
      return Response.json({ ok: true, version: VERSION, repaired });
    }

    await finishAgentExecution({
      db, agentName: 'supportGuardian', action, tenantId,
      startedAt: exec.startedAt, success: false, error: 'invalid_action', isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
    });
    return Response.json({ ok: false, error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    if (exec && execDb) {
      await finishAgentExecution({
        db: execDb, agentName: 'supportGuardian', action: execMeta.action, tenantId: execMeta.tenantId,
        startedAt: exec.startedAt, success: false, error: e?.message || String(e), isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
      });
    }
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
});
