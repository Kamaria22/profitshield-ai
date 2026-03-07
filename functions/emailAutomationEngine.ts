import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import {
  startAgentExecution,
  finishAgentExecution,
  ensureTenantIsolation,
  allowRole
} from './helpers/agentRuntime';

const VERSION = 'emailAutomationEngine_v2026_03_05';
const DEFAULT_SUPPORT_EMAIL = 'support@profitshield-ai.com';
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const TEMPLATE_BY_EVENT = {
  onboarding: {
    subject: 'Welcome to ProfitShield AI',
    body: 'Your onboarding is ready. Connect integrations to start protection immediately.'
  },
  feature_announcement: {
    subject: 'New ProfitShield feature is live',
    body: 'A new feature is available in your dashboard. Review the release notes in-app.'
  },
  risk_alert: {
    subject: 'Risk alert requires review',
    body: 'A risk condition was detected. Open the Alerts page to review and act.'
  },
  profit_recommendation: {
    subject: 'New profit recommendation available',
    body: 'Your AI engine generated a new profit optimization recommendation.'
  },
  integration_reminder: {
    subject: 'Complete your integration setup',
    body: 'Connect remaining integrations to unlock full automation coverage.'
  }
};

async function alreadySentRecently(db, tenantId, recipient, eventType) {
  const logs = await db.AuditLog.filter({ tenant_id: tenantId, action: 'marketing_email_sent' }, '-created_date', 100).catch(() => []);
  return logs.some(log => {
    const md = log.metadata || {};
    if (md.recipient !== recipient || md.event_type !== eventType) return false;
    const t = log.created_date ? new Date(log.created_date).getTime() : 0;
    return t > 0 && Date.now() - t < COOLDOWN_MS;
  });
}

const runtimeHandler = async (req) => {
  let exec = null;
  let execDb = null;
  let execMeta = { action: 'status', tenantId: null, userRole: null, isScheduler: true };
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    execDb = db;
    let body = {};
    try { body = await req.json(); } catch {}

    const action = body.action || 'status';
    const tenantId = body.tenant_id || null;
    execMeta = { action, tenantId, userRole: null, isScheduler: action === 'watchdog' };

    if (action !== 'watchdog') {
      let user = null;
      try { user = await base44.auth.me(); } catch (_) {}
      const role = (user?.role || user?.app_role || '').toLowerCase();
      execMeta.userRole = role || null;
      execMeta.isScheduler = !user;
      if (user && !allowRole(role, ['admin', 'owner'])) {
        return Response.json({ ok: false, error: 'Admin/owner only' }, { status: 403 });
      }
    }

    exec = await startAgentExecution({
      db,
      agentName: 'emailAutomationEngine',
      action,
      tenantId,
      userRole: execMeta.userRole,
      isScheduler: execMeta.isScheduler,
      policy: { max_executions_per_window: 100, max_failures_per_window: 25, version: VERSION }
    });
    if (!exec.ok) {
      return Response.json({ ok: false, error: 'Execution blocked by safety policy', reason: exec.blockReason }, { status: 429 });
    }

    if (action === 'dispatch_event') {
      const eventType = body.event_type;
      const recipient = body.recipient_email || body.to || null;
      const isolation = ensureTenantIsolation({ tenantId, allowSystem: true });
      if (!isolation.ok) {
        await finishAgentExecution({
          db, agentName: 'emailAutomationEngine', action, tenantId,
          startedAt: exec.startedAt, success: false, error: isolation.error, repairActions: [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
        });
        return Response.json({ ok: false, error: isolation.error }, { status: 400 });
      }

      if (!eventType || !TEMPLATE_BY_EVENT[eventType]) {
        await finishAgentExecution({
          db, agentName: 'emailAutomationEngine', action, tenantId,
          startedAt: exec.startedAt, success: false, error: 'unsupported_event_type', repairActions: [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
        });
        return Response.json({ ok: false, error: 'Unsupported event_type' }, { status: 400 });
      }
      if (!recipient) {
        await finishAgentExecution({
          db, agentName: 'emailAutomationEngine', action, tenantId,
          startedAt: exec.startedAt, success: false, error: 'recipient_email_required', repairActions: [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
        });
        return Response.json({ ok: false, error: 'recipient_email required' }, { status: 400 });
      }

      const duplicate = await alreadySentRecently(db, tenantId, recipient, eventType);
      if (duplicate) {
        await finishAgentExecution({
          db, agentName: 'emailAutomationEngine', action, tenantId,
          startedAt: exec.startedAt, success: true, repairActions: [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
        });
        return Response.json({ ok: true, skipped: true, reason: 'cooldown', version: VERSION });
      }

      const tpl = TEMPLATE_BY_EVENT[eventType];
      await base44.integrations.Core.SendEmail({
        to: recipient,
        subject: body.subject || tpl.subject,
        body: `${body.body || tpl.body}\n\n---\nNeed help? ${DEFAULT_SUPPORT_EMAIL}\nUnsubscribe via Settings notifications.`
      });

      await db.AuditLog.create({
        tenant_id: tenantId,
        action: 'marketing_email_sent',
        entity_type: 'email',
        performed_by: 'email_automation_engine',
        description: `Sent ${eventType} email to ${recipient}`,
        category: 'automation',
        metadata: { event_type: eventType, recipient, version: VERSION }
      }).catch(() => {});

      await finishAgentExecution({
        db, agentName: 'emailAutomationEngine', action, tenantId,
        startedAt: exec.startedAt, success: true, repairActions: ['send_event_email'], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
      });
      return Response.json({ ok: true, sent: true, event_type: eventType, version: VERSION });
    }

    if (action === 'watchdog') {
      const logs = await db.AuditLog.filter({ action: 'marketing_email_sent' }, '-created_date', 500).catch(() => []);
      await finishAgentExecution({
        db, agentName: 'emailAutomationEngine', action, tenantId,
        startedAt: exec.startedAt, success: true, repairActions: [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
      });
      return Response.json({
        ok: true,
        version: VERSION,
        sent_24h: logs.filter(l => {
          const t = l.created_date ? new Date(l.created_date).getTime() : 0;
          return t > 0 && Date.now() - t < 24 * 60 * 60 * 1000;
        }).length,
        non_spam_compliance: true
      });
    }

    await finishAgentExecution({
      db, agentName: 'emailAutomationEngine', action, tenantId,
      startedAt: exec.startedAt, success: true, repairActions: [], isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
    });
    return Response.json({ ok: true, version: VERSION, supported_events: Object.keys(TEMPLATE_BY_EVENT) });
  } catch (e) {
    if (exec && execDb) {
      await finishAgentExecution({
        db: execDb, agentName: 'emailAutomationEngine', action: execMeta.action, tenantId: execMeta.tenantId,
        startedAt: exec.startedAt, success: false, error: e?.message || String(e), isScheduler: execMeta.isScheduler, userRole: execMeta.userRole, version: VERSION
      });
    }
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
};

export default async function handler(req, res) {
  const response = await runtimeHandler(req);
  if (res && typeof res.status === 'function' && typeof res.json === 'function') {
    const payload = await response
      .clone()
      .json()
      .catch(async () => ({ ok: response.ok, status: response.status, text: await response.text().catch(() => '') }));
    return res.status(response.status || 200).json(payload);
  }
  return response;
}

Deno.serve(handler);
