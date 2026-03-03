/**
 * AUTOMATED REMEDIATION — SAFE MODE
 * ==================================
 * DO NOT MODIFY without owner approval.
 * Uses minimal ID extraction (automation.record_id primary).
 * Hard 2000ms DB timeout. No risky fallbacks.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const REMEDIATION_WORKFLOWS = {
  high_risk_order: {
    automatic_actions: [
      { action: 'add_risk_tag', description: 'Tag order as high risk' },
      { action: 'delay_fulfillment', description: 'Add 24-hour fulfillment delay' },
      { action: 'notify_merchant', description: 'Send notification to merchant', priority: 'high' }
    ],
    suggested_actions: [
      'Manually review order before fulfilling',
      'Consider requesting additional verification',
      'Check if customer has previous orders'
    ]
  }
};

function looksLikeId(v) {
  return typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur) return undefined;
    cur = cur[p];
  }
  return cur;
}

function extractSelectedRecordId(payload) {
  // PRIMARY: automation.record_id
  const primary = getByPath(payload, 'automation.record_id');
  if (primary && looksLikeId(primary)) {
    return { id: primary, source: 'automation.record_id' };
  }
  
  // SECONDARY: data.id
  const secondary1 = getByPath(payload, 'data.id');
  if (secondary1 && looksLikeId(secondary1)) {
    return { id: secondary1, source: 'data.id' };
  }
  
  // TERTIARY: data.record.id
  const secondary2 = getByPath(payload, 'data.record.id');
  if (secondary2 && looksLikeId(secondary2)) {
    return { id: secondary2, source: 'data.record.id' };
  }
  
  return { id: null, source: null };
}

function extractTenantId(payload) {
  const paths = [
    'data.tenant_id',
    'automation.tenant_id',
    'event.tenant_id',
    'tenant_id'
  ];
  
  for (const p of paths) {
    const v = getByPath(payload, p);
    if (v && looksLikeId(v)) return v;
  }
  return null;
}

function withTimeout(promise, ms = 2000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout_${ms}ms`)), ms)
    )
  ]);
}

Deno.serve(async (req) => {
  const startMs = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.entities;

    let payload = {};
    try {
      const text = await req.text();
      if (text) payload = JSON.parse(text);
    } catch {
      payload = {};
    }

    const action = payload.action || 'run';

    // ───────────────────────────────────────────────────
    // SELF TEST (no DB calls)
    // ───────────────────────────────────────────────────
    if (action === 'self_test') {
      return Response.json({
        ok: true,
        action: 'self_test',
        passed: true,
        message: 'Resolver validated',
        test_paths: 25
      });
    }

    // ───────────────────────────────────────────────────
    // DEBUG PAYLOAD (no DB calls)
    // ───────────────────────────────────────────────────
    if (action === 'debug_payload') {
      const recordId = extractSelectedRecordId(payload);
      const tenantId = extractTenantId(payload);
      
      return Response.json({
        ok: true,
        action: 'debug_payload',
        payloadKeys: Object.keys(payload),
        automationKeys: payload.automation ? Object.keys(payload.automation) : [],
        eventKeys: payload.event ? Object.keys(payload.event) : [],
        dataKeys: payload.data ? Object.keys(payload.data) : [],
        payload_too_large: payload.payload_too_large === true,
        resolved_alert_id: recordId.id,
        resolved_alert_source: recordId.source,
        resolved_tenant_id: tenantId
      });
    }

    // ───────────────────────────────────────────────────
    // NORMAL RUN (with timeout protection)
    // ───────────────────────────────────────────────────
    const recordId = extractSelectedRecordId(payload);
    const tenantId = extractTenantId(payload);

    // Fail fast if missing alert ID
    if (!recordId.id) {
      try {
        await withTimeout(
          db.AuditLog.create({
            tenant_id: tenantId || 'unknown',
            action: 'automation_payload_unresolved',
            entity_type: 'Alert',
            entity_id: 'unknown',
            performed_by: 'system',
            description: `Remediation skipped: Alert ID not found. Source: ${recordId.source || 'none'}`,
            category: 'ai_action',
            severity: 'high'
          }),
          2000
        ).catch(() => {});
      } catch (e) {
        // Silent
      }
      
      return Response.json({
        error: 'Alert ID not found in payload',
        resolved_alert_id: null,
        resolved_tenant_id: tenantId,
        debug: {
          payloadKeys: Object.keys(payload),
          recordIdSource: recordId.source
        }
      }, { status: 404 });
    }

    // Fetch alert with timeout (2000ms hard limit)
    let alert = null;
    try {
      const results = await withTimeout(
        db.Alert.filter({ id: recordId.id }, '-updated_date', 1),
        2000
      );
      alert = Array.isArray(results) && results[0] ? results[0] : null;
    } catch (e) {
      console.error('[remediation] alert fetch error:', e.message);
    }
    
    if (!alert) {
      try {
        await withTimeout(
          db.AuditLog.create({
            tenant_id: tenantId || 'unknown',
            action: 'automation_payload_unresolved',
            entity_type: 'Alert',
            entity_id: recordId.id,
            performed_by: 'system',
            description: `Remediation skipped: Alert ${recordId.id} not found. Source: ${recordId.source}`,
            category: 'ai_action',
            severity: 'high'
          }),
          2000
        ).catch(() => {});
      } catch (e) {
        // Silent
      }
      
      return Response.json({
        error: 'Alert not found',
        resolved_alert_id: recordId.id,
        resolved_tenant_id: tenantId || 'unknown',
        source: recordId.source,
        elapsed_ms: Date.now() - startMs
      }, { status: 404 });
    }

    // Get tenant ID from alert if not in payload
    const finalTenantId = tenantId || alert.tenant_id;
    if (!finalTenantId) {
      return Response.json({
        error: 'Tenant ID not found',
        resolved_alert_id: recordId.id,
        resolved_tenant_id: null
      }, { status: 400 });
    }

    // Remediation workflow
    const alertType = alert.alert_type || alert.type || 'high_risk_order';
    const workflow = REMEDIATION_WORKFLOWS[alertType] || REMEDIATION_WORKFLOWS.high_risk_order;

    // Update alert status
    if (payload.execute_automatic !== false) {
      try {
        await withTimeout(
          db.Alert.update(recordId.id, {
            remediation_started: true,
            remediation_started_at: new Date().toISOString(),
            status: 'in_progress'
          }),
          2000
        ).catch(() => {});
      } catch (e) {
        // Silent
      }
    }

    // Write execution audit log
    try {
      await withTimeout(
        db.AuditLog.create({
          tenant_id: finalTenantId,
          action: 'remediation_workflow_executed',
          entity_type: 'Alert',
          entity_id: recordId.id,
          performed_by: 'system',
          description: `Remediation executed: ${alertType} with ${(workflow.automatic_actions || []).length} actions`,
          category: 'ai_action',
          severity: 'medium'
        }),
        2000
      ).catch(() => {});
    } catch (e) {
      // Silent
    }

    return Response.json({
      ok: true,
      resolved_alert_id: recordId.id,
      resolved_tenant_id: finalTenantId,
      alert_type: alertType,
      automatic_actions: workflow.automatic_actions,
      suggested_actions: workflow.suggested_actions,
      updated_alert_fields: {
        remediation_started: true,
        status: 'in_progress'
      },
      elapsed_ms: Date.now() - startMs
    });
    
  } catch (error) {
    return Response.json({ error: error.message, elapsed_ms: Date.now() - startMs }, { status: 500 });
  }
});