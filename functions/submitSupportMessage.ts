import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERSION = 'submit_support_message_v1';

function normalizeShop(shop = '') {
  const clean = String(shop || '').trim().toLowerCase().replace(/^https?:\/\//, '');
  if (!clean) return '';
  return clean.includes('.myshopify.com') ? clean : `${clean}.myshopify.com`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));

    const trimmedMessage = String(body?.message || '').trim();
    if (!trimmedMessage) {
      return Response.json({ ok: false, reason: 'missing_message', version: VERSION }, { status: 400 });
    }

    let tenantId = String(body?.tenant_id || '').trim();
    const shopDomain = normalizeShop(body?.shop || body?.shop_domain || body?.store_key);

    if (!tenantId && shopDomain) {
      const tenants = await db.Tenant.filter({ shop_domain: shopDomain }).catch(() => []);
      if (tenants.length) tenantId = tenants[0].id;
    }

    if (!tenantId) {
      return Response.json({ ok: false, reason: 'missing_tenant', version: VERSION }, { status: 400 });
    }

    const userEmail =
      String(body?.user_email || '').trim() ||
      (shopDomain ? `merchant@${shopDomain}` : null);
    const userName = String(body?.user_name || '').trim() || null;
    const issueType = String(body?.issue_type || 'general').trim().toLowerCase();
    const priority = issueType === 'bug' ? 'high' : 'medium';

    const aiResolution = String(body?.ai_resolution || '').trim() || null;
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const duplicateWindowMs = 2 * 60 * 1000;

    const recent = await db.SupportConversation.filter(
      { tenant_id: tenantId, ...(userEmail ? { user_email: userEmail } : {}) },
      '-created_date',
      25
    ).catch(() => []);
    const duplicate = recent.find((row) => {
      const sameSummary = String(row?.issue_summary || '').trim() === trimmedMessage.slice(0, 140).trim();
      if (!sameSummary) return false;
      const createdAt = row?.created_date ? new Date(row.created_date).getTime() : 0;
      if (!createdAt) return false;
      return Date.now() - createdAt < duplicateWindowMs;
    });
    if (duplicate?.id) {
      return Response.json({ ok: true, id: duplicate.id, deduped: true, version: VERSION }, { status: 200 });
    }

    const created = await db.SupportConversation.create({
      tenant_id: tenantId,
      user_email: userEmail,
      user_name: userName,
      issue_summary: trimmedMessage.slice(0, 140),
      issue_type: issueType || 'general',
      priority,
      status: 'open',
      messages,
      ai_resolution: aiResolution,
      auto_fix_triggered: false,
      needs_owner_attention: false,
      owner_notified_at: null,
    });

    return Response.json({ ok: true, id: created?.id || null, version: VERSION }, { status: 200 });
  } catch (error) {
    console.error('[submitSupportMessage] error:', error);
    return Response.json(
      { ok: false, reason: 'server_error', message: error?.message || String(error), version: VERSION },
      { status: 500 }
    );
  }
});
