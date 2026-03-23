import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VERSION = 'support_ai_agent_v1';
const MAX_MESSAGE_LEN = 1200;
const DEFAULT_WEIGHTS = {
  inj: 2.2,
  malware: 2.4,
  exploit: 2.0,
  pii: 1.8,
  ext_links: 1.2,
  len: 0.7,
  out_scope: 1.6,
  bias: -2.0,
};

const APP_SCOPE_KEYWORDS = [
  'profitshield', 'dashboard', 'order', 'orders', 'risk', 'alert', 'billing', 'plan', 'subscription',
  'trial', 'integration', 'shopify', 'sync', 'ticket', 'support', 'automation', 'analytics', 'customer',
  'email', 'settings', 'webhook', 'onboarding', 'pricing', 'pnl', 'profit'
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (all|previous|prior) instructions/i,
  /system prompt/i,
  /developer mode/i,
  /jailbreak/i,
  /bypass/i,
  /act as/i,
  /reveal .*secret/i,
  /show .*token/i,
  /api key/i,
];

const MALWARE_PATTERNS = [
  /malware/i,
  /ransomware/i,
  /payload/i,
  /exploit/i,
  /xss/i,
  /sql injection/i,
  /remote code execution/i,
  /shellcode/i,
  /credential stuffing/i,
  /phishing kit/i,
];

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

