import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Unified backend platform context resolver
 * Resolves tenant_id, platform, store_key, integration_id, token_id
 * 
 * Inputs (any combination):
 * - shop (Shopify shop domain)
 * - site_url (WooCommerce site URL)
 * - store_hash (BigCommerce store hash)
 * - platform + store_key (generic)
 * - tenant_id (direct lookup)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { shop, site_url, store_hash, platform: inputPlatform, store_key: inputStoreKey, tenant_id } = body;
    
    let platform = inputPlatform;
    let storeKey = inputStoreKey;
    
    // Detect platform and normalize store key
    if (shop) {
      platform = 'shopify';
      storeKey = shop.toLowerCase().includes('.myshopify.com') 
        ? shop.toLowerCase().trim()
        : `${shop.toLowerCase().trim()}.myshopify.com`;
    } else if (site_url) {
      platform = 'woocommerce';
      let url = site_url.toLowerCase().trim();
      if (!url.startsWith('http')) {
        url = `https://${url}`;
      }
      storeKey = url.replace(/\/+$/, '');
    } else if (store_hash) {
      platform = 'bigcommerce';
      storeKey = store_hash.toLowerCase().trim();
    }
    
    console.log('[resolvePlatformContext] Resolving:', { platform, storeKey, tenant_id });
    
    let integration = null;
    let token = null;
    let tenant = null;
    
    // Strategy 1: Lookup by platform + store_key
    if (platform && storeKey) {
      const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
        platform,
        store_key: storeKey
      });
      
      if (integrations.length > 0) {
        integration = integrations[0];
        console.log('[resolvePlatformContext] Found integration by store_key:', integration.id);
      }
    }
    
    // Strategy 2: Lookup by tenant_id if no integration found
    if (!integration && tenant_id && platform) {
      const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
        tenant_id,
        platform,
        status: 'connected'
      });
      
      if (integrations.length > 0) {
        integration = integrations[0];
        storeKey = integration.store_key;
        console.log('[resolvePlatformContext] Found integration by tenant_id:', integration.id);
      }
    }
    
    // Strategy 3: Just tenant_id, find any active integration
    if (!integration && tenant_id) {
      const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
        tenant_id,
        status: 'connected'
      });
      
      if (integrations.length === 1) {
        integration = integrations[0];
        platform = integration.platform;
        storeKey = integration.store_key;
        console.log('[resolvePlatformContext] Found single active integration:', integration.id);
      } else if (integrations.length > 1) {
        return Response.json({ 
          error: 'Multiple active integrations found. Specify platform and store_key.',
          integrations: integrations.map(i => ({ id: i.id, platform: i.platform, store_key: i.store_key }))
        }, { status: 400 });
      }
    }
    
    if (!integration) {
      return Response.json({ 
        error: 'No integration found',
        platform,
        store_key: storeKey 
      }, { status: 404 });
    }
    
    // Load tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ 
      id: integration.tenant_id 
    });
    tenant = tenants[0] || null;
    
    // Load token
    if (integration.token_id) {
      const tokens = await base44.asServiceRole.entities.OAuthToken.filter({
        id: integration.token_id
      });
      token = tokens[0] || null;
    } else {
      // Fallback: lookup by tenant + platform + store_key
      const tokens = await base44.asServiceRole.entities.OAuthToken.filter({
        tenant_id: integration.tenant_id,
        platform: integration.platform,
        store_key: integration.store_key,
        is_valid: true
      });
      token = tokens[0] || null;
    }
    
    return Response.json({
      tenant_id: integration.tenant_id,
      platform: integration.platform,
      store_key: integration.store_key,
      integration_id: integration.id,
      token_id: token?.id || null,
      integration,
      tenant: tenant ? {
        id: tenant.id,
        shop_domain: tenant.shop_domain,
        shop_name: tenant.shop_name,
        status: tenant.status,
        currency: tenant.currency
      } : null,
      has_valid_token: !!token?.is_valid
    });
    
  } catch (error) {
    console.error('[resolvePlatformContext] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});