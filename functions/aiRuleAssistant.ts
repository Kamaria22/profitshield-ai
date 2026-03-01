/**
 * aiRuleAssistant
 * 
 * AI backend for risk rule suggestions:
 *   action=suggest  – analyse tenant order data + fraud patterns → suggest rules
 *   action=refine   – conversational refinement of a rule draft
 *   action=notify   – send email notification when a rule fires
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, tenant_id } = body;

    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    // ── SUGGEST ──────────────────────────────────────────────────────────────
    if (action === 'suggest') {
      // Fetch recent orders + existing rules for context
      const [orders, existingRules] = await Promise.all([
        base44.asServiceRole.entities.Order.filter({ tenant_id }, '-order_date', 100),
        base44.asServiceRole.entities.RiskRule.filter({ tenant_id })
      ]);

      // Build condensed stats from orders
      const totalOrders = orders.length;
      const highRisk = orders.filter(o => o.risk_level === 'high').length;
      const firstOrders = orders.filter(o => o.is_first_order).length;
      const multiDiscount = orders.filter(o => (o.discount_codes || []).length >= 2).length;
      const intlShipping = orders.filter(o => {
        const bill = o.billing_address?.country_code;
        const ship = o.shipping_address?.country_code;
        return bill && ship && bill !== ship;
      }).length;
      const avgOrderValue = totalOrders > 0
        ? (orders.reduce((s, o) => s + (o.total_revenue || 0), 0) / totalOrders).toFixed(2)
        : 0;
      const highValueOrders = orders.filter(o => (o.total_revenue || 0) > 500).length;

      // Countries that appear in high-risk orders
      const riskCountries = {};
      orders.filter(o => o.risk_level === 'high').forEach(o => {
        const c = o.shipping_address?.country_code;
        if (c) riskCountries[c] = (riskCountries[c] || 0) + 1;
      });
      const topRiskCountries = Object.entries(riskCountries)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([c]) => c);

      const existingRuleNames = existingRules.map(r => r.name).join(', ') || 'none';

      const prompt = `You are a fraud prevention AI expert for e-commerce. Analyse the following store statistics and suggest 3-5 custom risk rules that would meaningfully improve fraud detection.

STORE STATISTICS (last ${totalOrders} orders):
- Average order value: $${avgOrderValue}
- High-risk orders: ${highRisk} (${totalOrders > 0 ? ((highRisk/totalOrders)*100).toFixed(1) : 0}%)
- First-time customer orders: ${firstOrders} (${totalOrders > 0 ? ((firstOrders/totalOrders)*100).toFixed(1) : 0}%)
- Orders using multiple discount codes: ${multiDiscount}
- Orders with billing/shipping country mismatch: ${intlShipping}
- High-value orders (>$500): ${highValueOrders}
- Top countries in high-risk orders: ${topRiskCountries.join(', ') || 'N/A'}

ALREADY EXISTING RULES (do NOT suggest duplicates):
${existingRuleNames}

AVAILABLE FIELDS: order_value, discount_pct, customer_orders, product_type, shipping_country, payment_method, is_first_order, has_discount_code, item_count
AVAILABLE OPERATORS: equals, not_equals, greater_than, less_than, contains, not_contains
AVAILABLE ACTIONS: flag, hold, verify, cancel, none

Return exactly 3-5 rule suggestions. Each must have realistic thresholds based on the data. Be specific and practical.`;

      const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  rationale: { type: 'string' },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        operator: { type: 'string' },
                        value: { type: 'string' }
                      }
                    }
                  },
                  risk_adjustment: { type: 'number' },
                  action: { type: 'string' },
                  notification: { type: 'boolean' }
                }
              }
            }
          }
        }
      });

      return Response.json({ success: true, suggestions: response.suggestions || [] });
    }

    // ── REFINE ───────────────────────────────────────────────────────────────
    if (action === 'refine') {
      const { message, draft_rule, conversation_history = [] } = body;

      const systemContext = `You are a fraud prevention AI assistant helping a merchant configure custom risk detection rules for their e-commerce store. You help define conditions, actions, and thresholds.

Available fields: order_value (numeric $), discount_pct (numeric %), customer_orders (numeric count), product_type (string), shipping_country (ISO code), payment_method (string), is_first_order (true/false), has_discount_code (true/false), item_count (numeric)
Available operators: equals, not_equals, greater_than, less_than, contains, not_contains
Available actions: flag (mark for review), hold (stop fulfillment), verify (request verification), cancel (auto-cancel), none (score only)
Risk adjustment: integer -50 to +50 (positive = more risky, negative = less risky)

Current rule draft: ${draft_rule ? JSON.stringify(draft_rule) : 'none yet'}

When the user provides enough information, return an updated_rule in your JSON response. Always be concise and helpful.`;

      const historyText = conversation_history
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const prompt = `${systemContext}

${historyText ? `Previous conversation:\n${historyText}\n\n` : ''}User: ${message}

Respond helpfully. If you have enough info to build or update a rule, include updated_rule in your JSON.`;

      const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            updated_rule: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                conditions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      operator: { type: 'string' },
                      value: { type: 'string' }
                    }
                  }
                },
                risk_adjustment: { type: 'number' },
                action: { type: 'string' },
                notification: { type: 'boolean' }
              }
            }
          }
        }
      });

      return Response.json({
        success: true,
        reply: response.reply || '',
        updated_rule: response.updated_rule || null
      });
    }

    // ── NOTIFY ───────────────────────────────────────────────────────────────
    if (action === 'notify') {
      const { rule_name, order_number, order_value, risk_score, triggered_action, email, conditions_matched } = body;

      if (!email) return Response.json({ error: 'email required' }, { status: 400 });

      const conditionsList = (conditions_matched || [])
        .map(c => `<li>${c}</li>`)
        .join('');

      const actionLabels = {
        flag: 'Flagged for Review',
        hold: 'Order Held',
        verify: 'Verification Required',
        cancel: 'Order Auto-Cancelled',
        none: 'Score Adjustment Applied'
      };

      const actionLabel = actionLabels[triggered_action] || triggered_action;
      const actionColor = triggered_action === 'cancel' ? '#ef4444'
        : triggered_action === 'hold' ? '#f59e0b'
        : triggered_action === 'flag' ? '#8b5cf6'
        : '#6366f1';

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        from_name: 'ProfitShield AI',
        subject: `⚠️ Risk Rule Triggered: ${rule_name} — Order #${order_number}`,
        body: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 28px 32px;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="background: rgba(255,255,255,0.2); border-radius: 8px; padding: 8px;">
        <span style="font-size: 20px;">🛡️</span>
      </div>
      <div>
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: white;">Risk Rule Triggered</h1>
        <p style="margin: 4px 0 0; color: rgba(255,255,255,0.75); font-size: 13px;">ProfitShield AI Alert</p>
      </div>
    </div>
  </div>

  <div style="padding: 28px 32px; space-y: 20px;">
    <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 18px; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px; width: 140px;">Rule</td>
          <td style="padding: 8px 0; color: #f1f5f9; font-weight: 600;">${rule_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Order</td>
          <td style="padding: 8px 0; color: #f1f5f9; font-weight: 600;">#${order_number}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Order Value</td>
          <td style="padding: 8px 0; color: #f1f5f9; font-weight: 600;">$${parseFloat(order_value || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Risk Score</td>
          <td style="padding: 8px 0; color: ${risk_score >= 70 ? '#ef4444' : risk_score >= 40 ? '#f59e0b' : '#34d399'}; font-weight: 600;">${risk_score}/100</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #94a3b8; font-size: 13px;">Action Taken</td>
          <td style="padding: 8px 0;">
            <span style="background: ${actionColor}22; color: ${actionColor}; border: 1px solid ${actionColor}44; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">${actionLabel}</span>
          </td>
        </tr>
      </table>
    </div>

    ${conditionsList ? `
    <div style="margin-bottom: 20px;">
      <p style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px;">Conditions Matched</p>
      <ul style="margin: 0; padding-left: 18px; color: #cbd5e1; font-size: 14px; line-height: 1.8;">
        ${conditionsList}
      </ul>
    </div>` : ''}

    <div style="text-align: center; padding-top: 10px;">
      <a href="${Deno.env.get('APP_URL') || 'https://app.profitshield.ai'}/orders" 
         style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
        Review Order →
      </a>
    </div>
  </div>

  <div style="padding: 16px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
    <p style="color: #475569; font-size: 12px; margin: 0;">
      ProfitShield AI · Risk Intelligence Platform · 
      <a href="${Deno.env.get('APP_URL') || ''}/settings" style="color: #6366f1; text-decoration: none;">Manage alerts</a>
    </p>
  </div>
</div>`
      });

      return Response.json({ success: true });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('[aiRuleAssistant] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});