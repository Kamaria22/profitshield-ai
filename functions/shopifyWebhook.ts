import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// HMAC verification for Shopify webhooks
async function verifyShopifyWebhook(body, hmacHeader, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return computedHmac === hmacHeader;
}

// Generate idempotency key
function generateIdempotencyKey(tenantId, topic, eventId) {
  return `${tenantId}:${topic}:${eventId}`;
}

// Calculate profit for an order
function calculateOrderProfit(order, costMappings, settings) {
  const revenue = parseFloat(order.total_price) || 0;
  const shippingCharged = order.shipping_lines?.reduce((sum, l) => sum + parseFloat(l.price || 0), 0) || 0;
  const taxTotal = order.tax_lines?.reduce((sum, l) => sum + parseFloat(l.price || 0), 0) || 0;
  const discountTotal = order.discount_codes?.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0) || 0;
  
  // Calculate COGS
  let totalCogs = 0;
  let hasAllCosts = true;
  
  const lineItems = order.line_items || [];
  for (const item of lineItems) {
    const sku = item.sku || item.variant_id?.toString();
    const costMapping = costMappings.find(m => m.sku === sku);
    
    if (costMapping) {
      totalCogs += (costMapping.cost_per_unit || 0) * (item.quantity || 1);
    } else {
      hasAllCosts = false;
    }
  }
  
  // Estimate payment fees
  const paymentFeePct = settings?.default_payment_fee_pct || 2.9;
  const paymentFeeFixed = settings?.default_payment_fee_fixed || 0.30;
  const paymentFee = (revenue * paymentFeePct / 100) + paymentFeeFixed;
  
  // Platform fees
  const platformFeePct = settings?.default_platform_fee_pct || 0;
  const platformFee = revenue * platformFeePct / 100;
  
  // Shipping cost (use charged as estimate if no actual cost)
  const shippingCost = order.shipping_cost || shippingCharged * 0.8;
  
  // Calculate net profit
  const netProfit = revenue - totalCogs - paymentFee - platformFee - shippingCost;
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  
  // Determine confidence
  let confidence = 'high';
  if (!hasAllCosts) confidence = 'medium';
  if (lineItems.length > 0 && costMappings.length === 0) confidence = 'low';
  
  return {
    total_revenue: revenue,
    subtotal: revenue - shippingCharged - taxTotal,
    shipping_charged: shippingCharged,
    tax_total: taxTotal,
    discount_total: discountTotal,
    total_cogs: totalCogs,
    payment_fee: paymentFee,
    platform_fee: platformFee,
    shipping_cost: shippingCost,
    net_profit: netProfit,
    margin_pct: marginPct,
    confidence
  };
}

