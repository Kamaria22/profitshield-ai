/**
 * aiModelGovernance.ts — Scheduled AI Model Drift Detection (Robust / Non-breaking)
 *
 * Goals:
 * - Never fail a scheduled run due to missing required fields `level` and `message`
 * - Wrap all DB writes to expose the exact failing entity/op if any validation error occurs
 * - Produce a simple drift report (metric deltas vs baseline) and store telemetry/audit events safely
 *
 * NOTE:
 * - This file assumes Base44 provides a `db` client in context OR global `prisma`.
 * - If your environment uses `prisma`, this code will use it automatically.
 * - If your environment provides `ctx.db`, it will use that instead.
 */

type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";

type AnyObj = Record<string, any>;

const BUILD_ID = `aiModelGovernance-drift-safe-${new Date().toISOString()}`;

// ---- Helpers: time + safe strings ----
function nowISO() {
  return new Date().toISOString();
}

function asNonEmptyString(v: any, fallback: string) {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return fallback;
}

function normalizeLevel(v: any, fallback: Level = "INFO"): Level {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "DEBUG" || s === "INFO" || s === "WARN" || s === "ERROR") return s as Level;
  return fallback;
}

// ---- DB resolver (Base44 varies: prisma vs ctx.db) ----
function resolveDb(ctx?: AnyObj): AnyObj {
  // Prefer ctx.db if available, else global prisma if available
  const candidate = ctx?.db ?? (globalThis as any).prisma;
  if (!candidate) throw new Error(`[${BUILD_ID}] No db client found (expected ctx.db or global prisma).`);
  return candidate;
}

// ---- Strict wrapper for DB writes ----
async function safeDbWrite<T>(
  entityName: string,
  opName: "create" | "update" | "upsert" | "createMany" | "updateMany",
  payload: AnyObj,
  writeFn: (payload: AnyObj) => Promise<T>
): Promise<T> {
  try {
    return await writeFn(payload);
  } catch (err: any) {
    const keys = payload ? Object.keys(payload) : [];
    const hasLevel = payload && Object.prototype.hasOwnProperty.call(payload, "level");
    const hasMessage = payload && Object.prototype.hasOwnProperty.call(payload, "message");
    const original = err?.message || String(err);

    throw new Error(
      `[DB_WRITE_FAILED] BUILD_ID=${BUILD_ID} entity=${entityName} op=${opName} hasLevel=${hasLevel} hasMessage=${hasMessage} keys=${keys.join(
        ","
      )} original=${original}`
    );
  }
}

// ---- Entities known to require level/message in YOUR app based on logs ----
const REQUIRES_LEVEL_MESSAGE = new Set<string>([
  "ClientTelemetry",
  // Add any others that require level/message if your schema has them required:
  "AuditLog",
  "EventLog",
  "Incident",
  "SystemHealth",
  "ComplianceEvent",
  "GovernanceAuditEvent",
]);

function ensureLevelMessage(entityName: string, data: AnyObj, defaults?: { level?: Level; message?: string }) {
  if (!REQUIRES_LEVEL_MESSAGE.has(entityName)) return data;

  const safeLevel = normalizeLevel(data?.level ?? defaults?.level, defaults?.level ?? "INFO");
  const safeMessage = asNonEmptyString(data?.message ?? defaults?.message, defaults?.message ?? "Event");

  return {
    ...data,
    level: safeLevel,
    message: safeMessage,
  };
}

// ---- Safe telemetry/audit emitters ----
async function emitTelemetry(db: AnyObj, data: AnyObj) {
  // ClientTelemetry confirmed requires level + message
  const safe = ensureLevelMessage("ClientTelemetry", data, {
    level: "INFO",
    message: "AI Model Drift Detection telemetry",
  });

  // Many Base44 DB clients use: db.Entity.create({ data: {...} })
  return safeDbWrite("ClientTelemetry", "create", safe, async (payload) => {
    return db.ClientTelemetry.create({ data: payload });
  });
}

async function emitGovernanceAudit(db: AnyObj, data: AnyObj) {
  // If GovernanceAuditEvent requires level/message, ensure them; if it doesn't, this still passes them only if entity is in set.
  const safe = ensureLevelMessage("GovernanceAuditEvent", data, {
    level: "INFO",
    message: "AI Model Drift Detection audit",
  });

  return safeDbWrite("GovernanceAuditEvent", "create", safe, async (payload) => {
    return db.GovernanceAuditEvent.create({ data: payload });
  });
}

// ---- Drift calculation (simple but useful) ----
type DriftMetric = {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  deltaPct: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
};

function calcSeverity(deltaPctAbs: number): DriftMetric["severity"] {
  if (deltaPctAbs >= 0.25) return "HIGH";
  if (deltaPctAbs >= 0.10) return "MEDIUM";
  return "LOW";
}

function safePct(delta: number, baseline: number) {
  if (!isFinite(baseline) || baseline === 0) return delta === 0 ? 0 : 1;
  return delta / baseline;
}

function summarizeDrift(metrics: DriftMetric[]) {
  const high = metrics.filter((m) => m.severity === "HIGH").length;
  const med = metrics.filter((m) => m.severity === "MEDIUM").length;
  const low = metrics.filter((m) => m.severity === "LOW").length;
  return { high, med, low, total: metrics.length };
}

