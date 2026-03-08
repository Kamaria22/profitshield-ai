// redeploy trigger: ensure Base44 rebuilds function registry
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERSION = 'selfHeal_v2026_03_08_safe';

function nowIso() {
  return new Date().toISOString();
}

function safeJson(input, fallback = {}) {
  try { return typeof input === 'object' && input ? input : fallback; } catch { return fallback; }
}

async function loadIncidents(db, limit = 100) {
  const events = await db.SelfHealingEvent.list('-created_date', Math.min(200, Math.max(1, limit))).catch(() => []);
  const pendingPatches = await db.PatchBundle.filter({ status: 'proposed' }, '-created_date', 100).catch(() => []);
  const queueRows = await db.WebhookQueue.list('-created_date', 200).catch(() => []);
  const pending = queueRows.filter((q) => q.processing_status === 'pending' || q.status === 'pending').length;
  const dead = queueRows.filter((q) => q.processing_status === 'dead_letter' || q.status === 'dead_letter').length;
  return {
    ok: true,
    version: VERSION,
    events,
    pending_patches: pendingPatches,
    queue: { pending, dead_letter: dead }
  };
}

async function publishIncident(db, payload) {
  const incident = {
    tenant_id: payload.tenant_id || 'system',
    subsystem: payload.subsystem || payload.feature_key || 'GENERAL',
    issue_code: payload.issue_code || 'UNKNOWN',
    severity: payload.severity || 'medium',
    message: payload.message || payload.error || 'incident',
    status: 'open',
    source: payload.source || 'self_heal_client',
    details_json: safeJson(payload.context || payload),
    detected_at: payload.detected_at || nowIso(),
    created_date: nowIso()
  };
  await db.SelfHealingEvent.create(incident).catch(() => {});
  return { ok: true, published: true, version: VERSION };
}

async function runWatchdog(base44, tenantId) {
  const checks = [];
  try {
    const watchdog = await base44.functions.invoke('shopifyConnectionWatchdog', {
      tenant_id: tenantId || undefined,
      observe_only: true,
      mode: 'observe'
    });
    checks.push({ fn: 'shopifyConnectionWatchdog', ok: true, data: watchdog?.data || null });
  } catch (error) {
    checks.push({ fn: 'shopifyConnectionWatchdog', ok: false, error: error?.message || String(error) });
  }

  try {
    const stability = await base44.functions.invoke('stabilityAgent', {
      action: 'watchdog',
      mode: 'watch',
      observe_only: true
    });
    checks.push({ fn: 'stabilityAgent', ok: true, data: stability?.data || null });
  } catch (error) {
    checks.push({ fn: 'stabilityAgent', ok: false, error: error?.message || String(error) });
  }

  return {
    ok: true,
    version: VERSION,
    action: 'run_watchdog',
    tenant_id: tenantId || null,
    checks,
    incidents: checks.filter((c) => !c.ok),
    heals: [],
    ran_at: nowIso()
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'run_watchdog';
    const tenantId = body.tenant_id || null;

    // Allow scheduler (no user) OR admin/owner.
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    const role = String(user?.role || user?.app_role || '').toLowerCase();
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ ok: false, error: 'forbidden', version: VERSION }, { status: 403 });
    }

    if (action === 'get_flags') {
      return Response.json({
        ok: true,
        version: VERSION,
        flags: {
          ENABLE_AUTOHEAL: true,
          ENABLE_AUTOPATCH: false,
          FAIL_CLOSED_WEBHOOK_HMAC: true
        }
      }, { status: 200 });
    }

    if (action === 'get_incidents') {
      const limit = Number(body.limit || 100);
      return Response.json(await loadIncidents(db, limit), { status: 200 });
    }

    if (action === 'publish_incident') {
      return Response.json(await publishIncident(db, body), { status: 200 });
    }

    if (action === 'run_watchdog') {
      return Response.json(await runWatchdog(base44, tenantId), { status: 200 });
    }

    if (action === 'acknowledge_event') {
      const id = body.event_id;
      if (!id) return Response.json({ ok: false, error: 'event_id is required', version: VERSION }, { status: 400 });
      await db.SelfHealingEvent.update(id, { acknowledged: true, acknowledged_at: nowIso() }).catch(() => {});
      return Response.json({ ok: true, acknowledged: true, event_id: id, version: VERSION }, { status: 200 });
    }

    if (action === 'approve_patch' || action === 'reject_patch') {
      const id = body.patch_bundle_id;
      if (!id) return Response.json({ ok: false, error: 'patch_bundle_id is required', version: VERSION }, { status: 400 });
      const nextStatus = action === 'approve_patch' ? 'approved' : 'rejected';
      await db.PatchBundle.update(id, { status: nextStatus, reviewed_at: nowIso() }).catch(() => {});
      return Response.json({ ok: true, status: nextStatus, patch_bundle_id: id, version: VERSION }, { status: 200 });
    }

    return Response.json({ ok: false, error: 'invalid_action', version: VERSION }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error), version: VERSION }, { status: 500 });
  }
});