// Calculate risk scores
function calculateRiskScores(order, customer, settings) {
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  const riskReasons = [];
  
  const orderTotal = parseFloat(order.total_price || 0);
  const isFirstOrder = !customer || customer.orders_count <= 1;
  
  // Fraud indicators
  if (isFirstOrder && orderTotal > 200) {
    fraudScore += 25;
    riskReasons.push('New customer with high order value');
  }
  
  // Address mismatch
  const billing = order.billing_address;
  const shipping = order.shipping_address;
  if (billing && shipping) {
    if (billing.country_code !== shipping.country_code) {
      fraudScore += 30;
      riskReasons.push('Billing and shipping countries differ');
    } else if (billing.city?.toLowerCase() !== shipping.city?.toLowerCase()) {
      fraudScore += 15;
      riskReasons.push('Billing and shipping cities differ');
    }
  }
  
  // Multiple discount codes
  const discountCount = order.discount_codes?.length || 0;
  if (discountCount >= 2) {
    fraudScore += 10;
    chargebackScore += 15;
    riskReasons.push('Multiple discount codes used');
  }
  
  // High-value first order
  if (isFirstOrder && orderTotal > 500) {
    fraudScore += 20;
    chargebackScore += 10;
    riskReasons.push('First order exceeds $500');
  }
  
  // Return risk - new customer
  if (isFirstOrder) {
    returnScore += 20;
  }
  
  // Cap scores at 100
  fraudScore = Math.min(fraudScore, 100);
  returnScore = Math.min(returnScore, 100);
  chargebackScore = Math.min(chargebackScore, 100);
  
  // Determine overall risk level
  const maxScore = Math.max(fraudScore, chargebackScore);
  const highThreshold = settings?.high_risk_threshold || 70;
  const mediumThreshold = settings?.medium_risk_threshold || 40;
  
  let riskLevel = 'low';
  let recommendedAction = 'none';
  
  if (maxScore >= highThreshold) {
    riskLevel = 'high';
    recommendedAction = 'hold';
  } else if (maxScore >= mediumThreshold) {
    riskLevel = 'medium';
    recommendedAction = 'verify';
  }
  
  return {
    fraud_score: fraudScore,
    return_score: returnScore,
    chargeback_score: chargebackScore,
    risk_level: riskLevel,
    risk_reasons: riskReasons,
    recommended_action: recommendedAction
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const url = new URL(req.url);
    const topic = req.headers.get('x-shopify-topic');
    let shopDomain = req.headers.get('x-shopify-shop-domain');
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const webhookId = req.headers.get('x-shopify-webhook-id');
    
    if (!topic || !shopDomain) {
      return Response.json({ error: 'Missing required headers' }, { status: 400 });
    }
    
    // Normalize shop domain
    shopDomain = shopDomain.includes('.myshopify.com') 
      ? shopDomain.toLowerCase().trim()
      : `${shopDomain.toLowerCase().trim()}.myshopify.com`;
    
    console.log('[shopifyWebhook] Received webhook:', topic, 'for shop:', shopDomain);
    
    const body = await req.text();
    
    // Resolve tenant by shop domain (single source of truth)
    console.log('[shopifyWebhook] Looking up tenant by shop_domain:', shopDomain);
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
      shop_domain: shopDomain
    });
    
    console.log('[shopifyWebhook] Found tenants:', tenants.length);
    
    if (tenants.length === 0) {
      console.error('[shopifyWebhook] Unknown shop:', shopDomain);
      return Response.json({ error: 'Unknown shop' }, { status: 404 });
    }
    
    const tenant = tenants[0];
    console.log('[shopifyWebhook] Resolved tenant_id:', tenant.id, 'shop_name:', tenant.shop_name);
    
    // FAIL-CLOSED HMAC enforcement — no secret = reject
    if (!tenant.webhook_secret) {
      console.error('[shopifyWebhook] SECURITY: Missing webhook_secret for tenant:', tenant.id, '— fail closed');
      // Log security event
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant.id,
        action: 'webhook_hmac_missing_secret',
        entity_type: 'tenant',
        entity_id: tenant.id,
        performed_by: 'system',
        description: `Webhook rejected — tenant has no webhook_secret configured (fail-closed). Shop: ${shopDomain}`,
        severity: 'critical',
        category: 'security',
        metadata: { shop_domain: shopDomain, topic, hmac_present: !!hmacHeader }
      }).catch(() => {});
      return Response.json({ error: 'Webhook secret not configured' }, { status: 401 });
    }

    if (!hmacHeader) {
      console.error('[shopifyWebhook] SECURITY: Missing HMAC header for tenant:', tenant.id, '— fail closed');
      return Response.json({ error: 'Missing HMAC signature' }, { status: 401 });
    }

    const isValid = await verifyShopifyWebhook(body, hmacHeader, tenant.webhook_secret);
    if (!isValid) {
      console.error('[shopifyWebhook] SECURITY: Invalid HMAC signature for tenant:', tenant.id, 'shop:', shopDomain);
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant.id,
        action: 'webhook_hmac_invalid',
        entity_type: 'tenant',
        entity_id: tenant.id,
        performed_by: 'system',
        description: `Invalid HMAC signature rejected. Shop: ${shopDomain}, Topic: ${topic}`,
        severity: 'high',
        category: 'security',
        metadata: { shop_domain: shopDomain, topic }
      }).catch(() => {});
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }
    console.log('[shopifyWebhook] HMAC verified OK for tenant:', tenant.id);
    
    const payload = JSON.parse(body);
    const eventId = webhookId || payload.id?.toString() || Date.now().toString();
    const idempotencyKey = generateIdempotencyKey(tenant.id, topic, eventId);
    
    // Check idempotency
    const existingEvents = await base44.asServiceRole.entities.WebhookEvent.filter({ 
      idempotency_key: idempotencyKey 
    });
    
    if (existingEvents.length > 0) {
      console.log('Duplicate webhook, skipping:', idempotencyKey);
      return Response.json({ status: 'duplicate' });
    }
    
    // Store the event
    const event = await base44.asServiceRole.entities.WebhookEvent.create({
      tenant_id: tenant.id,
      platform: 'shopify',
      topic,
      event_id: eventId,
      idempotency_key: idempotencyKey,
      payload,
      status: 'processing'
    });
    
    // ASYNC ARCHITECTURE: Enqueue for processing; ACK immediately for fast response
    // app/uninstalled is handled inline (no profit compute needed, must be immediate)
    if (topic === 'app/uninstalled') {
      console.log('[shopifyWebhook] Processing uninstall inline for tenant:', tenant.id);
      await handleUninstall(base44, tenant);
      await base44.asServiceRole.entities.WebhookEvent.update(event.id, {
        status: 'processed',
        processed_at: new Date().toISOString()
      });
    } else {
      // Enqueue to WebhookQueue for async processing (orders, refunds, etc.)
      await base44.asServiceRole.entities.WebhookQueue.create({
        tenant_id: tenant.id,
        event_type: topic,
        platform: 'shopify',
        idempotency_key: idempotencyKey,
        payload,
        status: 'pending'
      }).catch(err => console.warn('[shopifyWebhook] Queue enqueue warning:', err.message));

      await base44.asServiceRole.entities.WebhookEvent.update(event.id, {
        status: 'queued',
        processed_at: new Date().toISOString()
      });
    }
    
    console.log('[shopifyWebhook] ACK sent for:', topic, 'tenant:', tenant.id);
    return Response.json({ status: 'ok', tenant_id: tenant.id });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function processOrder(base44, tenant, orderData) {
  console.log('[processOrder] Starting for order:', orderData.id, 'tenant:', tenant.id);
  
  // Get cost mappings and settings
  const [costMappings, settingsData] = await Promise.all([
    base44.asServiceRole.entities.CostMapping.filter({ tenant_id: tenant.id }),
    base44.asServiceRole.entities.TenantSettings.filter({ tenant_id: tenant.id })
  ]);
  
  console.log('[processOrder] Cost mappings:', costMappings.length, 'Settings found:', settingsData.length);
  const settings = settingsData[0] || {};
  
  // Calculate profit
  const profitData = calculateOrderProfit(orderData, costMappings, settings);
  
  // Calculate risk
  const riskData = calculateRiskScores(orderData, orderData.customer, settings);
  
  // Check if order exists
  const existingOrders = await base44.asServiceRole.entities.Order.filter({
    tenant_id: tenant.id,
    platform_order_id: orderData.id.toString()
  });
  
  const orderRecord = {
    tenant_id: tenant.id,
    platform_order_id: orderData.id.toString(),
    order_number: orderData.order_number?.toString() || orderData.name,
    customer_email: orderData.email,
    customer_name: orderData.customer?.first_name 
      ? `${orderData.customer.first_name} ${orderData.customer.last_name || ''}`
      : orderData.shipping_address?.name,
    order_date: orderData.created_at,
    status: mapOrderStatus(orderData),
    fulfillment_status: orderData.fulfillment_status || 'unfulfilled',
    billing_address: orderData.billing_address,
    shipping_address: orderData.shipping_address,
    discount_codes: orderData.discount_codes?.map(d => d.code) || [],
    is_first_order: !orderData.customer || orderData.customer.orders_count <= 1,
    ...profitData,
    ...riskData,
    platform_data: orderData
  };
  
  if (existingOrders.length > 0) {
    console.log('[processOrder] Updating existing order:', existingOrders[0].id);
    await base44.asServiceRole.entities.Order.update(existingOrders[0].id, orderRecord);
  } else {
    console.log('[processOrder] Creating new order:', orderRecord.order_number);
    const createdOrder = await base44.asServiceRole.entities.Order.create(orderRecord);
    console.log('[processOrder] Created order with id:', createdOrder.id);
    
    // Create alert if high risk
    if (riskData.risk_level === 'high') {
      await base44.asServiceRole.entities.Alert.create({
        tenant_id: tenant.id,
        type: 'high_risk_order',
        severity: 'high',
        title: `High Risk Order #${orderRecord.order_number}`,
        message: `Order flagged for: ${riskData.risk_reasons.join(', ')}`,
        entity_type: 'order',
        entity_id: orderData.id.toString(),
        recommended_action: riskData.recommended_action,
        metadata: { fraud_score: riskData.fraud_score, order_total: profitData.total_revenue }
      });
    }
    
    // Create alert if negative margin
    if (profitData.net_profit < 0) {
      await base44.asServiceRole.entities.Alert.create({
        tenant_id: tenant.id,
        type: 'negative_margin',
        severity: 'medium',
        title: `Negative Margin on Order #${orderRecord.order_number}`,
        message: `This order lost $${Math.abs(profitData.net_profit).toFixed(2)}`,
        entity_type: 'order',
        entity_id: orderData.id.toString(),
        metadata: { net_profit: profitData.net_profit, margin_pct: profitData.margin_pct }
      });
    }
  }
  
  // Process line items
  for (const item of orderData.line_items || []) {
    const sku = item.sku || item.variant_id?.toString() || '';
    const costMapping = costMappings.find(m => m.sku === sku);
    const unitCost = costMapping?.cost_per_unit || 0;
    const totalCost = unitCost * (item.quantity || 1);
    const lineProfit = parseFloat(item.price || 0) * (item.quantity || 1) - totalCost;
    
    const existingItems = await base44.asServiceRole.entities.OrderItem.filter({
      tenant_id: tenant.id,
      order_id: orderData.id.toString(),
      platform_line_item_id: item.id.toString()
    });
    
    const itemRecord = {
      tenant_id: tenant.id,
      order_id: orderData.id.toString(),
      platform_line_item_id: item.id.toString(),
      product_id: item.product_id?.toString(),
      variant_id: item.variant_id?.toString(),
      sku,
      title: item.title,
      variant_title: item.variant_title,
      quantity: item.quantity,
      unit_price: parseFloat(item.price || 0),
      unit_cost: unitCost,
      total_price: parseFloat(item.price || 0) * (item.quantity || 1),
      total_cost: totalCost,
      line_profit: lineProfit,
      line_margin_pct: item.price ? (lineProfit / (parseFloat(item.price) * item.quantity)) * 100 : 0,
      is_gift_card: item.gift_card || false,
      requires_shipping: item.requires_shipping || true
    };
    
    if (existingItems.length > 0) {
      await base44.asServiceRole.entities.OrderItem.update(existingItems[0].id, itemRecord);
    } else {
      await base44.asServiceRole.entities.OrderItem.create(itemRecord);
    }
  }
}

