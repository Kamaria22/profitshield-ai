/**
 * autonomousOpsRollout
 * Phase 1 (observe-only): scheduled watchdog telemetry orchestration.
 * No autonomous healing and no patch application.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { startAgentExecution, finishAgentExecution } from './helpers/agentRuntime.ts';

const VERSION = 'autonomousOpsRollout_v2026_03_07_phase1';
const AGENT_NAME = 'autonomousOpsRollout';

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
  const role = (req.headers.get('x-user-role') || '').toLowerCase() || null;
  const isScheduler = true;

  let exec = null;
  try {
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

    if (action !== 'observe_tick') {
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
    const calls = await Promise.all([
      invokeSafe(base44, 'supportGuardian', { action: 'run_watchdog', observe_only: true, mode: 'observe' }),
      invokeSafe(base44, 'shopifyConnectionWatchdog', { observe_only: true, mode: 'observe' }),
      invokeSafe(base44, 'stabilityAgent', { action: 'watchdog', mode: 'watch', observe_only: true }),
    ]);

    const summary = {
      version: VERSION,
      mode: 'observe_only',
      started_at,
      finished_at: new Date().toISOString(),
      checks: calls.map((c) => ({
        fn: c.fn,
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
      description: `Observe-only tick complete: ${summary.checks.filter((c) => c.ok).length}/${summary.checks.length} checks ok`,
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
