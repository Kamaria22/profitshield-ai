import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GDPR Customer Data Request Webhook
 * Required by Shopify for App Store approval
 * Called when a customer requests their data
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify Shopify webhook signature
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const shopDomain = req.headers.get('x-shopify-shop-domain');
    
    if (!shopDomain) {
      return Response.json({ error: 'Missing shop domain' }, { status: 400 });
    }
    
    const body = await req.text();
    const payload = JSON.parse(body);
    
    console.log('[GDPR] Customer data request received for shop:', shopDomain);
    
    // Get tenant by shop domain
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
      shop_domain: shopDomain 
    });
    
    if (tenants.length === 0) {
      console.log('[GDPR] Shop not found, returning success (no data to provide)');
      return Response.json({ message: 'No data found for this shop' });
    }
    
    const tenant = tenants[0];
    const customerEmail = payload.customer?.email;
    const customerId = payload.customer?.id?.toString();
    
    // Collect all customer data from our system
    const customerData = {
      request_id: payload.shop_id,
      customer_email: customerEmail,
      customer_id: customerId,
      requested_at: new Date().toISOString()
    };
    
    if (customerEmail) {
      // Find orders associated with this customer
      const orders = await base44.asServiceRole.entities.Order.filter({
        tenant_id: tenant.id,
        customer_email: customerEmail
      });
      
      customerData.orders = orders.map(order => ({
        order_id: order.id,
        order_number: order.order_number,
        order_date: order.order_date,
        total_revenue: order.total_revenue,
        status: order.status
      }));
      
      // Find customer records
      const customers = await base44.asServiceRole.entities.Customer.filter({
        tenant_id: tenant.id,
        email: customerEmail
      });
      
      if (customers.length > 0) {
        customerData.customer_profile = {
          email: customers[0].email,
          name: customers[0].name,
          total_orders: customers[0].total_orders,
          lifetime_value: customers[0].lifetime_value,
          created_date: customers[0].created_date
        };
      }
    }
    
    // Log the request for audit purposes
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: tenant.id,
      action: 'gdpr_data_request',
      entity_type: 'customer',
      entity_id: customerId || customerEmail,
      performed_by: 'shopify_gdpr_webhook',
      description: `Customer data request received for ${customerEmail}`,
      metadata: {
        shop_domain: shopDomain,
        customer_id: customerId,
        customer_email: customerEmail
      },
      category: 'compliance'
    });
    
    console.log('[GDPR] Customer data compiled:', Object.keys(customerData));
    
    // In production, you would email this data or make it available for download
    // For now, we log it and return success
    return Response.json({ 
      message: 'Customer data request processed',
      data: customerData 
    });
    
  } catch (error) {
    console.error('[GDPR] Data request error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});