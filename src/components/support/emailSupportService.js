import { base44 } from '@/api/base44Client';

export const DEFAULT_SUPPORT_EMAIL = 'support@profitshield-ai.com';

export class EmailService {
  static async ensureDefaultSystemEmail(tenantId) {
    if (!tenantId) return DEFAULT_SUPPORT_EMAIL;
    const rows = await base44.entities.TenantSettings.filter({ tenant_id: tenantId }).catch(() => []);
    const existing = rows[0];
    if (!existing) {
      await base44.entities.TenantSettings.create({
        tenant_id: tenantId,
        support_email: DEFAULT_SUPPORT_EMAIL
      }).catch(() => {});
      return DEFAULT_SUPPORT_EMAIL;
    }
    if (!existing.support_email) {
      await base44.entities.TenantSettings.update(existing.id, {
        support_email: DEFAULT_SUPPORT_EMAIL
      }).catch(() => {});
      return DEFAULT_SUPPORT_EMAIL;
    }
    return existing.support_email;
  }

  static async sendEmail({ to, subject, body }) {
    return base44.integrations.Core.SendEmail({ to, subject, body });
  }
}

export class SupportTicketQueue {
  static async createTicket({
    tenantId,
    userEmail,
    userName,
    issueSummary,
    issueType = 'general',
    priority = 'medium',
    messages = [],
    aiResolution = null,
    autoFixTriggered = false,
    needsOwnerAttention = false
  }) {
    return base44.entities.SupportConversation.create({
      tenant_id: tenantId || 'unknown',
      user_email: userEmail || null,
      user_name: userName || null,
      issue_summary: issueSummary || 'Support request',
      issue_type: issueType,
      priority,
      status: needsOwnerAttention ? 'escalated' : 'open',
      messages,
      ai_resolution: aiResolution,
      auto_fix_triggered: autoFixTriggered,
      needs_owner_attention: needsOwnerAttention,
      owner_notified_at: needsOwnerAttention ? new Date().toISOString() : null
    });
  }
}

export class SupportInboxEntity {
  static async list(filter = {}, limit = 100) {
    return base44.entities.SupportConversation.filter(filter, '-created_date', limit);
  }

  static async update(id, patch) {
    return base44.entities.SupportConversation.update(id, patch);
  }
}

