/**
 * autonomousOpsRollout
 * Phase 1 (observe-only): scheduled watchdog telemetry orchestration.
 * Phase 2 (safe subset): bounded queue retry + stale cleanup + webhook reconcile.
 * No patch generation and no patch auto-apply.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import {
  startAgentExecution,
  finishAgentExecution,
  allowRole,
  ensureTenantIsolation
} from './helpers/agentRuntime.ts';

const VERSION = 'autonomousOpsRollout_v2026_03_07_phase2';
const AGENT_NAME = 'autonomousOpsRollout';
const MAX_TENANTS_PER_RUN = 5;
const MAX_ACTIONS_PER_RUN = 20;

async function invokeSafe(base44, fn, payload) {
  try {
    const response = await base44.functions.invoke(fn, payload);
    return { ok: true, fn, data: response?.data || response || null };
  } catch (error) {
    return { ok: false, fn, error: error?.message || String(error) };
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  const body = await req.json().catch(() => ({}));
  const action = body.action || 'observe_tick';
  let user = null;
  try { user = await base44.auth.me(); } catch {}
  const role = (user?.role || user?.app_role || req.headers.get('x-user-role') || '').toLowerCase() || null;
  const isScheduler = !user;

  let exec = null;
  try {
    if (user && !allowRole(role, ['owner', 'admin'])) {
      return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    exec = await startAgentExecution({
      db,
      agentName: AGENT_NAME,
      action,
      tenantId: null,
      userRole: role,
      isScheduler,
      policy: {
        window_ms: 5 * 60 * 1000,
        max_executions_per_window: 12,
        max_failures_per_window: 6,
        version: VERSION
      }
    });

    if (!exec?.ok) {
      return Response.json(
        { ok: false, blocked: true, reason: exec?.blockReason || 'guard_blocked', version: VERSION },
        { status: 429 }
      );
    }

    if (!['observe_tick', 'safe_heal_tick'].includes(action)) {
      await finishAgentExecution({
        db,
        agentName: AGENT_NAME,
        action,
        tenantId: null,
        startedAt: exec.startedAt,
        success: false,
        error: 'invalid_action',
        isScheduler,
        userRole: role,
        version: VERSION
      });
      return Response.json({ ok: false, error: 'invalid_action', version: VERSION }, { status: 400 });
    }

    const started_at = new Date().toISOString();
    const calls = [];
    let actionsUsed = 0;

    if (action === 'observe_tick') {
      const observeCalls = await Promise.all([
        invokeSafe(base44, 'supportGuardian', { action: 'run_watchdog', observe_only: true, mode: 'observe' }),
        invokeSafe(base44, 'shopifyConnectionWatchdog', { observe_only: true, mode: 'observe' }),
        invokeSafe(base44, 'stabilityAgent', { action: 'watchdog', mode: 'watch', observe_only: true }),
      ]);
      calls.push(...observeCalls);
      actionsUsed += observeCalls.length;
    }

    if (action === 'safe_heal_tick') {
      // 1) Safe queue retry/drain (bounded by processWebhookQueue internal batch size)
      const queueRun = await invokeSafe(base44, 'processWebhookQueue', {});
      calls.push(queueRun);
      actionsUsed += 1;

      // 2) Tenant-bounded stale cleanup + webhook reconcile (non-destructive subset)
      const tenants = await db.Tenant.filter({ status: 'active' }, '-created_date', MAX_TENANTS_PER_RUN).catch(() => []);
      for (const tenant of tenants) {
        if (actionsUsed >= MAX_ACTIONS_PER_RUN) break;
        const tenantId = tenant?.id || null;
        const isolated = ensureTenantIsolation({ tenantId, allowSystem: false });
        if (!isolated.ok) {
          calls.push({ ok: false, fn: 'tenant_isolation', error: isolated.error, tenant_id: tenantId });
          actionsUsed += 1;
          continue;
        }

        const staleCleanup = await invokeSafe(base44, 'supportGuardian', {
          action: 'run_watchdog',
          tenant_id: tenantId,
          observe_only: false
        });
        calls.push({ ...staleCleanup, tenant_id: tenantId, op: 'stale_cleanup' });
        actionsUsed += 1;
        if (actionsUsed >= MAX_ACTIONS_PER_RUN) break;

        const reconcile = await invokeSafe(base44, 'shopifyConnectionManager', {
          action: 'reconcile_webhooks',
          tenant_id: tenantId
        });
        calls.push({ ...reconcile, tenant_id: tenantId, op: 'webhook_reconcile' });
        actionsUsed += 1;
      }
    }

    const summary = {
      version: VERSION,
      mode: action === 'observe_tick' ? 'observe_only' : 'safe_auto_heal_subset',
      started_at,
      finished_at: new Date().toISOString(),
      limits: {
        max_tenants_per_run: MAX_TENANTS_PER_RUN,
        max_actions_per_run: MAX_ACTIONS_PER_RUN,
      },
      actions_used: actionsUsed,
      checks: calls.map((c) => ({
        fn: c.fn,
        tenant_id: c.tenant_id || null,
        op: c.op || null,
        ok: c.ok,
        error: c.ok ? null : c.error
      })),
    };
    summary.ok = summary.checks.every((c) => c.ok);

    await db.AuditLog.create({
      tenant_id: 'system',
      action: 'autonomous_ops_observe_tick',
      entity_type: 'autonomous_ops',
      entity_id: AGENT_NAME,
      performed_by: 'system',
      description: `${summary.mode} tick complete: ${summary.checks.filter((c) => c.ok).length}/${summary.checks.length} checks ok`,
      category: 'automation',
      severity: summary.ok ? 'low' : 'medium',
      metadata: summary
    }).catch(() => {});

    await finishAgentExecution({
      db,
      agentName: AGENT_NAME,
      action,
      tenantId: null,
      startedAt: exec.startedAt,
      success: summary.ok,
      error: summary.ok ? null : 'one_or_more_watchdogs_failed',
      isScheduler,
      userRole: role,
      version: VERSION
    });

    return Response.json({ ok: true, ...summary });
  } catch (error) {
    if (exec?.ok) {
      await finishAgentExecution({
        db,
        agentName: AGENT_NAME,
        action: body.action || 'observe_tick',
        tenantId: null,
        startedAt: exec.startedAt,
        success: false,
        error: error?.message || String(error),
        isScheduler,
        userRole: role,
        version: VERSION
      });
    }
    return Response.json(
      { ok: false, version: VERSION, error: error?.message || String(error) },
      { status: 500 }
    );
  }
});
