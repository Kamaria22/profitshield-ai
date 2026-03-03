import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Entity automation: triggers on Order create/update
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, payload_too_large } = payload;

    if (!event || event.entity_name !== 'Order') {
      return Response.json({ skipped: true, reason: 'not_order_event' });
    }

    // Only process creates (and updates that don't already have fraud_score set by this function)
    const entityId = event.entity_id || data?.id;
    if (!entityId) {
      return Response.json({ skipped: true, reason: 'no_entity_id' });
    }

    // Fetch fresh order data — filter by id (list endpoint, no 404 risk)
    let order = null;
    if (entityId && !entityId.startsWith('test-') && entityId.length > 10) {
      try {
        const results = await base44.asServiceRole.entities.Order.list('-created_date', 1000);
        order = results.find(o => o.id === entityId) || null;
        if (!order) {
          // Try direct lookup as fallback
          const filtered = await base44.asServiceRole.entities.Order.filter({ id: entityId });
          order = filtered[0] || null;
        }
      } catch (e) {
        console.log(`[autoAnalyzeOrders] Order ${entityId} not found yet: ${e.message}`);
      }
    }

    // If not found, return success so automation doesn't fail — it will retry naturally on next webhook
    if (!order) {
      // Fallback: use inline data if provided
      if (data && data.tenant_id) {
        order = data;
      } else {
        return Response.json({ skipped: true, reason: 'order_not_found_yet', entity_id: entityId });
      }
    }

    if (!order.tenant_id) {
      return Response.json({ skipped: true, reason: 'missing_tenant_id' });
    }

    // Idempotency: skip if already analyzed recently (within 5 minutes) to avoid duplicate alerts
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

    // Respect auto-remediation flag
    if (tenantSettings.auto_remediation_enabled === false) {
      return Response.json({ skipped: true, reason: 'auto_analysis_disabled' });
    }

    // Fetch customer order history for velocity/pattern checks
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

    // Fetch active custom risk rules
    let customRules = [];
    try {
      customRules = await base44.asServiceRole.entities.RiskRule.filter({
        tenant_id: order.tenant_id,
        is_active: true
      });
    } catch (e) {
      console.warn('[autoAnalyzeOrders] Could not fetch risk rules:', e.message);
    }

    // Run risk analysis
    const riskAnalysis = analyzeRisk(order, customerOrders, tenantSettings, customRules);

    // Update order with risk scores (only if we have a real persisted order)
    if (order.id) {
      try {
        await base44.asServiceRole.entities.Order.update(order.id, {
          fraud_score: riskAnalysis.fraud_score,
          return_score: riskAnalysis.return_score,
          chargeback_score: riskAnalysis.chargeback_score,
          risk_level: riskAnalysis.risk_level,
          risk_reasons: riskAnalysis.risk_reasons,
          recommended_action: riskAnalysis.recommended_action,
          confidence: riskAnalysis.confidence
        });
      } catch (e) {
        console.warn('[autoAnalyzeOrders] Could not update order risk scores:', e.message);
      }
    }

    // Create alert for high/critical risk orders (idempotent check)
    if (riskAnalysis.risk_level === 'high' || riskAnalysis.risk_level === 'critical') {
      let existingAlert = false;
      try {
        const existing = await base44.asServiceRole.entities.Alert.filter({
          tenant_id: order.tenant_id,
          entity_type: 'order',
          entity_id: order.id,
          type: 'high_risk_order'
        });
        existingAlert = existing.length > 0;
      } catch (e) {
        // Proceed to create alert if check fails
      }

      if (!existingAlert) {
        await base44.asServiceRole.entities.Alert.create({
          tenant_id: order.tenant_id,
          type: 'high_risk_order',
          severity: riskAnalysis.risk_level === 'critical' ? 'critical' : 'high',
          title: `High Risk Order #${order.order_number || order.id}`,
          message: `Order flagged with ${riskAnalysis.risk_reasons.length} risk factor(s): ${riskAnalysis.risk_reasons.slice(0, 3).join(', ')}`,
          entity_type: 'order',
          entity_id: order.id,
          recommended_action: riskAnalysis.recommended_action,
          status: 'pending',
          metadata: {
            fraud_score: riskAnalysis.fraud_score,
            combined_score: riskAnalysis.combined_score,
            risk_reasons: riskAnalysis.risk_reasons,
            order_value: order.total_revenue
          }
        });
        console.log(`[autoAnalyzeOrders] Created high-risk alert for order ${order.order_number} (tenant: ${order.tenant_id})`);
      }
    }

    // Create PendingShopifyAction for matched risk rules requiring Shopify actions
    if (riskAnalysis.matched_shopify_actions?.length > 0 && order.platform_order_id) {
      for (const shopifyAction of riskAnalysis.matched_shopify_actions) {
        try {
          await base44.asServiceRole.entities.PendingShopifyAction.create({
            tenant_id: order.tenant_id,
            order_id: order.id,
            platform_order_id: order.platform_order_id,
            order_number: order.order_number,
            action_type: shopifyAction.type,
            action_config: shopifyAction.config,
            source_type: 'risk_rule',
            source_rule_id: shopifyAction.rule_id,
            source_rule_name: shopifyAction.rule_name,
            reason: `Auto-triggered by rule: ${shopifyAction.rule_name}`,
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
        description: `Auto fraud analysis: risk_level=${riskAnalysis.risk_level}, fraud_score=${riskAnalysis.fraud_score}, reasons=${riskAnalysis.risk_reasons.length}`,
        is_auto_action: true,
        auto_action_type: 'fraud_analysis',
        severity: riskAnalysis.risk_level === 'critical' || riskAnalysis.risk_level === 'high' ? 'high' : 'low',
        category: 'ai_action',
        metadata: {
          fraud_score: riskAnalysis.fraud_score,
          risk_level: riskAnalysis.risk_level,
          risk_reasons: riskAnalysis.risk_reasons
        }
      });
    } catch (e) {
      console.warn('[autoAnalyzeOrders] Could not write audit log:', e.message);
    }

    return Response.json({
      success: true,
      order_id: order.id,
      risk_analysis: {
        fraud_score: riskAnalysis.fraud_score,
        combined_score: riskAnalysis.combined_score,
        risk_level: riskAnalysis.risk_level,
        reasons_count: riskAnalysis.risk_reasons.length,
        recommended_action: riskAnalysis.recommended_action
      }
    });

  } catch (error) {
    console.error('[autoAnalyzeOrders] Fatal error:', error.message);
    // Return 200 to prevent automation retry storm — log is sufficient
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

  // 1. New customer
  const isFirstOrder = customerOrders.length <= 1;
  if (isFirstOrder) {
    fraudScore += 15;
    riskFactors.push('First-time customer');
  }

  // 2. Order value
  const orderValue = order.total_revenue || 0;
  if (orderValue > 500) {
    fraudScore += 10;
    riskFactors.push(`High value order ($${orderValue.toFixed(2)})`);
  }
  if (orderValue > 1000) {
    fraudScore += 15;
    chargebackScore += 10;
  }

  // 3. Avg order value spike
  if (customerOrders.length > 1) {
    const avg = customerOrders.reduce((s, o) => s + (o.total_revenue || 0), 0) / customerOrders.length;
    if (avg > 0 && orderValue > avg * 3) {
      fraudScore += 20;
      riskFactors.push('Order 3x above customer average');
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

  // 5. Heavy discount
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
    riskFactors.push(`${recentOrders.length + 1} orders in 24h`);
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

  // Combined score
  const combinedScore = Math.min(100, Math.round(
    (fraudScore * 0.5) + (returnScore * 0.25) + (chargebackScore * 0.25)
  ));

  // Risk level
  let riskLevel = 'low';
  if (combinedScore >= 80) riskLevel = 'critical';
  else if (combinedScore >= (settings.high_risk_threshold || 70)) riskLevel = 'high';
  else if (combinedScore >= (settings.medium_risk_threshold || 40)) riskLevel = 'medium';

  // Recommended action
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