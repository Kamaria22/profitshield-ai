import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Entity automation: triggers on Order create
// Analyzes new orders for fraud risk and creates alerts for high-risk orders
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, payload_too_large } = payload;

    if (!event || event.entity_name !== 'Order') {
      return Response.json({ skipped: true, reason: 'not_order_event' });
    }

    const entityId = event.entity_id || data?.id;
    if (!entityId) {
      return Response.json({ skipped: true, reason: 'no_entity_id' });
    }

    // Get order data — prefer inline data from automation payload, fall back to filter
    let order = data || null;
    if (payload_too_large || !order) {
      try {
        const results = await base44.asServiceRole.entities.Order.filter({ id: entityId });
        order = results[0] || null;
      } catch (e) {
        console.warn(`[autoAnalyzeOrders] Filter failed for ${entityId}: ${e.message}`);
        order = null;
      }
    }

    if (!order) {
      return Response.json({ skipped: true, reason: 'order_not_found', entity_id: entityId });
    }

    if (!order.tenant_id) {
      return Response.json({ skipped: true, reason: 'missing_tenant_id' });
    }

    // Idempotency: skip if just analyzed (update events that re-set fraud_score trigger this)
    if (event.type === 'update' && order.fraud_score !== undefined && order.fraud_score !== null) {
      const updatedMs = order.updated_date ? new Date(order.updated_date).getTime() : 0;
      if (Date.now() - updatedMs < 5 * 60 * 1000) {
        return Response.json({ skipped: true, reason: 'recently_analyzed', order_id: order.id });
      }
    }

    // Fetch tenant settings
    let tenantSettings = { high_risk_threshold: 70, medium_risk_threshold: 40, auto_remediation_enabled: true };
    try {
      const settings = await base44.asServiceRole.entities.TenantSettings.filter({ tenant_id: order.tenant_id });
      if (settings[0]) tenantSettings = { ...tenantSettings, ...settings[0] };
    } catch (e) {
      console.warn('[autoAnalyzeOrders] Could not fetch tenant settings:', e.message);
    }

    if (tenantSettings.auto_remediation_enabled === false) {
      return Response.json({ skipped: true, reason: 'auto_analysis_disabled' });
    }

    // Customer order history for velocity / pattern checks
    let customerOrders = [];
    if (order.customer_email) {
      try {
        customerOrders = await base44.asServiceRole.entities.Order.filter({
          tenant_id: order.tenant_id,
          customer_email: order.customer_email
        });
      } catch (e) {
        console.warn('[autoAnalyzeOrders] Could not fetch customer orders:', e.message);
      }
    }

    // Active custom risk rules
    let customRules = [];
    try {
      customRules = await base44.asServiceRole.entities.RiskRule.filter({
        tenant_id: order.tenant_id,
        is_active: true
      });
    } catch (e) {
      console.warn('[autoAnalyzeOrders] Could not fetch risk rules:', e.message);
    }

    // Run analysis
    const risk = analyzeRisk(order, customerOrders, tenantSettings, customRules);

    console.log(`[autoAnalyzeOrders] Order #${order.order_number} → risk_level=${risk.risk_level} fraud_score=${risk.fraud_score} combined=${risk.combined_score}`);

    // Persist risk scores back to the order
    if (order.id && order.id === entityId) {
      try {
        await base44.asServiceRole.entities.Order.update(order.id, {
          fraud_score: risk.fraud_score,
          return_score: risk.return_score,
          chargeback_score: risk.chargeback_score,
          risk_level: risk.risk_level,
          risk_reasons: risk.risk_reasons,
          recommended_action: risk.recommended_action,
          confidence: risk.confidence
        });
      } catch (e) {
        console.warn('[autoAnalyzeOrders] Could not persist risk scores:', e.message);
      }
    }

    // Create high-risk alert (idempotent)
    if (risk.risk_level === 'high' || risk.risk_level === 'critical') {
      let alertExists = false;
      try {
        const existing = await base44.asServiceRole.entities.Alert.filter({
          tenant_id: order.tenant_id,
          entity_type: 'order',
          entity_id: order.id,
          type: 'high_risk_order'
        });
        alertExists = existing.length > 0;
      } catch (e) { /* proceed */ }

      if (!alertExists) {
        await base44.asServiceRole.entities.Alert.create({
          tenant_id: order.tenant_id,
          type: 'high_risk_order',
          severity: risk.risk_level === 'critical' ? 'critical' : 'high',
          title: `High Risk Order #${order.order_number || order.id}`,
          message: `Fraud risk detected with ${risk.risk_reasons.length} factor(s): ${risk.risk_reasons.slice(0, 3).join(', ')}`,
          entity_type: 'order',
          entity_id: order.id,
          recommended_action: risk.recommended_action,
          status: 'pending',
          metadata: {
            fraud_score: risk.fraud_score,
            combined_score: risk.combined_score,
            risk_reasons: risk.risk_reasons,
            order_value: order.total_revenue
          }
        });
        console.log(`[autoAnalyzeOrders] Alert created for order #${order.order_number}`);
      }
    }

    // Queue Shopify actions from matched rules
    if (risk.matched_shopify_actions?.length > 0 && order.platform_order_id) {
      for (const action of risk.matched_shopify_actions) {
        try {
          await base44.asServiceRole.entities.PendingShopifyAction.create({
            tenant_id: order.tenant_id,
            order_id: order.id,
            platform_order_id: order.platform_order_id,
            order_number: order.order_number,
            action_type: action.type,
            action_config: action.config,
            source_type: 'risk_rule',
            source_rule_id: action.rule_id,
            source_rule_name: action.rule_name,
            reason: `Auto-triggered by rule: ${action.rule_name}`,
            status: 'pending_confirmation'
          });
        } catch (e) {
          console.warn('[autoAnalyzeOrders] Could not create pending shopify action:', e.message);
        }
      }
    }

    // Audit log
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: order.tenant_id,
        action: 'auto_fraud_analysis',
        entity_type: 'Order',
        entity_id: order.id,
        performed_by: 'system',
        description: `Auto fraud analysis complete: risk_level=${risk.risk_level}, fraud_score=${risk.fraud_score}, ${risk.risk_reasons.length} risk factor(s)`,
        is_auto_action: true,
        auto_action_type: 'fraud_analysis',
        severity: risk.risk_level === 'critical' || risk.risk_level === 'high' ? 'high' : 'low',
        category: 'ai_action',
        metadata: { fraud_score: risk.fraud_score, risk_level: risk.risk_level, risk_reasons: risk.risk_reasons }
      });
    } catch (e) {
      console.warn('[autoAnalyzeOrders] Audit log failed:', e.message);
    }

    return Response.json({
      success: true,
      order_id: order.id,
      risk_analysis: {
        fraud_score: risk.fraud_score,
        combined_score: risk.combined_score,
        risk_level: risk.risk_level,
        reasons_count: risk.risk_reasons.length,
        recommended_action: risk.recommended_action
      }
    });

  } catch (error) {
    console.error('[autoAnalyzeOrders] Fatal error:', error.message);
    // Return 200 to prevent automation retry storm
    return Response.json({ error: error.message, skipped: true }, { status: 200 });
  }
});

