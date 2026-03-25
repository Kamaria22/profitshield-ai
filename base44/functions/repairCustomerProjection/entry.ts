import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { rebuildProjectedCustomersFromOrders } from '../helpers/customerProjection/entry.ts';

const VERSION = '2026-03-23.repair-customer-projection-v1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || '').trim();

    if (!tenantId) {
      return Response.json({ ok: false, version: VERSION, error: 'tenant_id required' }, { status: 400 });
    }

    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const role = String(user?.role || user?.app_role || '').toLowerCase();
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ ok: false, version: VERSION, error: 'Admin/owner only' }, { status: 403 });
    }

    const beforeRows = await db.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 10).catch(() => []);
    const repair = await rebuildProjectedCustomersFromOrders(db, tenantId, 800);
    const afterRows = await db.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 10).catch(() => []);

    return Response.json({
      ok: true,
      version: VERSION,
      tenant_id: tenantId,
      before_count: Array.isArray(beforeRows) ? beforeRows.length : 0,
      after_count: Array.isArray(afterRows) ? afterRows.length : 0,
      repair,
      sample: Array.isArray(afterRows)
        ? afterRows.slice(0, 5).map((row) => ({
            id: row?.id || null,
            email: row?.email || null,
            tenant_id: row?.tenant_id || null,
            orders_count: row?.orders_count ?? row?.total_orders ?? null,
          }))
        : []
    });
  } catch (error) {
    return Response.json({
      ok: false,
      version: VERSION,
      error: String(error?.message || error || 'repair_failed')
    }, { status: 500 });
  }
});
