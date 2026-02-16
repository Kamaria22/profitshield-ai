import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook to resolve the current tenant from Shopify embedded app context.
 * Priority: A) URL param "shop" > B) localStorage > C) user.tenant_id
 * NO fallback to first tenant - require explicit resolution.
 * 
 * Returns: { tenant, tenantId, shopDomain, loading, error, debug, user }
 */
export function useTenantResolver() {
  const [state, setState] = useState({
    tenant: null,
    tenantId: null,
    shopDomain: null,
    loading: true,
    error: null,
    debug: {},
    user: null
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

    let currentUser = null;
    try {
      currentUser = await base44.auth.me();
    } catch (e) {
      console.log('[useTenantResolver] User not logged in');
    }

    try {
      // PRIORITY A: Extract shop domain from URL params (Shopify embedded app)
      const urlParams = new URLSearchParams(window.location.search);
      let shopDomain = urlParams.get('shop');
      debug.url_shop_param = shopDomain;
      
      console.log('[useTenantResolver] URL shop param:', shopDomain);
      
      let tenant = null;
      
      if (shopDomain) {
        // Normalize to *.myshopify.com, lowercase
        shopDomain = shopDomain.includes('.myshopify.com') 
          ? shopDomain.toLowerCase().trim()
          : `${shopDomain.toLowerCase().trim()}.myshopify.com`;
        
        debug.resolved_via = 'url_param';
        debug.shop_domain = shopDomain;
        debug.query_filter = { shop_domain: shopDomain };
        
        console.log('[useTenantResolver] Querying Tenant by shop_domain:', shopDomain);
        const tenants = await base44.entities.Tenant.filter({ shop_domain: shopDomain });
        console.log('[useTenantResolver] Found tenants:', tenants.length);
        
        if (tenants.length > 0) {
          tenant = tenants[0];
          // Persist for navigation fallback
          localStorage.setItem('resolved_shop_domain', shopDomain);
          localStorage.setItem('resolved_tenant_id', tenant.id);
        }
      }
      
      // PRIORITY B: localStorage fallback
      if (!tenant) {
        const storedShopDomain = localStorage.getItem('resolved_shop_domain');
        const storedTenantId = localStorage.getItem('resolved_tenant_id');
        console.log('[useTenantResolver] Trying localStorage fallback:', storedShopDomain, storedTenantId);
        
        if (storedShopDomain) {
          debug.query_filter = { shop_domain: storedShopDomain };
          const tenants = await base44.entities.Tenant.filter({ shop_domain: storedShopDomain });
          if (tenants.length > 0) {
            tenant = tenants[0];
            shopDomain = storedShopDomain;
            debug.resolved_via = 'localStorage_shop';
            debug.shop_domain = shopDomain;
          }
        } else if (storedTenantId) {
          debug.query_filter = { id: storedTenantId };
          const tenants = await base44.entities.Tenant.filter({ id: storedTenantId });
          if (tenants.length > 0) {
            tenant = tenants[0];
            shopDomain = tenant.shop_domain;
            debug.resolved_via = 'localStorage_tenant';
            debug.shop_domain = shopDomain;
          }
        }
      }
      
      // PRIORITY C: user.tenant_id fallback
      if (!tenant && currentUser?.tenant_id) {
        console.log('[useTenantResolver] User tenant_id:', currentUser.tenant_id);
        debug.query_filter = { id: currentUser.tenant_id };
        const tenants = await base44.entities.Tenant.filter({ id: currentUser.tenant_id });
        if (tenants.length > 0) {
          tenant = tenants[0];
          shopDomain = tenant.shop_domain;
          debug.resolved_via = 'user_tenant';
          debug.shop_domain = shopDomain;
          // Persist for navigation
          localStorage.setItem('resolved_shop_domain', shopDomain);
          localStorage.setItem('resolved_tenant_id', tenant.id);
        }
      }
      
      // NO FALLBACK - require explicit tenant resolution
      if (!tenant) {
        console.warn('[useTenantResolver] No tenant resolved. shop param missing and no fallback.');
        setState({
          tenant: null,
          tenantId: null,
          shopDomain: null,
          loading: false,
          error: 'No store connected. Open the app from Shopify Admin or connect your store.',
          debug,
          user: currentUser
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
        debug,
        user: currentUser
      });
      
    } catch (error) {
      console.error('[useTenantResolver] Error:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message,
        debug: { ...prev.debug, error: error.message },
        user: currentUser
      }));
    }
  };

  return state;
}

export default useTenantResolver;