// ---- Main scheduled handler ----
// Base44 may call as (args) or (args, ctx). We support both.
export default async function aiModelGovernance(args: AnyObj = {}, ctx: AnyObj = {}) {
  const db = resolveDb(ctx);

  // Ensure function always logs its build so we can confirm scheduler runs the latest code.
  const runId = `drift-${Date.now()}`;
  const startedAt = nowISO();

  // IMPORTANT: never allow missing level/message writes to crash job
  try {
    // Discover tenant context (best effort)
    // If your scheduled job is per-tenant, you might pass tenant_id in args. If not, run global summary.
    const tenantId = args?.tenant_id ?? null;

    // Time windows: current = last 7 days; baseline = prior 28 days
    const end = new Date();
    const currentStart = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const baselineStart = new Date(end.getTime() - 35 * 24 * 60 * 60 * 1000);
    const baselineEnd = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Pull a few governance-relevant metrics from your existing tables (best effort).
    // We'll use PerformanceMetric if it exists; otherwise fall back to SaaSMetrics.
    let baselineRows: AnyObj[] = [];
    let currentRows: AnyObj[] = [];

    const whereTenant = tenantId ? { tenant_id: tenantId } : {};

    // Try PerformanceMetric first
    if (db.PerformanceMetric?.findMany) {
      baselineRows = await db.PerformanceMetric.findMany({
        where: {
          ...whereTenant,
          created_at: { gte: baselineStart.toISOString(), lt: baselineEnd.toISOString() },
        },
        take: 5000,
      });
      currentRows = await db.PerformanceMetric.findMany({
        where: {
          ...whereTenant,
          created_at: { gte: currentStart.toISOString(), lt: end.toISOString() },
        },
        take: 5000,
      });
    } else if (db.SaaSMetrics?.findMany) {
      baselineRows = await db.SaaSMetrics.findMany({
        where: {
          ...whereTenant,
          created_at: { gte: baselineStart.toISOString(), lt: baselineEnd.toISOString() },
        },
        take: 5000,
      });
      currentRows = await db.SaaSMetrics.findMany({
        where: {
          ...whereTenant,
          created_at: { gte: currentStart.toISOString(), lt: end.toISOString() },
        },
        take: 5000,
      });
    }

    // Aggregate: we'll look for numeric fields commonly present.
    // If your schema differs, this still works: it scans numeric keys and averages them.
    function avgByKey(rows: AnyObj[]) {
      const sums: Record<string, number> = {};
      const counts: Record<string, number> = {};
      for (const r of rows) {
        for (const [k, v] of Object.entries(r)) {
          if (typeof v === "number" && isFinite(v)) {
            sums[k] = (sums[k] ?? 0) + v;
            counts[k] = (counts[k] ?? 0) + 1;
          }
        }
      }
      const avgs: Record<string, number> = {};
      for (const k of Object.keys(sums)) {
        avgs[k] = sums[k] / Math.max(1, counts[k] ?? 1);
      }
      return avgs;
    }

    const baselineAvg = avgByKey(baselineRows);
    const currentAvg = avgByKey(currentRows);

    // Pick a short list of keys to evaluate (prioritize "risk", "fraud", "chargeback", "refund", "profit", "margin")
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

    const metrics: DriftMetric[] = [];
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

    // Always emit telemetry safely
    await emitTelemetry(db, {
      tenant_id: tenantId,
      run_id: runId,
      build_id: BUILD_ID,
      kind: "AI_MODEL_DRIFT_DETECTION",
      started_at: startedAt,
      finished_at: nowISO(),
      level: summary.high > 0 ? "WARN" : "INFO",
      message:
        summary.high > 0
          ? `Drift detected: HIGH=${summary.high}, MED=${summary.med}, LOW=${summary.low}`
          : `No significant drift: HIGH=${summary.high}, MED=${summary.med}, LOW=${summary.low}`,
      payload: {
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

    // Governance audit event (safe)
    await emitGovernanceAudit(db, {
      tenant_id: tenantId,
      run_id: runId,
      build_id: BUILD_ID,
      level: summary.high > 0 ? "WARN" : "INFO",
      message: summary.high > 0 ? "AI drift/bias monitoring flagged changes" : "AI drift/bias monitoring OK",
      details: {
        summary,
        metricsCount: metrics.length,
      },
      created_at: nowISO(),
    });

    // Return success (helps manual tests)
    return {
      ok: true,
      build_id: BUILD_ID,
      run_id: runId,
      tenant_id: tenantId,
      summary,
    };
  } catch (err: any) {
    // IMPORTANT: if we error, we still must not fail due to missing level/message on logging writes
    const errorMsg = err?.message || String(err);

    try {
      const db = resolveDb(ctx);
      await emitTelemetry(db, {
        tenant_id: args?.tenant_id ?? null,
        run_id: `drift-${Date.now()}`,
        build_id: BUILD_ID,
        kind: "AI_MODEL_DRIFT_DETECTION_ERROR",
        level: "ERROR",
        message: "AI Model Drift Detection failed",
        payload: {
          error: errorMsg,
          stack: err?.stack,
        },
        created_at: nowISO(),
      });
    } catch {
      // swallow secondary errors
    }

    // Return explicit error (not generic) so you can see BUILD_ID and cause
    throw new Error(`[${BUILD_ID}] AI Model Drift Detection failed: ${errorMsg}`);
  }
}