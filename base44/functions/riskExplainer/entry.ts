import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Risk factor explanations for customers
const FACTOR_EXPLANATIONS = {
  high_order_value: "This order has an unusually high value compared to typical orders",
  new_customer: "This is a first-time customer with no purchase history",
  address_mismatch: "The billing and shipping addresses are in different regions",
  velocity_flag: "Multiple orders were placed in a short time period",
  device_risk: "The device used shows characteristics common in fraudulent transactions",
  email_risk: "The email address has characteristics that may indicate risk",
  payment_risk: "The payment method has been associated with chargebacks",
  geo_mismatch: "The IP location doesn't match the billing address",
  failed_attempts: "There were multiple failed payment attempts before this order"
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'explain_risk') {
      return await explainRisk(base44, body.order_id);
    } else if (action === 'submit_appeal') {
      return await submitAppeal(base44, body);
    } else if (action === 'review_appeal') {
      return await reviewAppeal(base44, body.appeal_id, body.decision, user.email);
    } else if (action === 'get_appeals') {
      return await getAppeals(base44, body.tenant_id);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function explainRisk(base44, orderId) {
  const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId });
  if (orders.length === 0) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }

  const order = orders[0];
  const riskScore = order.risk_score || 0;
  
  // Get risk analysis if exists
  const riskAudits = await base44.asServiceRole.entities.RiskScoreAudit.filter({ order_id: orderId });
  const riskAudit = riskAudits[0];

  // Build customer-friendly explanation
  const factors = [];
  const internalFactors = [];

  // Analyze risk factors
  if (order.total > 500) {
    factors.push({
      factor: 'high_order_value',
      weight: 15,
      explanation: FACTOR_EXPLANATIONS.high_order_value,
      customer_visible: true
    });
  }

  if (!order.customer_orders_count || order.customer_orders_count === 0) {
    factors.push({
      factor: 'new_customer',
      weight: 10,
      explanation: FACTOR_EXPLANATIONS.new_customer,
      customer_visible: true
    });
  }

  if (order.billing_address?.country !== order.shipping_address?.country) {
    factors.push({
      factor: 'address_mismatch',
      weight: 20,
      explanation: FACTOR_EXPLANATIONS.address_mismatch,
      customer_visible: true
    });
  }

  // Add some simulated factors
  if (riskScore > 50) {
    factors.push({
      factor: 'velocity_flag',
      weight: 25,
      explanation: FACTOR_EXPLANATIONS.velocity_flag,
      customer_visible: true
    });
  }

  if (riskScore > 70) {
    internalFactors.push({
      factor: 'device_risk',
      weight: 20,
      explanation: FACTOR_EXPLANATIONS.device_risk,
      customer_visible: false
    });
  }

  // Generate customer-facing explanation
  const visibleFactors = factors.filter(f => f.customer_visible);
  let customerExplanation = '';
  
  if (riskScore < 30) {
    customerExplanation = "This order has been approved and shows no significant risk indicators.";
  } else if (riskScore < 50) {
    customerExplanation = "This order is under standard review. " + 
      (visibleFactors.length > 0 ? `We noticed: ${visibleFactors.map(f => f.explanation.toLowerCase()).join('; ')}.` : '');
  } else if (riskScore < 70) {
    customerExplanation = "This order requires additional verification. " +
      `Reasons: ${visibleFactors.map(f => f.explanation.toLowerCase()).join('; ')}. ` +
      "You may submit additional documentation to expedite processing.";
  } else {
    customerExplanation = "This order has been flagged for enhanced review. " +
      `Primary concerns: ${visibleFactors.map(f => f.explanation.toLowerCase()).join('; ')}. ` +
      "Please contact support or submit an appeal with supporting documentation.";
  }

  return Response.json({
    order_id: orderId,
    risk_score: riskScore,
    risk_level: riskScore < 30 ? 'low' : riskScore < 50 ? 'medium' : riskScore < 70 ? 'high' : 'critical',
    customer_explanation: customerExplanation,
    visible_factors: visibleFactors,
    can_appeal: riskScore >= 50,
    appeal_instructions: riskScore >= 50 
      ? "You can submit an appeal with supporting documentation such as ID verification, proof of address, or previous order history."
      : null
  });
}

