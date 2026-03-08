import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { withEndpointGuard, safeFilter } from './helpers/endpointSafety.ts';

Deno.serve(withEndpointGuard('syncShopifyData', async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow embedded/scheduler invocations where Base44 session may not exist yet.
    try { await base44.auth.me(); } catch (_) {}
    
    const { tenant_id, days = 30 } = await req.json();
    
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }
    
    // Get tenant and token
    const tenants = await safeFilter(
      () => base44.asServiceRole.entities.Tenant.filter({ id: tenant_id }),
      [],
      'syncShopifyData.tenant_lookup'
    );
    if (tenants.length === 0) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }
    
    const tenant = tenants[0];
    
    const tokens = await safeFilter(
      () => base44.asServiceRole.entities.OAuthToken.filter({ tenant_id, is_valid: true }),
      [],
      'syncShopifyData.token_lookup'
    );
    const shopifyTokens = tokens.filter((t) => t.platform === 'shopify');
    
    if (shopifyTokens.length === 0) {
      return Response.json({ error: 'No valid token found' }, { status: 400 });
    }
    
    const accessToken = await decryptToken(shopifyTokens[0].encrypted_access_token);
    const integrations = await safeFilter(
      () => base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id, platform: 'shopify' }),
      [],
      'syncShopifyData.integration_lookup'
    );
    const integration = integrations.find((i) => i.status === 'connected') || integrations[0] || null;
    const shopDomain = integration?.store_key || tenant.shop_domain;
    if (!shopDomain) {
      return Response.json({ error: 'Missing Shopify shop domain for tenant' }, { status: 400 });
    }
    
    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();
    
    // Fetch orders from Shopify
    let allOrders = [];
    let pageInfo = null;
    let hasMore = true;
    
    while (hasMore && allOrders.length < 500) {
      let url = `https://${shopDomain}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDateStr}`;
      
      if (pageInfo) {
        url = `https://${shopDomain}/admin/api/2024-01/orders.json?page_info=${pageInfo}&limit=250`;
      }
      
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
      
      const data = await response.json();
      allOrders = allOrders.concat(data.orders || []);
      
      // Check for pagination
      const linkHeader = response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^>]+)>; rel="next"/);
        pageInfo = match ? match[1] : null;
        hasMore = !!pageInfo;
      } else {
        hasMore = false;
      }
    }
    
    // Get cost mappings and settings
    const [costMappings, settingsData] = await Promise.all([
      base44.asServiceRole.entities.CostMapping.filter({ tenant_id }),
      base44.asServiceRole.entities.TenantSettings.filter({ tenant_id })
    ]);
    
    const settings = settingsData[0] || {};
    
    // Process each order
    let processedCount = 0;
    let errorCount = 0;
    
    for (const orderData of allOrders) {
      try {
        await processOrder(base44, tenant, orderData, costMappings, settings);
        processedCount++;
      } catch (e) {
        console.error(`Error processing order ${orderData.id}:`, e);
        errorCount++;
      }
    }
    
    // Update tenant status
    await base44.asServiceRole.entities.Tenant.update(tenant.id, {
      orders_this_month: processedCount,
      status: 'active'
    });
    
    return Response.json({
      success: true,
      orders_synced: processedCount,
      errors: errorCount,
      total_fetched: allOrders.length
    });
    
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}));

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    return atob(encryptedToken);
  }
  
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // Fallback for non-encrypted tokens
    return atob(encryptedToken);
  }
}

async function processOrder(base44, tenant, orderData, costMappings, settings) {
  const profitData = calculateOrderProfit(orderData, costMappings, settings);
  const riskData = calculateRiskScores(orderData, orderData.customer, settings);
  
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
  } else {
    await base44.asServiceRole.entities.Order.create(orderRecord);
  }
}

function calculateOrderProfit(order, costMappings, settings) {
  const revenue = parseFloat(order.total_price || 0);
  const shippingCharged = order.shipping_lines?.reduce((sum, l) => sum + parseFloat(l.price || 0), 0) || 0;
  const taxTotal = order.tax_lines?.reduce((sum, l) => sum + parseFloat(l.price || 0), 0) || 0;
  const discountTotal = order.discount_codes?.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0) || 0;
  
  let totalCogs = 0;
  let hasAllCosts = true;
  
  for (const item of order.line_items || []) {
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
  
  const shippingCost = shippingCharged * 0.8;
  
  const netProfit = revenue - totalCogs - paymentFee - platformFee - shippingCost;
  const marginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  
  let confidence = 'high';
  if (!hasAllCosts) confidence = 'medium';
  if ((order.line_items?.length || 0) > 0 && costMappings.length === 0) confidence = 'low';
  
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

function calculateRiskScores(order, customer, settings) {
  let fraudScore = 0;
  let returnScore = 0;
  let chargebackScore = 0;
  const riskReasons = [];
  
  const orderTotal = parseFloat(order.total_price || 0);
  const isFirstOrder = !customer || customer.orders_count <= 1;
  
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
  
  if ((order.discount_codes?.length || 0) >= 2) {
    fraudScore += 10;
    riskReasons.push('Multiple discount codes used');
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
  if (order.refunds?.length > 0) return 'partially_refunded';
  if (order.fulfillment_status === 'fulfilled') return 'fulfilled';
  if (order.financial_status === 'paid') return 'paid';
  return 'pending';
}