async function processRefund(base44, tenant, refundData) {
  const existingRefunds = await base44.asServiceRole.entities.Refund.filter({
    tenant_id: tenant.id,
    platform_refund_id: refundData.id.toString()
  });
  
  if (existingRefunds.length > 0) return;
  
  const totalAmount = refundData.transactions?.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) || 0;
  
  await base44.asServiceRole.entities.Refund.create({
    tenant_id: tenant.id,
    order_id: refundData.order_id.toString(),
    platform_refund_id: refundData.id.toString(),
    amount: totalAmount,
    reason: refundData.note || 'No reason provided',
    refund_line_items: refundData.refund_line_items?.map(item => ({
      line_item_id: item.line_item_id?.toString(),
      quantity: item.quantity,
      amount: parseFloat(item.subtotal || 0)
    })),
    restock: refundData.restock || false,
    refunded_at: refundData.created_at
  });
  
  // Update order refund amount
  const orders = await base44.asServiceRole.entities.Order.filter({
    tenant_id: tenant.id,
    platform_order_id: refundData.order_id.toString()
  });
  
  if (orders.length > 0) {
    const currentRefund = orders[0].refund_amount || 0;
    await base44.asServiceRole.entities.Order.update(orders[0].id, {
      refund_amount: currentRefund + totalAmount,
      status: totalAmount >= orders[0].total_revenue ? 'refunded' : 'partially_refunded'
    });
  }
}

