import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook to resolve the current tenant from Shopify embedded app context.
 * Priority: URL param "shop" > session/user.tenant_id
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
    try {
      // 1. Extract shop domain from URL params (Shopify embedded app)
      const urlParams = new URLSearchParams(window.location.search);
      let shopDomain = urlParams.get('shop');
      
      const debug = {
        url_shop_param: shopDomain,
        resolved_via: null,
        env: 'prod'
      };
      
      if (shopDomain) {
        debug.resolved_via = 'url_param';
        // Normalize
        shopDomain = shopDomain.includes('.myshopify.com') 
          ? shopDomain.toLowerCase().trim()
          : `${shopDomain.toLowerCase().trim()}.myshopify.com`;
      }
      
      // 2. If no shop param, try to get from user's tenant
      if (!shopDomain) {
        try {
          const user = await base44.auth.me();
          if (user?.tenant_id) {
            const tenants = await base44.entities.Tenant.filter({ id: user.tenant_id });
            if (tenants.length > 0) {
              shopDomain = tenants[0].shop_domain;
              debug.resolved_via = 'user_tenant';
              debug.user_tenant_id = user.tenant_id;
            }
          }
        } catch (e) {
          console.log('[useTenantResolver] User not logged in');
        }
      }
      
      // 3. If still no shop domain, check for demo tenant
      if (!shopDomain) {
        const demoTenants = await base44.entities.Tenant.filter({}, '-created_date', 1);
        if (demoTenants.length > 0) {
          shopDomain = demoTenants[0].shop_domain;
          debug.resolved_via = 'fallback_first_tenant';
        }
      }
      
      if (!shopDomain) {
        setState({
          tenant: null,
          tenantId: null,
          shopDomain: null,
          loading: false,
          error: 'No shop domain found. Please access from Shopify Admin.',
          debug
        });
        return;
      }
      
      debug.shop_domain = shopDomain;
      
      // 4. Call backend to resolve/create tenant
      const response = await base44.functions.invoke('resolveTenant', { shop_domain: shopDomain });
      const data = response.data;
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      debug.tenant_id = data.tenant_id;
      
      // 5. Fetch full tenant data
      const tenants = await base44.entities.Tenant.filter({ id: data.tenant_id });
      const tenant = tenants.length > 0 ? tenants[0] : null;
      
      setState({
        tenant,
        tenantId: data.tenant_id,
        shopDomain: data.shop_domain,
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