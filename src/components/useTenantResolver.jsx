import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook to resolve the current tenant from Shopify embedded app context.
 * Priority: URL param "shop" > session/user.tenant_id > fallback first tenant
 * 
 * Returns: { tenant, tenantId, shopDomain, loading, error, debug }
 */
export function useTenantResolver() {
  const [state, setState] = useState({
    tenant: null,
    tenantId: null,
    shopDomain: null,
    loading: true,
    error: null,
    debug: {}
  });

  useEffect(() => {
    resolveTenant();
  }, []);

  const resolveTenant = async () => {
    const debug = {
      env: 'prod',
      url_shop_param: null,
      resolved_via: null,
      query_filter: null
    };

    try {
      // 1. Extract shop domain from URL params (Shopify embedded app)
      const urlParams = new URLSearchParams(window.location.search);
      let shopDomain = urlParams.get('shop');
      debug.url_shop_param = shopDomain;
      
      console.log('[useTenantResolver] URL shop param:', shopDomain);
      
      let tenant = null;
      
      if (shopDomain) {
        // Normalize
        shopDomain = shopDomain.includes('.myshopify.com') 
          ? shopDomain.toLowerCase().trim()
          : `${shopDomain.toLowerCase().trim()}.myshopify.com`;
        
        debug.resolved_via = 'url_param';
        debug.shop_domain = shopDomain;
        
        // Query tenant directly by shop_domain
        debug.query_filter = { shop_domain: shopDomain };
        console.log('[useTenantResolver] Querying Tenant by shop_domain:', shopDomain);
        
        const tenants = await base44.entities.Tenant.filter({ shop_domain: shopDomain });
        console.log('[useTenantResolver] Found tenants:', tenants.length);
        
        if (tenants.length > 0) {
          tenant = tenants[0];
        }
      }
      
      // 2. If no tenant from shop param, try user's tenant
      if (!tenant) {
        try {
          const user = await base44.auth.me();
          console.log('[useTenantResolver] User tenant_id:', user?.tenant_id);
          
          if (user?.tenant_id) {
            debug.query_filter = { id: user.tenant_id };
            const tenants = await base44.entities.Tenant.filter({ id: user.tenant_id });
            if (tenants.length > 0) {
              tenant = tenants[0];
              shopDomain = tenant.shop_domain;
              debug.resolved_via = 'user_tenant';
              debug.shop_domain = shopDomain;
            }
          }
        } catch (e) {
          console.log('[useTenantResolver] User not logged in');
        }
      }
      
      // 3. Fallback to first tenant (for demo)
      if (!tenant) {
        console.log('[useTenantResolver] Falling back to first tenant');
        debug.query_filter = {};
        const tenants = await base44.entities.Tenant.filter({}, '-created_date', 1);
        if (tenants.length > 0) {
          tenant = tenants[0];
          shopDomain = tenant.shop_domain;
          debug.resolved_via = 'fallback_first_tenant';
          debug.shop_domain = shopDomain;
        }
      }
      
      if (!tenant) {
        setState({
          tenant: null,
          tenantId: null,
          shopDomain: null,
          loading: false,
          error: 'No tenant found. Please connect your Shopify store.',
          debug
        });
        return;
      }
      
      debug.tenant_id = tenant.id;
      console.log('[useTenantResolver] Resolved tenant_id:', tenant.id, 'shop:', shopDomain);
      
      setState({
        tenant,
        tenantId: tenant.id,
        shopDomain: shopDomain,
        loading: false,
        error: null,
        debug
      });
      
    } catch (error) {
      console.error('[useTenantResolver] Error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message,
        debug: { ...prev.debug, error: error.message }
      }));
    }
  };

  return state;
}

export default useTenantResolver;