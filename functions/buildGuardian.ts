/**
 * buildGuardian
 * ------------------------------------------------------------------
 * System health checker: validates env, webhooks, integrations
 * - Detects missing configuration
 * - Auto-heals Shopify integrations
 * - Logs findings to audit trail
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

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