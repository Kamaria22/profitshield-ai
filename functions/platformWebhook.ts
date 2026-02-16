import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as crypto from 'node:crypto';

// Verify webhook signatures for different platforms
async function verifyShopifyWebhook(body, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  const computed = hmac.digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
}

async function verifyWooCommerceWebhook(body, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  const computed = hmac.digest('base64');
  return signature === computed;
}

async function verifyBigCommerceWebhook(headers, secret) {
  // BigCommerce uses OAuth verification
  const authHeader = headers.get('Authorization');
  return authHeader && authHeader.includes(secret);
}

// Transform platform-specific order data to unified format
function transformShopifyOrder(data) {
  return {
    platform_order_id: String(data.id),
    order_number: data.name || data.order_number,
    customer_email: data.email || data.customer?.email,
    customer_name: data.customer ? `${data.customer.first_name || ''} ${data.customer.last_name || ''}`.trim() : null,
    order_date: data.created_at,
    status: mapShopifyStatus(data.financial_status, data.fulfillment_status),
    fulfillment_status: data.fulfillment_status || 'unfulfilled',
    subtotal: parseFloat(data.subtotal_price) || 0,
    shipping_charged: parseFloat(data.total_shipping_price_set?.shop_money?.amount) || 0,
    tax_total: parseFloat(data.total_tax) || 0,
    discount_total: parseFloat(data.total_discounts) || 0,
    total_revenue: parseFloat(data.total_price) || 0,
    refund_amount: data.refunds?.reduce((sum, r) => sum + parseFloat(r.transactions?.[0]?.amount || 0), 0) || 0,
    billing_address: data.billing_address,
    shipping_address: data.shipping_address,
    discount_codes: data.discount_codes?.map(d => d.code) || [],
    tags: data.tags ? data.tags.split(', ') : [],
    is_first_order: data.customer?.orders_count === 1,
    line_items: data.line_items?.map(item => ({
      platform_product_id: String(item.product_id),
      platform_variant_id: String(item.variant_id),
      sku: item.sku,
      title: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price),
      total: parseFloat(item.price) * item.quantity
    })),
    platform_data: data
  };
}

function transformWooCommerceOrder(data) {
  return {
    platform_order_id: String(data.id),
    order_number: data.number,
    customer_email: data.billing?.email,
    customer_name: `${data.billing?.first_name || ''} ${data.billing?.last_name || ''}`.trim(),
    order_date: data.date_created,
    status: mapWooCommerceStatus(data.status),
    fulfillment_status: data.status === 'completed' ? 'fulfilled' : 'unfulfilled',
    subtotal: parseFloat(data.total) - parseFloat(data.shipping_total) - parseFloat(data.total_tax),
    shipping_charged: parseFloat(data.shipping_total) || 0,
    tax_total: parseFloat(data.total_tax) || 0,
    discount_total: parseFloat(data.discount_total) || 0,
    total_revenue: parseFloat(data.total) || 0,
    refund_amount: data.refunds?.reduce((sum, r) => sum + Math.abs(parseFloat(r.total)), 0) || 0,
    billing_address: data.billing,
    shipping_address: data.shipping,
    discount_codes: data.coupon_lines?.map(c => c.code) || [],
    line_items: data.line_items?.map(item => ({
      platform_product_id: String(item.product_id),
      platform_variant_id: String(item.variation_id),
      sku: item.sku,
      title: item.name,
      quantity: item.quantity,
      price: parseFloat(item.price),
      total: parseFloat(item.total)
    })),
    platform_data: data
  };
}

function transformBigCommerceOrder(data) {
  return {
    platform_order_id: String(data.id),
    order_number: String(data.id),
    customer_email: data.billing_address?.email,
    customer_name: `${data.billing_address?.first_name || ''} ${data.billing_address?.last_name || ''}`.trim(),
    order_date: data.date_created,
    status: mapBigCommerceStatus(data.status_id),
    fulfillment_status: data.status_id >= 10 ? 'fulfilled' : 'unfulfilled',
    subtotal: parseFloat(data.subtotal_ex_tax) || 0,
    shipping_charged: parseFloat(data.shipping_cost_ex_tax) || 0,
    tax_total: parseFloat(data.total_tax) || 0,
    discount_total: parseFloat(data.discount_amount) || 0,
    total_revenue: parseFloat(data.total_inc_tax) || 0,
    refund_amount: parseFloat(data.refunded_amount) || 0,
    billing_address: data.billing_address,
    shipping_address: data.shipping_addresses?.[0],
    platform_data: data
  };
}

