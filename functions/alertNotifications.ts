import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERSION = "alertNotifications_v2026_03_03_fix2_selected_record_priority";

// Priority resolver - checks automation UI "selected record" fields FIRST
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

const ALERT_TEMPLATES = {
  fraud_detected: {
    subject: '🚨 URGENT: Fraud Detected on Your Store',
    severity: 'critical',
    isScam: true
  },
  fraud_ring: {
    subject: '🚨 CRITICAL: Fraud Ring Detected - Multiple Orders Affected',
    severity: 'critical',
    isScam: true
  },
  chargeback: {
    subject: '⚠️ Chargeback Alert: Immediate Action Required',
    severity: 'high',
    isScam: false
  },
  high_risk_order: {
    subject: '⚠️ High Risk Order Detected',
    severity: 'high',
    isScam: false
  },
  suspicious_activity: {
    subject: '⚠️ Suspicious Activity Detected on Your Account',
    severity: 'high',
    isScam: true
  },
  data_breach_attempt: {
    subject: '🚨 CRITICAL: Potential Data Breach Attempt Detected',
    severity: 'critical',
    isScam: true
  },
  revenue_anomaly: {
    subject: '📊 Revenue Anomaly Alert',
    severity: 'medium',
    isScam: false
  },
  churn_risk: {
    subject: '📉 Customer Churn Risk Alert',
    severity: 'medium',
    isScam: false
  },
  margin_alert: {
    subject: '💰 Profit Margin Alert',
    severity: 'medium',
    isScam: false
  },
  supplier_risk: {
    subject: '📦 Supplier Risk Alert',
    severity: 'medium',
    isScam: false
  },
  default: {
    subject: '🔔 ProfitShield Alert',
    severity: 'medium',
    isScam: false
  }
};

