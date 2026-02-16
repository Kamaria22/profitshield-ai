import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_id, tenant_id } = await req.json();
    
    if (!order_id || !tenant_id) {
      return Response.json({ error: 'order_id and tenant_id are required' }, { status: 400 });
    }

    // Fetch the order
    const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id, tenant_id });
    if (orders.length === 0) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }
    const order = orders[0];

    // Fetch customer order history
    const customerOrders = order.customer_email 
      ? await base44.asServiceRole.entities.Order.filter({ 
          tenant_id, 
          customer_email: order.customer_email 
        })
      : [];

    // Fetch tenant settings for thresholds
    const settings = await base44.asServiceRole.entities.TenantSettings.filter({ tenant_id });
    const tenantSettings = settings[0] || {
      high_risk_threshold: 70,
      medium_risk_threshold: 40
    };

    // Fetch custom risk rules
    const customRules = await base44.asServiceRole.entities.RiskRule.filter({ 
      tenant_id, 
      is_active: true 
    });

    // Perform comprehensive risk analysis with custom rules
    const riskAnalysis = analyzeRisk(order, customerOrders, tenantSettings, customRules);

    // Update the order with risk analysis results
    await base44.asServiceRole.entities.Order.update(order_id, {
      fraud_score: riskAnalysis.fraud_score,
      return_score: riskAnalysis.return_score,
      chargeback_score: riskAnalysis.chargeback_score,
      risk_level: riskAnalysis.risk_level,
      risk_reasons: riskAnalysis.risk_reasons,
      recommended_action: riskAnalysis.recommended_action,
      confidence: riskAnalysis.confidence
    });

    // Create alert if high risk
    if (riskAnalysis.risk_level === 'high') {
      await base44.asServiceRole.entities.Alert.create({
        tenant_id,
        type: 'high_risk_order',
        severity: 'high',
        title: `High Risk Order #${order.order_number}`,
        message: `Order flagged with ${riskAnalysis.risk_reasons.length} risk factors: ${riskAnalysis.risk_reasons.slice(0, 3).join(', ')}`,
        entity_type: 'order',
        entity_id: order_id,
        recommended_action: riskAnalysis.recommended_action,
        status: 'pending',
        metadata: {
          fraud_score: riskAnalysis.fraud_score,
          risk_reasons: riskAnalysis.risk_reasons
        }
      });
    }

    return Response.json({ 
      success: true, 
      risk_analysis: riskAnalysis 
    });

  } catch (error) {
    console.error('Risk analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function analyzeRisk(order, customerOrders, settings, customRules = []) {
  const riskFactors = [];
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  let customRuleAction = null;

  // 1. New Customer Analysis
  const isFirstOrder = customerOrders.length <= 1;
  if (isFirstOrder) {
    fraudScore += 15;
    riskFactors.push('First-time customer with no purchase history');
  }

  // 2. Order Value Analysis
  const avgOrderValue = customerOrders.length > 1 
    ? customerOrders.reduce((sum, o) => sum + (o.total_revenue || 0), 0) / customerOrders.length
    : 0;
  
  if (order.total_revenue > 500) {
    fraudScore += 10;
    riskFactors.push(`High order value ($${order.total_revenue?.toFixed(2)})`);
  }
  if (order.total_revenue > 1000) {
    fraudScore += 15;
    chargebackScore += 10;
  }
  if (avgOrderValue > 0 && order.total_revenue > avgOrderValue * 3) {
    fraudScore += 20;
    riskFactors.push('Order value 3x higher than customer average');
  }

  // 3. Address Mismatch Analysis
  const billingAddr = order.billing_address || {};
  const shippingAddr = order.shipping_address || {};
  
  if (billingAddr.country && shippingAddr.country && billingAddr.country !== shippingAddr.country) {
    fraudScore += 25;
    chargebackScore += 15;
    riskFactors.push('Billing and shipping countries differ');
  } else if (billingAddr.zip && shippingAddr.zip && billingAddr.zip !== shippingAddr.zip) {
    fraudScore += 10;
    riskFactors.push('Billing and shipping zip codes differ');
  }

  // 4. Discount Analysis
  const discountPct = order.total_revenue > 0 
    ? ((order.discount_total || 0) / (order.total_revenue + (order.discount_total || 0))) * 100 
    : 0;
  
  if (discountPct > 30) {
    fraudScore += 15;
    riskFactors.push(`Heavy discount usage (${discountPct.toFixed(0)}% off)`);
  }
  if ((order.discount_codes || []).length > 1) {
    fraudScore += 10;
    riskFactors.push('Multiple discount codes applied');
  }

  // 5. Shipping Analysis
  if (order.shipping_charged === 0 && order.total_revenue > 100) {
    returnScore += 10;
    riskFactors.push('Free shipping on high-value order');
  }

  // 6. Email Analysis
  const email = order.customer_email || '';
  if (email.includes('+') || /\d{4,}/.test(email.split('@')[0])) {
    fraudScore += 15;
    riskFactors.push('Suspicious email pattern detected');
  }
  const freeEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (freeEmailDomains.includes(emailDomain) && order.total_revenue > 500) {
    fraudScore += 5;
    riskFactors.push('High-value order with free email provider');
  }

  // 7. Velocity Check - Multiple orders in short timeframe
  const recentOrders = customerOrders.filter(o => {
    const orderDate = new Date(o.order_date);
    const now = new Date();
    const hoursDiff = (now - orderDate) / (1000 * 60 * 60);
    return hoursDiff < 24 && o.id !== order.id;
  });
  if (recentOrders.length >= 2) {
    fraudScore += 20;
    chargebackScore += 15;
    riskFactors.push(`${recentOrders.length + 1} orders in last 24 hours`);
  }

  // 8. Return History Analysis
  const previousRefunds = customerOrders.filter(o => 
    o.status === 'refunded' || o.status === 'partially_refunded'
  );
  if (previousRefunds.length > 0) {
    const refundRate = (previousRefunds.length / customerOrders.length) * 100;
    if (refundRate > 30) {
      returnScore += 25;
      riskFactors.push(`High refund history (${refundRate.toFixed(0)}% of orders)`);
    } else if (refundRate > 15) {
      returnScore += 15;
      riskFactors.push(`Moderate refund history (${refundRate.toFixed(0)}% of orders)`);
    }
  }

  // 9. Negative Margin Check
  if ((order.net_profit || 0) < 0) {
    riskFactors.push('Order has negative profit margin');
    chargebackScore += 10;
  }

  // 10. Apply Custom Risk Rules
  for (const rule of customRules) {
    const ruleMatches = evaluateCustomRule(rule, order, customerOrders);
    if (ruleMatches) {
      const adjustment = rule.risk_adjustment || 0;
      fraudScore += adjustment;
      riskFactors.push(`Custom rule: ${rule.name} (${adjustment > 0 ? '+' : ''}${adjustment})`);
      
      // Track rule action (most severe takes priority)
      if (rule.action && rule.action !== 'none') {
        const actionPriority = { cancel: 4, hold: 3, verify: 2, flag: 1 };
        if (!customRuleAction || actionPriority[rule.action] > actionPriority[customRuleAction]) {
          customRuleAction = rule.action;
        }
      }
    }
  }

  // Calculate combined risk score
  const combinedScore = Math.min(100, Math.round(
    (fraudScore * 0.5) + (returnScore * 0.25) + (chargebackScore * 0.25)
  ));

  // Determine risk level
  let riskLevel = 'low';
  if (combinedScore >= settings.high_risk_threshold) {
    riskLevel = 'high';
  } else if (combinedScore >= settings.medium_risk_threshold) {
    riskLevel = 'medium';
  }

  // Determine recommended action (custom rules can override)
  let recommendedAction = 'none';
  if (customRuleAction) {
    recommendedAction = customRuleAction;
  } else if (riskLevel === 'high') {
    if (fraudScore >= 60) {
      recommendedAction = 'cancel';
    } else if (fraudScore >= 40) {
      recommendedAction = 'verify';
    } else {
      recommendedAction = 'hold';
    }
  } else if (riskLevel === 'medium') {
    if (order.total_revenue > 500) {
      recommendedAction = 'signature';
    } else {
      recommendedAction = 'verify';
    }
  }

  // Calculate confidence based on data completeness
  let confidenceScore = 100;
  if (!order.billing_address) confidenceScore -= 15;
  if (!order.shipping_address) confidenceScore -= 15;
  if (!order.customer_email) confidenceScore -= 20;
  if (customerOrders.length < 2) confidenceScore -= 10;
  
  let confidence = 'high';
  if (confidenceScore < 60) confidence = 'low';
  else if (confidenceScore < 80) confidence = 'medium';

  return {
    fraud_score: Math.min(100, Math.max(0, fraudScore)),
    return_score: Math.min(100, Math.max(0, returnScore)),
    chargeback_score: Math.min(100, Math.max(0, chargebackScore)),
    combined_score: combinedScore,
    risk_level: riskLevel,
    risk_reasons: riskFactors,
    recommended_action: recommendedAction,
    confidence,
    confidence_score: confidenceScore
  };
}

// Evaluate a custom risk rule against an order
function evaluateCustomRule(rule, order, customerOrders) {
  const conditions = rule.conditions || [];
  
  // All conditions must match (AND logic)
  for (const condition of conditions) {
    const { field, operator, value } = condition;
    let fieldValue = getFieldValue(field, order, customerOrders);
    let compareValue = value;
    
    // Type coercion for numeric fields
    const numericFields = ['order_value', 'discount_pct', 'customer_orders', 'item_count'];
    if (numericFields.includes(field)) {
      fieldValue = parseFloat(fieldValue) || 0;
      compareValue = parseFloat(value) || 0;
    }
    
    // Boolean fields
    if (field === 'is_first_order' || field === 'has_discount_code') {
      fieldValue = !!fieldValue;
      compareValue = value === 'true' || value === true;
    }
    
    const matches = evaluateCondition(fieldValue, operator, compareValue);
    if (!matches) return false;
  }
  
  return true;
}

function getFieldValue(field, order, customerOrders) {
  switch (field) {
    case 'order_value':
      return order.total_revenue || 0;
    case 'discount_pct':
      const total = order.total_revenue || 0;
      const discount = order.discount_total || 0;
      return total > 0 ? (discount / (total + discount)) * 100 : 0;
    case 'customer_orders':
      return customerOrders.length;
    case 'product_type':
      // Would need line items with product type data
      return order.platform_data?.line_items?.[0]?.product_type || '';
    case 'shipping_country':
      return order.shipping_address?.country || order.shipping_address?.country_code || '';
    case 'payment_method':
      return order.platform_data?.payment_gateway_names?.[0] || '';
    case 'is_first_order':
      return order.is_first_order || customerOrders.length <= 1;
    case 'has_discount_code':
      return (order.discount_codes || []).length > 0;
    case 'item_count':
      return order.platform_data?.line_items?.length || 1;
    default:
      return null;
  }
}

function evaluateCondition(fieldValue, operator, compareValue) {
  switch (operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === String(compareValue).toLowerCase();
    case 'not_equals':
      return String(fieldValue).toLowerCase() !== String(compareValue).toLowerCase();
    case 'greater_than':
      return Number(fieldValue) > Number(compareValue);
    case 'less_than':
      return Number(fieldValue) < Number(compareValue);
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());
    case 'not_contains':
      return !String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());
    default:
      return false;
  }
}