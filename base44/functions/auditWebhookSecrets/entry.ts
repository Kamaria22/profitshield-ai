/**
 * ADMIN AUDIT: Scan all tenants for missing webhook_secret
 * Returns a list of tenants that are vulnerable (fail-open if not fixed).
 * Admin-only.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const db = base44.asServiceRole;

    // Fetch all active/pending tenants
    const allTenants = await db.entities.Tenant.filter({}, '-created_date', 200);

    const vulnerable = [];
    const secure = [];
    const inactive = [];

    for (const t of allTenants) {
      if (t.status === 'inactive' || t.status === 'suspended') {
        inactive.push({ id: t.id, shop_domain: t.shop_domain, status: t.status });
        continue;
      }
      if (!t.webhook_secret) {
        vulnerable.push({
          id: t.id,
          shop_domain: t.shop_domain,
          shop_name: t.shop_name,
          status: t.status,
          platform: t.platform,
          created_date: t.created_date
        });
      } else {
        secure.push({ id: t.id, shop_domain: t.shop_domain });
      }
    }

    const totalActive = allTenants.filter(t => t.status !== 'inactive' && t.status !== 'suspended').length;
    const securityScore = totalActive > 0 ? Math.round((secure.length / totalActive) * 100) : 100;

    // Log audit event
    await db.entities.AuditLog.create({
      tenant_id: 'system',
      action: 'webhook_secret_audit',
      entity_type: 'Tenant',
      entity_id: 'all',
      performed_by: user.email || 'admin',
      description: `Webhook secret audit: ${vulnerable.length} vulnerable, ${secure.length} secure, ${inactive.length} inactive`,
      severity: vulnerable.length > 0 ? 'high' : 'low',
      category: 'security',
      metadata: { vulnerable_count: vulnerable.length, secure_count: secure.length, security_score: securityScore }
    }).catch(() => {});

    return Response.json({
      audit_at: new Date().toISOString(),
      security_score: securityScore,
      summary: {
        total: allTenants.length,
        active: totalActive,
        secure: secure.length,
        vulnerable: vulnerable.length,
        inactive: inactive.length
      },
      vulnerable_tenants: vulnerable,
      recommendation: vulnerable.length > 0
        ? 'Re-install the Shopify app for affected stores to regenerate webhook secrets via OAuth flow.'
        : 'All active tenants are secured.'
    });

  } catch (error) {
    console.error('[auditWebhookSecrets]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});