// ─── Risk Analysis Engine ────────────────────────────────────────────────────

function analyzeRisk(order, customerOrders, settings, customRules = []) {
  const riskFactors = [];
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  const matchedShopifyActions = [];

  const orderValue = order.total_revenue || 0;

  // 1. First-time customer
  const isFirstOrder = customerOrders.length <= 1;
  if (isFirstOrder) {
    fraudScore += 15;
    riskFactors.push('First-time customer');
  }

  // 2. High order value
  if (orderValue > 500) {
    fraudScore += 10;
    riskFactors.push(`High value order ($${orderValue.toFixed(2)})`);
  }
  if (orderValue > 1000) {
    fraudScore += 15;
    chargebackScore += 10;
  }

  // 3. Order value spike vs customer average
  if (customerOrders.length > 1) {
    const avg = customerOrders.reduce((s, o) => s + (o.total_revenue || 0), 0) / customerOrders.length;
    if (avg > 0 && orderValue > avg * 3) {
      fraudScore += 20;
      riskFactors.push('Order value 3x above customer average');
    }
  }

  // 4. Address mismatch
  const billing = order.billing_address || {};
  const shipping = order.shipping_address || {};
  if (billing.country && shipping.country && billing.country !== shipping.country) {
    fraudScore += 25;
    chargebackScore += 15;
    riskFactors.push('Billing/shipping country mismatch');
  } else if (billing.zip && shipping.zip && billing.zip !== shipping.zip) {
    fraudScore += 8;
    riskFactors.push('Billing/shipping zip mismatch');
  }

  // 5. Heavy discount usage
  const discountPct = orderValue > 0
    ? ((order.discount_total || 0) / (orderValue + (order.discount_total || 0))) * 100
    : 0;
  if (discountPct > 30) {
    fraudScore += 15;
    riskFactors.push(`Heavy discount (${discountPct.toFixed(0)}%)`);
  }
  if ((order.discount_codes || []).length > 1) {
    fraudScore += 10;
    riskFactors.push('Multiple discount codes');
  }

  // 6. Suspicious email
  const email = order.customer_email || '';
  if (email.includes('+') || /\d{4,}/.test(email.split('@')[0])) {
    fraudScore += 15;
    riskFactors.push('Suspicious email pattern');
  }

  // 7. Velocity: multiple orders in 24h
  const recentOrders = customerOrders.filter(o => {
    if (!o.order_date || o.id === order.id) return false;
    return (Date.now() - new Date(o.order_date).getTime()) < 24 * 60 * 60 * 1000;
  });
  if (recentOrders.length >= 2) {
    fraudScore += 20;
    chargebackScore += 15;
    riskFactors.push(`${recentOrders.length + 1} orders in 24h (velocity)`);
  }

  // 8. Refund history
  const refunded = customerOrders.filter(o => o.status === 'refunded' || o.status === 'partially_refunded');
  if (refunded.length > 0 && customerOrders.length > 0) {
    const refundRate = (refunded.length / customerOrders.length) * 100;
    if (refundRate > 30) {
      returnScore += 25;
      riskFactors.push(`High refund rate (${refundRate.toFixed(0)}%)`);
    } else if (refundRate > 15) {
      returnScore += 12;
      riskFactors.push(`Moderate refund rate (${refundRate.toFixed(0)}%)`);
    }
  }

  // 9. Negative margin
  if ((order.net_profit || 0) < 0) {
    chargebackScore += 10;
    riskFactors.push('Negative profit margin');
  }

  // 10. Custom rules
  for (const rule of customRules) {
    if (evaluateRule(rule, order, customerOrders)) {
      const adj = rule.risk_adjustment || 0;
      fraudScore += adj;
      riskFactors.push(`Rule: ${rule.name}${adj !== 0 ? ` (${adj > 0 ? '+' : ''}${adj})` : ''}`);
      if (rule.shopify_action_type && rule.shopify_action_type !== 'none') {
        matchedShopifyActions.push({
          type: rule.shopify_action_type,
          config: rule.shopify_action_config || {},
          rule_id: rule.id,
          rule_name: rule.name
        });
      }
    }
  }

  const combinedScore = Math.min(100, Math.round(
    (fraudScore * 0.5) + (returnScore * 0.25) + (chargebackScore * 0.25)
  ));

  let riskLevel = 'low';
  if (combinedScore >= 80) riskLevel = 'critical';
  else if (combinedScore >= (settings.high_risk_threshold || 70)) riskLevel = 'high';
  else if (combinedScore >= (settings.medium_risk_threshold || 40)) riskLevel = 'medium';

  let recommendedAction = 'none';
  if (riskLevel === 'critical') recommendedAction = 'cancel';
  else if (riskLevel === 'high') recommendedAction = fraudScore >= 50 ? 'cancel' : 'verify';
  else if (riskLevel === 'medium') recommendedAction = 'flag';

  return {
    fraud_score: Math.min(100, Math.max(0, Math.round(fraudScore))),
    return_score: Math.min(100, Math.max(0, Math.round(returnScore))),
    chargeback_score: Math.min(100, Math.max(0, Math.round(chargebackScore))),
    combined_score: combinedScore,
    risk_level: riskLevel,
    risk_reasons: riskFactors,
    recommended_action: recommendedAction,
    confidence: customerOrders.length > 5 ? 'high' : customerOrders.length > 1 ? 'medium' : 'low',
    matched_shopify_actions: matchedShopifyActions
  };
}

