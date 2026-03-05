/**
 * AI Support Watchdog + Guardian
 * 
 * Monitors support tickets, clusters repeated issues,
 * triggers autonomous repairs, and alerts the admin owner
 * when human intervention is required.
 * 
 * CRITICAL: Does NOT touch Shopify OAuth, billing, webhooks, or sync systems.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const OWNER_EMAIL = 'support@profitshield.ai';
const ADMIN_EMAIL = 'rohan.a.roberts@gmail.com';

// Issue patterns that can be auto-resolved
const AUTO_RESOLVABLE_PATTERNS = [
  { pattern: /integration.*disconnect|store.*not.*connect|shopify.*disconnect/i, type: 'integration_disconnect', action: 'check_integration' },
  { pattern: /sync.*fail|orders.*not.*loading|data.*not.*show/i, type: 'sync_failure', action: 'check_sync' },
  { pattern: /dashboard.*not.*load|page.*blank|screen.*empty/i, type: 'ui_rendering', action: 'check_frontend' },
  { pattern: /automation.*fail|alert.*not.*trigger/i, type: 'automation_failure', action: 'check_automations' },
];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const startedAt = new Date().toISOString();
  const report = { watchdog_run_at: startedAt, actions_taken: [], escalations: 0, auto_resolved: 0, issues_clustered: [] };

  try {
    const body = await req.json().catch(() => ({}));
    const manualTrigger = body.manual === true;

    // --- 1. Fetch recent open/escalated conversations ---
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const conversations = await base44.asServiceRole.entities.SupportConversation.filter(
      { status: 'open' }, '-created_date', 200
    );
    const escalated = await base44.asServiceRole.entities.SupportConversation.filter(
      { needs_owner_attention: true, status: 'escalated' }, '-created_date', 50
    );

    report.open_count = conversations.length;
    report.escalated_count = escalated.length;

    // --- 2. Cluster repeated issues (watchdog pattern detection) ---
    const patternCounts = {};
    for (const conv of conversations) {
      const text = `${conv.issue_summary || ''} ${(conv.messages || []).map(m => m.content).join(' ')}`;
      for (const p of AUTO_RESOLVABLE_PATTERNS) {
        if (p.pattern.test(text)) {
          patternCounts[p.type] = (patternCounts[p.type] || 0) + 1;
        }
      }
    }

    // --- 3. Guardian protocol: auto-repair if threshold met ---
    for (const [issueType, count] of Object.entries(patternCounts)) {
      if (count >= 2 || manualTrigger) {
        const pattern = AUTO_RESOLVABLE_PATTERNS.find(p => p.type === issueType);
        report.issues_clustered.push({ type: issueType, count, action: pattern?.action });

        // Create a self-heal event for the build guardian to pick up
        try {
          await base44.asServiceRole.entities.SelfHealingEvent.create({
            trigger_source: 'support_watchdog',
            issue_type: issueType,
            issue_count: count,
            action_taken: pattern?.action || 'investigate',
            status: 'pending',
            notes: `Watchdog detected ${count} users reporting "${issueType}" — guardian repair initiated`,
            created_at: new Date().toISOString(),
          });
          report.auto_resolved++;
          report.actions_taken.push(`Guardian repair queued for: ${issueType} (${count} reports)`);
        } catch (e) {
          // SelfHealingEvent may not exist — log as AuditLog instead
          try {
            await base44.asServiceRole.entities.AuditLog.create({
              tenant_id: 'system',
              action: 'support_watchdog_guardian_repair',
              entity_type: 'SupportConversation',
              performed_by: 'system',
              description: `Guardian repair queued: ${issueType} — ${count} user reports`,
              category: 'ai_action',
              severity: count >= 3 ? 'high' : 'medium',
              metadata: { issue_type: issueType, count, action: pattern?.action }
            });
          } catch (_) {}
          report.actions_taken.push(`Audit logged guardian repair: ${issueType}`);
        }
      }
    }

    // --- 4. Auto-resolve AI-fixable conversations ---
    const autoResolvable = conversations.filter(conv => {
      if (conv.auto_fix_triggered && conv.status === 'open') {
        const ageHours = (Date.now() - new Date(conv.created_date).getTime()) / (1000 * 60 * 60);
        return ageHours > 1; // Auto-close after 1h if fix was triggered and no escalation
      }
      return false;
    });

    for (const conv of autoResolvable.slice(0, 10)) {
      try {
        await base44.asServiceRole.entities.SupportConversation.update(conv.id, {
          status: 'ai_resolved',
          ai_resolution: 'Autonomous repair system applied fix. Issue auto-resolved.',
          resolved_at: new Date().toISOString()
        });
        report.auto_resolved++;
        report.actions_taken.push(`Auto-resolved ticket: ${conv.id} (${conv.issue_summary?.slice(0, 50)})`);
      } catch (e) {
        console.warn(`Failed to auto-resolve ${conv.id}:`, e.message);
      }
    }

    // --- 5. Alert admin for escalated conversations requiring human attention ---
    const needsHuman = escalated.filter(conv => !conv.owner_notified_at || 
      (Date.now() - new Date(conv.owner_notified_at).getTime()) > 2 * 60 * 60 * 1000 // Re-alert every 2h
    );

    if (needsHuman.length > 0) {
      report.escalations = needsHuman.length;

      const ticketSummaries = needsHuman.slice(0, 5).map((conv, i) => 
        `${i + 1}. [${conv.priority?.toUpperCase() || 'MEDIUM'}] ${conv.user_email || 'Anonymous'} — ${conv.issue_summary?.slice(0, 100) || 'Support request'}\n   Created: ${conv.created_date ? new Date(conv.created_date).toLocaleString() : 'unknown'}`
      ).join('\n\n');

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: ADMIN_EMAIL,
          from_name: 'ProfitShield Support Watchdog',
          subject: `🚨 [ProfitShield] ${needsHuman.length} Support Ticket${needsHuman.length > 1 ? 's' : ''} Need Your Attention`,
          body: `ProfitShield AI Support Watchdog Alert
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${needsHuman.length} support ticket${needsHuman.length > 1 ? 's' : ''} require your personal attention. The AI could not fully resolve these issues.

TICKETS NEEDING REVIEW:
${ticketSummaries}

SYSTEM STATUS:
• Open Tickets: ${conversations.length}
• Auto-Resolved This Run: ${report.auto_resolved}
• Guardian Repairs Queued: ${report.issues_clustered.length}
• Watchdog Run: ${new Date().toLocaleString()}

ACTION REQUIRED:
→ Log in to ProfitShield and open Support Inbox to review and respond.
→ Respond directly to users via the inbox — they'll receive your reply via email.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ProfitShield AI Support Watchdog
support@profitshield.ai`
        });

        // Mark as notified
        for (const conv of needsHuman) {
          try {
            await base44.asServiceRole.entities.SupportConversation.update(conv.id, {
              owner_notified_at: new Date().toISOString()
            });
          } catch (_) {}
        }

        report.actions_taken.push(`Admin alert email sent for ${needsHuman.length} escalated tickets`);
      } catch (emailErr) {
        console.error('[SupportWatchdog] Email alert failed:', emailErr.message);
        report.actions_taken.push(`Email alert failed: ${emailErr.message}`);
      }
    }

    // --- 6. Log watchdog run summary ---
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: 'system',
        action: 'support_watchdog_run',
        performed_by: 'system',
        description: `Watchdog scan: ${conversations.length} open, ${report.escalations} escalated, ${report.auto_resolved} auto-resolved`,
        category: 'ai_action',
        severity: report.escalations > 0 ? 'medium' : 'low',
        metadata: report
      });
    } catch (_) {}

    console.log('[SupportWatchdog] Complete:', JSON.stringify({ open: conversations.length, escalated: report.escalations, auto_resolved: report.auto_resolved }));

    return Response.json({ success: true, ...report });

  } catch (error) {
    console.error('[SupportWatchdog] Fatal:', error.message);
    return Response.json({ success: false, error: error.message, ...report }, { status: 500 });
  }
});