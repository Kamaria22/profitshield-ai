import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GDPR Shop Redaction Webhook
 * Required by Shopify for App Store approval
 * Called 48 hours after app uninstall to delete all shop data
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
    
    console.log('[GDPR] Shop redaction request received for:', shopDomain);
    
    // Get tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
      shop_domain: shopDomain 
    });
    
    if (tenants.length === 0) {
      console.log('[GDPR] Shop not found, nothing to redact');
      return Response.json({ message: 'No data found' });
    }
    
    const tenant = tenants[0];
    let deletedRecords = {
      orders: 0,
      customers: 0,
      products: 0,
      alerts: 0,
      cost_mappings: 0,
      risk_rules: 0,
      oauth_tokens: 0,
      integrations: 0,
      settings: 0,
      audit_logs: 0
    };
    
    console.log('[GDPR] Starting full data deletion for tenant:', tenant.id);
    
    // Delete all orders
    const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenant.id });
    for (const order of orders) {
      await base44.asServiceRole.entities.Order.delete(order.id);
      deletedRecords.orders++;
    }
    
    // Delete all customers
    const customers = await base44.asServiceRole.entities.Customer.filter({ tenant_id: tenant.id });
    for (const customer of customers) {
      await base44.asServiceRole.entities.Customer.delete(customer.id);
      deletedRecords.customers++;
    }
    
    // Delete all products
    const products = await base44.asServiceRole.entities.Product.filter({ tenant_id: tenant.id });
    for (const product of products) {
      await base44.asServiceRole.entities.Product.delete(product.id);
      deletedRecords.products++;
    }
    
    // Delete all alerts
    const alerts = await base44.asServiceRole.entities.Alert.filter({ tenant_id: tenant.id });
    for (const alert of alerts) {
      await base44.asServiceRole.entities.Alert.delete(alert.id);
      deletedRecords.alerts++;
    }
    
    // Delete cost mappings
    const costMappings = await base44.asServiceRole.entities.CostMapping.filter({ tenant_id: tenant.id });
    for (const mapping of costMappings) {
      await base44.asServiceRole.entities.CostMapping.delete(mapping.id);
      deletedRecords.cost_mappings++;
    }
    
    // Delete risk rules
    const riskRules = await base44.asServiceRole.entities.RiskRule.filter({ tenant_id: tenant.id });
    for (const rule of riskRules) {
      await base44.asServiceRole.entities.RiskRule.delete(rule.id);
      deletedRecords.risk_rules++;
    }
    
    // Delete OAuth tokens
    const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ tenant_id: tenant.id });
    for (const token of tokens) {
      await base44.asServiceRole.entities.OAuthToken.delete(token.id);
      deletedRecords.oauth_tokens++;
    }
    
    // Delete platform integrations
    const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ tenant_id: tenant.id });
    for (const integration of integrations) {
      await base44.asServiceRole.entities.PlatformIntegration.delete(integration.id);
      deletedRecords.integrations++;
    }
    
    // Delete settings
    const settings = await base44.asServiceRole.entities.TenantSettings.filter({ tenant_id: tenant.id });
    for (const setting of settings) {
      await base44.asServiceRole.entities.TenantSettings.delete(setting.id);
      deletedRecords.settings++;
    }
    
    // Keep audit logs for compliance but mark as redacted
    const auditLogs = await base44.asServiceRole.entities.AuditLog.filter({ tenant_id: tenant.id });
    for (const log of auditLogs) {
      await base44.asServiceRole.entities.AuditLog.update(log.id, {
        metadata: { redacted: true },
        description: '[REDACTED]'
      });
      deletedRecords.audit_logs++;
    }
    
    // Final audit log before tenant deletion
    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: tenant.id,
      action: 'gdpr_shop_redact_complete',
      entity_type: 'tenant',
      entity_id: tenant.id,
      performed_by: 'shopify_gdpr_webhook',
      description: `All shop data deleted for ${shopDomain}`,
      metadata: {
        shop_domain: shopDomain,
        records_deleted: deletedRecords,
        deleted_at: new Date().toISOString()
      },
      category: 'compliance',
      severity: 'critical'
    });
    
    // Finally, delete the tenant
    await base44.asServiceRole.entities.Tenant.delete(tenant.id);
    
    console.log('[GDPR] Shop data fully redacted:', deletedRecords);
    
    return Response.json({ 
      message: 'All shop data successfully deleted',
      records_deleted: deletedRecords
    });
    
  } catch (error) {
    console.error('[GDPR] Shop redaction error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});