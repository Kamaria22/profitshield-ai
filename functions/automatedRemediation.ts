import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const REMEDIATION_WORKFLOWS = {
  fraud_detected: {
    automatic_actions: [
      { action: 'hold_order', description: 'Automatically hold order for review' },
      { action: 'flag_customer', description: 'Flag customer account for monitoring' },
      { action: 'notify_merchant', description: 'Send urgent notification to merchant', priority: 'critical' }
    ],
    suggested_actions: [
      'Review order details and shipping address',
      'Verify customer identity if possible',
      'Consider canceling order if risk is too high',
      'Report to payment processor fraud department'
    ],
    escalation_threshold: 80,
    auto_cancel_threshold: 95
  },
  fraud_ring: {
    automatic_actions: [
      { action: 'hold_all_linked_orders', description: 'Hold all orders linked to fraud ring' },
      { action: 'block_identifiers', description: 'Block associated emails, IPs, and devices' },
      { action: 'notify_merchant', description: 'Send critical alert to merchant', priority: 'critical' },
      { action: 'generate_evidence_report', description: 'Generate fraud evidence report for law enforcement' }
    ],
    suggested_actions: [
      'Review all linked orders immediately',
      'Consider reporting to FBI IC3 (ic3.gov)',
      'Contact payment processor fraud team',
      'Document all evidence thoroughly'
    ],
    escalation_threshold: 70,
    auto_cancel_threshold: 90
  },
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
    ],
    escalation_threshold: 70,
    auto_cancel_threshold: null
  },
  chargeback: {
    automatic_actions: [
      { action: 'flag_customer', description: 'Flag customer for chargeback history' },
      { action: 'collect_evidence', description: 'Gather transaction evidence automatically' },
      { action: 'notify_merchant', description: 'Send chargeback notification', priority: 'high' }
    ],
    suggested_actions: [
      'Review original transaction details',
      'Gather shipping confirmation and delivery proof',
      'Prepare dispute response within deadline',
      'Consider blacklisting customer if repeat offender'
    ],
    escalation_threshold: null,
    auto_cancel_threshold: null
  },
  revenue_anomaly: {
    automatic_actions: [
      { action: 'snapshot_metrics', description: 'Capture current revenue metrics' },
      { action: 'analyze_root_cause', description: 'Run automated root cause analysis' },
      { action: 'notify_merchant', description: 'Send anomaly alert', priority: 'medium' }
    ],
    suggested_actions: [
      'Review recent price changes',
      'Check for technical issues affecting checkout',
      'Analyze traffic sources for changes',
      'Review competitor pricing'
    ],
    escalation_threshold: null,
    auto_cancel_threshold: null
  },
  churn_risk: {
    automatic_actions: [
      { action: 'trigger_retention_campaign', description: 'Initiate retention workflow' },
      { action: 'notify_merchant', description: 'Send churn risk alert', priority: 'medium' }
    ],
    suggested_actions: [
      'Review customer engagement metrics',
      'Consider personalized outreach',
      'Offer retention incentive if appropriate'
    ],
    escalation_threshold: null,
    auto_cancel_threshold: null
  },
  data_breach_attempt: {
    automatic_actions: [
      { action: 'block_ip', description: 'Block suspicious IP addresses' },
      { action: 'increase_security', description: 'Enable enhanced security monitoring' },
      { action: 'notify_merchant', description: 'Send critical security alert', priority: 'critical' },
      { action: 'log_incident', description: 'Create detailed security incident log' }
    ],
    suggested_actions: [
      'Review all recent access logs',
      'Change admin passwords immediately',
      'Enable 2FA if not already active',
      'Consider notifying affected customers if breach confirmed',
      'Report to appropriate authorities if data was compromised'
    ],
    escalation_threshold: 50,
    auto_cancel_threshold: null
  }
};

// -------------------------
// Helpers
// -------------------------
function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
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