function generateEmailBody(alert, tenant, isScam) {
  const storeName = tenant?.shop_name || 'Your Store';
  const timestamp = new Date().toLocaleString('en-US', { 
    dateStyle: 'full', 
    timeStyle: 'short',
    timeZone: 'America/New_York'
  });

  let scamNotice = '';
  if (isScam) {
    scamNotice = `
<div style="background: #FEE2E2; border: 2px solid #DC2626; border-radius: 8px; padding: 16px; margin: 16px 0;">
  <h3 style="color: #DC2626; margin: 0 0 8px 0;">⚠️ POTENTIAL SCAM ACTIVITY DETECTED</h3>
  <p style="margin: 0; color: #7F1D1D;">
    This alert indicates potential fraudulent or scam activity. We recommend:
  </p>
  <ul style="color: #7F1D1D; margin: 8px 0;">
    <li>Do NOT fulfill any flagged orders until verified</li>
    <li>Document all evidence for potential law enforcement reporting</li>
    <li>Consider filing a report with the FBI's IC3 (ic3.gov) if losses exceed $1,000</li>
    <li>Contact your payment processor's fraud department</li>
    <li>Review your store's security settings immediately</li>
  </ul>
</div>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10B981 0%, #0D9488 100%); padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">🛡️ ProfitShield Alert</h1>
    <p style="color: #D1FAE5; margin: 8px 0 0 0;">${storeName}</p>
  </div>
  
  <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
    ${scamNotice}
    
    <div style="background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 16px;">
      <h2 style="color: #0F172A; margin: 0 0 12px 0; font-size: 18px;">${alert.title || 'Alert Notification'}</h2>
      
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <span style="background: ${alert.severity === 'critical' ? '#FEE2E2' : alert.severity === 'high' ? '#FEF3C7' : '#E0F2FE'}; color: ${alert.severity === 'critical' ? '#DC2626' : alert.severity === 'high' ? '#D97706' : '#0369A1'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
          ${alert.severity || 'Medium'} Priority
        </span>
        <span style="background: #F1F5F9; color: #64748B; padding: 4px 12px; border-radius: 20px; font-size: 12px;">
          ${alert.alert_type || 'Alert'}
        </span>
      </div>
      
      <p style="color: #475569; margin: 0 0 16px 0;">${alert.description || alert.message || 'An alert has been triggered that requires your attention.'}</p>
      
      ${alert.order_id ? `
      <div style="background: #F8FAFC; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <p style="margin: 0; font-size: 14px;"><strong>Order ID:</strong> ${alert.order_id}</p>
        ${alert.order_total ? `<p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Order Total:</strong> $${alert.order_total}</p>` : ''}
        ${alert.customer_email ? `<p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Customer:</strong> ${alert.customer_email}</p>` : ''}
      </div>
      ` : ''}
      
      ${alert.risk_score ? `
      <div style="background: ${alert.risk_score >= 70 ? '#FEE2E2' : alert.risk_score >= 40 ? '#FEF3C7' : '#D1FAE5'}; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <p style="margin: 0; font-size: 14px;"><strong>Risk Score:</strong> ${alert.risk_score}/100</p>
        ${alert.risk_factors ? `<p style="margin: 4px 0 0 0; font-size: 14px;"><strong>Risk Factors:</strong> ${Array.isArray(alert.risk_factors) ? alert.risk_factors.join(', ') : alert.risk_factors}</p>` : ''}
      </div>
      ` : ''}
      
      ${alert.impact_amount ? `
      <div style="background: #FEF3C7; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
        <p style="margin: 0; font-size: 14px;"><strong>Estimated Impact:</strong> $${alert.impact_amount.toLocaleString()}</p>
      </div>
      ` : ''}
      
      ${alert.recommended_actions ? `
      <div style="margin-top: 16px;">
        <h4 style="color: #0F172A; margin: 0 0 8px 0;">Recommended Actions:</h4>
        <ul style="margin: 0; padding-left: 20px; color: #475569;">
          ${Array.isArray(alert.recommended_actions) 
            ? alert.recommended_actions.map(a => `<li>${a}</li>`).join('') 
            : `<li>${alert.recommended_actions}</li>`}
        </ul>
      </div>
      ` : ''}
    </div>
    
    <div style="text-align: center; margin-top: 20px;">
      <a href="https://profitshield.app/Alerts" style="display: inline-block; background: linear-gradient(135deg, #10B981 0%, #0D9488 100%); color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        View in Dashboard →
      </a>
    </div>
    
    <p style="color: #94A3B8; font-size: 12px; text-align: center; margin-top: 24px;">
      Alert generated on ${timestamp}<br>
      Alert ID: ${alert.id || 'N/A'}
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 16px; color: #94A3B8; font-size: 12px;">
    <p>You're receiving this because you have alerts enabled for ${storeName}.</p>
    <p>
      <a href="https://profitshield.app/Settings" style="color: #10B981;">Manage notification settings</a>
    </p>
  </div>
</body>
</html>`;
}

function generateSMSBody(alert, isScam) {
  const severity = alert.severity?.toUpperCase() || 'ALERT';
  let message = `ProfitShield ${severity}: ${alert.title || 'New Alert'}`;
  
  if (isScam) {
    message += ' ⚠️ POTENTIAL FRAUD/SCAM DETECTED.';
  }
  
  if (alert.order_id) {
    message += ` Order: ${alert.order_id}`;
  }
  
  if (alert.risk_score) {
    message += ` Risk: ${alert.risk_score}/100`;
  }
  
  if (alert.impact_amount) {
    message += ` Impact: $${alert.impact_amount}`;
  }
  
  message += ' View details: profitshield.app/Alerts';
  
  if (message.length > 160) {
    message = message.substring(0, 157) + '...';
  }
  
  return message;
}

Deno.serve(async (req) => {
  const startMs = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    
    let payload = {};
    try {
      const text = await req.text();
      if (text) {
        payload = JSON.parse(text);
      }
    } catch (e) {
      payload = {};
    }
    
    const payloadKeys = Object.keys(payload);
    const eventKeys = payload.event ? Object.keys(payload.event) : [];
    const dataKeys = payload.data ? Object.keys(payload.data) : [];
    const payloadTooLarge = payload.payload_too_large === true;

    // SELF_TEST: Create temporary alert, test resolver on multiple payload shapes
    if (payload.action === 'self_test') {
      try {
        const tempAlert = await base44.entities.Alert.create({
          tenant_id: 'test_tenant_' + Date.now(),
          type: 'test_alert',
          severity: 'low',
          title: 'Self-Test Alert'
        });

        if (!tempAlert || !tempAlert.id) {
          return Response.json({
            ok: false,
            version: VERSION,
            action: 'self_test',
            error: 'Failed to create test alert',
            elapsed_ms: Date.now() - startMs
          }, { status: 500 });
        }

        // Test multiple payload shapes
        const testShapes = [
          { shape: 'event.entity_id', payload: { event: { entity_id: tempAlert.id } } },
          { shape: 'automation.record_id', payload: { automation: { record_id: tempAlert.id } } },
          { shape: 'data.id', payload: { data: { id: tempAlert.id } } },
          { shape: 'data.record.id', payload: { data: { record: { id: tempAlert.id } } } },
          { shape: 'event.data.entity_id', payload: { event: { data: { entity_id: tempAlert.id } } } },
          { shape: 'event.data.id', payload: { event: { data: { id: tempAlert.id } } } }
        ];

        const testResults = [];
        for (const test of testShapes) {
          const resolution = resolveAlertId(test.payload);
          const hits = await base44.entities.Alert.filter({ id: resolution.alertId }).catch(() => []);
          testResults.push({
            shape: test.shape,
            resolved: resolution.alertId === tempAlert.id,
            lookup_count: hits.length
          });
        }

        // Cleanup
        await base44.entities.Alert.delete(tempAlert.id).catch(() => {});

        return Response.json({
          ok: true,
          version: VERSION,
          action: 'self_test',
          passed: testResults.every(r => r.resolved && r.lookup_count === 1),
          test_results: testResults,
          elapsed_ms: Date.now() - startMs
        });
      } catch (e) {
        return Response.json({
          ok: false,
          version: VERSION,
          action: 'self_test',
          error: e.message,
          elapsed_ms: Date.now() - startMs
        }, { status: 500 });
      }
    }

    // DEBUG_PAYLOAD: Analyze payload, attempt lookup, return proof
    if (payload.action === 'debug_payload') {
      const resolution = resolveAlertId(payload);
      
      let hits = [];
      if (resolution.alertId) {
        try {
          hits = await base44.entities.Alert.filter({ id: resolution.alertId }).catch(() => []);
        } catch (e) {
          // Silent
        }
      }

      return Response.json({
        ok: true,
        version: VERSION,
        action: 'debug_payload',
        payloadKeys,
        eventKeys,
        dataKeys,
        payload_too_large: payloadTooLarge,
        resolved_alert_id: resolution.alertId,
        chosen_source: resolution.source,
        lookup_count: hits.length,
        looked_for_id: resolution.alertId,
        candidates: resolution.candidates,
        elapsed_ms: Date.now() - startMs
      });
    }

    // NORMAL RUN: Resolve, lookup, send notification
    const resolution = resolveAlertId(payload);
    const { alertId, source: chosenSource } = resolution;

    if (!alertId) {
      return Response.json({
        ok: false,
        version: VERSION,
        error: 'Alert ID not resolved',
        payloadKeys,
        eventKeys,
        dataKeys,
        candidates: resolution.candidates,
        elapsed_ms: Date.now() - startMs
      }, { status: 400 });
    }

    // Lookup alert
    let hits = [];
    try {
      hits = await base44.entities.Alert.filter({ id: alertId }).catch(() => []);
    } catch (e) {
      // Silent
    }

    if (hits.length === 0) {
      return Response.json({
        ok: false,
        version: VERSION,
        error: 'Alert not found',
        resolved_alert_id: alertId,
        chosen_source: chosenSource,
        lookup_count: 0,
        payloadKeys,
        eventKeys,
        dataKeys,
        payload_too_large: payloadTooLarge,
        elapsed_ms: Date.now() - startMs
      }, { status: 404 });
    }

    const alertData = hits[0];
    let tenant_id = alertData.tenant_id || payload.tenant_id;

    if (!tenant_id) {
      return Response.json({
        ok: false,
        version: VERSION,
        error: 'Tenant ID not found',
        resolved_alert_id: alertId,
        lookup_count: 1,
        elapsed_ms: Date.now() - startMs
      }, { status: 400 });
    }

    // Fetch tenant and settings
    let tenant = null;
    let settings = null;

    try {
      const [tenantResult, settingsResult] = await Promise.all([
        base44.entities.Tenant.filter({ id: tenant_id }, '-updated_date', 1).catch(() => []),
        base44.entities.TenantSettings.filter({ tenant_id }, '-updated_date', 1).catch(() => [])
      ]);
      tenant = tenantResult?.[0] || null;
      settings = settingsResult?.[0] || null;
    } catch (e) {
      // Silent
    }

    const forceNotify = payload.force || payload.execute_automatic === true;
    if (!forceNotify && settings?.notifications_enabled === false) {
      return Response.json({
        ok: true,
        version: VERSION,
        resolved_alert_id: alertId,
        chosen_source: chosenSource,
        lookup_count: 1,
        skipped_reason: 'notifications_disabled',
        elapsed_ms: Date.now() - startMs
      });
    }

    const alertType = alertData.alert_type || alertData.type || 'default';
    const template = ALERT_TEMPLATES[alertType] || ALERT_TEMPLATES.default;
    const isScam = template.isScam || alertData.is_scam || alertData.fraud_detected;

    const recipientEmail = settings?.notification_email || tenant?.owner_email || alertData.merchant_email;

    if (!recipientEmail) {
      return Response.json({
        ok: false,
        version: VERSION,
        resolved_alert_id: alertId,
        chosen_source: chosenSource,
        lookup_count: 1,
        error: 'No recipient email configured',
        elapsed_ms: Date.now() - startMs
      }, { status: 400 });
    }

    const results = {
      email: null,
      sms: null,
      push: null
    };

    // Send email notification
    if (payload.notification_channels?.includes('email') !== false) {
      try {
        const emailBody = generateEmailBody(alertData, tenant, isScam);
        const subject = isScam 
          ? `🚨 SCAM ALERT: ${alertData.title || template.subject}`
          : template.subject;

        await base44.integrations.Core.SendEmail({
          to: recipientEmail,
          subject: subject,
          body: emailBody,
          from_name: 'ProfitShield Alerts'
        });

        results.email = { success: true, recipient: recipientEmail };
      } catch (error) {
        results.email = { success: false, error: error.message };
      }
    }

    // Update alert
    try {
      await base44.entities.Alert.update(alertData.id, {
        notification_sent: true,
        notification_sent_at: new Date().toISOString(),
        notification_channels: payload.notification_channels || ['email']
      }).catch(() => {});
    } catch (e) {
      // Silent
    }

    return Response.json({
      ok: true,
      version: VERSION,
      resolved_alert_id: alertId,
      chosen_source: chosenSource,
      lookup_count: 1,
      payloadKeys,
      eventKeys,
      dataKeys,
      payload_too_large: payloadTooLarge,
      alert_type: alertType,
      is_scam: isScam,
      results,
      notifications_sent: results.email?.success ? 1 : 0,
      elapsed_ms: Date.now() - startMs
    });

  } catch (error) {
    return Response.json({
      ok: false,
      version: VERSION,
      error: error.message,
      elapsed_ms: Date.now() - startMs
    }, { status: 500 });
  }
});