function evaluateRule(rule, order, customerOrders) {
  for (const condition of (rule.conditions || [])) {
    const { field, operator, value } = condition;
    let fieldVal = getFieldValue(field, order, customerOrders);
    let compareVal = value;
    if (['order_value', 'discount_pct', 'customer_orders', 'item_count'].includes(field)) {
      fieldVal = parseFloat(fieldVal) || 0;
      compareVal = parseFloat(value) || 0;
    }
    if (field === 'is_first_order' || field === 'has_discount_code') {
      fieldVal = !!fieldVal;
      compareVal = value === 'true' || value === true;
    }
    if (!evalCondition(fieldVal, operator, compareVal)) return false;
  }
  return true;
}

function getFieldValue(field, order, customerOrders) {
  switch (field) {
    case 'order_value': return order.total_revenue || 0;
    case 'discount_pct': {
      const t = order.total_revenue || 0;
      const d = order.discount_total || 0;
      return t > 0 ? (d / (t + d)) * 100 : 0;
    }
    case 'customer_orders': return customerOrders.length;
    case 'shipping_country': return order.shipping_address?.country || order.shipping_address?.country_code || '';
    case 'is_first_order': return order.is_first_order || customerOrders.length <= 1;
    case 'has_discount_code': return (order.discount_codes || []).length > 0;
    case 'item_count': return order.platform_data?.line_items?.length || 1;
    default: return null;
  }
}

function evalCondition(fieldVal, operator, compareVal) {
  switch (operator) {
    case 'equals': return String(fieldVal).toLowerCase() === String(compareVal).toLowerCase();
    case 'not_equals': return String(fieldVal).toLowerCase() !== String(compareVal).toLowerCase();
    case 'greater_than': return Number(fieldVal) > Number(compareVal);
    case 'less_than': return Number(fieldVal) < Number(compareVal);
    case 'contains': return String(fieldVal).toLowerCase().includes(String(compareVal).toLowerCase());
    case 'not_contains': return !String(fieldVal).toLowerCase().includes(String(compareVal).toLowerCase());
    default: return false;
  }
}