async function handleUninstall(base44, tenant) {
  console.log('[handleUninstall] Processing app uninstall for tenant:', tenant.id);
  
  // Mark tenant as inactive
  await base44.asServiceRole.entities.Tenant.update(tenant.id, {
    status: 'inactive',
    uninstalled_at: new Date().toISOString()
  });
  
  // Invalidate all OAuth tokens
  const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ tenant_id: tenant.id });
  for (const token of tokens) {
    await base44.asServiceRole.entities.OAuthToken.update(token.id, { is_valid: false });
  }
  
  // Mark platform integrations as disconnected
  const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenant.id });
  for (const integration of integrations) {
    await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, { 
      status: 'disconnected' 
    });
  }
  
  // Log uninstall for audit trail
  await base44.asServiceRole.entities.AuditLog.create({
    tenant_id: tenant.id,
    action: 'app_uninstalled',
    entity_type: 'tenant',
    entity_id: tenant.id,
    performed_by: 'shopify_webhook',
    description: `App uninstalled for ${tenant.shop_domain}. GDPR deletion will occur in 48 hours.`,
    metadata: {
      shop_domain: tenant.shop_domain,
      uninstalled_at: new Date().toISOString()
    },
    category: 'integration',
    severity: 'high'
  });
  
  console.log('[handleUninstall] Uninstall processed. GDPR cleanup will be triggered by Shopify in 48 hours.');
}

function mapOrderStatus(order) {
  if (order.cancelled_at) return 'cancelled';
  if (order.refunds?.length > 0) {
    const refundTotal = order.refunds.reduce((sum, r) => 
      sum + r.transactions.reduce((s, t) => s + parseFloat(t.amount || 0), 0), 0);
    if (refundTotal >= parseFloat(order.total_price)) return 'refunded';
    return 'partially_refunded';
  }
  if (order.fulfillment_status === 'fulfilled') return 'fulfilled';
  if (order.financial_status === 'paid') return 'paid';
  return 'pending';
}