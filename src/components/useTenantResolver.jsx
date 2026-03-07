import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  normalizeShopDomain,
  parseQuery,
  getPersistedShopifyContext,
  persistShopifyContext
} from '@/components/shopifyContext';
import { getPersistedContext } from '@/components/platformContext';

/**
 * Hook to resolve the current tenant for pages.
 * Uses the shared shopifyContext utilities.
 * Priority: A) URL shop param, B) localStorage, C) user.tenant_id
 * NO fallback to first tenant.
 */
export function useTenantResolver() {
  const [state, setState] = useState({
    tenant: null,
    tenantId: null,
    shopDomain: null,
    loading: true,
    error: null,
    debug: { resolved_via: null },
    user: null
  });

  useEffect(() => {
    resolveTenant();
  }, []);

  const resolveTenant = async () => {
    const urlParams = parseQuery(window.location.search);
    const persisted = getPersistedShopifyContext();
    
    const debug = {
      env: 'prod',
      url_shop_param: urlParams.shop,
      resolved_via: null,
      pathname: window.location.pathname
    };
    
    let resolvedTenant = null;
    let resolvedShopDomain = null;
    let user = null;
    
    const isEmbedded = (() => {
      try {
        if (urlParams.shop && (urlParams.host || urlParams.embedded === '1')) return true;
        const persistedCtx = getPersistedContext(true);
        return persistedCtx?.platform === 'shopify' && !!persistedCtx?.tenantId;
      } catch {
        return false;
      }
    })();

    // Get current user only outside Shopify embedded mode.
    if (!isEmbedded) {
      try {
        user = await base44.auth.me();
      } catch (e) {
        console.log('[useTenantResolver] No user auth');
      }
    }
    
    // PRIORITY A: URL shop param
    if (urlParams.shop) {
      resolvedShopDomain = normalizeShopDomain(urlParams.shop);
      debug.resolved_via = 'url_param';
      
      const tenants = await base44.entities.Tenant.filter({ shop_domain: resolvedShopDomain });
      if (tenants.length > 0) {
        resolvedTenant = tenants[0];
        // Persist for navigation
        persistShopifyContext({
          shop: resolvedShopDomain,
          host: urlParams.host,
          tenantId: resolvedTenant.id
        });
      }
    }
    
    // PRIORITY B: localStorage fallback
    if (!resolvedTenant && persisted.shopDomain) {
      debug.resolved_via = 'localStorage_shop';
      resolvedShopDomain = persisted.shopDomain;
      
      const tenants = await base44.entities.Tenant.filter({ shop_domain: resolvedShopDomain });
      if (tenants.length > 0) {
        resolvedTenant = tenants[0];
      }
    } else if (!resolvedTenant && persisted.tenantId) {
      debug.resolved_via = 'localStorage_tenant';
      
      const tenants = await base44.entities.Tenant.filter({ id: persisted.tenantId });
      if (tenants.length > 0) {
        resolvedTenant = tenants[0];
        resolvedShopDomain = resolvedTenant.shop_domain;
      }
    }
    
    // PRIORITY C: user.tenant_id
    if (!resolvedTenant && user?.tenant_id) {
      debug.resolved_via = 'user_tenant';
      
      const tenants = await base44.entities.Tenant.filter({ id: user.tenant_id });
      if (tenants.length > 0) {
        resolvedTenant = tenants[0];
        resolvedShopDomain = resolvedTenant.shop_domain;
        // Persist for navigation
        persistShopifyContext({
          shop: resolvedShopDomain,
          tenantId: resolvedTenant.id
        });
      }
    }
    
    // NO FALLBACK
    if (!resolvedTenant) {
      console.warn('[useTenantResolver] No tenant resolved');
    }
    
    debug.tenant_id = resolvedTenant?.id;
    debug.shop_domain = resolvedShopDomain;
    
    setState({
      tenant: resolvedTenant,
      tenantId: resolvedTenant?.id || null,
      shopDomain: resolvedShopDomain,
      loading: false,
      error: resolvedTenant ? null : 'No tenant resolved',
      debug,
      user
    });
  };

  return state;
}
