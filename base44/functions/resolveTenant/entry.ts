import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Single source-of-truth tenant resolver.
 * Resolves tenant_id from Shopify shop domain.
 * If not found, creates a new tenant.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { shop_domain } = await req.json();
    
    if (!shop_domain) {
      return Response.json({ error: 'shop_domain is required' }, { status: 400 });
    }
    
    // Normalize shop domain
    const normalizedDomain = shop_domain.includes('.myshopify.com') 
      ? shop_domain.toLowerCase().trim()
      : `${shop_domain.toLowerCase().trim()}.myshopify.com`;
    
    console.log('[resolveTenant] Resolving shop_domain:', normalizedDomain);
    
    // Look up existing tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
      shop_domain: normalizedDomain,
      platform: 'shopify'
    });
    
    let tenant;
    
    if (tenants.length > 0) {
      tenant = tenants[0];
      console.log('[resolveTenant] Found existing tenant:', tenant.id);
    } else {
      // Create new tenant
      tenant = await base44.asServiceRole.entities.Tenant.create({
        shop_domain: normalizedDomain,
        platform: 'shopify',
        status: 'active',
        currency: 'USD',
        onboarding_completed: true,
        subscription_tier: 'trial',
        monthly_order_limit: 100,
        orders_this_month: 0,
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        webhook_secret: crypto.randomUUID()
      });
      console.log('[resolveTenant] Created new tenant:', tenant.id);
      
      // Also create default TenantSettings
      await base44.asServiceRole.entities.TenantSettings.create({
        tenant_id: tenant.id,
        default_payment_fee_pct: 2.9,
        default_payment_fee_fixed: 0.3,
        default_platform_fee_pct: 0,
        shipping_buffer_pct: 10,
        high_risk_threshold: 70,
        medium_risk_threshold: 40,
        enable_discount_protection: false,
        enable_shipping_alerts: true,
        enable_risk_alerts: true,
        weekly_report_enabled: true,
        badge_public: false,
        badge_style: 'light'
      });
    }
    
    // Update current user with tenant_id if authenticated
    try {
      const user = await base44.auth.me();
      if (user && (!user.tenant_id || user.tenant_id !== tenant.id)) {
        await base44.auth.updateMe({ tenant_id: tenant.id });
        console.log('[resolveTenant] Updated user tenant_id:', tenant.id);
      }
    } catch (e) {
      // User not logged in, skip
    }
    
    return Response.json({
      tenant_id: tenant.id,
      shop_domain: normalizedDomain,
      shop_name: tenant.shop_name || normalizedDomain,
      status: tenant.status,
      profit_integrity_score: tenant.profit_integrity_score
    });
    
  } catch (error) {
    console.error('[resolveTenant] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});