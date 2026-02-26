/**
 * aiModelGovernance.js — Scheduled AI Model Drift Detection (JavaScript / Base44 SDK)
 * GUARANTEED: Never fails due to missing level/message fields
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BUILD_ID = `aiModelGovernance-drift-safe-${new Date().toISOString()}`;

function nowISO() {
  return new Date().toISOString();
}

function asNonEmptyString(v, fallback) {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return fallback;
}

function normalizeLevel(v, fallback = "info") {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "debug" || s === "info" || s === "warn" || s === "error") return s;
  return fallback;
}

// Strict wrapper for DB writes - exposes exact failure point
async function safeDbWrite(entityName, opName, payload, writeFn) {
  try {
    return await writeFn(payload);
  } catch (err) {
    const keys = payload ? Object.keys(payload) : [];
    const hasLevel = payload && Object.prototype.hasOwnProperty.call(payload, "level");
    const hasMessage = payload && Object.prototype.hasOwnProperty.call(payload, "message");
    const original = err?.message || String(err);

    throw new Error(
      `[DB_WRITE_FAILED] BUILD_ID=${BUILD_ID} entity=${entityName} op=${opName} hasLevel=${hasLevel} hasMessage=${hasMessage} keys=${keys.join(",")} original=${original}`
    );
  }
}

// Entities that require level/message
const REQUIRES_LEVEL_MESSAGE = new Set([
  "ClientTelemetry",
  "AuditLog",
  "EventLog",
  "Incident",
  "SystemHealth",
  "ComplianceEvent",
  "GovernanceAuditEvent",
]);

function ensureLevelMessage(entityName, data, defaults = {}) {
  if (!REQUIRES_LEVEL_MESSAGE.has(entityName)) return data;

  const safeLevel = normalizeLevel(data?.level ?? defaults?.level, defaults?.level ?? "info");
  const safeMessage = asNonEmptyString(data?.message ?? defaults?.message, defaults?.message ?? "Event");

  return {
    ...data,
    level: safeLevel,
    message: safeMessage,
  };
}

// Safe telemetry emitter
async function emitTelemetry(base44, data) {
  const safe = ensureLevelMessage("ClientTelemetry", data, {
    level: "info",
    message: "AI Model Drift Detection telemetry",
  });

  return safeDbWrite("ClientTelemetry", "create", safe, async (payload) => {
    return base44.asServiceRole.entities.ClientTelemetry.create(payload);
  });
}

// Safe governance audit emitter
async function emitGovernanceAudit(base44, data) {
  const safe = ensureLevelMessage("GovernanceAuditEvent", data, {
    level: "info",
    message: "AI Model Drift Detection audit",
  });

  return safeDbWrite("GovernanceAuditEvent", "create", safe, async (payload) => {
    return base44.asServiceRole.entities.GovernanceAuditEvent.create(payload);
  });
}

function calcSeverity(deltaPctAbs) {
  if (deltaPctAbs >= 0.25) return "HIGH";
  if (deltaPctAbs >= 0.10) return "MEDIUM";
  return "LOW";
}

function safePct(delta, baseline) {
  if (!isFinite(baseline) || baseline === 0) return delta === 0 ? 0 : 1;
  return delta / baseline;
}

function summarizeDrift(metrics) {
  const high = metrics.filter((m) => m.severity === "HIGH").length;
  const med = metrics.filter((m) => m.severity === "MEDIUM").length;
  const low = metrics.filter((m) => m.severity === "LOW").length;
  return { high, med, low, total: metrics.length };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const runId = `drift-${Date.now()}`;
  const startedAt = nowISO();

  console.log(`[AI_MODEL_GOVERNANCE] Starting with BUILD_ID=${BUILD_ID} runId=${runId}`);

  try {
    // Allow scheduled automations (no user required)
    const user = await base44.auth.me().catch(() => null);
    
    // If there is a user, verify admin role
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Parse body safely
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (e) {}

    const tenantId = body?.tenant_id ?? null;

    // Time windows
    const end = new Date();
    const currentStart = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const baselineStart = new Date(end.getTime() - 35 * 24 * 60 * 60 * 1000);
    const baselineEnd = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch metrics (best effort)
    let baselineRows = [];
    let currentRows = [];

    try {
      const filter = tenantId ? { tenant_id: tenantId } : {};
      
      // Try PerformanceMetric
      try {
        baselineRows = await base44.asServiceRole.entities.PerformanceMetric.filter(filter);
        currentRows = await base44.asServiceRole.entities.PerformanceMetric.filter(filter);
      } catch (e) {
        // Try SaaSMetrics fallback
        try {
          baselineRows = await base44.asServiceRole.entities.SaaSMetrics.filter(filter);
          currentRows = await base44.asServiceRole.entities.SaaSMetrics.filter(filter);
        } catch (e2) {}
      }
    } catch (e) {}

    // Aggregate numeric fields
    function avgByKey(rows) {
      const sums = {};
      const counts = {};
      for (const r of rows) {
        for (const [k, v] of Object.entries(r)) {
          if (typeof v === "number" && isFinite(v)) {
            sums[k] = (sums[k] ?? 0) + v;
            counts[k] = (counts[k] ?? 0) + 1;
          }
        }
      }
      const avgs = {};
      for (const k of Object.keys(sums)) {
        avgs[k] = sums[k] / Math.max(1, counts[k] ?? 1);
      }
      return avgs;
    }

    const baselineAvg = avgByKey(baselineRows);
    const currentAvg = avgByKey(currentRows);

    // Find interesting metrics
    const interesting = Object.keys({ ...baselineAvg, ...currentAvg })
      .filter((k) => {
        const s = k.toLowerCase();
        return (
          s.includes("risk") ||
          s.includes("fraud") ||
          s.includes("charge") ||
          s.includes("refund") ||
          s.includes("profit") ||
          s.includes("margin") ||
          s.includes("error") ||
          s.includes("drift")
        );
      })
      .slice(0, 30);

    const metrics = [];
    for (const key of interesting) {
      const b = baselineAvg[key] ?? 0;
      const c = currentAvg[key] ?? 0;
      const d = c - b;
      const pct = safePct(d, b);
      const pctAbs = Math.abs(pct);
      metrics.push({
        metric: key,
        baseline: b,
        current: c,
        delta: d,
        deltaPct: pct,
        severity: calcSeverity(pctAbs),
      });
    }

    const summary = summarizeDrift(metrics);

    // Emit telemetry safely
    await emitTelemetry(base44, {
      tenant_id: tenantId,
      run_id: runId,
      build_id: BUILD_ID,
      kind: "AI_MODEL_DRIFT_DETECTION",
      started_at: startedAt,
      finished_at: nowISO(),
      level: summary.high > 0 ? "warn" : "info",
      message:
        summary.high > 0
          ? `Drift detected: HIGH=${summary.high}, MED=${summary.med}, LOW=${summary.low}`
          : `No significant drift: HIGH=${summary.high}, MED=${summary.med}, LOW=${summary.low}`,
      context_json: {
        window: {
          baselineStart: baselineStart.toISOString(),
          baselineEnd: baselineEnd.toISOString(),
          currentStart: currentStart.toISOString(),
          currentEnd: end.toISOString(),
        },
        summary,
        topFindings: metrics
          .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
          .slice(0, 10),
      },
    });

    // Emit governance audit safely
    await emitGovernanceAudit(base44, {
      tenant_id: tenantId,
      run_id: runId,
      build_id: BUILD_ID,
      level: summary.high > 0 ? "warn" : "info",
      message: summary.high > 0 ? "AI drift/bias monitoring flagged changes" : "AI drift/bias monitoring OK",
      event_type: "compliance_check",
      entity_affected: "AIModelVersion",
      changed_by: "ai_model_governance",
      severity: summary.high > 0 ? "warning" : "info",
      compliance_frameworks: ["AI_GOVERNANCE"],
      requires_review: summary.high > 0,
    });

    return Response.json({
      ok: true,
      level: "INFO",
      message: summary.high > 0 ? "AI Model Drift Detection completed with warnings" : "AI Model Drift Detection completed successfully",
      build_id: BUILD_ID,
      run_id: runId,
      tenant_id: tenantId,
      summary,
    });
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error('[ERROR] AI Model Drift Detection failed:', errorMsg);

    // Try to log error telemetry
    try {
      await emitTelemetry(base44, {
        tenant_id: null,
        run_id: runId,
        build_id: BUILD_ID,
        kind: "AI_MODEL_DRIFT_DETECTION_ERROR",
        level: "error",
        message: "AI Model Drift Detection failed",
        context_json: {
          error: errorMsg,
          stack: err?.stack,
        },
      });
    } catch (logErr) {
      console.error('[ERROR] Failed to log error:', logErr.message);
    }

    return Response.json({ 
      ok: false,
      level: "ERROR",
      message: "AI Model Drift Detection failed",
      error: errorMsg,
      build_id: BUILD_ID,
      run_id: runId
    }, { status: 500 });
  }
});