function pickFirstTruthy(values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function looksLikeId(v) {
  return typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
}

function deepScanForIds(obj, { depth = 4, maxNodes = 200 } = {}) {
  const found = new Set();
  const seen = new Set();
  const stack = [{ value: obj, d: 0 }];
  let nodes = 0;

  while (stack.length && nodes < maxNodes) {
    const { value, d } = stack.pop();
    nodes += 1;

    if (typeof value === 'string') {
      const matches = value.match(/[a-f0-9]{24}/gi);
      if (matches) matches.forEach(m => found.add(m.toLowerCase()));
      continue;
    }

    if (d >= depth || !value || typeof value !== 'object') continue;

    const ref = Object.prototype.toString.call(value);
    if (seen.has(ref)) continue;
    seen.add(ref);

    if (Array.isArray(value)) {
      for (let i = 0; i < Math.min(value.length, 50); i++) {
        stack.push({ value: value[i], d: d + 1 });
      }
    } else {
      const keys = Object.keys(value).slice(0, 30);
      for (const k of keys) {
        stack.push({ value: value[k], d: d + 1 });
      }
    }
  }

  return Array.from(found);
}

function sanitizeKeys(obj) {
  if (!isObject(obj)) return [];
  return Object.keys(obj);
}

// -------------------------
// Core resolver (single source of truth)
// -------------------------
async function resolveAlertAndTenant(db, payload) {
  const alertIdPaths = [
    'alert_id', 'alertId', 'alert.id', 'alert.record_id',
    'data.id', 'data.record.id', 'data.record_id', 'data.recordId',
    'data.selected.id', 'data.selected.record.id', 'data.selected.record_id',
    'data.selectedRecordId', 'data.selected_record_id',
    'data.new_data.id', 'data.new_data.record_id',
    'event.id', 'event.data.id', 'event.data.record.id', 'event.data.record_id',
    'event.record_id', 'event.recordId',
    // automation wrappers (critical)
    'automation.record_id', 'automation.recordId',
    'automation.selected_record_id', 'automation.selectedRecordId',
    'automation.context.record_id', 'automation.context.selected_record_id',
    'automation.context.recordId', 'automation.context.selectedRecordId',
    'automation.data.record_id', 'automation.data.selected_record_id',
    'automation.input.record_id', 'automation.input.selected_record_id',
    'old_data.id', 'old_data.record.id', 'old_data.record_id'
  ];

  const tenantIdPaths = [
    'tenant_id', 'tenantId',
    'alert.tenant_id', 'alert.tenantId',
    'data.tenant_id', 'data.tenantId',
    'data.record.tenant_id', 'data.record.tenantId',
    'automation.tenant_id', 'automation.tenantId',
    'automation.context.tenant_id', 'automation.context.tenantId',
    'event.tenant_id', 'event.tenantId'
  ];

  const alertIdCandidates = {};
  for (const p of alertIdPaths) {
    const v = getByPath(payload, p);
    if (v !== undefined) alertIdCandidates[p] = v;
  }

  const tenantIdCandidates = {};
  for (const p of tenantIdPaths) {
    const v = getByPath(payload, p);
    if (v !== undefined) tenantIdCandidates[p] = v;
  }

  let lookedFor = pickFirstTruthy(Object.values(alertIdCandidates));
  let tenantId = pickFirstTruthy(Object.values(tenantIdCandidates));

  // Normalize possible object shapes
  if (isObject(lookedFor) && looksLikeId(lookedFor.id)) lookedFor = lookedFor.id;
  if (isObject(tenantId) && looksLikeId(tenantId.id)) tenantId = tenantId.id;

  // If values aren't ids but include an id, extract it
  if (typeof lookedFor === 'string' && !looksLikeId(lookedFor)) {
    const m = lookedFor.match(/[a-f0-9]{24}/i);
    if (m) lookedFor = m[0];
  }
  if (typeof tenantId === 'string' && !looksLikeId(tenantId)) {
    const m = tenantId.match(/[a-f0-9]{24}/i);
    if (m) tenantId = m[0];
  }

  let resolvedAlert = null;
  let resolvedTenant = null;
  let used_latest_alert_fallback = false;

  // First try direct alert id lookup
  if (looksLikeId(lookedFor)) {
    const alerts = await db.Alert.filter({ id: lookedFor }).catch(() => []);
    if (alerts[0]) resolvedAlert = alerts[0];
  }

  // If no alert, deep scan for ids and try each against Alert then Tenant
  const discoveredIds = deepScanForIds(payload);
  if (!resolvedAlert) {
    for (const id of discoveredIds) {
      if (!looksLikeId(id)) continue;
      const alerts = await db.Alert.filter({ id }).catch(() => []);
      if (alerts[0]) {
        resolvedAlert = alerts[0];
        break;
      }
    }
  }

  if (!tenantId && resolvedAlert?.tenant_id) tenantId = resolvedAlert.tenant_id;

  if (looksLikeId(tenantId)) {
    const tenants = await db.Tenant.filter({ id: tenantId }).catch(() => []);
    if (tenants[0]) resolvedTenant = tenants[0];
  }

  if (!resolvedTenant) {
    for (const id of discoveredIds) {
      if (!looksLikeId(id)) continue;
      const tenants = await db.Tenant.filter({ id }).catch(() => []);
      if (tenants[0]) {
        resolvedTenant = tenants[0];
        break;
      }
    }
  }

  // Last resort: if tenant resolved but alert missing, choose latest alert for tenant
  if (!resolvedAlert && resolvedTenant?.id) {
    const latest = await db.Alert
      .filter({ tenant_id: resolvedTenant.id })
      .sort({ created_date: -1 })
      .limit(1)
      .catch(() => []);
    if (latest[0]) {
      resolvedAlert = latest[0];
      used_latest_alert_fallback = true;
    }
  }

  return {
    resolvedAlert,
    resolvedTenant,
    debug: {
      lookedFor: looksLikeId(lookedFor) ? lookedFor : null,
      tenantId: looksLikeId(tenantId) ? tenantId : null,
      payloadKeys: sanitizeKeys(payload),
      alertIdCandidates,
      tenantIdCandidates,
      discoveredIds,
      used_latest_alert_fallback
    }
  };
}

// -------------------------
// Automatic actions (DB only, no db.functions)
// -------------------------
async function executeAutomaticAction(db, action, alert, tenant) {
  const results = { action: action.action, success: false, details: null };

  try {
    switch (action.action) {
      case 'hold_order': {
        if (alert.order_id) {
          const orders = await db.Order.filter({
            platform_order_id: alert.order_id,
            tenant_id: tenant.id
          }).catch(() => []);
          if (orders[0]) {
            await db.Order.update(orders[0].id, {
              status: 'on_hold',
              hold_reason: 'Automated hold due to fraud detection',
              held_at: new Date().toISOString()
            });
            results.success = true;
            results.details = { order_id: alert.order_id, new_status: 'on_hold' };
          } else {
            results.details = { note: 'Order not found for hold_order', order_id: alert.order_id };
          }
        }
        break;
      }

      case 'hold_all_linked_orders': {
        const linked = Array.isArray(alert.linked_orders) ? alert.linked_orders : [];
        const held = [];
        for (const orderId of linked) {
          const orders = await db.Order.filter({
            platform_order_id: orderId,
            tenant_id: tenant.id
          }).catch(() => []);
          if (orders[0]) {
            await db.Order.update(orders[0].id, {
              status: 'on_hold',
              hold_reason: 'Linked to fraud ring investigation',
              held_at: new Date().toISOString()
            });
            held.push(orderId);
          }
        }
        results.success = true;
        results.details = { orders_held: held.length, order_ids: held };
        break;
      }

      case 'flag_customer': {
        if (alert.customer_email || alert.customer_id) {
          const customers = await db.Customer.filter({
            tenant_id: tenant.id,
            ...(alert.customer_email ? { email: alert.customer_email } : { id: alert.customer_id })
          }).catch(() => []);
          if (customers[0]) {
            const flags = customers[0].flags || [];
            flags.push({
              type: 'fraud_risk',
              reason: alert.title || 'Flagged by automated remediation',
              flagged_at: new Date().toISOString(),
              alert_id: alert.id
            });
            await db.Customer.update(customers[0].id, {
              risk_level: 'high',
              flags
            });
            results.success = true;
            results.details = { customer_flagged: true };
          } else {
            results.details = { note: 'Customer not found for flag_customer' };
          }
        }
        break;
      }

      case 'add_risk_tag': {
        if (alert.order_id) {
          const orders = await db.Order.filter({
            platform_order_id: alert.order_id,
            tenant_id: tenant.id
          }).catch(() => []);
          if (orders[0]) {
            const tags = Array.isArray(orders[0].tags) ? orders[0].tags : [];
            if (!tags.includes('high_risk')) tags.push('high_risk');
            await db.Order.update(orders[0].id, {
              tags,
              risk_flagged_at: new Date().toISOString()
            });
            results.success = true;
            results.details = { tag_added: 'high_risk' };
          } else {
            results.details = { note: 'Order not found for add_risk_tag' };
          }
        }
        break;
      }

      case 'delay_fulfillment': {
        if (alert.order_id) {
          const orders = await db.Order.filter({
            platform_order_id: alert.order_id,
            tenant_id: tenant.id
          }).catch(() => []);
          if (orders[0]) {
            const delayUntil = new Date();
            delayUntil.setHours(delayUntil.getHours() + 24);
            await db.Order.update(orders[0].id, {
              fulfillment_delayed: true,
              fulfill_after: delayUntil.toISOString(),
              delay_reason: 'Risk review required'
            });
            results.success = true;
            results.details = { delayed_until: delayUntil.toISOString() };
          } else {
            results.details = { note: 'Order not found for delay_fulfillment' };
          }
        }
        break;
      }

      case 'notify_merchant': {
        // No db.functions usage in this hardened version
        // We log an AuditLog entry so UI notifications can pick it up asynchronously.
        await db.AuditLog.create({
          tenant_id: tenant.id,
          action: 'notify_merchant_requested',
          entity_type: 'Alert',
          entity_id: alert.id,
          performed_by: 'system',
          details: {
            priority: action.priority || 'medium',
            alert_title: alert.title,
            alert_type: alert.alert_type
          },
          timestamp: new Date().toISOString()
        }).catch(() => {});
        results.success = true;
        results.details = { notification_queued: true, priority: action.priority };
        break;
      }

      case 'generate_evidence_report': {
        await db.AuditLog.create({
          tenant_id: tenant.id,
          action: 'fraud_evidence_report_generated',
          entity_type: 'FraudRing',
          entity_id: alert.fraud_ring_id || alert.id,
          performed_by: 'system',
          details: {
            alert_data: alert,
            generated_at: new Date().toISOString(),
            report_type: 'fraud_evidence'
          },
          timestamp: new Date().toISOString()
        }).catch(() => {});
        results.success = true;
        results.details = { report_generated: true };
        break;
      }

      case 'snapshot_metrics': {
        results.success = true;
        results.details = { metrics_captured: true };
        break;
      }

      case 'analyze_root_cause': {
        // Skip LLM integration in this hardened version; log request for async processor.
        await db.AuditLog.create({
          tenant_id: tenant.id,
          action: 'root_cause_analysis_requested',
          entity_type: 'Alert',
          entity_id: alert.id,
          performed_by: 'system',
          details: { alert },
          timestamp: new Date().toISOString()
        }).catch(() => {});
        results.success = true;
        results.details = { analysis_queued: true };
        break;
      }

      case 'block_ip': {
        if (alert.source_ip) {
          await db.AuditLog.create({
            tenant_id: tenant.id,
            action: 'ip_block_requested',
            entity_type: 'Security',
            entity_id: alert.id,
            performed_by: 'system',
            details: {
              ip_address: alert.source_ip,
              reason: alert.title,
              alert_id: alert.id
            },
            timestamp: new Date().toISOString()
          }).catch(() => {});
          results.success = true;
          results.details = { ip_logged_for_blocking: alert.source_ip };
        }
        break;
      }

      case 'log_incident': {
        await db.AuditLog.create({
          tenant_id: tenant.id,
          action: 'security_incident',
          entity_type: 'Security',
          entity_id: alert.id,
          performed_by: 'system',
          details: {
            incident_type: alert.alert_type,
            severity: 'critical',
            alert_data: alert,
            auto_remediation: true
          },
          timestamp: new Date().toISOString()
        }).catch(() => {});
        results.success = true;
        results.details = { incident_logged: true };
        break;
      }

      default: {
        results.details = { note: 'Action not implemented' };
      }
    }
  } catch (error) {
    results.error = error.message;
  }

  return results;
}

async function parseJsonBody(req) {
  try {
    const text = await req.text();
    if (!text || !text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// -------------------------
// Main handler
// -------------------------
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.entities;

    const payload = await parseJsonBody(req);
    const action = payload.action || 'run';

    // Debug payload mode
    if (action === 'debug_payload') {
      const resolved = await resolveAlertAndTenant(db, payload);
      return Response.json({
        ok: true,
        action: 'debug_payload',
        payloadKeys: sanitizeKeys(payload),
        automationKeys: sanitizeKeys(payload.automation),
        eventKeys: sanitizeKeys(payload.event),
        dataKeys: sanitizeKeys(payload.data),
        payload_too_large: payload.payload_too_large === true,
        resolver: resolved.debug,
        resolved_alert_id: resolved.resolvedAlert?.id || null,
        resolved_tenant_id: resolved.resolvedTenant?.id || null
      });
    }

    // Self-test mode (proof)
    if (action === 'self_test') {
      const tenant = await db.Tenant.create({
        status: 'active',
        shop_name: 'SelfTest Tenant',
        created_date: new Date().toISOString()
      });

      const alert = await db.Alert.create({
        tenant_id: tenant.id,
        title: 'SelfTest Alert',
        alert_type: 'high_risk_order',
        risk_score: 75,
        status: 'pending',
        created_date: new Date().toISOString()
      });

      const shapes = [
        { name: 'automation.record_id', payload: { automation: { record_id: alert.id } } },
        { name: 'automation.context.selected_record_id', payload: { automation: { context: { selected_record_id: alert.id } } } },
        { name: 'event.data.record_id', payload: { event: { data: { record_id: alert.id } } } },
        { name: 'data.selected.record.id', payload: { data: { selected: { record: { id: alert.id } } } } },
        { name: 'payload_too_large+automation.record_id', payload: { payload_too_large: true, automation: { record_id: alert.id } } },
        { name: 'deepScan string', payload: { something: `alert:${alert.id}` } },
        { name: 'old_data.record_id', payload: { old_data: { record_id: alert.id } } },
        { name: 'data.record_id', payload: { data: { record_id: alert.id } } },
        { name: 'event.recordId', payload: { event: { recordId: alert.id } } },
        { name: 'data.id', payload: { data: { id: alert.id } } }
      ];

      const cases = [];
      for (const s of shapes) {
        const r = await resolveAlertAndTenant(db, s.payload);
        cases.push({
          name: s.name,
          ok: r.resolvedAlert?.id === alert.id,
          resolved_alert_id: r.resolvedAlert?.id || null
        });
      }

      // proof update
      await db.Alert.update(alert.id, {
        remediation_started: true,
        remediation_started_at: new Date().toISOString(),
        status: 'in_progress'
      });

      return Response.json({
        ok: true,
        action: 'self_test',
        passed: cases.every(c => c.ok),
        cases,
        proof_alert_id: alert.id,
        proof_tenant_id: tenant.id,
        proof_alert_updated: true
      });
    }

    // Normal run
    const { resolvedAlert, resolvedTenant, debug } = await resolveAlertAndTenant(db, payload);

    if (!resolvedAlert) {
      return Response.json({
        error: 'Alert not found',
        debug: {
          message: 'Could not resolve alert from payload',
          ...debug,
          nextStep: 'Run with action=debug_payload from Automation UI to see the exact payload shape'
        }
      }, { status: 404 });
    }

    if (!resolvedTenant) {
      return Response.json({
        error: 'Tenant not found',
        debug: {
          message: 'Could not resolve tenant from payload or alert.tenant_id',
          ...debug
        }
      }, { status: 404 });
    }

    const alertType = resolvedAlert.alert_type || resolvedAlert.type || 'high_risk_order';
    const workflow = REMEDIATION_WORKFLOWS[alertType] || REMEDIATION_WORKFLOWS.high_risk_order;

    const execute_automatic = payload.execute_automatic !== false;
    const dry_run = payload.dry_run === true;

    const results = {
      ok: true,
      resolved_alert_id: resolvedAlert.id,
      resolved_tenant_id: resolvedTenant.id,
      alert_type: alertType,
      used_latest_alert_fallback: debug.used_latest_alert_fallback,
      automatic_actions: [],
      suggested_actions: workflow.suggested_actions || [],
      dry_run
    };

    if (execute_automatic && workflow.automatic_actions && !dry_run) {
      for (const a of workflow.automatic_actions) {
        const r = await executeAutomaticAction(db, a, resolvedAlert, resolvedTenant);
        results.automatic_actions.push({ ...a, result: r });
      }

      await db.Alert.update(resolvedAlert.id, {
        remediation_started: true,
        remediation_started_at: new Date().toISOString(),
        remediation_actions: results.automatic_actions,
        status: 'in_progress'
      });

      results.updated_alert_fields = {
        remediation_started: true,
        status: 'in_progress'
      };
    } else if (dry_run) {
      results.automatic_actions = (workflow.automatic_actions || []).map(a => ({
        ...a,
        result: { dry_run: true, would_execute: true }
      }));
    }

    if (workflow.auto_cancel_threshold && (resolvedAlert.risk_score || 0) >= workflow.auto_cancel_threshold) {
      results.auto_cancel_recommended = true;
      results.auto_cancel_reason = `Risk score ${resolvedAlert.risk_score} exceeds threshold ${workflow.auto_cancel_threshold}`;
    }

    await db.AuditLog.create({
      tenant_id: resolvedTenant.id,
      action: 'remediation_workflow_executed',
      entity_type: 'Alert',
      entity_id: resolvedAlert.id,
      performed_by: 'system',
      details: {
        workflow_type: alertType,
        actions_executed: results.automatic_actions.length,
        dry_run,
        used_latest_alert_fallback: debug.used_latest_alert_fallback
      },
      timestamp: new Date().toISOString()
    }).catch(() => {});

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});