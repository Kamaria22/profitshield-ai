/**
 * Autonomous Marketing Email System
 * Sends personalized, event-triggered emails to merchants.
 * 
 * CRITICAL: Does NOT touch Shopify OAuth, webhooks, billing, or sync systems.
 * Triggered by: scheduled runs or explicit action payloads.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ADMIN_EMAIL = 'rohan.a.roberts@gmail.com';
const FROM_NAME = 'ProfitShield AI';
const MARKETING_ML_VERSION = 'marketing_ml_v1';
const CAMPAIGN_COOLDOWN_DAYS = {
  onboarding_day1: 30,
  integration_reminder: 14,
  profit_opportunity: 7,
  trial_ending: 10,
  risk_alert: 1
};

const DEFAULT_MARKETING_WEIGHTS = {
  onboarding_day1: 0.8,
  integration_reminder: 1.0,
  profit_opportunity: 0.9,
  trial_ending: 1.2,
  risk_alert: 1.1
};

function clamp(val, min = 0.2, max = 2.5) {
  return Math.max(min, Math.min(max, Number(val) || 0));
}

function isRecent(ts, days) {
  if (!ts) return false;
  const ageMs = Date.now() - new Date(ts).getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}

function learnMarketingWeights(previous = {}, signals = {}) {
  const w = { ...DEFAULT_MARKETING_WEIGHTS, ...previous };
  const next = { ...w };

  // Positive outcomes increase campaign confidence.
  if (signals.reviewSubmitted7d > 0) next.profit_opportunity += 0.08;
  if (signals.referralActivated7d > 0) next.profit_opportunity += 0.12;
  if (signals.integrationConnected) next.integration_reminder -= 0.2;
  if (!signals.integrationConnected) next.integration_reminder += 0.12;
  if (signals.daysToTrialEnd <= 5 && signals.daysToTrialEnd >= 0) next.trial_ending += 0.18;
  if (signals.openSupportTickets > 5) {
    // Reduce promotional pressure while support load is high.
    next.profit_opportunity -= 0.12;
    next.integration_reminder -= 0.08;
  }

  // Light decay keeps the model adaptive to newer behavior.
  for (const key of Object.keys(next)) {
    next[key] = clamp((next[key] * 0.95) + (w[key] * 0.05));
  }
  return next;
}

function pickAdaptiveCampaign({ tenant, signals, weights, state }) {
  const ageHours = (Date.now() - new Date(tenant.created_date).getTime()) / 3600000;
  const candidates = [];

  if (ageHours <= 26 && !tenant.onboarding_email_sent) {
    candidates.push({ type: 'onboarding_day1', base: 1.25 });
  }
  if (ageHours > 72 && ageHours < 168 && !signals.integrationConnected && !tenant.integration_reminder_sent) {
    candidates.push({ type: 'integration_reminder', base: 1.1 });
  }
  if (signals.daysToTrialEnd > 2.5 && signals.daysToTrialEnd < 3.5 && tenant.plan_status === 'trial' && !tenant.trial_ending_email_sent) {
    candidates.push({ type: 'trial_ending', base: 1.3 });
  }
  if (signals.integrationConnected && signals.openSupportTickets <= 5) {
    candidates.push({ type: 'profit_opportunity', base: 1.0 });
  }

  const lastSentByType = state?.last_sent_by_type || {};
  const scored = candidates
    .filter((c) => !isRecent(lastSentByType[c.type], CAMPAIGN_COOLDOWN_DAYS[c.type] || 7))
    .map((c) => ({
      ...c,
      score: Number(((weights[c.type] || 1) * c.base).toFixed(4))
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0] || null;
}

function extractTrendKeywords(texts = []) {
  const stop = new Set(['the', 'and', 'for', 'your', 'with', 'from', 'that', 'this', 'have', 'has', 'are', 'was', 'you', 'our', 'app', 'shopify', 'profitshield', 'support', 'issue', 'error']);
  const counts = {};
  for (const raw of texts) {
    const tokens = String(raw || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
    for (const t of tokens) {
      if (stop.has(t)) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([kw]) => kw);
}

// Email templates
const TEMPLATES = {
  onboarding_day1: (tenant) => ({
    subject: `🚀 Welcome to ProfitShield — Let's protect your profits`,
    body: `Hi there,

Welcome to ProfitShield AI! We're excited to help you protect and grow your store profits.

Here's how to get the most out of ProfitShield in your first 24 hours:

✅ STEP 1: Connect Your Shopify Store
Go to Settings > Integrations and connect your Shopify store to start syncing orders automatically.

✅ STEP 2: Review Your Profit Dashboard
Once connected, your AI dashboard will show your real profit margin, risk scores, and profit leaks.

✅ STEP 3: Set Up Alert Rules
Visit Alerts > Rules to configure notifications for low-margin orders, high-risk fraud signals, and shipping losses.

🎯 Your 14-day free trial gives you full access to all Pro features.

Need help? Just reply to this email or open the Help chat inside ProfitShield.

— The ProfitShield AI Team
support@profitshield.ai`
  }),

  integration_reminder: (tenant) => ({
    subject: `⚡ Your ProfitShield store isn't connected yet`,
    body: `Hi,

We noticed your ProfitShield account is set up but your store isn't connected yet.

You're missing out on:
• Real-time profit tracking on every order
• AI fraud detection saving you from chargebacks
• Automatic shipping loss detection
• Margin leak forensics

It only takes 2 minutes to connect your Shopify store.

→ Log in and click "Connect Store" to get started.

If you need help, reply to this email and our team will assist you immediately.

— ProfitShield AI
support@profitshield.ai`
  }),

  profit_opportunity: (tenant, data) => ({
    subject: `💡 AI found a profit opportunity in your store`,
    body: `Hi,

ProfitShield's AI has analyzed your recent orders and found something important:

${data.insight || 'We detected potential profit improvements in your store.'}

${data.estimated_value ? `Estimated opportunity: $${data.estimated_value.toLocaleString()}/month` : ''}

To act on this insight:
1. Log in to ProfitShield
2. Visit Dashboard > AI Insights
3. Review the detailed breakdown

This opportunity was identified by analyzing your order margin patterns, shipping costs, and risk exposure.

— ProfitShield AI
support@profitshield.ai`
  }),

  trial_ending: (tenant) => ({
    subject: `⏰ Your ProfitShield trial ends soon`,
    body: `Hi,

Your ProfitShield free trial ends in 3 days.

During your trial, ProfitShield has been protecting your profits with:
✅ AI fraud detection
✅ Real-time margin tracking
✅ Profit leak detection
✅ Risk score monitoring

To continue protecting your profits, upgrade to a paid plan before your trial ends.

→ Visit Billing in your dashboard to choose a plan.

Questions? Reply to this email and we'll help you find the right plan.

— ProfitShield AI
support@profitshield.ai`
  }),

  risk_alert: (tenant, data) => ({
    subject: `🚨 High-risk order detected on your store`,
    body: `Hi,

ProfitShield AI detected a high-risk order on your store that needs your attention.

Order Details:
• Order: ${data.order_number || 'N/A'}
• Risk Score: ${data.risk_score || 'High'}
• Risk Reason: ${data.risk_reason || 'Multiple fraud signals detected'}

Recommended Action: ${data.recommended_action || 'Review this order before fulfilling'}

→ Log in to ProfitShield > Orders to review and take action.

This alert was automatically generated by ProfitShield's AI risk engine.

— ProfitShield AI
support@profitshield.ai`
  })
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const action = body.action || 'run_scheduled';
  const manualTrigger = body.manual === true || action === 'send_manual';
  const results = { sent: 0, skipped: 0, failed: 0, emails: [] };

  try {
    const requester = await base44.auth.me().catch(() => null);
    const requesterRole = String(requester?.role || requester?.app_role || '').toLowerCase();
    const requesterIsPrivileged = requesterRole === 'owner' || requesterRole === 'admin';

    if (manualTrigger && !requesterIsPrivileged) {
      return Response.json(
        { success: false, error: 'forbidden', message: 'Only owner/admin can run marketing email automation.' },
        { status: 403 }
      );
    }

    // Scheduled run: send event-triggered emails to all tenants
    if (action === 'run_scheduled') {
      const tenants = await base44.asServiceRole.entities.Tenant.list('-created_date', 100);
      const trendCorpus = [];

      for (const tenant of tenants) {
        if (!tenant.billing_email && !tenant.shop_domain) continue;
        const email = tenant.billing_email || null;
        if (!email) { results.skipped++; continue; }

        try {
          const [settingsRows, integrations, reviewRequests, referrals, supportConversations] = await Promise.all([
            base44.asServiceRole.entities.TenantSettings.filter({ tenant_id: tenant.id }).catch(() => []),
            base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenant.id, platform: 'shopify' }).catch(() => []),
            base44.asServiceRole.entities.ReviewRequest.filter({ tenant_id: tenant.id }).catch(() => []),
            base44.asServiceRole.entities.Referral.filter({ referrer_tenant_id: tenant.id }).catch(() => []),
            base44.asServiceRole.entities.SupportConversation.filter({ tenant_id: tenant.id }, '-created_date', 50).catch(() => [])
          ]);
          const settings = settingsRows[0] || null;
          if (settings?.marketing_email_enabled === false) {
            results.skipped++;
            continue;
          }

          trendCorpus.push(...supportConversations.map((s) => s.issue_summary || s.last_message || s.user_email || ''));

          const integrationConnected = integrations.some((i) => i.status === 'connected');
          const reviewSubmitted7d = reviewRequests.filter((r) => r.review_submitted && isRecent(r.shown_at || r.created_date, 7)).length;
          const referralActivated7d = referrals.filter((r) => r.status === 'activated' && isRecent(r.activated_at || r.updated_date || r.created_date, 7)).length;
          const openSupportTickets = supportConversations.filter((s) => s.status === 'open' || s.needs_owner_attention).length;
          const daysToTrialEnd = tenant.trial_ends_at ? (new Date(tenant.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24) : 999;

          const signals = {
            integrationConnected,
            reviewSubmitted7d,
            referralActivated7d,
            openSupportTickets,
            daysToTrialEnd
          };

          const previousState = settings?.marketing_model_state || {};
          const learnedWeights = learnMarketingWeights(previousState.weights || DEFAULT_MARKETING_WEIGHTS, signals);
          const chosen = pickAdaptiveCampaign({
            tenant,
            signals,
            weights: learnedWeights,
            state: previousState
          });

          if (!chosen) {
            results.skipped++;
            continue;
          }

          let tpl;
          if (chosen.type === 'profit_opportunity') {
            tpl = TEMPLATES.profit_opportunity(tenant, {
              insight: integrationConnected
                ? 'Stores with active sync and alert rules are converting risk prevention into higher retained margin.'
                : 'Connecting your store and enabling AI rules typically unlocks the biggest profit lift in the first week.',
              estimated_value: Math.max(150, Math.round((reviewSubmitted7d * 80) + (referralActivated7d * 120)))
            });
          } else {
            tpl = TEMPLATES[chosen.type](tenant);
          }

          await base44.asServiceRole.integrations.Core.SendEmail({ to: email, from_name: FROM_NAME, ...tpl });
          const nowIso = new Date().toISOString();

          await base44.asServiceRole.entities.Tenant.update(tenant.id, {
            onboarding_email_sent: chosen.type === 'onboarding_day1' ? true : tenant.onboarding_email_sent,
            integration_reminder_sent: chosen.type === 'integration_reminder' ? true : tenant.integration_reminder_sent,
            trial_ending_email_sent: chosen.type === 'trial_ending' ? true : tenant.trial_ending_email_sent
          }).catch(() => {});

          const nextState = {
            version: MARKETING_ML_VERSION,
            updated_at: nowIso,
            weights: learnedWeights,
            signals,
            last_sent_by_type: {
              ...(previousState.last_sent_by_type || {}),
              [chosen.type]: nowIso
            }
          };
          if (settings?.id) {
            await base44.asServiceRole.entities.TenantSettings.update(settings.id, { marketing_model_state: nextState }).catch(() => {});
          } else {
            await base44.asServiceRole.entities.TenantSettings.create({ tenant_id: tenant.id, marketing_model_state: nextState }).catch(() => {});
          }

          results.sent++;
          results.emails.push({ type: chosen.type, to: email, tenant: tenant.id, ml_version: MARKETING_ML_VERSION, score: chosen.score });
        } catch (e) {
          results.failed++;
          console.error(`[MarketingEmail] Failed for tenant ${tenant.id}: ${e.message}`);
        }
      }

      // Persist global trend snapshot (non-blocking, for autonomous marketing evolution).
      try {
        const trendKeywords = extractTrendKeywords(trendCorpus);
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id: 'system',
          action: 'marketing_trend_snapshot',
          entity_type: 'growth',
          entity_id: 'autonomous_marketing',
          performed_by: requester?.email || 'system',
          description: `Autonomous marketing trend snapshot (${MARKETING_ML_VERSION})`,
          severity: 'low',
          category: 'growth',
          is_auto_action: true,
          metadata: {
            model_version: MARKETING_ML_VERSION,
            keywords: trendKeywords,
            sent: results.sent,
            skipped: results.skipped,
            failed: results.failed
          }
        });
      } catch (trendErr) {
        console.warn('[MarketingEmail] Trend snapshot failed:', trendErr?.message || String(trendErr));
      }
    }

    // Manual: send a specific email type to a specific tenant
    if (action === 'send_manual') {
      const { tenant_id, email_type, to_email, data: emailData } = body;
      if (!to_email || !email_type || !TEMPLATES[email_type]) {
        return Response.json({ success: false, error: 'Missing to_email or invalid email_type' }, { status: 400 });
      }
      const tenant = tenant_id ? await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id }).then(r => r[0]) : {};
      const tpl = TEMPLATES[email_type](tenant || {}, emailData || {});
      await base44.asServiceRole.integrations.Core.SendEmail({ to: to_email, from_name: FROM_NAME, ...tpl });
      results.sent++;
      results.emails.push({ type: email_type, to: to_email });
    }

    // Send admin summary
    if (results.sent > 0) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: ADMIN_EMAIL,
        from_name: 'ProfitShield Email Engine',
        subject: `📧 Marketing Email Summary — ${results.sent} sent`,
        body: `Autonomous Marketing Email Engine Report\n\nSent: ${results.sent}\nSkipped: ${results.skipped}\nFailed: ${results.failed}\n\nEmails:\n${results.emails.map(e => `• ${e.type} → ${e.to}`).join('\n')}`
      });
    }

    console.log(`[MarketingEmail] Done — sent=${results.sent} skipped=${results.skipped} failed=${results.failed}`);
    return Response.json({ success: true, action, ...results });

  } catch (error) {
    console.error('[MarketingEmail] Fatal:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