function normalizeShop(shop = '') {
  const clean = String(shop || '').trim().toLowerCase().replace(/^https?:\/\//, '');
  if (!clean) return '';
  return clean.includes('.myshopify.com') ? clean : `${clean}.myshopify.com`;
}

function hasAppScope(msg = '') {
  const text = String(msg || '').toLowerCase();
  if (!text) return true;
  return APP_SCOPE_KEYWORDS.some((k) => text.includes(k));
}

function extractFeatures(message: string) {
  const msg = String(message || '');
  const lower = msg.toLowerCase();
  const inj = PROMPT_INJECTION_PATTERNS.some((p) => p.test(msg)) ? 1 : 0;
  const malware = MALWARE_PATTERNS.some((p) => p.test(msg)) ? 1 : 0;
  const exploit = /(hack|breach|vulnerability|worm|botnet|ddos|inject)/i.test(msg) ? 1 : 0;
  const pii = /(password|secret|token|credit card|ssn|social security|2fa code)/i.test(msg) ? 1 : 0;
  const ext_links = /https?:\/\//i.test(msg) ? 1 : 0;
  const len = Math.min(lower.length / MAX_MESSAGE_LEN, 1);
  const out_scope = hasAppScope(msg) ? 0 : 1;
  return { inj, malware, exploit, pii, ext_links, len, out_scope };
}

function scoreThreat(features: Record<string, number>, weights: Record<string, number>) {
  const z =
    (weights.inj || 0) * features.inj +
    (weights.malware || 0) * features.malware +
    (weights.exploit || 0) * features.exploit +
    (weights.pii || 0) * features.pii +
    (weights.ext_links || 0) * features.ext_links +
    (weights.len || 0) * features.len +
    (weights.out_scope || 0) * features.out_scope +
    (weights.bias || 0);
  return sigmoid(z);
}

function updateWeights(
  weights: Record<string, number>,
  features: Record<string, number>,
  label: number,
  lr = 0.03
) {
  const prediction = scoreThreat(features, weights);
  const error = label - prediction;
  const next = { ...weights };
  for (const key of ['inj', 'malware', 'exploit', 'pii', 'ext_links', 'len', 'out_scope']) {
    next[key] = Number((next[key] + lr * error * (features[key] || 0)).toFixed(6));
  }
  next.bias = Number((next.bias + lr * error).toFixed(6));
  return next;
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

  const base44 = createClientFromRequest(req);
  const db = base44.asServiceRole.entities;

  try {
    const body = await req.json().catch(() => ({}));
    let tenantId = String(body?.tenant_id || '').trim();
    const shopDomain = normalizeShop(body?.shop || body?.shop_domain || body?.store_key);
    const userEmail = String(body?.user_email || '').trim() || null;
    const history = Array.isArray(body?.history) ? body.history.slice(-6) : [];
    const rawMessage = String(body?.message || '').trim();

    if (!rawMessage) {
      return Response.json({ ok: false, reason: 'missing_message', version: VERSION }, { status: 400 });
    }

    const message = rawMessage.slice(0, MAX_MESSAGE_LEN);

    if (!tenantId && shopDomain) {
      const tenants = await db.Tenant.filter({ shop_domain: shopDomain }).catch(() => []);
      if (tenants?.[0]?.id) tenantId = tenants[0].id;
    }

    const settingsRows = tenantId
      ? await db.TenantSettings.filter({ tenant_id: tenantId }).catch(() => [])
      : [];
    const settings = settingsRows?.[0] || null;

    const model = settings?.support_ml_security_model || {};
    const weights = {
      ...DEFAULT_WEIGHTS,
      ...(typeof model?.weights === 'object' && model?.weights ? model.weights : {}),
    };

    const features = extractFeatures(message);
    const threatScore = scoreThreat(features, weights);
    const hardBlocked = features.malware === 1 || features.inj === 1 || threatScore >= 0.78;

    if (hardBlocked) {
      const nextWeights = updateWeights(weights, features, 1);
      if (tenantId && settings?.id) {
        await db.TenantSettings.update(settings.id, {
          support_ml_security_model: {
            version: VERSION,
            updated_at: new Date().toISOString(),
            weights: nextWeights,
            last_score: threatScore,
            blocked_count: Number(model?.blocked_count || 0) + 1,
          }
        }).catch(() => {});
      }

      await db.AuditLog.create({
        tenant_id: tenantId || 'unknown',
        category: 'security',
        severity: 'high',
        action: 'support_ai_blocked_message',
        description: 'Support AI blocked suspicious or malicious message.',
        performed_by: userEmail || 'anonymous',
        metadata: { version: VERSION, threatScore, features }
      }).catch(() => {});

      return Response.json({
        ok: true,
        blocked: true,
        threat_score: threatScore,
        response: 'I can only assist with safe ProfitShield app support requests. Please ask an app-related question without security-exploit or sensitive-secret content.',
        needs_auto_fix: false,
        needs_owner_attention: true,
        category: 'blocked_security',
        version: VERSION,
      }, { status: 200 });
    }

    if (!hasAppScope(message)) {
      const nextWeights = updateWeights(weights, features, 0.35);
      if (tenantId && settings?.id) {
        await db.TenantSettings.update(settings.id, {
          support_ml_security_model: {
            version: VERSION,
            updated_at: new Date().toISOString(),
            weights: nextWeights,
            last_score: threatScore,
            out_of_scope_count: Number(model?.out_of_scope_count || 0) + 1,
          }
        }).catch(() => {});
      }

      return Response.json({
        ok: true,
        blocked: false,
        out_of_scope: true,
        threat_score: threatScore,
        response: 'I can only answer ProfitShield app support questions (dashboard, orders, alerts, billing, integrations, automations, sync, and settings). Please ask about the app.',
        needs_auto_fix: false,
        needs_owner_attention: false,
        category: 'out_of_scope',
        version: VERSION,
      }, { status: 200 });
    }

    const issueType =
      /(error|bug|broken|not working|crash|fail|timeout|stuck)/i.test(message) ? 'technical' :
      /(slow|loading|performance|lag)/i.test(message) ? 'performance' :
      /(billing|trial|plan|subscription|payment)/i.test(message) ? 'billing' :
      'general';

    const historyText = history
      .map((m: any) => `${String(m?.role || 'user')}: ${String(m?.content || '').slice(0, 220)}`)
      .join('\n');

    const prompt = `You are ProfitShield AI Support.
Hard rules:
- Only answer questions about the ProfitShield app.
- Refuse any unrelated request.
- Never provide malware/exploit/security-abuse guidance.
- Keep answers concise, practical, and app-specific.

Recent chat:
${historyText}

User message:
${message}

Return JSON only.`;

    const llm = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          response: { type: 'string' },
          issue_summary: { type: 'string' },
          needs_auto_fix: { type: 'boolean' },
          needs_owner_attention: { type: 'boolean' },
        },
        required: ['response']
      }
    });

    const safeResponse = String(llm?.response || llm?.data?.response || llm || '').slice(0, 1500)
      || 'I can help with ProfitShield support. Please describe the issue you are seeing in the app.';

    const nextWeights = updateWeights(weights, features, 0);
    if (tenantId && settings?.id) {
      await db.TenantSettings.update(settings.id, {
        support_ml_security_model: {
          version: VERSION,
          updated_at: new Date().toISOString(),
          weights: nextWeights,
          last_score: threatScore,
          clean_count: Number(model?.clean_count || 0) + 1,
        }
      }).catch(() => {});
    }

    return Response.json({
      ok: true,
      blocked: false,
      threat_score: threatScore,
      response: safeResponse,
      issue_summary: String(llm?.issue_summary || message.slice(0, 120)),
      needs_auto_fix: Boolean(llm?.needs_auto_fix || issueType === 'technical'),
      needs_owner_attention: Boolean(llm?.needs_owner_attention),
      issue_type: issueType,
      category: 'app_support',
      version: VERSION,
    }, { status: 200 });
  } catch (error) {
    console.error('[supportAiAgent] error:', error);
    return Response.json({
      ok: false,
      blocked: false,
      response: 'Support AI is temporarily unavailable. Please try again in a moment.',
      needs_auto_fix: false,
      needs_owner_attention: false,
      category: 'fallback',
      version: VERSION,
      message: error?.message || String(error),
    }, { status: 200 });
  }
});

