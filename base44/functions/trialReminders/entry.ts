import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * TRIAL REMINDER AUTOMATION
 * Sends email/SMS reminders to users approaching trial end
 * Runs on a schedule to check all tenants
 */

const TRIAL_DAYS = 14;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // This can be called by automation without user auth
    const body = await req.json().catch(() => ({}));
    const { action = 'send_reminders' } = body;

    if (action === 'send_reminders') {
      return await sendTrialReminders(base44);
    }

    if (action === 'check_expirations') {
      return await checkAndLockExpired(base44);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Trial reminders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function sendTrialReminders(base44) {
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
    subscription_tier: 'trial',
    status: 'active'
  });

  const now = new Date();
  const remindersSent = [];
  const reminderDays = [7, 3, 1, 0]; // Days before expiration to send reminders

  for (const tenant of tenants) {
    if (!tenant.trial_ends_at) continue;

    const trialEnd = new Date(tenant.trial_ends_at);
    const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Check if we should send a reminder today
    if (reminderDays.includes(daysRemaining)) {
      const email = tenant.billing_email;
      if (!email) continue;

      // Check if we already sent this reminder
      const existingReminders = await base44.asServiceRole.entities.AuditLog.filter({
        tenant_id: tenant.id,
        action: `trial_reminder_${daysRemaining}d`
      });

      if (existingReminders.length > 0) continue;

      // Send the appropriate reminder
      const emailContent = getEmailContent(daysRemaining, tenant.shop_name || 'your store');
      
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: emailContent.subject,
          body: emailContent.body
        });

        // Log that we sent this reminder
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id: tenant.id,
          action: `trial_reminder_${daysRemaining}d`,
          entity_type: 'tenant',
          entity_id: tenant.id,
          performed_by: 'trial_reminder_automation',
          description: `Sent ${daysRemaining}-day trial reminder to ${email}`
        });

        remindersSent.push({
          tenant_id: tenant.id,
          email,
          days_remaining: daysRemaining
        });
      } catch (e) {
        console.error('Failed to send reminder:', e);
      }
    }
  }

  return Response.json({
    success: true,
    reminders_sent: remindersSent.length,
    details: remindersSent
  });
}

async function checkAndLockExpired(base44) {
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
    subscription_tier: 'trial',
    status: 'active'
  });

  const now = new Date();
  const locked = [];

  for (const tenant of tenants) {
    if (!tenant.trial_ends_at) continue;

    const trialEnd = new Date(tenant.trial_ends_at);
    
    if (now >= trialEnd) {
      // Trial expired - lock the account
      await base44.asServiceRole.entities.Tenant.update(tenant.id, {
        status: 'pending_setup'
      });

      // Send final email
      if (tenant.billing_email) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: tenant.billing_email,
            subject: '🔒 Your ProfitShield Trial Has Ended',
            body: `Hi,

Your 14-day ProfitShield trial has ended and your account has been temporarily locked.

During your trial, you:
• Analyzed orders for profit leaks
• Protected your margins with AI insights
• Detected potential risks in real-time

Don't lose access to these powerful tools!

👉 Subscribe Now to Continue: https://app.profitshield.ai/Pricing

Your data is safe and will be fully restored upon subscription.

Questions? Just reply to this email.

- The ProfitShield Team`
          });
        } catch (e) {
          console.error('Failed to send expiration email:', e);
        }
      }

      // Create alert
      await base44.asServiceRole.entities.Alert.create({
        tenant_id: tenant.id,
        alert_type: 'trial_expired',
        severity: 'high',
        title: 'Trial Expired - Account Locked',
        message: 'Your 14-day trial has ended. Subscribe to continue using ProfitShield.',
        status: 'pending',
        action_url: '/Pricing',
        action_label: 'Subscribe Now'
      });

      locked.push({
        tenant_id: tenant.id,
        shop_name: tenant.shop_name
      });
    }
  }

  return Response.json({
    success: true,
    accounts_locked: locked.length,
    details: locked
  });
}

function getEmailContent(daysRemaining, storeName) {
  if (daysRemaining === 7) {
    return {
      subject: '🕐 7 Days Left on Your ProfitShield Trial',
      body: `Hi there,

You're one week into your ProfitShield trial for ${storeName}! Here's what you've accomplished:

✅ Connected your store
✅ Started analyzing order profitability
✅ Enabled AI-powered profit protection

You have 7 days left to explore all features. After that, you'll need to subscribe to continue.

Ready to commit? Choose your plan:
👉 https://app.profitshield.ai/Pricing

Starter: $29/mo - 500 orders
Growth: $79/mo - 2,000 orders + AI Insights
Pro: $199/mo - 10,000 orders + Full Automation

Questions? Just reply to this email.

- The ProfitShield Team`
    };
  }

  if (daysRemaining === 3) {
    return {
      subject: '⏰ 3 Days Left - Don\'t Lose Your Profit Protection',
      body: `Hi there,

Only 3 days left on your ProfitShield trial!

Don't lose the profit protection you've built for ${storeName}. Subscribe now to:

• Keep all your analytics and insights
• Continue AI-powered risk detection
• Maintain automated profit protection

👉 Subscribe Now: https://app.profitshield.ai/Pricing

Special offer: Use code TRIAL10 for 10% off your first 3 months!

- The ProfitShield Team`
    };
  }

  if (daysRemaining === 1) {
    return {
      subject: '🚨 FINAL DAY - Your Trial Ends Tomorrow',
      body: `Hi there,

⚠️ Your ProfitShield trial ends TOMORROW.

After that, your account will be locked and you'll lose access to:
• Profit leak detection
• AI-powered analytics
• Risk scoring and alerts
• All your historical data views

Don't let your profits go unprotected!

👉 Subscribe NOW: https://app.profitshield.ai/Pricing

Your data will be safe, but you won't be able to access it until you subscribe.

- The ProfitShield Team`
    };
  }

  if (daysRemaining === 0) {
    return {
      subject: '🔴 Your Trial Ends TODAY',
      body: `Hi there,

This is your final reminder - your ProfitShield trial ends TODAY.

At midnight, your account will be locked.

👉 Subscribe now to keep protecting your profits: https://app.profitshield.ai/Pricing

We'd hate to see you go. If you have any questions or concerns, reply to this email right away.

- The ProfitShield Team`
    };
  }

  return {
    subject: 'Your ProfitShield Trial Update',
    body: `Your trial has ${daysRemaining} days remaining. Subscribe at https://app.profitshield.ai/Pricing`
  };
}