/**
 * agentRuntime
 * Shared production hardening guardrails for autonomous agents.
 * Core guardian/watchdog runtime safety layer.
 */

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function coerceTenantId(input) {
  if (!input) return null;
  return typeof input === 'string' ? input : String(input);
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function writeExecutionLog(db, entry) {
  try {
    if (db?.AgentExecutionLog?.create) {
      await db.AgentExecutionLog.create(entry);
      return;
    }
  } catch {
    // Fallback below
  }

  await db?.AuditLog?.create({
    tenant_id: entry.tenant_id || 'system',
    action: 'agent_execution',
    entity_type: 'Agent',
    entity_id: entry.agent_name,
    performed_by: 'system',
    description: `${entry.agent_name} ${entry.status}${entry.action ? ` (${entry.action})` : ''}`,
    category: 'automation',
    severity: entry.status === 'success' ? 'low' : 'medium',
    metadata: entry
  }).catch(() => {});
}

async function recentFailureCount(db, agentName, tenantId, windowMs) {
  const since = Date.now() - windowMs;
  const logs = await db?.AuditLog?.filter({
    action: 'agent_execution',
    entity_id: agentName
  }, '-created_date', 200).catch(() => []);

  return (logs || []).filter((l) => {
    if (tenantId && l.tenant_id && l.tenant_id !== tenantId) return false;
    const t = l.created_date ? new Date(l.created_date).getTime() : 0;
    if (!t || t < since) return false;
    return (l.metadata?.status || '').toLowerCase() === 'failure';
  }).length;
}

async function recentExecutionCount(db, agentName, tenantId, windowMs) {
  const since = Date.now() - windowMs;
  const logs = await db?.AuditLog?.filter({
    action: 'agent_execution',
    entity_id: agentName
  }, '-created_date', 200).catch(() => []);

  return (logs || []).filter((l) => {
    if (tenantId && l.tenant_id && l.tenant_id !== tenantId) return false;
    const t = l.created_date ? new Date(l.created_date).getTime() : 0;
    return !!t && t >= since;
  }).length;
}

export async function startAgentExecution({
  db,
  agentName,
  action,
  tenantId,
  userRole = null,
  isScheduler = false,
  policy = {}
}) {
  const startedAt = Date.now();
  const tid = coerceTenantId(tenantId);
  const windowMs = policy.window_ms || DEFAULT_WINDOW_MS;
  const maxExecutions = policy.max_executions_per_window || 20;
  const maxFailures = policy.max_failures_per_window || 10;

  const executions = await recentExecutionCount(db, agentName, tid, windowMs);
  if (executions >= maxExecutions) {
    await writeExecutionLog(db, {
      agent_name: agentName,
      action,
      status: 'blocked',
      block_reason: 'rate_limit',
      tenant_id: tid,
      started_at: nowIso(),
      finished_at: nowIso(),
      elapsed_ms: 0,
      is_scheduler: isScheduler,
      user_role: userRole,
      version: policy.version || 'unknown'
    });
    return { ok: false, blockReason: 'rate_limit', startedAt };
  }

  const failures = await recentFailureCount(db, agentName, tid, windowMs);
  if (failures >= maxFailures) {
    await writeExecutionLog(db, {
      agent_name: agentName,
      action,
      status: 'blocked',
      block_reason: 'circuit_open',
      tenant_id: tid,
      started_at: nowIso(),
      finished_at: nowIso(),
      elapsed_ms: 0,
      is_scheduler: isScheduler,
      user_role: userRole,
      version: policy.version || 'unknown'
    });
    return { ok: false, blockReason: 'circuit_open', startedAt };
  }

  await writeExecutionLog(db, {
    agent_name: agentName,
    action,
    status: 'started',
    tenant_id: tid,
    started_at: nowIso(),
    finished_at: null,
    elapsed_ms: 0,
    is_scheduler: isScheduler,
    user_role: userRole,
    version: policy.version || 'unknown'
  });

  return { ok: true, startedAt };
}

export async function finishAgentExecution({
  db,
  agentName,
  action,
  tenantId,
  startedAt,
  success,
  repairActions = [],
  error = null,
  isScheduler = false,
  userRole = null,
  version = 'unknown'
}) {
  await writeExecutionLog(db, {
    agent_name: agentName,
    action,
    status: success ? 'success' : 'failure',
    tenant_id: coerceTenantId(tenantId),
    started_at: new Date(startedAt).toISOString(),
    finished_at: nowIso(),
    elapsed_ms: Math.max(0, Date.now() - startedAt),
    repair_actions: repairActions,
    error: error ? String(error).slice(0, 500) : null,
    is_scheduler: isScheduler,
    user_role: userRole,
    version
  });
}

export function ensureTenantIsolation({ tenantId, allowSystem = false }) {
  const tid = coerceTenantId(tenantId);
  if (!tid && !allowSystem) {
    return { ok: false, error: 'tenant_id required for isolated execution' };
  }
  return { ok: true, tenantId: tid };
}

export function allowRole(role, allowed = ['admin', 'owner']) {
  const r = (role || '').toLowerCase();
  return allowed.includes(r);
}

export class AgentRuntimeGuards {
  static async start(ctx) {
    return startAgentExecution(ctx);
  }

  static async finish(ctx) {
    return finishAgentExecution(ctx);
  }

  static enforceTenant(ctx) {
    return ensureTenantIsolation(ctx);
  }

  static roleAllowed(role, allowed) {
    return allowRole(role, allowed);
  }
}
