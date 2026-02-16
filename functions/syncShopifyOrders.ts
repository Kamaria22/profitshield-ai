import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Calculate profit for an order
function calculateOrderProfit(order, costMappings, settings) {
  const revenue = parseFloat(order.total_price) || 0;
  const shippingCharged = order.shipping_lines?.reduce((sum, l) => sum + parseFloat(l.price || 0), 0) || 0;
  const taxTotal = order.tax_lines?.reduce((sum, l) => sum + parseFloat(l.price || 0), 0) || 0;
  const discountTotal = order.discount_codes?.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0) || 0;
  
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
  
  const paymentFeePct = settings?.default_payment_fee_pct || 2.9;
  const paymentFeeFixed = settings?.default_payment_fee_fixed || 0.30;
  const paymentFee = (revenue * paymentFeePct / 100) + paymentFeeFixed;
  const platformFeePct = settings?.default_platform_fee_pct || 0;
  const platformFee = revenue * platformFeePct / 100;
  const shippingCost = order.shipping_cost || shippingCharged * 0.8;
  
  const netProfit = revenue - totalCogs - paymentFee - platformFee - shippingCost;
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  
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
function calculateRiskScores(order, settings) {
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  const riskReasons = [];
  
  const orderTotal = parseFloat(order.total_price || 0);
  const isFirstOrder = !order.customer || order.customer.orders_count <= 1;
  
  if (isFirstOrder && orderTotal > 200) {
    fraudScore += 25;
    riskReasons.push('New customer with high order value');
  }
  
  const billing = order.billing_address;
  const shipping = order.shipping_address;
  if (billing && shipping) {
    if (billing.country_code !== shipping.country_code) {
      fraudScore += 30;
      riskReasons.push('Billing and shipping countries differ');
    }
  }
  
  const discountCount = order.discount_codes?.length || 0;
  if (discountCount >= 2) {
    fraudScore += 10;
    chargebackScore += 15;
    riskReasons.push('Multiple discount codes used');
  }
  
  if (isFirstOrder && orderTotal > 500) {
    fraudScore += 20;
    chargebackScore += 10;
    riskReasons.push('First order exceeds $500');
  }
  
  if (isFirstOrder) returnScore += 20;
  
  fraudScore = Math.min(fraudScore, 100);
  returnScore = Math.min(returnScore, 100);
  chargebackScore = Math.min(chargebackScore, 100);
  
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

function mapOrderStatus(order) {
  if (order.cancelled_at) return 'cancelled';
  if (order.refunds?.length > 0) {
    const refundTotal = order.refunds.reduce((sum, r) => 
      sum + r.transactions?.reduce((s, t) => s + parseFloat(t.amount || 0), 0) || 0, 0);
    if (refundTotal >= parseFloat(order.total_price)) return 'refunded';
    return 'partially_refunded';
  }
  if (order.fulfillment_status === 'fulfilled') return 'fulfilled';
  if (order.financial_status === 'paid') return 'paid';
  return 'pending';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { tenant_id } = await req.json();
    
    if (!tenant_id) {
      return Response.json({ error: 'Missing tenant_id' }, { status: 400 });
    }
    
    // Get tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    if (tenants.length === 0) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenant = tenants[0];
    
    // Get OAuth token
    const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ 
      tenant_id: tenant.id, 
      platform: 'shopify',
      is_valid: true 
    });
    
    if (tokens.length === 0) {
      return Response.json({ error: 'No valid Shopify token found. Please reconnect your store.' }, { status: 400 });
    }
    
    // Decrypt access token
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
    const encryptedToken = tokens[0].encrypted_access_token;
    
    // Simple XOR decryption (matches encryption in shopifyAuth)
    let accessToken;
    try {
      const encrypted = atob(encryptedToken);
      let decrypted = '';
      for (let i = 0; i < encrypted.length; i++) {
        decrypted += String.fromCharCode(encrypted.charCodeAt(i) ^ encryptionKey.charCodeAt(i % encryptionKey.length));
      }
      accessToken = decrypted;
    } catch (e) {
      console.error('Token decryption failed:', e);
      return Response.json({ error: 'Failed to decrypt access token' }, { status: 500 });
    }
    
    console.log('[syncShopifyOrders] Fetching orders from Shopify for:', tenant.shop_domain);
    
    // Fetch recent orders from Shopify
    const shopifyUrl = `https://${tenant.shop_domain}/admin/api/2024-01/orders.json?status=any&limit=50`;
    const shopifyRes = await fetch(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    
    if (!shopifyRes.ok) {
      const errorText = await shopifyRes.text();
      console.error('[syncShopifyOrders] Shopify API error:', shopifyRes.status, errorText);
      return Response.json({ error: `Shopify API error: ${shopifyRes.status}` }, { status: 500 });
    }
    
    const { orders: shopifyOrders } = await shopifyRes.json();
    console.log('[syncShopifyOrders] Fetched orders from Shopify:', shopifyOrders.length);
    
    // Get cost mappings and settings
    const [costMappings, settingsData] = await Promise.all([
      base44.asServiceRole.entities.CostMapping.filter({ tenant_id: tenant.id }),
      base44.asServiceRole.entities.TenantSettings.filter({ tenant_id: tenant.id })
    ]);
    const settings = settingsData[0] || {};
    
    let created = 0;
    let updated = 0;
    
    for (const orderData of shopifyOrders) {
      const profitData = calculateOrderProfit(orderData, costMappings, settings);
      const riskData = calculateRiskScores(orderData, settings);
      
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
        await base44.asServiceRole.entities.Order.update(existingOrders[0].id, orderRecord);
        updated++;
      } else {
        await base44.asServiceRole.entities.Order.create(orderRecord);
        created++;
      }
    }
    
    console.log('[syncShopifyOrders] Sync complete. Created:', created, 'Updated:', updated);
    
    return Response.json({ 
      success: true, 
      created, 
      updated, 
      total: shopifyOrders.length 
    });
    
  } catch (error) {
    console.error('[syncShopifyOrders] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});