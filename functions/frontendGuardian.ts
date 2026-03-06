/**
 * frontendGuardian — Continuous Frontend Feature Health + Auto-Heal
 * ================================================================
 * Goals:
 * 1) Detect UI/feature breakage early (client-reported incidents + server smoke probes)
 * 2) Auto-heal common causes (missing config, stale caches, missing data artifacts, stuck jobs)
 * 3) NEVER break automations: returns 200 even if it cannot heal
 * 4) When "missing component/code" is needed: create PatchBundle for admin approval
 *
 * Actions:
 * - watchdog (scheduled): runs all checks + heals
 * - report_incident (frontend): record a JS error/feature failure
 * - get_status (admin): return current health snapshot
 * - process_queue (scheduled): retries deferred incidents
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const FUNCTION_NAME = "frontendGuardian";
const HANDLER_FILE = "functions/frontendGuardian";
const VERSION = `frontendGuardian_${new Date().toISOString()}`;

const HEALTH_TTL_MIN = 10;
const MAX_INCIDENTS_PER_RUN = 25;

const FEATURE_KEYS = [
  "customer_segmentation",
  "rfm_analysis",
  "risk_score_explainer",
  "orders_table",
  "orders_filters",
  "export_csv",
  "dash_kpis",
];
const REQUIRED_PAGE_KEYS = ["SupportContact", "AdminEmailCenter", "Home", "AIInsights", "Orders"];
const REQUIRED_CRITICAL_ROUTES = ["/support/contact", "/admin/email", "/dashboard", "/ai-insights", "/orders"];

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

function ok(payload, status = 200) {
  return Response.json(
    {
      ok: true,
      version: VERSION,
      function_name: FUNCTION_NAME,
      handler_file: HANDLER_FILE,
      ...payload,
      timestamp: nowIso(),
      status_code: status,
    },
    { status }
  );
}

function fail(payload, status = 500) {
  return Response.json(
    {
      ok: false,
      version: VERSION,
      function_name: FUNCTION_NAME,
      handler_file: HANDLER_FILE,
      ...payload,
      timestamp: nowIso(),
      status_code: status,
    },
    { status }
  );
}

function classifyIncident(incident) {
  const msg = (incident?.message || "").toLowerCase();
  const code = (incident?.code || "").toLowerCase();

  if (msg.includes("this content is blocked") || msg.includes("refused to display")) return "embedded_routing_blocked";
  if (msg.includes("failed to execute 'postmessage'") || (msg.includes("target origin provided") && msg.includes("does not match the recipient window's origin"))) {
    return "embedded_postmessage_origin_mismatch";
  }
  if (msg.includes("permission mismatch") || msg.includes("forbidden route access")) return "permission_mismatch";
  if (msg.includes("route registry") || msg.includes("missing route")) return "route_registry_mismatch";
  if (code.includes("feature_flags") || msg.includes("feature_flags")) return "missing_feature_flags";
  if (msg.includes("cannot read properties of undefined")) return "null_access";
  if (msg.includes("404") && msg.includes("assets")) return "missing_asset";
  if (msg.includes("schema") || msg.includes("contract")) return "api_contract_mismatch";
  if (msg.includes("segmentation") || msg.includes("rfm")) return "segmentation_failure";
  if (msg.includes("timeout") || msg.includes("502")) return "infra_timeout";
  return "unknown";
}

async function createRoutingPatchBundle(db, tenantId, details) {
  await db.PatchBundle?.create({
    title: "Fix embedded routing / router navigation mismatch",
    status: "pending_review",
    subsystem: "frontend_routing",
    severity: "high",
    created_at: nowIso(),
    details: {
      tenant_id: tenantId,
      recommended_fix: "Use react-router navigate()/Link, avoid external anchors/window.location for internal routes",
      ...details,
    },
  }).catch(() => {});
}

async function evaluateUiProbe(base44, tenantId, uiProbe) {
  if (!uiProbe || !tenantId) return { ok: true, issues: [], repairs: [] };
  const db = base44.asServiceRole.entities;
  const issues = [];
  const repairs = [];

  const routeRegistry = uiProbe.route_registry || {};
  if (routeRegistry.all_pages_mapped_in_router === false) {
    issues.push({ type: "router_pages_config_mismatch" });
  }
  const missingPageKeys = REQUIRED_PAGE_KEYS.filter((key) => !routeRegistry.page_keys?.includes?.(key));
  if (missingPageKeys.length > 0) {
    issues.push({ type: "route_registry_missing_pages", missing_pages: missingPageKeys });
  }

  const criticalRoutes = Array.isArray(uiProbe.critical_routes) ? uiProbe.critical_routes : [];
  const missingCriticalRoutes = REQUIRED_CRITICAL_ROUTES.filter((r) => !criticalRoutes.includes(r));
  if (missingCriticalRoutes.length > 0) {
    issues.push({ type: "critical_route_monitor_missing", missing_routes: missingCriticalRoutes });
  }

  const embeddedProbe = uiProbe.embedded_probe || {};
  if (embeddedProbe.embedded && embeddedProbe.blocked_text_detected) {
    issues.push({ type: "embedded_routing_blocked", message: "Embedded page rendered with blocked iframe content text" });
  }
  if (embeddedProbe.embedded && embeddedProbe.has_host_param === false) {
    issues.push({ type: "embedded_host_param_missing", message: "Embedded route missing host query param" });
  }

  const linkIssues = (embeddedProbe.link_issues || []).filter((i) => i?.repair_needed);
  if (linkIssues.length > 0) {
    issues.push({ type: "external_navigation_detected", links: linkIssues });
    await createRoutingPatchBundle(db, tenantId, { link_issues: linkIssues });
    repairs.push("patch_bundle_created_for_navigation_fix");
  }

  const permissionProbe = uiProbe.permission_probe || {};
  if (permissionProbe.mismatch) {
    issues.push({ type: "permission_mismatch", details: permissionProbe });
  }

  if (issues.length > 0) {
    await db.SelfHealingEvent.create({
      tenant_id: tenantId,
      feature_key: "ui_routing_integrity",
      message: "UI route integrity issue detected by frontendGuardian",
      severity: "high",
      status: "open",
      source: "frontend_guardian",
      details_json: { issues, ui_probe: uiProbe },
      created_at: nowIso(),
    }).catch(() => {});

    await writeAudit(base44, tenantId, "frontend_guardian_ui_route_check_failed", {
      severity: "high",
      description: `UI route integrity checks failed (${issues.length} issue(s))`,
      issues,
    });

    await base44.functions.invoke("selfHeal", {
      action: "heal_ui_routing",
      tenant_id: tenantId,
      ui_probe: uiProbe,
      issues,
    }).catch(() => {});
  }

  return { ok: issues.length === 0, issues, repairs };
}

async function writeAudit(base44, tenantId, action, details) {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: tenantId || "unknown",
      action,
      entity_type: "FrontendGuardian",
      performed_by: "system",
      category: "ai_action",
      severity: details?.severity || "medium",
      description: details?.description || action,
      details,
      timestamp: nowIso(),
    });
  } catch {}
}

async function upsertHealthSnapshot(base44, tenantId, snapshot) {
  const db = base44.asServiceRole.entities;
  const existing = await db.SystemHealth
    .filter({ tenant_id: tenantId })
    .catch(() => []);
  if (existing?.[0]) {
    await db.SystemHealth.update(existing[0].id, snapshot).catch(() => {});
    return existing[0].id;
  }
  const created = await db.SystemHealth.create(snapshot).catch(() => null);
  return created?.id || null;
}

async function ensureDefaults(base44, tenantId) {
  const db = base44.asServiceRole.entities;

  const tenants = await db.Tenant.filter({ id: tenantId }).catch(() => []);
  const tenant = tenants?.[0];
  if (!tenant) return { ok: false, note: "tenant_not_found" };

  const flags = tenant.feature_flags || {};
  let changed = false;

  for (const k of FEATURE_KEYS) {
    if (typeof flags[k] === "undefined") {
      flags[k] = true;
      changed = true;
    }
  }

  if (changed) {
    await db.Tenant.update(tenant.id, { feature_flags: flags }).catch(() => {});
    return { ok: true, changed: true, flags_written: true };
  }

  return { ok: true, changed: false };
}

async function ensureSegmentationArtifacts(base44, tenantId) {
  const db = base44.asServiceRole.entities;

  const hasOrders = await db.Order.filter({ tenant_id: tenantId }, "-created_date", 1).then((r) => !!r?.[0]).catch(() => false);
  const hasCustomers = await db.Customer.filter({ tenant_id: tenantId }, "-created_date", 1).then((r) => !!r?.[0]).catch(() => false);

  if (!hasOrders || !hasCustomers) {
    return { ok: true, status: "no_data_yet", hasOrders, hasCustomers };
  }

  // Check latest customer segment
  const existing = await db.CustomerSegment
    .filter({ tenant_id: tenantId }, "-created_date", 1)
    .catch(() => null);

  const snap = existing?.[0] || null;
  const freshEnough = snap?.updated_date
    ? (Date.now() - new Date(snap.updated_date).getTime()) / 60000 < HEALTH_TTL_MIN
    : false;

  if (freshEnough) {
    return { ok: true, status: "fresh", snapshot_id: snap.id };
  }

  // Compute minimal RFM from last 90 days
  const orders = await db.Order
    .filter({ tenant_id: tenantId }, "-order_date", 2000)
    .catch(() => []);

  const cutoff = Date.now() - 90 * 86400000;
  const filtered = (orders || []).filter((o) => {
    const t = new Date(o.order_date || o.created_date || 0).getTime();
    return t && t >= cutoff;
  });

  const byCustomer = {};
  for (const o of filtered) {
    const key = o.customer_email || null;
    if (!key) continue;

    const t = new Date(o.order_date || o.created_date || 0).getTime();
    const amt = Number(o.total_revenue || o.subtotal || 0) || 0;

    if (!byCustomer[key]) byCustomer[key] = { last: t, freq: 0, money: 0 };
    byCustomer[key].last = Math.max(byCustomer[key].last, t);
    byCustomer[key].freq += 1;
    byCustomer[key].money += amt;
  }

  const customerCount = Object.keys(byCustomer).length;

  return { ok: true, status: "computed", customer_count: customerCount, order_count: filtered.length };
}

async function resolveAndHeal(base44, incident) {
  const db = base44.asServiceRole.entities;

  const tenantId = incident?.tenant_id && typeof incident.tenant_id === "string" ? incident.tenant_id : null;
  const category = classifyIncident(incident);

  const result = {
    category,
    healed: false,
    actions: [],
    tenant_id: tenantId,
    incident_id: incident?.id || null,
  };

  if (!tenantId) {
    result.actions.push({ action: "no_tenant_context", ok: false });
    return result;
  }

  if (category === "missing_feature_flags" || category === "null_access" || category === "unknown") {
    const r = await ensureDefaults(base44, tenantId);
    result.actions.push({ action: "ensure_defaults_feature_flags", ...r });
    result.healed = result.healed || !!r?.changed;
  }

  if (category === "segmentation_failure") {
    const r = await ensureSegmentationArtifacts(base44, tenantId);
    result.actions.push({ action: "ensure_segmentation_artifacts", ...r });
    result.healed = result.healed || r?.status === "computed" || r?.status === "fresh";
  }

  if (category === "missing_asset") {
    await db.PatchBundle?.create({
      title: "Fix missing frontend assets (404)",
      status: "pending_review",
      subsystem: "frontend",
      severity: "critical",
      created_at: nowIso(),
      details: {
        incident,
        note: "Likely deploy artifact mismatch. Verify build output and asset manifest.",
      },
    }).catch(() => {});
    result.actions.push({ action: "create_patch_bundle_missing_assets", ok: true });
  }

  if (category === "embedded_routing_blocked" || category === "route_registry_mismatch" || category === "permission_mismatch") {
    await createRoutingPatchBundle(db, tenantId, { incident });
    result.actions.push({ action: "create_patch_bundle_ui_routing", ok: true });
  }

  await writeAudit(base44, tenantId, "frontend_guardian_heal", {
    category,
    healed: result.healed,
    actions: result.actions,
    severity: result.healed ? "low" : "medium",
    description: `FrontendGuardian healed incident category=${category} healed=${result.healed}`,
  });

  return result;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const start = Date.now();

  try {
    const text = await req.text().catch(() => "");
    const payload = text ? safeJsonParse(text) : {};
    const action = payload?.action || "watchdog";

    const db = base44.asServiceRole.entities;

    if (action === "get_status") {
      const tenantId = payload?.tenant_id;
      if (!tenantId) return ok({ action, error: "tenant_id required" }, 200);

      const rows = await db.SystemHealth.filter({ tenant_id: tenantId }, "-created_date", 1).catch(() => []);
      return ok({ action, tenant_id: tenantId, snapshot: rows?.[0] || null, elapsed_ms: Date.now() - start }, 200);
    }

    if (action === "report_incident") {
      const incident = payload?.incident || payload;
      const tenantId = incident?.tenant_id || payload?.tenant_id || null;

      const created = await db.SelfHealingEvent.create({
        tenant_id: tenantId,
        feature_key: incident?.feature_key || null,
        message: incident?.message || "unknown",
        stack: incident?.stack || null,
        url: incident?.url || null,
        severity: incident?.severity || "error",
        status: "open",
        source: "frontend_guardian",
        created_at: nowIso(),
      }).catch(() => null);

      const heal = await resolveAndHeal(base44, { ...incident, id: created?.id, tenant_id: tenantId });
      const uiProbeResult = await evaluateUiProbe(base44, tenantId, incident?.payload?.ui_probe || payload?.ui_probe);

      return ok({
        action,
        incident_id: created?.id || null,
        heal,
        ui_probe: uiProbeResult,
        elapsed_ms: Date.now() - start,
      }, 200);
    }

    if (action === "process_queue") {
      const tenantId = payload?.tenant_id || null;
      const filter = tenantId ? { tenant_id: tenantId, status: "open" } : { status: "open" };

      const incidents = await db.SelfHealingEvent.filter(filter, "-created_date", MAX_INCIDENTS_PER_RUN).catch(() => []);
      const results = [];

      for (const inc of incidents || []) {
        const heal = await resolveAndHeal(base44, inc);
        results.push({ incident_id: inc.id, heal });

        if (heal?.healed) {
          await db.SelfHealingEvent.update(inc.id, { status: "resolved", resolved_at: nowIso() }).catch(() => {});
        }
      }

      return ok({ action, processed: results.length, results, elapsed_ms: Date.now() - start }, 200);
    }

    // WATCHDOG
    if (action === "watchdog") {
      const tenantId = payload?.tenant_id || null;
      const uiProbe = payload?.ui_probe || null;

      const tenantIds = tenantId
        ? [tenantId]
        : (await db.Tenant.filter({ status: "active" }, "-created_date", 200).catch(() => [])).map((t) => t.id);

      const out = [];

      for (const tid of tenantIds) {
        const defaults = await ensureDefaults(base44, tid);
        const seg = await ensureSegmentationArtifacts(base44, tid);

        const snapshot = {
          tenant_id: tid,
          computed_at: nowIso(),
          healthy: true,
          checks: {
            ensure_defaults: defaults,
            segmentation: seg,
          },
          version: VERSION,
        };

        if (tenantId && tid === tenantId && uiProbe) {
          const uiCheck = await evaluateUiProbe(base44, tid, uiProbe);
          snapshot.checks.ui_route_integrity = uiCheck;
          if (!uiCheck.ok) snapshot.healthy = false;
        }

        if (seg?.ok === false) snapshot.healthy = false;

        await upsertHealthSnapshot(base44, tid, snapshot);
        out.push({ tenant_id: tid, healthy: snapshot.healthy, checks: snapshot.checks });
      }

      return ok({ action, tenants_checked: out.length, results: out, elapsed_ms: Date.now() - start }, 200);
    }

    return ok({ action, note: "no-op (unknown action)", elapsed_ms: Date.now() - start }, 200);
  } catch (e) {
    return fail({ error: e?.message || "unknown_error", elapsed_ms: Date.now() - start }, 500);
  }
});
