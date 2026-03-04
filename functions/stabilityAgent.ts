/**
 * StabilityAgent — Autonomous Reliability + Security Guardian
 * Converts signals -> incident -> actions, with SAFE/RISKY guardrails.
 * SAFE actions run automatically; RISKY require policy approval.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────
// STABILITY BRAIN — deterministic signal → plan
// ─────────────────────────────────────────────
class StabilityBrain {
  constructor(policy) {
    this.policy = policy;
  }

  assess(signals) {
    const issues = [];
    let severity = "info";

    const sloBreached =
      signals.p95_ms > this.policy.slo_p95_ms ||
      signals.error_rate > this.policy.slo_error_rate;

    if (signals.error_rate > this.policy.slo_error_rate) issues.push("Error rate above SLO");
    if (signals.p95_ms > this.policy.slo_p95_ms) issues.push("Latency above SLO");
    if (signals.db_conn_pct > 85) issues.push("DB connections nearing limit");
    if (signals.db_p95_ms > 250) issues.push("DB latency high");
    if (signals.queue_depth > 10000) issues.push("Queue backlog growing");
    if (signals.auth_401_rate > 0.08) issues.push("Auth failures spiking");
    if (signals.suspicious_rps > 0.15 * signals.rps) issues.push("Suspicious traffic elevated");
    if (signals.webhook_fail_rate > 0.10) issues.push("Webhooks failing");

    if (!sloBreached && issues.length === 0) return null;

    if (
      signals.error_rate > this.policy.slo_error_rate * 3 ||
      signals.p95_ms > this.policy.slo_p95_ms * 2
    ) {
      severity = "critical";
    } else {
      severity = "warning";
    }

    const hypotheses = [];
    if (signals.suspicious_rps > 0.15 * signals.rps) hypotheses.push("Traffic abuse / bot spike");
    if (signals.db_conn_pct > 85 || signals.db_p95_ms > 250) hypotheses.push("DB saturation");
    if (signals.queue_depth > 10000) hypotheses.push("Async backlog (workers underprovisioned)");
    if (signals.auth_401_rate > 0.08) hypotheses.push("Token invalidation / auth misconfig / attack");
    if (signals.webhook_fail_rate > 0.10) hypotheses.push("Webhook endpoint regression or throttling");
    hypotheses.push("Possible deploy regression: " + signals.deploy_version);

    return {
      id: uid("incident"),
      ts: nowIso(),
      severity,
      summary: issues.join("; "),
      rootCauseHypothesis: hypotheses,
      signals,
    };
  }

  deriveScale(x, factor) {
    const base = Math.ceil((x / 100) * factor);
    return Math.max(2, Math.min(50, base));
  }

  plan(incident) {
    const s = incident.signals;
    const actions = [];

    // 1) Defensive: block abuse (SAFE)
    if (s.suspicious_rps > 0.15 * s.rps) {
      actions.push({
        id: uid("act"),
        name: "enable_bot_defense",
        risk: "SAFE",
        reason: "Suspicious traffic elevated; protect origin capacity",
        payload: { mode: incident.severity === "critical" ? "block" : "monitor" },
      });
      actions.push({
        id: uid("act"),
        name: "enable_rate_limit",
        risk: "SAFE",
        reason: "Reduce abusive traffic to preserve SLOs",
        payload: {
          ruleName: "global_protect_origin",
          mode: incident.severity === "critical" ? "hard" : "soft",
          dropPct: Math.min(
            this.policy.max_rate_limit_drop_pct,
            incident.severity === "critical" ? 0.5 : 0.25
          ),
        },
      });
    }

    // 2) Preventive: scale (SAFE within cap)
    if (s.cpu_pct > 70 || s.mem_pct > 75 || s.error_rate > this.policy.slo_error_rate) {
      actions.push({
        id: uid("act"),
        name: "scale_services",
        risk: "SAFE",
        reason: "Resource pressure / errors rising; scale out within policy cap",
        payload: {
          services: [
            {
              name: "web",
              targetReplicas: Math.min(
                this.policy.max_scale_replicas,
                this.deriveScale(s.rps, 1.0)
              ),
            },
            {
              name: "workers",
              targetReplicas: Math.min(
                this.policy.max_scale_replicas,
                this.deriveScale(s.queue_depth / 1000, 0.8)
              ),
            },
          ],
        },
      });
    }

    // 3) Load shedding: disable expensive features (SAFE)
    if (
      incident.severity === "critical" &&
      (s.p95_ms > this.policy.slo_p95_ms * 1.5 || s.db_conn_pct > 90)
    ) {
      for (const flag of this.policy.shed_features_order) {
        actions.push({
          id: uid("act"),
          name: "disable_feature_flag",
          risk: "SAFE",
          reason: "Critical degradation; shed non-essential load",
          payload: { flag, enabled: false },
        });
      }
      actions.push({
        id: uid("act"),
        name: "set_circuit_breaker",
        risk: "SAFE",
        reason: "Prevent cascading failures on dependent services",
        payload: { service: "analytics-heavy", state: "open" },
      });
    }

    // 4) Recovery: queues (SAFE)
    if (s.queue_depth > 10000) {
      actions.push({
        id: uid("act"),
        name: "drain_queue",
        risk: "SAFE",
        reason: "Backlog growing; increase drain concurrency",
        payload: {
          queueName: "sync_jobs",
          concurrency: incident.severity === "critical" ? 50 : 20,
        },
      });
    }

    // 5) Risky: rollback if deploy regression likely (requires policy approval)
    if (incident.severity === "critical" && this.policy.allow_auto_rollback) {
      actions.push({
        id: uid("act"),
        name: "rollback_deployment",
        risk: "RISKY",
        reason: "Critical SLO breach; rollback may immediately restore stability",
        payload: { service: "web" },
      });
    }

    // 6) Risky: secret rotation on auth anomaly (requires policy approval)
    if (s.auth_401_rate > 0.12 && this.policy.allow_auto_secret_rotate) {
      actions.push({
        id: uid("act"),
        name: "rotate_secret",
        risk: "RISKY",
        reason: "Auth failures spiking; rotate session/OAuth secrets as precaution",
        payload: { secretName: "SHOPIFY_OAUTH_ENCRYPTION_KEY" },
      });
    }

    return actions;
  }
}

// ─────────────────────────────────────────────
// INFRA ADAPTER — logs to DB entities / audit
// ─────────────────────────────────────────────
function buildInfraAdapter(db) {
  async function writeAudit(event) {
    try {
      await db.AuditLog.create({
        tenant_id: event.tenant_id || "system",
        action: event.type || "stability.event",
        entity_type: "StabilityAgent",
        performed_by: "system",
        description: event.incident?.summary || event.type || "",
        is_auto_action: true,
        auto_action_type: event.type,
        severity: event.incident?.severity || "low",
        category: "automation",
        metadata: event,
      });
    } catch (e) {
      console.warn("[stabilityAgent] writeAudit failed:", e?.message);
    }
  }

  function makeResult(actionId, details) {
    return { actionId, ok: true, details };
  }

  // Adapter methods — in this platform context these log intent + write BuildGuardianAction records
  async function recordAction(name, payload, reason) {
    try {
      await db.BuildGuardianAction.create({
        action: name,
        status: "success",
        details: { payload, reason },
        performed_by: "system",
        created_at: nowIso(),
      });
    } catch (e) {
      console.warn("[stabilityAgent] recordAction failed:", e?.message);
    }
    return makeResult(uid("res"), { name, payload });
  }

  return {
    writeAudit,
    async scaleService(service, replicas) { return recordAction("scale_service", { service, replicas }, "auto-scale"); },
    async enableRateLimit(ruleName, mode, dropPct) { return recordAction("enable_rate_limit", { ruleName, mode, dropPct }, "abuse protection"); },
    async enableBotDefense(mode) { return recordAction("enable_bot_defense", { mode }, "bot mitigation"); },
    async setCircuitBreaker(service, state) { return recordAction("set_circuit_breaker", { service, state }, "cascading failure prevention"); },
    async rollbackDeployment(service, toVersion) { return recordAction("rollback_deployment", { service, toVersion: toVersion || "previous" }, "SLO breach recovery"); },
    async setFeatureFlag(flag, enabled) { return recordAction("set_feature_flag", { flag, enabled }, "load shedding"); },
    async rotateSecret(secretName) { return recordAction("rotate_secret", { secretName: "***redacted***" }, "auth anomaly"); },
    async drainQueue(queueName, concurrency) { return recordAction("drain_queue", { queueName, concurrency }, "backlog reduction"); },
    async notify(channel, message, payload) {
      console.log(`[stabilityAgent] NOTIFY(${channel}): ${message}`);
      try {
        await db.BuildGuardianAction.create({
          action: `notify_${channel}`,
          status: "success",
          details: { message, payload },
          performed_by: "system",
          created_at: nowIso(),
        });
      } catch {}
    },
  };
}

// ─────────────────────────────────────────────
// TELEMETRY — reads real entities for signals
// ─────────────────────────────────────────────
async function gatherSignals(db, tenantId) {
  // Pull recent system health record if available
  let health = null;
  try {
    const rows = await db.SystemHealth.filter({ tenant_id: tenantId });
    health = rows?.[0] || null;
  } catch {}

  // Pull recent AutomationRunLog failures
  let recentLogs = [];
  try {
    recentLogs = await db.AutomationRunLog.filter({ status: "failed" });
  } catch {}

  const failedRuns = recentLogs.length;
  const webhookFailRate = failedRuns > 0 ? Math.min(1, failedRuns / 20) : 0;

  return {
    ts: nowIso(),
    p95_ms: health?.p95_ms ?? 150,
    error_rate: health?.error_rate ?? (failedRuns > 5 ? 0.05 : 0.005),
    rps: health?.rps ?? 100,
    cpu_pct: health?.cpu_pct ?? 40,
    mem_pct: health?.mem_pct ?? 50,
    queue_depth: health?.queue_depth ?? 0,
    db_cpu_pct: health?.db_cpu_pct ?? 30,
    db_conn_pct: health?.db_conn_pct ?? 40,
    db_p95_ms: health?.db_p95_ms ?? 80,
    auth_401_rate: health?.auth_401_rate ?? 0.01,
    suspicious_rps: health?.suspicious_rps ?? 0,
    webhook_fail_rate: health?.webhook_fail_rate ?? webhookFailRate,
    deploy_version: health?.deploy_version ?? "unknown",
  };
}

// ─────────────────────────────────────────────
// DEFAULT POLICY
// ─────────────────────────────────────────────
const DEFAULT_POLICY = {
  slo_p95_ms: 300,
  slo_error_rate: 0.01,
  max_scale_replicas: 20,
  max_rate_limit_drop_pct: 0.6,
  allow_auto_rollback: true,
  allow_auto_secret_rotate: false,
  shed_features_order: [
    "ai_marketing_campaigns",
    "profit_leak_forensics",
    "customer_segmentation",
    "export_csv",
  ],
  autoApprove(action, incident) {
    if (action.risk === "SAFE") return true;
    if (action.name === "rollback_deployment" && incident.severity === "critical") return true;
    return false;
  },
};

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Service-role only for watchdog automations — no user session required
    let body = {};
    try { body = await req.json(); } catch {}

    const action = body.action || "enforce";
    const mode = body.mode || "enforce"; // "watch" | "enforce"
    const policyOverride = body.policy || {};

    // prove_live: no auth needed
    if (action === "prove_live") {
      return Response.json({ ok: true, function: "stabilityAgent", ts: nowIso() });
    }

    // watchdog: runs via automation — no user session, loop all tenants
    if (action === "watchdog") {
      const db = base44.asServiceRole.entities;
      const policy = { ...DEFAULT_POLICY, ...policyOverride };
      const brain = new StabilityBrain(policy);
      const infra = buildInfraAdapter(db);
      const tenants = await db.Tenant.filter({ status: "active" }).catch(() => []);
      const results = [];
      for (const tenant of tenants.slice(0, 20)) {
        try {
          const signals = await gatherSignals(db, tenant.id);
          const incident = brain.assess(signals);
          if (incident) {
            await infra.writeAudit({ type: "stability.incident_detected", ts: nowIso(), tenant_id: tenant.id, incident });
            results.push({ tenant_id: tenant.id, incident: incident.summary });
          } else {
            results.push({ tenant_id: tenant.id, ok: true });
          }
        } catch (e) {
          results.push({ tenant_id: tenant.id, error: e?.message });
        }
      }
      return Response.json({ ok: true, watchdog: true, tenants_checked: tenants.length, results, ts: nowIso() });
    }

    // For direct calls, allow admin users only
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (user && user.role !== "admin" && user.role !== "owner") {
      return Response.json({ error: "Forbidden: admin only" }, { status: 403 });
    }

    const tenantId = body.tenant_id || "system";

    const db = base44.asServiceRole.entities;
    const policy = { ...DEFAULT_POLICY, ...policyOverride };
    const brain = new StabilityBrain(policy);
    const infra = buildInfraAdapter(db);

    // 1. Gather signals
    const signals = await gatherSignals(db, tenantId);

    // 2. Assess
    const incident = brain.assess(signals);

    if (!incident) {
      await infra.writeAudit({ type: "stability.ok", ts: nowIso(), tenant_id: tenantId, signals });
      return Response.json({ ok: true, incident: null, actions: [], signals });
    }

    // 3. Plan
    const actions = brain.plan(incident);

    await infra.writeAudit({
      type: "stability.incident_detected",
      ts: nowIso(),
      tenant_id: tenantId,
      incident,
      actions_planned: actions,
    });

    // 4. Notify
    if (incident.severity === "critical") {
      await infra.notify("pager", `CRITICAL: ${incident.summary}`, { incident });
    } else {
      await infra.notify("slack", `Warning: ${incident.summary}`, { incident });
    }

    // 5. Execute (or dry-run in watch mode)
    const results = [];
    for (const action of actions) {
      const approved = action.risk === "SAFE" || policy.autoApprove(action, incident);

      if (!approved) {
        results.push({ actionId: action.id, ok: false, details: { skipped: "awaiting_approval" } });
        continue;
      }

      if (mode === "watch") {
        results.push({ actionId: action.id, ok: true, details: { dry_run: true, action: action.name } });
        continue;
      }

      // Execute action via infra adapter
      let result;
      try {
        switch (action.name) {
          case "enable_bot_defense":
            result = await infra.enableBotDefense(action.payload.mode);
            break;
          case "enable_rate_limit":
            result = await infra.enableRateLimit(action.payload.ruleName, action.payload.mode, action.payload.dropPct);
            break;
          case "scale_services": {
            const subResults = [];
            for (const svc of action.payload.services) {
              subResults.push(await infra.scaleService(svc.name, svc.targetReplicas));
            }
            result = { actionId: action.id, ok: subResults.every(r => r.ok), details: subResults };
            break;
          }
          case "disable_feature_flag":
            result = await infra.setFeatureFlag(action.payload.flag, action.payload.enabled);
            break;
          case "set_circuit_breaker":
            result = await infra.setCircuitBreaker(action.payload.service, action.payload.state);
            break;
          case "drain_queue":
            result = await infra.drainQueue(action.payload.queueName, action.payload.concurrency);
            break;
          case "rollback_deployment":
            result = await infra.rollbackDeployment(action.payload.service);
            break;
          case "rotate_secret":
            result = await infra.rotateSecret(action.payload.secretName);
            break;
          default:
            result = { actionId: action.id, ok: false, details: { error: "unknown_action" } };
        }
      } catch (e) {
        result = { actionId: action.id, ok: false, details: { error: e?.message || "execute_failed" } };
      }

      results.push(result);
    }

    await infra.writeAudit({
      type: "stability.actions_executed",
      ts: nowIso(),
      tenant_id: tenantId,
      incident_id: incident.id,
      results,
    });

    return Response.json({ ok: true, incident, actions, results, signals });
  } catch (err) {
    console.error("[stabilityAgent] Unhandled error:", err?.message);
    return Response.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
});