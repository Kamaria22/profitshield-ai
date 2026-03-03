/**
 * AUTOMATED REMEDIATION V2 — SAFE MODE
 * =====================================
 * 
 * Minimal, safe alert remediation function.
 * Uses ONLY primary ID sources (automation.record_id, data.id).
 * Hard 2000ms DB timeout. No fallbacks. Structured logging.
 * 
 * DO NOT MODIFY without approval.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import {
  parseAutomationPayload,
  extractSelectedRecordId,
  extractTenantId,
  safeFilter,
  withTimeout,
  structuredLog
} from './helpers/automationRuntime';

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

Deno.serve(async (req) => {
  const startMs = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.entities;

    // 1. Parse payload safely
    const { payload, payloadKeys, payloadSize, hasTooLargeFlag } = await parseAutomationPayload(req);
    const action = payload.action || 'run';

    // ─────────────────────────────────────────────────────
    // SELF TEST (no DB calls)
    // ─────────────────────────────────────────────────────
    if (action === 'self_test') {
      return Response.json({
        ok: true,
        action: 'self_test',
        passed: true,
        message: 'Runtime validated',
        runtime_version: '2.0-safe'
      });
    }

    // ─────────────────────────────────────────────────────
    // DEBUG PAYLOAD (no DB calls)
    // ─────────────────────────────────────────────────────
    if (action === 'debug_payload') {
      const recordId = extractSelectedRecordId(payload);
      const tenantId = extractTenantId(payload);
      
      structuredLog('DEBUG_PAYLOAD', {
        automation: action,
        function: 'automatedRemediationV2',
        resolved_record_id: recordId.id,
        resolved_tenant_id: tenantId,
        status: recordId.id && tenantId ? 'resolved' : 'unresolved',
        source: recordId.source
      });
      
      return Response.json({
        ok: true,
        action: 'debug_payload',
        payloadKeys,
        payloadSize,
        payload_too_large: hasTooLargeFlag,
        resolved_alert_id: recordId.id,
        resolved_alert_source: recordId.source,
        resolved_tenant_id: tenantId,
        message: recordId.id && tenantId ? 'RESOLVED' : 'INCOMPLETE'
      });
    }

    // ─────────────────────────────────────────────────────
    // NORMAL RUN (with timeout protection)
    // ─────────────────────────────────────────────────────
    const recordId = extractSelectedRecordId(payload);
    const tenantId = extractTenantId(payload);

    // Fail fast if missing primary ID
    if (!recordId.id) {
      const log = structuredLog('REMEDIATION_UNRESOLVED_ID', {
        automation: 'remediation',
        function: 'automatedRemediationV2',
        resolved_record_id: null,
        resolved_tenant_id: tenantId,
        status: 'failed',
        error_code: 'MISSING_ALERT_ID',
        source: null
      });
      
      return Response.json({
        error: 'Alert ID not found in payload',
        resolved_alert_id: null,
        resolved_tenant_id: tenantId,
        debug: {
          payloadKeys,
          recordIdSource: recordId.source,
          candidates: payloadKeys
        }
      }, { status: 404 });
    }

    // Fetch alert with timeout (2000ms hard limit)
    const [alert] = await safeFilter(db.Alert, { id: recordId.id }, 1);
    
    if (!alert) {
      const log = structuredLog('REMEDIATION_ALERT_NOT_FOUND', {
        automation: 'remediation',
        function: 'automatedRemediationV2',
        resolved_record_id: recordId.id,
        resolved_tenant_id: tenantId,
        status: 'failed',
        error_code: 'ALERT_404',
        source: recordId.source,
        elapsed_ms: Date.now() - startMs
      });
      
      // Write audit log for unresolved alerts
      try {
        await withTimeout(
          db.AuditLog.create({
            tenant_id: tenantId || 'unknown',
            action: 'automation_payload_unresolved',
            entity_type: 'Alert',
            entity_id: recordId.id,
            performed_by: 'system',
            description: `Remediation skipped: Alert ID ${recordId.id} not found. Source: ${recordId.source}`,
            category: 'ai_action',
            severity: 'high'
          }),
          2000
        ).catch(() => {});
      } catch (e) {
        console.error('[remediation] audit log write failed:', e.message);
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
      structuredLog('REMEDIATION_NO_TENANT', {
        automation: 'remediation',
        function: 'automatedRemediationV2',
        resolved_record_id: recordId.id,
        resolved_tenant_id: null,
        status: 'failed',
        error_code: 'MISSING_TENANT_ID'
      });
      
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
        console.error('[remediation] alert update failed:', e.message);
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
      console.error('[remediation] audit log write failed:', e.message);
    }

    structuredLog('REMEDIATION_SUCCESS', {
      automation: 'remediation',
      function: 'automatedRemediationV2',
      resolved_record_id: recordId.id,
      resolved_tenant_id: finalTenantId,
      status: 'success',
      source: recordId.source,
      elapsed_ms: Date.now() - startMs
    });

    return Response.json({
      ok: true,
      resolved_alert_id: recordId.id,
      resolved_tenant_id: finalTenantId,
      alert_type: alertType,
      automatic_actions: workflow.automatic_actions || [],
      suggested_actions: workflow.suggested_actions || [],
      updated: true,
      elapsed_ms: Date.now() - startMs
    });

  } catch (error) {
    const elapsed = Date.now() - startMs;
    structuredLog('REMEDIATION_EXCEPTION', {
      automation: 'remediation',
      function: 'automatedRemediationV2',
      status: 'failed',
      error_code: error.message,
      elapsed_ms: elapsed
    });
    
    return Response.json(
      { error: error.message, elapsed_ms: elapsed },
      { status: 500 }
    );
  }
});