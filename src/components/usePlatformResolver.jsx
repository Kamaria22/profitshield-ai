import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  parseQuery,
  detectPlatformFromUrl,
  getPersistedContext,
  persistContext,
  normalizeStoreKey
} from '@/components/platformContext';

/**
 * Resolution status types
 */
export const RESOLVER_STATUS = {
  RESOLVING: 'resolving',
  RESOLVED: 'resolved',
  NEEDS_SELECTION: 'needs_selection',
  ERROR: 'error'
};

/**
 * Unified multi-platform context resolver hook
 * Supports Shopify, WooCommerce, BigCommerce
 * 
 * Resolution priority:
 * 1. URL params (shop, site, store_hash, platform+store)
 * 2. localStorage persisted context
 * 3. User's tenant_id -> active integrations (auto-select if 1, picker if 2+)
 * 
 * NO fallbacks to "first tenant" or hardcoded values
 */
export function usePlatformResolver() {
  const location = useLocation();
  
  const [state, setState] = useState({
    status: RESOLVER_STATUS.RESOLVING,
    tenantId: null,
    platform: null,
    storeKey: null,
    integration: null,
    tenant: null,
    user: null,
    reason: null,
    availableStores: []
  });

  const resolve = useCallback(async () => {
    setState(prev => ({ ...prev, status: RESOLVER_STATUS.RESOLVING }));
    
    const urlParams = parseQuery(location.search);
    const urlContext = detectPlatformFromUrl(urlParams);
    const persisted = getPersistedContext();
    
    console.log('[Resolver] URL context:', urlContext);
    console.log('[Resolver] Persisted context:', persisted);
    
    let platform = null;
    let storeKey = null;
    let tenantId = null;
    let integration = null;
    let tenant = null;
    let user = null;
    let reason = null;
    
    // STEP 1: URL FIRST
    if (urlContext.platform && urlContext.storeKey) {
      platform = urlContext.platform;
      storeKey = urlContext.storeKey;
      reason = 'url_params';
      console.log('[Resolver] Using URL context:', platform, storeKey);
    }
    
    // STEP 2: LOCALSTORAGE SECOND
    if (!platform && persisted.platform && persisted.storeKey) {
      platform = persisted.platform;
      storeKey = persisted.storeKey;
      tenantId = persisted.tenantId;
      reason = 'localStorage';
      console.log('[Resolver] Using localStorage context:', platform, storeKey);
    }
    
    // Get current user
    try {
      user = await base44.auth.me();
      console.log('[Resolver] User:', user?.email, 'tenant_id:', user?.tenant_id);
    } catch (e) {
      console.log('[Resolver] No user auth');
    }
    
    // If we have platform + storeKey, look up the integration
    if (platform && storeKey) {
      const integrations = await base44.entities.PlatformIntegration.filter({
        platform,
        store_key: storeKey,
        status: 'connected'
      });
      
      if (integrations.length > 0) {
        integration = integrations[0];
        tenantId = integration.tenant_id;
        
        // Load tenant
        const tenants = await base44.entities.Tenant.filter({ id: tenantId });
        tenant = tenants[0] || null;
        
        // Persist context
        persistContext({
          platform,
          storeKey,
          tenantId,
          host: urlParams.host || persisted.host,
          embedded: urlParams.embedded || persisted.embedded,
          debug: urlParams.debug || persisted.debug
        });
        
        console.log('[Resolver] Found integration:', integration.id, 'tenant:', tenantId);
        
        setState({
          status: RESOLVER_STATUS.RESOLVED,
          tenantId,
          platform,
          storeKey,
          integration,
          tenant,
          user,
          reason,
          availableStores: []
        });
        return;
      } else {
        console.log('[Resolver] No active integration found for:', platform, storeKey);
        // Continue to user fallback
      }
    }
    
    // STEP 3: USER THIRD - Look up user's active integrations
    if (user?.tenant_id) {
      tenantId = user.tenant_id;
      
      const activeIntegrations = await base44.entities.PlatformIntegration.filter({
        tenant_id: tenantId,
        status: 'connected'
      });
      
      console.log('[Resolver] User active integrations:', activeIntegrations.length);
      
      if (activeIntegrations.length === 1) {
        // Auto-select the only active integration
        integration = activeIntegrations[0];
        platform = integration.platform;
        storeKey = integration.store_key;
        reason = 'user_single_store';
        
        // Load tenant
        const tenants = await base44.entities.Tenant.filter({ id: tenantId });
        tenant = tenants[0] || null;
        
        // Persist
        persistContext({
          platform,
          storeKey,
          tenantId,
          host: urlParams.host || persisted.host,
          embedded: urlParams.embedded || persisted.embedded,
          debug: urlParams.debug || persisted.debug
        });
        
        console.log('[Resolver] Auto-selected single store:', platform, storeKey);
        
        setState({
          status: RESOLVER_STATUS.RESOLVED,
          tenantId,
          platform,
          storeKey,
          integration,
          tenant,
          user,
          reason,
          availableStores: activeIntegrations
        });
        return;
      }
      
      if (activeIntegrations.length > 1) {
        // Multiple stores - need user selection
        console.log('[Resolver] Multiple stores - needs selection');
        
        setState({
          status: RESOLVER_STATUS.NEEDS_SELECTION,
          tenantId,
          platform: null,
          storeKey: null,
          integration: null,
          tenant: null,
          user,
          reason: 'multiple_stores',
          availableStores: activeIntegrations
        });
        return;
      }
      
      // User has tenant_id but no active integrations
      // Check if there's a tenant at least
      const tenants = await base44.entities.Tenant.filter({ id: tenantId });
      if (tenants.length > 0) {
        tenant = tenants[0];
        
        // Check for any integrations (even disconnected)
        const allIntegrations = await base44.entities.PlatformIntegration.filter({
          tenant_id: tenantId
        });
        
        if (allIntegrations.length > 0) {
          // Has integrations but none connected - show selection/reconnect
          setState({
            status: RESOLVER_STATUS.NEEDS_SELECTION,
            tenantId,
            platform: null,
            storeKey: null,
            integration: null,
            tenant,
            user,
            reason: 'no_active_integrations',
            availableStores: allIntegrations
          });
          return;
        }
      }
    }
    
    // NO FALLBACKS - Cannot resolve
    console.log('[Resolver] Cannot resolve context - no fallback');
    
    setState({
      status: RESOLVER_STATUS.ERROR,
      tenantId: null,
      platform: null,
      storeKey: null,
      integration: null,
      tenant: null,
      user,
      reason: 'no_context',
      availableStores: []
    });
    
  }, [location.search]);

  // Re-resolve on location change
  useEffect(() => {
    resolve();
  }, [resolve]);

  // Function to manually select a store
  const selectStore = useCallback(async (integration) => {
    const platform = integration.platform;
    const storeKey = integration.store_key;
    const tenantId = integration.tenant_id;
    
    // Load tenant
    const tenants = await base44.entities.Tenant.filter({ id: tenantId });
    const tenant = tenants[0] || null;
    
    // Persist
    persistContext({
      platform,
      storeKey,
      tenantId
    });
    
    setState(prev => ({
      ...prev,
      status: RESOLVER_STATUS.RESOLVED,
      tenantId,
      platform,
      storeKey,
      integration,
      tenant,
      reason: 'manual_selection'
    }));
  }, []);

  // Function to refresh resolution
  const refresh = useCallback(() => {
    resolve();
  }, [resolve]);

  return {
    ...state,
    selectStore,
    refresh,
    // Legacy compatibility
    shopDomain: state.platform === 'shopify' ? state.storeKey : null,
    loading: state.status === RESOLVER_STATUS.RESOLVING
  };
}

export default usePlatformResolver;