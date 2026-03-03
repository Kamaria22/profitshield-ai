import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import {
  withTimeout
} from './helpers/automationRuntime';

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
  
  // SMS max length consideration
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
      if (text) payload = JSON.parse(text);
    } catch (e) {
      payload = {};
    }
    
    // Priority 1: Explicit alert data in payload
    let alertData = payload.alert || payload.data;
    let tenant_id = payload.tenant_id;

    // Priority 2: If alertData exists, use its tenant_id
    if (alertData && !tenant_id) {
      tenant_id = alertData.tenant_id;
    }

    // Validate we have alert data
    if (!alertData || !alertData.id) {
      return Response.json({ 
        error: 'Alert not found',
        payloadKeys: Object.keys(payload),
        dataKeys: payload.data ? Object.keys(payload.data) : [],
        elapsed_ms: Date.now() - startMs
      }, { status: 404 });
    }

    // Get tenant data and settings with timeout (parallel for performance)
    const tId = tenant_id;
    let tenant = null;
    let settings = null;

    if (tId) {
      try {
        const [tenantResult, settingsResult] = await Promise.all([
          withTimeout(
            Promise.resolve(base44.asServiceRole.entities.Tenant.filter({ id: tId }, '-updated_date', 1)),
            2000
          ).catch(() => [null]),
          withTimeout(
            Promise.resolve(base44.asServiceRole.entities.TenantSettings.filter({ tenant_id: tId }, '-updated_date', 1)),
            2000
          ).catch(() => [null])
        ]);
        tenant = tenantResult?.[0] || null;
        settings = settingsResult?.[0] || null;
      } catch (e) {
        console.warn('[alertNotifications] fetch failed:', e.message);
      }
    }

    // Check notification preferences
    const forceNotify = payload.force || payload.execute_automatic === true;
    const notificationChannels = payload.notification_channels || ['email'];

    if (!forceNotify && settings?.notifications_enabled === false) {
      return Response.json({ 
        success: true, 
        skipped: true, 
        reason: 'Notifications disabled for tenant',
        elapsed_ms: Date.now() - startMs
      });
    }

    // Determine alert template and if it's a scam
    const alertType = alertData.alert_type || alertData.type || 'default';
    const template = ALERT_TEMPLATES[alertType] || ALERT_TEMPLATES.default;
    const isScam = template.isScam || alertData.is_scam || alertData.fraud_detected;

    // Get recipient email
    const recipientEmail = settings?.notification_email || 
                          tenant?.owner_email || 
                          alertData.merchant_email;

    if (!recipientEmail) {
      return Response.json({ 
        success: false, 
        error: 'No recipient email configured' 
      }, { status: 400 });
    }

    const results = {
      email: null,
      sms: null,
      push: null
    };

    // Send email notification
    if (notificationChannels.includes('email')) {
      try {
        const emailBody = generateEmailBody(alertData, tenant, isScam);
        const subject = isScam 
          ? `🚨 SCAM ALERT: ${alertData.title || template.subject}`
          : template.subject;

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: recipientEmail,
          subject: subject,
          body: emailBody,
          from_name: 'ProfitShield Alerts'
        });

        results.email = { success: true, recipient: recipientEmail };
      } catch (error) {
        console.error('Email send failed:', error);
        results.email = { success: false, error: error.message };
      }
    }

    // Generate SMS body (for logging/future SMS integration)
    if (notificationChannels.includes('sms')) {
      const smsBody = generateSMSBody(alertData, isScam);
      // SMS would require Twilio or similar integration
      // For now, log the SMS that would be sent
      console.log('SMS would be sent:', smsBody);
      results.sms = { 
        success: false, 
        message: smsBody,
        note: 'SMS integration requires Twilio setup' 
      };
    }

    // Update alert to mark notification sent
    if (alertData.id) {
      try {
        await withTimeout(
          Promise.resolve(base44.asServiceRole.entities.Alert.update(alertData.id, {
            notification_sent: true,
            notification_sent_at: new Date().toISOString(),
            notification_channels: notificationChannels
          })),
          2000
        );
      } catch (e) {
        console.warn('Failed to update alert notification status:', e);
      }
    }

    // Log the notification event
    try {
      await withTimeout(
        Promise.resolve(base44.asServiceRole.entities.AuditLog.create({
          tenant_id: tId,
          action: 'alert_notification_sent',
          entity_type: 'Alert',
          entity_id: alertData.id,
          performed_by: 'system',
          description: `Alert notification sent: ${alertType}`,
          category: 'ai_action',
          severity: 'medium'
        })),
        2000
      );
    } catch (e) {
      console.warn('Failed to log notification event:', e);
    }

    return Response.json({
      success: true,
      alert_id: alertData.id,
      is_scam: isScam,
      results,
      elapsed_ms: Date.now() - startMs
    });

  } catch (error) {
    console.error('Alert notification error:', error);
    return Response.json({ 
      error: error.message,
      elapsed_ms: Date.now() - startMs
    }, { status: 500 });
  }
});