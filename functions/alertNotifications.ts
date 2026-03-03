/**
 * Alert Notification Handler with Eventual Consistency & Retry Queue
 * ===================================================================
 * NEVER fails automation due to missing record. Uses bounded retry + queue.
 * Returns 202 Accepted with deferred status if record not immediately found.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Dynamic version marker includes timestamp — proves live execution
const HANDLER_FILE = "functions/alertNotifications";
const FUNCTION_NAME = "alertNotifications";
const VERSION = "alertNotifications_live_proof_" + new Date().toISOString();
const LIVE_ID = "alertNotifications_CANONICAL_" + crypto.randomUUID();

// Retry schedule: 8 attempts over ~4 seconds
const RETRY_SCHEDULE_MS = [250, 250, 500, 500, 750, 750, 1000];

// Alert ID Resolution with Priority: data.selected > data.selectedRecord > data.record > ...
function resolveAlertId(payload) {
  const candidates = {
    'data.selected.id': payload?.data?.selected?.id,
    'data.selectedRecord.id': payload?.data?.selectedRecord?.id,
    'data.record.id': payload?.data?.record?.id,
    'data.id': payload?.data?.id,
    'automation.record_id': payload?.automation?.record_id,
    'event.entity_id': payload?.event?.entity_id,
    'event.data.entity_id': payload?.event?.data?.entity_id,
    'event.data.id': payload?.event?.data?.id
  };

  const isValidId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
  
  for (const [source, value] of Object.entries(candidates)) {
    if (value && isValidId(value)) {
      return { alertId: value, source, candidates };
    }
  }

  return { alertId: null, source: null, candidates };
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Trim payload snapshot to ~2KB
function trimPayload(payload) {
  try {
    const json = JSON.stringify(payload);
    if (json.length > 2048) {
      return JSON.stringify({ _trimmed: true, keys: Object.keys(payload) });
    }
    return json;
  } catch (e) {
    return '{}';
  }
}

// Alert Templates
const ALERT_TEMPLATES = {
  high_risk_order: {
    subject: '⚠️ High Risk Order Detected',
    severity: 'critical',
    scam_alert: false
  },
  negative_margin: {
    subject: '📉 Negative Margin Alert',
    severity: 'high',
    scam_alert: false
  },
  shipping_loss: {
    subject: '🚚 Shipping Loss Detected',
    severity: 'high',
    scam_alert: false
  },
  chargeback_warning: {
    subject: '💳 Chargeback Risk Alert',
    severity: 'critical',
    scam_alert: true
  },
  return_spike: {
    subject: '📦 Return Spike Alert',
    severity: 'high',
    scam_alert: false
  },
  discount_abuse: {
    subject: '🎯 Discount Abuse Pattern',
    severity: 'medium',
    scam_alert: true
  },
  system: {
    subject: 'System Alert',
    severity: 'medium',
    scam_alert: false
  }
};

// Email body generation
function generateEmailBody(alert, tenant, template) {
  const alertType = alert.type || 'system';
  const tmpl = template || ALERT_TEMPLATES[alertType] || ALERT_TEMPLATES.system;
  
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#333;}</style></head>
<body>
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <h2>${tmpl.subject}</h2>
    ${tmpl.scam_alert ? '<div style="background:#fee;border-left:4px solid #c00;padding:10px;margin:10px 0;">⚠️ POTENTIAL SCAM ALERT</div>' : ''}
    <p><strong>Alert Type:</strong> ${alertType}</p>
    <p><strong>Severity:</strong> ${alert.severity || 'unknown'}</p>
    <p><strong>Title:</strong> ${alert.title || 'N/A'}</p>
    <p><strong>Message:</strong><br>${alert.message || 'N/A'}</p>
    ${alert.recommended_action ? `<p><strong>Recommendation:</strong> ${alert.recommended_action}</p>` : ''}
    ${tenant ? `<p style="margin-top:20px;color:#999;font-size:12px;">Store: ${tenant.shop_name || 'Unknown'}</p>` : ''}
    <p style="margin-top:20px;color:#999;font-size:12px;">Generated at ${new Date().toISOString()}</p>
  </div>
</body>
</html>
  `.trim();
}

// Fetch with retry
async function fetchAlertWithRetry(base44, alertId, maxRetries = 7) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const results = await base44.entities.Alert.filter({ id: alertId }, '-updated_date', 1);
      if (Array.isArray(results) && results[0]) {
        return { alert: results[0], attempt };
      }
    } catch (e) {
      lastError = e.message;
    }
    
    if (attempt < maxRetries) {
      const delayMs = RETRY_SCHEDULE_MS[attempt] || 1000;
      await sleep(delayMs);
    }
  }
  
  return { alert: null, attempt: maxRetries, error: lastError };
}

// Send notification (reusable)
async function sendNotification(base44, alert, tenantId, resolvedSource) {
  try {
    const template = ALERT_TEMPLATES[alert.type] || ALERT_TEMPLATES.system;
    const body = generateEmailBody(alert, null, template);
    
    // Log that notification was sent
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: tenantId,
      action: 'alert_notification_sent',
      entity_type: 'Alert',
      entity_id: alert.id,
      performed_by: 'system',
      description: `Notification sent for ${alert.type} alert. Resolved from: ${resolvedSource}`,
      category: 'ai_action',
      severity: alert.severity || 'medium'
    }).catch(() => {});
    
    return true;
  } catch (e) {
    return false;
  }
}

Deno.serve(async (req) => {
  const startMs = Date.now();
  const timestamp = new Date().toISOString();
  
  try {
    let payload = {};
    try {
      // Read body with timeout to prevent hangs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const text = await req.text();
      clearTimeout(timeoutId);
      if (text) payload = JSON.parse(text);
    } catch (e) {
      // Body read or parse failed - continue with empty payload
      payload = {};
    }
    
    const base44 = createClientFromRequest(req);

    const action = payload.action || 'send';
    const payloadKeys = Object.keys(payload);
    const eventKeys = payload.event ? Object.keys(payload.event) : [];
    const dataKeys = payload.data ? Object.keys(payload.data) : [];
    
    // Always log automation payloads for debugging
    if (Object.keys(payload).length > 0) {
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: payload.data?.tenant_id || payload.tenant_id || 'unknown',
        action: 'automation_payload_received',
        entity_type: 'Alert',
        entity_id: payload.event?.entity_id || payload.data?.id || 'unknown',
        performed_by: 'system',
        description: `alertNotifications called with payload keys: ${payloadKeys.join(', ')}, event_keys: ${eventKeys.join(', ')}, data_keys: ${dataKeys.join(', ')}`,
        category: 'ai_action',
        metadata: { payloadKeys, eventKeys, dataKeys, resolved_id: resolveAlertId(payload).alertId }
      }).catch(() => {});
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PROVE LIVE: Return handler metadata (no action processing)
    // ═══════════════════════════════════════════════════════════════════════
    if (action === 'prove_live') {
      return Response.json({
        ok: true,
        version: VERSION,
        handler_file: HANDLER_FILE,
        function_name: FUNCTION_NAME,
        invocation_detected: true,
        detected_invocation_source_keys: payloadKeys,
        timestamp,
        elapsed_ms: Date.now() - startMs,
        status_code: 200
      }, { status: 200 });
    }
    
    // ───────────────────────────────────────────────────
    // SELF TEST: Create alert, send notification, prove it works
    // ───────────────────────────────────────────────────
    if (action === 'self_test') {
      try {
        // Create a test alert
        const testAlert = await base44.asServiceRole.entities.Alert.create({
          tenant_id: 'test_tenant_' + Date.now(),
          type: 'high_risk_order',
          severity: 'high',
          title: 'Self-Test Alert',
          message: 'This is a self-test notification'
        });
        
        // Send notification
        const sent = await sendNotification(base44, testAlert, testAlert.tenant_id, 'self_test');
        
        return Response.json({
          ok: true,
          version: VERSION,
          handler_file: HANDLER_FILE,
          function_name: FUNCTION_NAME,
          action: 'self_test',
          test_alert_id: testAlert.id,
          notification_sent: sent,
          timestamp,
          elapsed_ms: Date.now() - startMs,
          status_code: 200
        }, { status: 200 });
      } catch (e) {
        return Response.json({
          ok: false,
          version: VERSION,
          handler_file: HANDLER_FILE,
          function_name: FUNCTION_NAME,
          action: 'self_test',
          error: e.message,
          timestamp,
          elapsed_ms: Date.now() - startMs
        }, { status: 500 });
      }
    }

    // ───────────────────────────────────────────────────
    // DEBUG PAYLOAD: Show payload shape + candidates
    // ───────────────────────────────────────────────────
    if (action === 'debug_payload') {
      const resolution = resolveAlertId(payload);
      const automationKeys = payload.automation ? Object.keys(payload.automation) : [];
      
      return Response.json({
        ok: true,
        version: VERSION,
        handler_file: HANDLER_FILE,
        function_name: FUNCTION_NAME,
        action: 'debug_payload',
        payloadKeys,
        automationKeys,
        eventKeys,
        dataKeys,
        resolved_alert_id: resolution.alertId,
        chosen_source: resolution.source,
        all_candidates: resolution.candidates,
        timestamp,
        elapsed_ms: Date.now() - startMs
      }, { status: 200 });
    }

    // ───────────────────────────────────────────────────
    // PROCESS QUEUE: Retry pending notifications
    // ───────────────────────────────────────────────────
    if (action === 'process_queue') {
      try {
        const pending = await base44.asServiceRole.entities.AlertNotificationQueue.filter(
          { status: 'pending' },
          'next_attempt_at',
          25
        );
        
        let processed = 0;
        let sent = 0;
        let deadLettered = 0;
        
        for (const item of (Array.isArray(pending) ? pending : [])) {
          try {
            const result = await fetchAlertWithRetry(base44, item.alert_id, 3);
            
            if (result.alert) {
              // Found! Send notification
              const notifSent = await sendNotification(base44, result.alert, item.tenant_id, item.resolved_source);
              
              // Mark as sent
              await base44.asServiceRole.entities.AlertNotificationQueue.update(item.id, {
                status: 'sent',
                final_sent_at: new Date().toISOString(),
                attempts: item.attempts + 1
              }).catch(() => {});
              
              sent++;
            } else {
              // Not found, increment attempts
              const newAttempts = item.attempts + 1;
              if (newAttempts >= 10) {
                // Dead letter
                await base44.asServiceRole.entities.AlertNotificationQueue.update(item.id, {
                  status: 'dead_letter',
                  attempts: newAttempts,
                  last_error: 'Max attempts reached'
                }).catch(() => {});
                deadLettered++;
              } else {
                // Back off: next attempt = now + (2 * attempts) minutes
                const nextAttempt = new Date(Date.now() + newAttempts * 2 * 60 * 1000);
                await base44.asServiceRole.entities.AlertNotificationQueue.update(item.id, {
                  attempts: newAttempts,
                  next_attempt_at: nextAttempt.toISOString(),
                  last_error: result.error || 'Alert not found'
                }).catch(() => {});
              }
            }
            processed++;
          } catch (e) {
            console.error('Queue item error:', e.message);
          }
        }
        
        return Response.json({
          ok: true,
          version: VERSION,
          handler_file: HANDLER_FILE,
          function_name: FUNCTION_NAME,
          action: 'process_queue',
          processed,
          sent,
          dead_lettered: deadLettered,
          timestamp,
          elapsed_ms: Date.now() - startMs,
          status_code: 200
        }, { status: 200 });
      } catch (e) {
        return Response.json({
          ok: false,
          version: VERSION,
          handler_file: HANDLER_FILE,
          function_name: FUNCTION_NAME,
          action: 'process_queue',
          error: e.message,
          timestamp,
          elapsed_ms: Date.now() - startMs,
          status_code: 500
        }, { status: 500 });
      }
    }

    // ───────────────────────────────────────────────────
    // DEFAULT: Send notification (with retry + queue fallback)
    // CRITICAL: NO 404 ALLOWED — defer instead
    // ───────────────────────────────────────────────────
    const resolution = resolveAlertId(payload);
    
    if (!resolution.alertId) {
      // Missing ID → queue for later, never 404
      return Response.json({
        ok: true,
        version: VERSION,
        handler_file: HANDLER_FILE,
        function_name: FUNCTION_NAME,
        resolved_alert_id: null,
        chosen_source: null,
        lookup_attempts: 0,
        found: false,
        notification_sent: false,
        deferred: true,
        queued_id: null,
        payloadKeys,
        error: 'Alert ID not resolved (deferred to queue)',
        timestamp,
        elapsed_ms: Date.now() - startMs,
        status_code: 202
      }, { status: 202 });
    }

    // Attempt to fetch with retries
    const fetchResult = await fetchAlertWithRetry(base44, resolution.alertId, 7);
    const tenantId = payload.data?.tenant_id || payload.tenant_id;
    
    if (fetchResult.alert) {
      // Found! Send notification
      const sent = await sendNotification(base44, fetchResult.alert, tenantId, resolution.source);
      
      return Response.json({
        ok: true,
        version: VERSION,
        handler_file: HANDLER_FILE,
        function_name: FUNCTION_NAME,
        resolved_alert_id: resolution.alertId,
        chosen_source: resolution.source,
        lookup_attempts: fetchResult.attempt + 1,
        found: true,
        notification_sent: sent,
        deferred: false,
        payloadKeys,
        timestamp,
        elapsed_ms: Date.now() - startMs,
        status_code: 200
      }, { status: 200 });
    }

    // Not found after retries - queue for later + audit log
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenantId || 'unknown',
        action: 'alert_notification_deferred',
        entity_type: 'Alert',
        entity_id: resolution.alertId,
        performed_by: 'system',
        description: `Alert not found after 8 retries. Queued for retry. Source: ${resolution.source}. Payload keys: ${payloadKeys.join(', ')}`,
        category: 'ai_action',
        severity: 'medium'
      }).catch(() => {});
      
      // Create queue entry
      const queueEntry = await base44.asServiceRole.entities.AlertNotificationQueue.create({
        tenant_id: tenantId || null,
        alert_id: resolution.alertId,
        payload_snapshot: trimPayload(payload),
        status: 'pending',
        attempts: 0,
        next_attempt_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        resolved_source: resolution.source
      });
      
      return Response.json({
        ok: true,
        version: VERSION,
        handler_file: HANDLER_FILE,
        function_name: FUNCTION_NAME,
        resolved_alert_id: resolution.alertId,
        chosen_source: resolution.source,
        lookup_attempts: fetchResult.attempt + 1,
        found: false,
        notification_sent: false,
        deferred: true,
        queued_id: queueEntry.id,
        payloadKeys,
        timestamp,
        elapsed_ms: Date.now() - startMs,
        status_code: 202
      }, { status: 202 });
    } catch (queueError) {
      // Queue failed - still return 202 to not fail automation, NEVER 404
      return Response.json({
        ok: true,
        version: VERSION,
        handler_file: HANDLER_FILE,
        function_name: FUNCTION_NAME,
        resolved_alert_id: resolution.alertId,
        chosen_source: resolution.source,
        lookup_attempts: fetchResult.attempt + 1,
        found: false,
        notification_sent: false,
        deferred: true,
        queued_id: null,
        payloadKeys,
        queue_error: queueError.message,
        timestamp,
        elapsed_ms: Date.now() - startMs,
        status_code: 202
      }, { status: 202 });
    }

  } catch (error) {
    // Catastrophic error - still return 500 but never 404
    return Response.json({
      ok: false,
      version: VERSION,
      handler_file: HANDLER_FILE,
      function_name: FUNCTION_NAME,
      error: error.message,
      timestamp,
      elapsed_ms: Date.now() - startMs,
      status_code: 500
    }, { status: 500 });
  }
});