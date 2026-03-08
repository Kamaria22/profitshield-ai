// redeploy trigger: ensure Base44 rebuilds function registry
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERSION = 'profitAlertWatchdog_v2026_03_08_safe';

async function collectTenantIds(base44) {
  const fromRules = await base44.asServiceRole.entities.AlertRule.list('-created_date', 500).catch(() => []);
  const ruleTenantIds = fromRules.map((r) => r.tenant_id).filter(Boolean);

  const fromTenants = await base44.asServiceRole.entities.Tenant.list('-created_date', 200).catch(() => []);
  const tenantIds = fromTenants.map((t) => t.id).filter(Boolean);

  return [...new Set([...ruleTenantIds, ...tenantIds])];
}

async function runForTenant(base44, tenantId) {
  try {
    const result = await base44.functions.invoke('checkProfitAlerts', { tenant_id: tenantId });
    return {
      tenant_id: tenantId,
      ok: true,
      alerts_triggered: Number(result?.data?.alerts_triggered || 0)
    };
  } catch (error) {
    return {
      tenant_id: tenantId,
      ok: false,
      error: error?.message || String(error)
    };
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenant_id || null;

    // Allow scheduler (no user) OR admin/owner
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const role = String(user?.role || user?.app_role || '').toLowerCase();
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ success: false, error: 'forbidden', version: VERSION }, { status: 403 });
    }

    const tenants = tenantId ? [tenantId] : await collectTenantIds(base44);
    if (!tenants.length) {
      return Response.json({
        success: true,
        version: VERSION,
        tenant_count: 0,
        success_count: 0,
        fail_count: 0,
        alerts_triggered: 0,
        results: []
      }, { status: 200 });
    }

    const results = [];
    let successCount = 0;
    let failCount = 0;
    let alertsTriggered = 0;

    for (const tId of tenants.slice(0, 100)) {
      const run = await runForTenant(base44, tId);
      results.push(run);
      if (run.ok) {
        successCount++;
        alertsTriggered += Number(run.alerts_triggered || 0);
      } else {
        failCount++;
      }
    }

    return Response.json({
      success: true,
      version: VERSION,
      tenant_count: results.length,
      success_count: successCount,
      fail_count: failCount,
      alerts_triggered: alertsTriggered,
      results
    }, { status: 200 });
  } catch (error) {
    return Response.json({
      success: false,
      version: VERSION,
      error: error?.message || String(error)
    }, { status: 500 });
  }
});
