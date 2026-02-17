import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// This function is triggered by entity automation when orders are created/updated
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    
    // Handle entity automation payload
    const { event, data, old_data, payload_too_large } = payload;
    
    if (!event || event.entity_name !== 'Order') {
      return Response.json({ skipped: true, reason: 'Not an order event' });
    }

    // Get order data
    let order = data;
    if (payload_too_large) {
      const orders = await base44.asServiceRole.entities.Order.filter({ id: event.entity_id });
      if (orders.length === 0) {
        return Response.json({ skipped: true, reason: 'Order not found' });
      }
      order = orders[0];
    }

    if (!order || !order.tenant_id) {
      return Response.json({ skipped: true, reason: 'Missing order or tenant_id' });
    }

    // Skip if already analyzed (has fraud_score set)
    if (event.type === 'update' && old_data?.fraud_score !== undefined && old_data?.fraud_score === order.fraud_score) {
      return Response.json({ skipped: true, reason: 'Already analyzed' });
    }

    // Check tenant settings for auto-analysis
    const settings = await base44.asServiceRole.entities.TenantSettings.filter({ 
      tenant_id: order.tenant_id 
    });
    const tenantSettings = settings[0] || {};
    
    // Skip if auto-remediation is disabled
    if (tenantSettings.auto_remediation_enabled === false) {
      return Response.json({ skipped: true, reason: 'Auto-analysis disabled' });
    }

    // Fetch customer order history
    const customerOrders = order.customer_email 
      ? await base44.asServiceRole.entities.Order.filter({ 
          tenant_id: order.tenant_id, 
          customer_email: order.customer_email 
        })
      : [];

    // Fetch custom risk rules
    const customRules = await base44.asServiceRole.entities.RiskRule.filter({ 
      tenant_id: order.tenant_id, 
      is_active: true 
    });

    // Perform risk analysis
    const riskAnalysis = analyzeRisk(order, customerOrders, {
      high_risk_threshold: tenantSettings.high_risk_threshold || 70,
      medium_risk_threshold: tenantSettings.medium_risk_threshold || 40
    }, customRules);

    // Update order with risk scores
    await base44.asServiceRole.entities.Order.update(order.id, {
      fraud_score: riskAnalysis.fraud_score,
      return_score: riskAnalysis.return_score,
      chargeback_score: riskAnalysis.chargeback_score,
      risk_level: riskAnalysis.risk_level,
      risk_reasons: riskAnalysis.risk_reasons,
      recommended_action: riskAnalysis.recommended_action,
      confidence: riskAnalysis.confidence
    });

    // Create alert for high-risk orders
    if (riskAnalysis.risk_level === 'high' || riskAnalysis.risk_level === 'critical') {
      const existingAlerts = await base44.asServiceRole.entities.Alert.filter({
        tenant_id: order.tenant_id,
        entity_type: 'order',
        entity_id: order.id,
        type: 'high_risk_order'
      });

      if (existingAlerts.length === 0) {
        await base44.asServiceRole.entities.Alert.create({
          tenant_id: order.tenant_id,
          type: 'high_risk_order',
          severity: riskAnalysis.risk_level === 'critical' ? 'critical' : 'high',
          title: `High Risk Order #${order.order_number || order.id}`,
          message: `Potential scam detected with ${riskAnalysis.risk_reasons.length} risk factors: ${riskAnalysis.risk_reasons.slice(0, 3).join(', ')}`,
          entity_type: 'order',
          entity_id: order.id,
          recommended_action: riskAnalysis.recommended_action,
          status: 'pending',
          metadata: {
            fraud_score: riskAnalysis.fraud_score,
            risk_reasons: riskAnalysis.risk_reasons,
            order_value: order.total_revenue
          }
        });
      }
    }

    // Handle Shopify actions from matched rules
    if (riskAnalysis.matched_shopify_actions?.length > 0 && order.platform_order_id) {
      for (const shopifyAction of riskAnalysis.matched_shopify_actions) {
        const requireConfirmation = shopifyAction.config?.require_confirmation !== false;

        if (requireConfirmation || shopifyAction.type === 'cancel_order') {
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
            reason: `Auto-triggered: ${shopifyAction.rule_name}`,
            status: 'pending_confirmation'
          });
        }
      }
    }

    // Log audit event
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: order.tenant_id,
      action_type: 'auto_risk_analysis',
      entity_type: 'Order',
      entity_id: order.id,
      new_state: {
        fraud_score: riskAnalysis.fraud_score,
        risk_level: riskAnalysis.risk_level,
        risk_reasons: riskAnalysis.risk_reasons
      }
    });

    return Response.json({ 
      success: true, 
      order_id: order.id,
      risk_analysis: {
        fraud_score: riskAnalysis.fraud_score,
        risk_level: riskAnalysis.risk_level,
        reasons_count: riskAnalysis.risk_reasons.length
      }
    });

  } catch (error) {
    console.error('Auto-analyze orders error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function analyzeRisk(order, customerOrders, settings, customRules = []) {
  const riskFactors = [];
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  const matchedShopifyActions = [];

  // 1. New Customer Analysis
  const isFirstOrder = customerOrders.length <= 1;
  if (isFirstOrder) {
    fraudScore += 15;
    riskFactors.push('First-time customer');
  }

  // 2. Order Value Analysis
  if (order.total_revenue > 500) {
    fraudScore += 10;
    riskFactors.push(`High value order ($${order.total_revenue?.toFixed(2)})`);
  }
  if (order.total_revenue > 1000) {
    fraudScore += 15;
    chargebackScore += 10;
  }

  // 3. Address Mismatch
  const billing = order.billing_address || {};
  const shipping = order.shipping_address || {};
  if (billing.country && shipping.country && billing.country !== shipping.country) {
    fraudScore += 25;
    chargebackScore += 15;
    riskFactors.push('Billing/shipping country mismatch');
  }

  // 4. Discount Analysis
  const discountPct = order.total_revenue > 0 
    ? ((order.discount_total || 0) / (order.total_revenue + (order.discount_total || 0))) * 100 
    : 0;
  if (discountPct > 30) {
    fraudScore += 15;
    riskFactors.push(`Heavy discount (${discountPct.toFixed(0)}%)`);
  }

  // 5. Email Analysis
  const email = order.customer_email || '';
  if (email.includes('+') || /\d{4,}/.test(email.split('@')[0])) {
    fraudScore += 15;
    riskFactors.push('Suspicious email pattern');
  }

  // 6. Velocity Check
  const recentOrders = customerOrders.filter(o => {
    const orderDate = new Date(o.order_date);
    const now = new Date();
    return (now - orderDate) / (1000 * 60 * 60) < 24 && o.id !== order.id;
  });
  if (recentOrders.length >= 2) {
    fraudScore += 20;
    riskFactors.push(`${recentOrders.length + 1} orders in 24h`);
  }

  // 7. Return History
  const refundedOrders = customerOrders.filter(o => o.status === 'refunded' || o.status === 'partially_refunded');
  if (refundedOrders.length > 0 && customerOrders.length > 0) {
    const refundRate = (refundedOrders.length / customerOrders.length) * 100;
    if (refundRate > 30) {
      returnScore += 25;
      riskFactors.push(`High refund rate (${refundRate.toFixed(0)}%)`);
    }
  }

  // 8. Apply Custom Rules
  for (const rule of customRules) {
    if (evaluateRule(rule, order, customerOrders)) {
      fraudScore += rule.risk_adjustment || 0;
      riskFactors.push(`Rule: ${rule.name}`);
      
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

  // Calculate combined score
  const combinedScore = Math.min(100, Math.round(
    (fraudScore * 0.5) + (returnScore * 0.25) + (chargebackScore * 0.25)
  ));

  // Determine risk level
  let riskLevel = 'low';
  if (combinedScore >= 80) riskLevel = 'critical';
  else if (combinedScore >= settings.high_risk_threshold) riskLevel = 'high';
  else if (combinedScore >= settings.medium_risk_threshold) riskLevel = 'medium';

  // Recommended action
  let recommendedAction = 'none';
  if (riskLevel === 'critical') recommendedAction = 'cancel';
  else if (riskLevel === 'high') recommendedAction = 'verify';
  else if (riskLevel === 'medium') recommendedAction = 'flag';

  return {
    fraud_score: Math.min(100, Math.max(0, fraudScore)),
    return_score: Math.min(100, Math.max(0, returnScore)),
    chargeback_score: Math.min(100, Math.max(0, chargebackScore)),
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
    default: return false;
  }
}