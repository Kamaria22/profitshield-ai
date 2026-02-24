import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GDPR Customer Redaction Webhook
 * Required by Shopify for App Store approval
 * Called when a customer requests data deletion
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const shopDomain = req.headers.get('x-shopify-shop-domain');
    
    if (!shopDomain) {
      return Response.json({ error: 'Missing shop domain' }, { status: 400 });
    }
    
    const body = await req.text();
    const payload = JSON.parse(body);
    
    console.log('[GDPR] Customer redaction request received for shop:', shopDomain);
    
    // Get tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
      shop_domain: shopDomain 
    });
    
    if (tenants.length === 0) {
      console.log('[GDPR] Shop not found, nothing to redact');
      return Response.json({ message: 'No data found' });
    }
    
    const tenant = tenants[0];
    const customerEmail = payload.customer?.email;
    const customerId = payload.customer?.id?.toString();
    
    let deletedRecords = {
      orders: 0,
      customers: 0,
      order_items: 0
    };
    
    if (customerEmail) {
      // Find and redact/anonymize orders
      const orders = await base44.asServiceRole.entities.Order.filter({
        tenant_id: tenant.id,
        customer_email: customerEmail
      });
      
      for (const order of orders) {
        // Anonymize order data instead of deleting (preserve analytics)
        await base44.asServiceRole.entities.Order.update(order.id, {
          customer_email: `redacted_${Date.now()}@privacy.local`,
          customer_name: '[REDACTED]',
          billing_address: null,
          shipping_address: null,
          platform_data: null // Remove full Shopify data
        });
        deletedRecords.orders++;
      }
      
      // Find and delete customer records
      const customers = await base44.asServiceRole.entities.Customer.filter({
        tenant_id: tenant.id,
        email: customerEmail
      });
      
      for (const customer of customers) {
        await base44.asServiceRole.entities.Customer.delete(customer.id);
        deletedRecords.customers++;
      }
    }
    
    // Log the redaction for audit
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: tenant.id,
      action: 'gdpr_customer_redact',
      entity_type: 'customer',
      entity_id: customerId || customerEmail,
      performed_by: 'shopify_gdpr_webhook',
      description: `Customer data redacted for ${customerEmail}`,
      metadata: {
        shop_domain: shopDomain,
        customer_id: customerId,
        customer_email: customerEmail,
        records_affected: deletedRecords
      },
      category: 'compliance',
      severity: 'high'
    });
    
    console.log('[GDPR] Customer data redacted:', deletedRecords);
    
    return Response.json({ 
      message: 'Customer data successfully redacted',
      records_affected: deletedRecords
    });
    
  } catch (error) {
    console.error('[GDPR] Redaction error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});