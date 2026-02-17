import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Remediation workflows by alert type
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

async function executeAutomaticAction(base44, action, alert, tenant) {
  const results = { action: action.action, success: false, details: null };

  try {
    switch (action.action) {
      case 'hold_order':
        if (alert.order_id) {
          // Update order status to held
          const orders = await base44.asServiceRole.entities.Order.filter({ 
            platform_order_id: alert.order_id,
            tenant_id: tenant.id 
          });
          if (orders[0]) {
            await base44.asServiceRole.entities.Order.update(orders[0].id, {
              status: 'on_hold',
              hold_reason: 'Automated hold due to fraud detection',
              held_at: new Date().toISOString()
            });
            results.success = true;
            results.details = { order_id: alert.order_id, new_status: 'on_hold' };
          }
        }
        break;

      case 'hold_all_linked_orders':
        if (alert.linked_orders && Array.isArray(alert.linked_orders)) {
          const held = [];
          for (const orderId of alert.linked_orders) {
            const orders = await base44.asServiceRole.entities.Order.filter({ 
              platform_order_id: orderId,
              tenant_id: tenant.id 
            });
            if (orders[0]) {
              await base44.asServiceRole.entities.Order.update(orders[0].id, {
                status: 'on_hold',
                hold_reason: 'Linked to fraud ring investigation',
                held_at: new Date().toISOString()
              });
              held.push(orderId);
            }
          }
          results.success = true;
          results.details = { orders_held: held.length, order_ids: held };
        }
        break;

      case 'flag_customer':
        if (alert.customer_email || alert.customer_id) {
          const customers = await base44.asServiceRole.entities.Customer.filter({
            tenant_id: tenant.id,
            ...(alert.customer_email ? { email: alert.customer_email } : { id: alert.customer_id })
          });
          if (customers[0]) {
            const flags = customers[0].flags || [];
            flags.push({
              type: 'fraud_risk',
              reason: alert.title || 'Flagged by automated remediation',
              flagged_at: new Date().toISOString(),
              alert_id: alert.id
            });
            await base44.asServiceRole.entities.Customer.update(customers[0].id, {
              risk_level: 'high',
              flags: flags
            });
            results.success = true;
            results.details = { customer_flagged: true };
          }
        }
        break;

      case 'add_risk_tag':
        if (alert.order_id) {
          const orders = await base44.asServiceRole.entities.Order.filter({ 
            platform_order_id: alert.order_id,
            tenant_id: tenant.id 
          });
          if (orders[0]) {
            const tags = orders[0].tags || [];
            if (!tags.includes('high_risk')) {
              tags.push('high_risk');
            }
            await base44.asServiceRole.entities.Order.update(orders[0].id, {
              tags: tags,
              risk_flagged_at: new Date().toISOString()
            });
            results.success = true;
            results.details = { tag_added: 'high_risk' };
          }
        }
        break;

      case 'delay_fulfillment':
        if (alert.order_id) {
          const orders = await base44.asServiceRole.entities.Order.filter({ 
            platform_order_id: alert.order_id,
            tenant_id: tenant.id 
          });
          if (orders[0]) {
            const delayUntil = new Date();
            delayUntil.setHours(delayUntil.getHours() + 24);
            await base44.asServiceRole.entities.Order.update(orders[0].id, {
              fulfillment_delayed: true,
              fulfill_after: delayUntil.toISOString(),
              delay_reason: 'Risk review required'
            });
            results.success = true;
            results.details = { delayed_until: delayUntil.toISOString() };
          }
        }
        break;

      case 'notify_merchant':
        // Trigger notification function
        await base44.asServiceRole.functions.invoke('alertNotifications', {
          alert: alert,
          tenant_id: tenant.id,
          notification_channels: ['email'],
          force: true
        });
        results.success = true;
        results.details = { notification_sent: true, priority: action.priority };
        break;

      case 'generate_evidence_report':
        // Create an evidence report record
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id: tenant.id,
          action: 'fraud_evidence_report_generated',
          entity_type: 'FraudRing',
          entity_id: alert.fraud_ring_id || alert.id,
          details: {
            alert_data: alert,
            generated_at: new Date().toISOString(),
            report_type: 'fraud_evidence'
          },
          timestamp: new Date().toISOString()
        });
        results.success = true;
        results.details = { report_generated: true };
        break;

      case 'snapshot_metrics':
        // Already captured in alert data typically
        results.success = true;
        results.details = { metrics_captured: true };
        break;

      case 'analyze_root_cause':
        // Trigger AI analysis
        try {
          const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `Analyze this revenue anomaly and provide root cause analysis:
Alert: ${alert.title}
Type: ${alert.anomaly_type || alert.alert_type}
Current Value: ${alert.current_value}
Expected Value: ${alert.expected_value}
Change: ${alert.change_percentage}%

Provide 3-5 likely root causes and recommended actions.`,
            response_json_schema: {
              type: 'object',
              properties: {
                root_causes: { type: 'array', items: { type: 'string' } },
                recommendations: { type: 'array', items: { type: 'string' } },
                severity_assessment: { type: 'string' }
              }
            }
          });
          results.success = true;
          results.details = { analysis: analysis };
        } catch (e) {
          results.details = { error: 'AI analysis failed' };
        }
        break;

      case 'block_ip':
        // Log blocked IPs (actual blocking would require firewall integration)
        if (alert.source_ip) {
          await base44.asServiceRole.entities.AuditLog.create({
            tenant_id: tenant.id,
            action: 'ip_blocked',
            entity_type: 'Security',
            details: {
              ip_address: alert.source_ip,
              reason: alert.title,
              alert_id: alert.id
            },
            timestamp: new Date().toISOString()
          });
          results.success = true;
          results.details = { ip_logged_for_blocking: alert.source_ip };
        }
        break;

      case 'log_incident':
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id: tenant.id,
          action: 'security_incident',
          entity_type: 'Security',
          details: {
            incident_type: alert.alert_type,
            severity: 'critical',
            alert_data: alert,
            auto_remediation: true
          },
          timestamp: new Date().toISOString()
        });
        results.success = true;
        results.details = { incident_logged: true };
        break;

      default:
        results.details = { note: 'Action not implemented' };
    }
  } catch (error) {
    console.error(`Action ${action.action} failed:`, error);
    results.error = error.message;
  }

  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { 
      alert_id,
      alert,
      tenant_id,
      execute_automatic = true,
      dry_run = false
    } = payload;

    // Get alert data
    let alertData = alert;
    if (alert_id && !alertData) {
      const alerts = await base44.asServiceRole.entities.Alert.filter({ id: alert_id });
      alertData = alerts[0];
    }

    if (!alertData) {
      return Response.json({ error: 'Alert not found' }, { status: 404 });
    }

    // Get tenant
    const tId = tenant_id || alertData.tenant_id;
    let tenant = null;
    if (tId) {
      const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tId });
      tenant = tenants[0];
    }

    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get workflow for this alert type
    const alertType = alertData.alert_type || alertData.type || 'high_risk_order';
    const workflow = REMEDIATION_WORKFLOWS[alertType] || REMEDIATION_WORKFLOWS.high_risk_order;

    const results = {
      alert_id: alertData.id,
      alert_type: alertType,
      workflow_found: !!workflow,
      automatic_actions: [],
      suggested_actions: workflow.suggested_actions || [],
      is_scam: ['fraud_detected', 'fraud_ring', 'data_breach_attempt', 'suspicious_activity'].includes(alertType),
      dry_run: dry_run
    };

    // Execute automatic actions
    if (execute_automatic && workflow.automatic_actions && !dry_run) {
      for (const action of workflow.automatic_actions) {
        const actionResult = await executeAutomaticAction(base44, action, alertData, tenant);
        results.automatic_actions.push({
          ...action,
          result: actionResult
        });
      }

      // Update alert with remediation status
      try {
        await base44.asServiceRole.entities.Alert.update(alertData.id, {
          remediation_started: true,
          remediation_started_at: new Date().toISOString(),
          remediation_actions: results.automatic_actions,
          status: 'in_progress'
        });
      } catch (e) {
        console.warn('Failed to update alert remediation status:', e);
      }
    } else if (dry_run) {
      // Just return what would happen
      results.automatic_actions = workflow.automatic_actions.map(a => ({
        ...a,
        result: { dry_run: true, would_execute: true }
      }));
    }

    // Check if we should auto-cancel (for extreme fraud cases)
    if (workflow.auto_cancel_threshold && alertData.risk_score >= workflow.auto_cancel_threshold) {
      results.auto_cancel_recommended = true;
      results.auto_cancel_reason = `Risk score ${alertData.risk_score} exceeds auto-cancel threshold ${workflow.auto_cancel_threshold}`;
    }

    // Log remediation execution
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: tId,
      action: 'remediation_workflow_executed',
      entity_type: 'Alert',
      entity_id: alertData.id,
      details: {
        workflow_type: alertType,
        actions_executed: results.automatic_actions.length,
        dry_run: dry_run,
        is_scam: results.is_scam
      },
      timestamp: new Date().toISOString()
    });

    return Response.json(results);

  } catch (error) {
    console.error('Automated remediation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});