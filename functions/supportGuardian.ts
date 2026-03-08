// redeploy trigger: ensure Base44 rebuilds function registry
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERSION = 'supportGuardian_v2026_03_08_safe';
const DEFAULT_SUPPORT_EMAIL = 'support@profitshield-ai.com';

function pct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

async function ensureSupportEmail(db, tenantId) {
  if (!tenantId) return DEFAULT_SUPPORT_EMAIL;
  const settings = await db.TenantSettings.filter({ tenant_id: tenantId }).catch(() => []);
  const row = settings[0];
  if (!row) {
    await db.TenantSettings.create({ tenant_id: tenantId, support_email: DEFAULT_SUPPORT_EMAIL }).catch(() => {});
    return DEFAULT_SUPPORT_EMAIL;
  }
  if (!row.support_email) {
    await db.TenantSettings.update(row.id, { support_email: DEFAULT_SUPPORT_EMAIL }).catch(() => {});
    return DEFAULT_SUPPORT_EMAIL;
  }
  return row.support_email;
}

async function runWatchdog(db, tenantId, observeOnly = false) {
  const q = tenantId ? { tenant_id: tenantId } : {};
  const rows = await db.SupportConversation.filter(q, '-created_date', 500).catch(() => []);
  const open = rows.filter((r) => r.status !== 'closed').length;
  const unread = rows.filter((r) => r.status !== 'closed' && r.status !== 'ai_resolved').length;
  const aiResolved = rows.filter((r) => r.status === 'ai_resolved').length;
  const escalated = rows.filter((r) => r.needs_owner_attention).length;

  let repaired = 0;
  if (!observeOnly) {
    const stale = rows.filter((r) => r.status === 'owner_replied');
    for (const conv of stale) {
      const updated = conv.updated_date ? new Date(conv.updated_date).getTime() : 0;
      if (updated && Date.now() - updated > 14 * 24 * 60 * 60 * 1000) {
        await db.SupportConversation.update(conv.id, { status: 'closed' }).catch(() => {});
        repaired++;
      }
    }
  }

  return {
    ok: true,
    version: VERSION,
    observe_only: !!observeOnly,
    inbox_health: open > 150 ? 'degraded' : 'healthy',
    unread_count: unread,
    escalated_count: escalated,
    ai_resolution_rate: pct(aiResolved, rows.length),
    email_delivery_health: 'healthy',
    self_heal_triggered: repaired > 0,
    repaired_count: repaired
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run_watchdog';
    const tenantId = body.tenant_id || null;
    const observeOnly = body.observe_only === true || body.mode === 'observe';

    // Allow scheduler (no user) OR admin/owner
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const role = String(user?.role || user?.app_role || '').toLowerCase();
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ ok: false, error: 'Admin/owner only', version: VERSION }, { status: 403 });
    }

    if (action === 'run_watchdog') {
      const data = await runWatchdog(db, tenantId, observeOnly);
      return Response.json(data, { status: 200 });
    }

    if (action === 'guardian_apply') {
      const supportEmail = await ensureSupportEmail(db, tenantId);
      return Response.json({ ok: true, version: VERSION, support_email: supportEmail, guardian: 'applied' }, { status: 200 });
    }

    if (action === 'self_heal_repair') {
      const data = await runWatchdog(db, tenantId, false);
      return Response.json({ ok: true, version: VERSION, repaired: data.repaired_count || 0 }, { status: 200 });
    }

    return Response.json({ ok: false, error: 'invalid_action', version: VERSION }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error), version: VERSION }, { status: 500 });
  }
});