async function submitAppeal(base44, data) {
  const { tenant_id, order_id, appeal_reason, evidence } = data;

  // Get order details
  const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
  if (orders.length === 0) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }

  const order = orders[0];

  // Get risk explanation
  const explanation = await explainRisk(base44, order_id);
  const explanationData = await explanation.json();

  const appeal = await base44.asServiceRole.entities.RiskAppeal.create({
    tenant_id: tenant_id || order.tenant_id,
    order_id,
    original_risk_score: order.risk_score,
    risk_factors: explanationData.visible_factors,
    customer_explanation: explanationData.customer_explanation,
    appeal_reason,
    supporting_evidence: evidence || [],
    status: 'pending'
  });

  // Create task for review
  await base44.asServiceRole.entities.Task.create({
    tenant_id: tenant_id || order.tenant_id,
    title: `Review Risk Appeal - Order ${order.order_number || order_id}`,
    description: `Appeal submitted for order with risk score ${order.risk_score}. Reason: ${appeal_reason}`,
    type: 'review',
    priority: order.risk_score > 70 ? 'high' : 'medium',
    status: 'pending',
    related_entity_type: 'RiskAppeal',
    related_entity_id: appeal.id
  });

  return Response.json({
    success: true,
    appeal_id: appeal.id,
    status: 'pending',
    message: 'Your appeal has been submitted and will be reviewed within 24-48 hours.'
  });
}

async function reviewAppeal(base44, appealId, decision, reviewerEmail) {
  const appeals = await base44.asServiceRole.entities.RiskAppeal.filter({ id: appealId });
  if (appeals.length === 0) {
    return Response.json({ error: 'Appeal not found' }, { status: 404 });
  }

  const appeal = appeals[0];
  const newStatus = decision === 'approve' ? 'approved' : 'rejected';
  
  // If approved, update the order risk score
  let newRiskScore = appeal.original_risk_score;
  if (decision === 'approve') {
    newRiskScore = Math.max(0, appeal.original_risk_score - 40);
    
    const orders = await base44.asServiceRole.entities.Order.filter({ id: appeal.order_id });
    if (orders.length > 0) {
      await base44.asServiceRole.entities.Order.update(orders[0].id, {
        risk_score: newRiskScore,
        risk_override: true,
        risk_override_reason: `Appeal approved by ${reviewerEmail}`
      });
    }
  }

  await base44.asServiceRole.entities.RiskAppeal.update(appeal.id, {
    status: newStatus,
    reviewer: reviewerEmail,
    decision_date: new Date().toISOString(),
    new_risk_score: decision === 'approve' ? newRiskScore : null,
    model_feedback: {
      was_false_positive: decision === 'approve',
      feedback_applied: decision === 'approve',
      model_version_updated: null
    }
  });

  // Log governance event
  await base44.asServiceRole.entities.GovernanceAuditEvent.create({
    event_type: 'data_access',
    entity_affected: 'RiskAppeal',
    entity_id: appealId,
    changed_by: reviewerEmail,
    change_reason: `Appeal ${decision}: ${appeal.appeal_reason}`,
    severity: 'info'
  });

  return Response.json({
    success: true,
    appeal_id: appealId,
    decision: newStatus,
    new_risk_score: decision === 'approve' ? newRiskScore : appeal.original_risk_score
  });
}

async function getAppeals(base44, tenantId) {
  const filter = tenantId ? { tenant_id: tenantId } : {};
  const appeals = await base44.asServiceRole.entities.RiskAppeal.filter(filter);

  return Response.json({
    appeals: appeals.map(a => ({
      id: a.id,
      order_id: a.order_id,
      original_risk_score: a.original_risk_score,
      appeal_reason: a.appeal_reason,
      status: a.status,
      created_date: a.created_date,
      decision_date: a.decision_date
    })),
    summary: {
      total: appeals.length,
      pending: appeals.filter(a => a.status === 'pending').length,
      approved: appeals.filter(a => a.status === 'approved').length,
      rejected: appeals.filter(a => a.status === 'rejected').length,
      false_positive_rate: appeals.filter(a => a.status === 'approved').length / Math.max(1, appeals.length) * 100
    }
  });
}