function mapShopifyStatus(financial, fulfillment) {
  if (financial === 'refunded') return 'refunded';
  if (financial === 'partially_refunded') return 'partially_refunded';
  if (fulfillment === 'fulfilled') return 'fulfilled';
  if (financial === 'paid') return 'paid';
  return 'pending';
}

function mapWooCommerceStatus(status) {
  const mapping = {
    'pending': 'pending',
    'processing': 'paid',
    'on-hold': 'pending',
    'completed': 'fulfilled',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
    'failed': 'cancelled'
  };
  return mapping[status] || 'pending';
}

function mapBigCommerceStatus(statusId) {
  if (statusId === 4) return 'cancelled';
  if (statusId === 5) return 'cancelled';
  if (statusId >= 10) return 'fulfilled';
  if (statusId === 11) return 'paid';
  return 'pending';
}

// Determine outcome type from order status changes
function determineOutcomeType(order, previousOrder) {
  if (order.status === 'refunded' || order.refund_amount > 0) {
    // Check for chargeback indicators
    if (order.tags?.some(t => t.toLowerCase().includes('chargeback'))) {
      if (order.tags?.some(t => t.toLowerCase().includes('fraud'))) {
        return 'chargeback_fraud';
      }
      return 'chargeback_other';
    }
    
    // Regular refund
    if (order.tags?.some(t => t.toLowerCase().includes('defective'))) {
      return 'refunded_defective';
    }
    if (order.tags?.some(t => t.toLowerCase().includes('not received'))) {
      return 'refunded_not_received';
    }
    return 'refunded_customer_request';
  }
  
  if (order.status === 'cancelled') {
    if (order.tags?.some(t => t.toLowerCase().includes('fraud'))) {
      return 'cancelled_fraud';
    }
    if (order.tags?.some(t => t.toLowerCase().includes('inventory'))) {
      return 'cancelled_inventory';
    }
    return 'cancelled_customer';
  }
  
  if (order.status === 'fulfilled') {
    return 'fulfilled_ok';
  }
  
  return null;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform');
    const tenantId = url.searchParams.get('tenant');
    
    if (!platform || !tenantId) {
      return Response.json({ error: 'Missing platform or tenant' }, { status: 400 });
    }

    const body = await req.text();
    const payload = JSON.parse(body);

    // Get integration and verify webhook
    const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
      tenant_id: tenantId,
      platform
    });

    if (!integrations.length) {
      return Response.json({ error: 'Integration not found' }, { status: 404 });
    }

    const integration = integrations[0];
    
    // Get tenant for webhook secret
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
    const webhookSecret = tenants[0]?.webhook_secret;

    // Verify webhook signature
    let verified = false;
    if (platform === 'shopify') {
      const signature = req.headers.get('X-Shopify-Hmac-Sha256');
      if (signature && webhookSecret) {
        verified = await verifyShopifyWebhook(body, signature, webhookSecret);
      }
    } else if (platform === 'woocommerce') {
      const signature = req.headers.get('X-WC-Webhook-Signature');
      if (signature && webhookSecret) {
        verified = await verifyWooCommerceWebhook(body, signature, webhookSecret);
      }
    } else if (platform === 'bigcommerce') {
      verified = await verifyBigCommerceWebhook(req.headers, webhookSecret);
    }

    // Log event
    const topic = req.headers.get('X-Shopify-Topic') || 
                  req.headers.get('X-WC-Webhook-Topic') || 
                  payload.scope || 
                  'unknown';

    const eventId = req.headers.get('X-Shopify-Webhook-Id') || 
                    req.headers.get('X-WC-Webhook-ID') || 
                    `${platform}_${Date.now()}`;

    const idempotencyKey = `${tenantId}:${platform}:${topic}:${eventId}`;

    // Check for duplicate
    const existingEvents = await base44.asServiceRole.entities.EventLog.filter({
      idempotency_key: idempotencyKey
    });

    if (existingEvents.length > 0) {
      return Response.json({ status: 'duplicate', message: 'Event already processed' });
    }

    // Create event log
    const eventLog = await base44.asServiceRole.entities.EventLog.create({
      tenant_id: tenantId,
      event_id: eventId,
      source: `${platform}_webhook`,
      event_type: topic,
      idempotency_key: idempotencyKey,
      processing_status: 'processing'
    });

    try {
      // Transform order data based on platform
      let orderData;
      if (platform === 'shopify') {
        orderData = transformShopifyOrder(payload);
      } else if (platform === 'woocommerce') {
        orderData = transformWooCommerceOrder(payload);
      } else if (platform === 'bigcommerce') {
        orderData = transformBigCommerceOrder(payload.data || payload);
      }

      // Check if order exists
      const existingOrders = await base44.asServiceRole.entities.Order.filter({
        tenant_id: tenantId,
        platform_order_id: orderData.platform_order_id
      });

      let order;
      let isNewOrder = false;
      let previousOrder = null;

      if (existingOrders.length > 0) {
        previousOrder = { ...existingOrders[0] };
        // Update existing order
        order = await base44.asServiceRole.entities.Order.update(existingOrders[0].id, {
          ...orderData,
          tenant_id: tenantId
        });
      } else {
        isNewOrder = true;
        // Create new order
        order = await base44.asServiceRole.entities.Order.create({
          ...orderData,
          tenant_id: tenantId,
          is_demo: false
        });
      }

      // For new orders or status changes, analyze risk
      if (isNewOrder || topic.includes('create')) {
        // Call risk analysis function
        try {
          await base44.asServiceRole.functions.invoke('analyzeOrderRisk', {
            order_id: order.id,
            tenant_id: tenantId
          });
        } catch (riskError) {
          console.error('Risk analysis error:', riskError);
        }
      }

      // Track outcome for adaptive learning
      if (!isNewOrder && (topic.includes('update') || topic.includes('fulfilled') || topic.includes('refund'))) {
        const outcomeType = determineOutcomeType(order, previousOrder);
        
        if (outcomeType) {
          // Check if we already have an outcome record
          const existingOutcomes = await base44.asServiceRole.entities.OrderOutcome.filter({
            order_id: order.id
          });

          if (existingOutcomes.length === 0) {
            const orderCreatedDate = new Date(order.order_date || order.created_date);
            const daysToOutcome = Math.floor((Date.now() - orderCreatedDate.getTime()) / (1000 * 60 * 60 * 24));

            // Determine prediction accuracy
            const wasHighRisk = order.risk_level === 'high' || order.fraud_score >= 70;
            const wasBadOutcome = outcomeType.includes('chargeback') || 
                                  outcomeType.includes('fraud') || 
                                  outcomeType.includes('return_abuse');
            
            let predictionAnalysis;
            if (wasHighRisk && wasBadOutcome) predictionAnalysis = 'true_positive';
            else if (!wasHighRisk && !wasBadOutcome) predictionAnalysis = 'true_negative';
            else if (wasHighRisk && !wasBadOutcome) predictionAnalysis = 'false_positive';
            else predictionAnalysis = 'false_negative';

            await base44.asServiceRole.entities.OrderOutcome.create({
              tenant_id: tenantId,
              order_id: order.id,
              platform_order_id: order.platform_order_id,
              risk_score_at_creation: order.fraud_score,
              risk_level_at_creation: order.risk_level,
              recommended_action_at_creation: order.recommended_action,
              outcome_type: outcomeType,
              outcome_date: new Date().toISOString(),
              days_to_outcome: daysToOutcome,
              financial_impact: {
                original_value: order.total_revenue,
                refund_amount: order.refund_amount,
                net_loss: order.refund_amount
              },
              was_correct_prediction: (wasHighRisk && wasBadOutcome) || (!wasHighRisk && !wasBadOutcome),
              prediction_analysis: predictionAnalysis,
              contributing_factors: order.risk_reasons || []
            });
          }
        }
      }

      // Update event log
      await base44.asServiceRole.entities.EventLog.update(eventLog.id, {
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        processing_duration_ms: Date.now() - startTime
      });

      return Response.json({ 
        status: 'success', 
        order_id: order.id,
        is_new: isNewOrder
      });

    } catch (processingError) {
      // Update event log with error
      await base44.asServiceRole.entities.EventLog.update(eventLog.id, {
        processing_status: 'failed',
        error_message: processingError.message,
        processed_at: new Date().toISOString(),
        processing_duration_ms: Date.now() - startTime
      });

      throw processingError;
    }

  } catch (error) {
    console.error('Platform webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});