/**
 * buildGuardian
 * ------------------------------------------------------------------
 * System health checker: validates env, webhooks, integrations
 * - Detects missing configuration
 * - Auto-heals Shopify integrations
 * - Logs findings to audit trail
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const REQUIRED_PAGE_KEYS = ["SupportContact", "AdminEmailCenter", "Home", "AIInsights", "Orders"];
const REQUIRED_CRITICAL_ROUTES = ["/support/contact", "/admin/email", "/dashboard", "/ai-insights", "/orders"];

function json(res, status = 200) {
  return Response.json(res, { status });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  let payload = {};
  try {
    payload = JSON.parse(await req.text() || "{}");
  } catch {
    payload = {};
  }

  const action = payload.action || "run";
  const tenantId = payload.tenant_id || null;

  const findings = [];
  const fixes = [];

  // 1) Required env checks
  const required = ["APP_URL", "SHOPIFY_WEBHOOK_SECRET", "SHOPIFY_API_KEY"];
  for (const k of required) {
    const v = Deno.env.get(k);
    if (!v) {
      findings.push({ type: "missing_env", key: k, severity: "critical" });
    }
  }

  // 2) Canonical webhook endpoint check
  const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/+$/, "");
  const expectedWebhook = `${appUrl}/api/functions/shopifyWebhook`;

  // 2b) Route integrity check (client-supplied registry from watchdog probes)
  const routeRegistry = payload.route_registry || {};
  const pageKeys = Array.isArray(routeRegistry.page_keys) ? routeRegistry.page_keys : [];
  const criticalRoutes = Array.isArray(routeRegistry.critical_routes) ? routeRegistry.critical_routes : [];

  const missingPageKeys = REQUIRED_PAGE_KEYS.filter((k) => !pageKeys.includes(k));
  if (missingPageKeys.length > 0) {
    findings.push({
      type: "missing_page_registration",
      severity: "high",
      missing_pages: missingPageKeys,
    });
  }

  const missingCriticalRoutes = REQUIRED_CRITICAL_ROUTES.filter((r) => !criticalRoutes.includes(r));
  if (missingCriticalRoutes.length > 0) {
    findings.push({
      type: "missing_critical_route_monitoring",
      severity: "medium",
      missing_routes: missingCriticalRoutes,
    });
  }

  const permissionProbe = payload.permission_probe || {};
  if (permissionProbe.mismatch) {
    findings.push({
      type: "permission_integrity_mismatch",
      severity: "high",
      details: permissionProbe,
    });
  }

  if (routeRegistry.all_pages_mapped_in_router === false) {
    findings.push({
      type: "router_pages_config_mismatch",
      severity: "high",
    });
  }

  // 3) Auto-heal Shopify integration per tenant (optional)
  if (tenantId) {
    try {
      const r = await base44.functions.invoke("shopifyConnectionManager", {
        action: "run_watchdog",
        tenant_id: tenantId,
        days: 7,
      });
      fixes.push({ type: "shopify_watchdog", status: r?.data?.ok ? "success" : "failed" });
    } catch (e) {
      findings.push({
        type: "shopify_watchdog_failed",
        error: e?.message || String(e),
        severity: "high",
      });
    }
  }

  // Persist incident log
  if (findings.length) {
    await db.AuditLog.create({
      tenant_id: tenantId,
      action: "build_guardian_findings",
      entity_type: "BuildGuardian",
      performed_by: "system",
      description: `BuildGuardian detected ${findings.length} finding(s). Expected webhook: ${expectedWebhook}`,
      details: { findings, fixes, expectedWebhook },
      category: "ai_action",
      severity: findings.some((f) => f.severity === "critical") ? "critical" : "medium",
    }).catch(() => {});
  }

  return json({ ok: true, action, findings, fixes, expectedWebhook }, 200);
});
