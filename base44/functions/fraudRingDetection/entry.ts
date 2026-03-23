import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'detect_rings') {
      return await detectFraudRings(base44);
    } else if (action === 'get_active_rings') {
      return await getActiveRings(base44);
    } else if (action === 'apply_countermeasure') {
      return await applyCountermeasure(base44, body.ring_id, body.measure);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function detectFraudRings(base44) {
  // Get cross-merchant signals
  const signals = await base44.asServiceRole.entities.CrossMerchantSignal.filter({});
  const orders = await base44.asServiceRole.entities.Order.filter({});
  
  // Build entity graph
  const entityGraph = {};
  const ringCandidates = [];

  // Group orders by shared attributes
  const emailGroups = {};
  const ipGroups = {};
  const deviceGroups = {};
  const paymentGroups = {};

  for (const order of orders) {
    const email = order.customer_email?.toLowerCase();
    const ip = order.source_ip;
    const device = order.device_fingerprint;
    const payment = order.payment_method_fingerprint;

    if (email) {
      emailGroups[email] = emailGroups[email] || [];
      emailGroups[email].push(order);
    }
    if (ip) {
      ipGroups[ip] = ipGroups[ip] || [];
      ipGroups[ip].push(order);
    }
  }

  // Detect rings based on shared entities across multiple merchants
  const detectedRings = [];
  let ringCounter = 1;

  // Check for email-based rings
  for (const [email, emailOrders] of Object.entries(emailGroups)) {
    const uniqueTenants = new Set(emailOrders.map(o => o.tenant_id));
    if (uniqueTenants.size >= 2 && emailOrders.length >= 3) {
      const highRiskOrders = emailOrders.filter(o => (o.risk_score || 0) > 50);
      if (highRiskOrders.length >= 2) {
        const ring = await createFraudRing(base44, {
          ring_id: `RING-${Date.now()}-${ringCounter++}`,
          detection_method: 'graph_analysis',
          connected_entities: [
            { entity_type: 'email', entity_value: email, connection_strength: 1.0, occurrence_count: emailOrders.length }
          ],
          affected_merchants: Array.from(uniqueTenants).map(tid => ({
            tenant_id: tid,
            orders_affected: emailOrders.filter(o => o.tenant_id === tid).length,
            loss_amount: emailOrders.filter(o => o.tenant_id === tid).reduce((sum, o) => sum + (o.total || 0), 0)
          })),
          total_orders_linked: emailOrders.length,
          total_loss_amount: emailOrders.reduce((sum, o) => sum + (o.total || 0), 0),
          total_merchants_affected: uniqueTenants.size,
          severity: uniqueTenants.size >= 5 ? 'critical' : uniqueTenants.size >= 3 ? 'high' : 'medium',
          confidence_score: Math.min(95, 60 + uniqueTenants.size * 10)
        });
        detectedRings.push(ring);
      }
    }
  }

  // Check for IP-based velocity patterns
  for (const [ip, ipOrders] of Object.entries(ipGroups)) {
    const uniqueTenants = new Set(ipOrders.map(o => o.tenant_id));
    const timeWindow = 3600000; // 1 hour
    
    // Check for velocity (many orders in short time)
    ipOrders.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    let velocityCount = 0;
    for (let i = 1; i < ipOrders.length; i++) {
      const timeDiff = new Date(ipOrders[i].created_date) - new Date(ipOrders[i-1].created_date);
      if (timeDiff < timeWindow) velocityCount++;
    }

    if (velocityCount >= 5 && uniqueTenants.size >= 2) {
      const ring = await createFraudRing(base44, {
        ring_id: `RING-${Date.now()}-${ringCounter++}`,
        detection_method: 'velocity_pattern',
        connected_entities: [
          { entity_type: 'ip_address', entity_value: ip, connection_strength: 0.9, occurrence_count: ipOrders.length }
        ],
        affected_merchants: Array.from(uniqueTenants).map(tid => ({
          tenant_id: tid,
          orders_affected: ipOrders.filter(o => o.tenant_id === tid).length,
          loss_amount: ipOrders.filter(o => o.tenant_id === tid).reduce((sum, o) => sum + (o.total || 0), 0)
        })),
        total_orders_linked: ipOrders.length,
        total_loss_amount: ipOrders.reduce((sum, o) => sum + (o.total || 0), 0),
        total_merchants_affected: uniqueTenants.size,
        severity: velocityCount >= 20 ? 'critical' : velocityCount >= 10 ? 'high' : 'medium',
        confidence_score: Math.min(90, 50 + velocityCount * 3)
      });
      detectedRings.push(ring);
    }
  }

  // Log detection event
  await base44.asServiceRole.entities.GovernanceAuditEvent.create({
    event_type: 'security_event',
    entity_affected: 'FraudRing',
    changed_by: 'fraud_ring_detector',
    change_reason: `Detected ${detectedRings.length} potential fraud rings`,
    severity: detectedRings.some(r => r.severity === 'critical') ? 'critical' : 'info'
  });

  return Response.json({
    success: true,
    rings_detected: detectedRings.length,
    total_orders_linked: detectedRings.reduce((sum, r) => sum + r.total_orders_linked, 0),
    total_loss_at_risk: detectedRings.reduce((sum, r) => sum + r.total_loss_amount, 0),
    rings: detectedRings.map(r => ({
      ring_id: r.ring_id,
      method: r.detection_method,
      severity: r.severity,
      merchants_affected: r.total_merchants_affected,
      orders_linked: r.total_orders_linked,
      confidence: r.confidence_score
    }))
  });
}

async function createFraudRing(base44, data) {
  const ring = await base44.asServiceRole.entities.FraudRing.create({
    ...data,
    ring_name: `Fraud Ring ${data.ring_id}`,
    status: 'active',
    timeline: {
      first_activity: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      last_activity: new Date().toISOString()
    }
  });
  return ring;
}

async function getActiveRings(base44) {
  const rings = await base44.asServiceRole.entities.FraudRing.filter({ status: 'active' });
  
  return Response.json({
    active_rings: rings.map(r => ({
      ring_id: r.ring_id,
      ring_name: r.ring_name,
      detection_method: r.detection_method,
      severity: r.severity,
      confidence: r.confidence_score,
      merchants_affected: r.total_merchants_affected,
      orders_linked: r.total_orders_linked,
      total_loss: r.total_loss_amount,
      status: r.status,
      countermeasures_applied: (r.countermeasures || []).length
    })),
    summary: {
      total_active: rings.length,
      critical_rings: rings.filter(r => r.severity === 'critical').length,
      total_loss_at_risk: rings.reduce((sum, r) => sum + (r.total_loss_amount || 0), 0)
    }
  });
}

async function applyCountermeasure(base44, ringId, measure) {
  const rings = await base44.asServiceRole.entities.FraudRing.filter({ ring_id: ringId });
  if (rings.length === 0) {
    return Response.json({ error: 'Ring not found' }, { status: 404 });
  }

  const ring = rings[0];
  const countermeasures = ring.countermeasures || [];

  countermeasures.push({
    measure: measure,
    applied_at: new Date().toISOString(),
    effectiveness: 0
  });

  const newStatus = measure === 'block_all_entities' ? 'contained' : 
                    measure === 'neutralize' ? 'neutralized' : 'monitoring';

  await base44.asServiceRole.entities.FraudRing.update(ring.id, {
    countermeasures,
    status: newStatus
  });

  return Response.json({
    success: true,
    ring_id: ringId,
    measure_applied: measure,
    new_status: newStatus
  });
}