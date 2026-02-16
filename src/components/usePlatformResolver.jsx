/**
 * ENTERPRISE-GRADE PLATFORM RESOLVER
 * Deterministic multi-platform context resolution with full observability.
 * 
 * PRIORITY ORDER (STRICT):
 * P0) Explicit override (selectStore call)
 * P1) URL params (shop / platform+storeKey / integrationId)
 * P2) Persisted context (localStorage)
 * P3) User default preference (future: stored on user profile)
 * P4) Multiple stores -> NEEDS_SELECTION
 * P5) Zero stores -> ERROR
 * 
 * INVARIANTS:
 * - tenantId must match integration.tenant_id
 * - storeKey must correspond to exactly 1 integration
 * - platform must match integration.platform
 * - Shopify embedded requires host param
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  parseQuery,
  getPersistedContext,
  persistContext,
  clearContext,
  normalizeStoreKey,
  hasValidContext
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
 * Trace step types for debugging
 */
const TRACE_STEP = {
  START: 'start',
  PARSE_URL: 'parse_url',
  PARSE_PERSISTED: 'parse_persisted',
  AUTH_USER: 'auth_user',
  LOOKUP_INTEGRATION: 'lookup_integration',
  LOOKUP_TENANT: 'lookup_tenant',
  VALIDATE_INVARIANTS: 'validate_invariants',
  ANTI_STALE_CHECK: 'anti_stale_check',
  FINAL_DECISION: 'final_decision'
};

/**
 * Creates a trace step object
 */
function traceStep(step, data, ok, note) {
  return { step, data, ok, note, ts: Date.now() };
}

/**
 * Initial state factory
 */
function getInitialState() {
  return {
    status: RESOLVER_STATUS.RESOLVING,
    tenantId: null,
    tenant: null,
    user: null,
    platform: null,
    storeKey: null,
    integration: null,
    integrationId: null,
    availableStores: [],
    reason: null,
    trace: {
      startedAt: null,
      finishedAt: null,
      chosenBy: null,
      steps: []
    }
  };
}

/**
 * Enterprise Platform Resolver Hook
 */
export function usePlatformResolver() {
  const location = useLocation();
  const [state, setState] = useState(getInitialState);
  const resolveIdRef = useRef(0);

  /**
   * Main resolution logic
   */
  const resolve = useCallback(async () => {
    const resolveId = ++resolveIdRef.current;
    const trace = { startedAt: Date.now(), finishedAt: null, chosenBy: null, steps: [] };
    
    setState(prev => ({ ...prev, status: RESOLVER_STATUS.RESOLVING, trace }));
    
    // Helper to abort if a newer resolve started
    const isStale = () => resolveIdRef.current !== resolveId;
    
    let platform = null;
    let storeKey = null;
    let tenantId = null;
    let integrationId = null;
    let integration = null;
    let tenant = null;
    let user = null;
    let availableStores = [];
    let reason = null;
    let chosenBy = null;

    // =====================
    // STEP 1: Parse URL
    // =====================
    trace.steps.push(traceStep(TRACE_STEP.START, { search: location.search }, true, 'Resolution started'));
    
    const urlParams = parseQuery(location.search);
    trace.steps.push(traceStep(TRACE_STEP.PARSE_URL, urlParams, true, null));
    
    // =====================
    // STEP 2: Parse Persisted
    // =====================
    const persisted = getPersistedContext();
    trace.steps.push(traceStep(TRACE_STEP.PARSE_PERSISTED, persisted, true, null));
    
    // =====================
    // STEP 3: Authenticate User
    // =====================
    try {
      user = await base44.auth.me();
      trace.steps.push(traceStep(TRACE_STEP.AUTH_USER, { email: user?.email, tenant_id: user?.tenant_id }, true, null));
    } catch (e) {
      trace.steps.push(traceStep(TRACE_STEP.AUTH_USER, { error: e.message }, false, 'No authenticated user'));
    }
    
    if (isStale()) return;

    // =====================
    // PRIORITY RESOLUTION
    // =====================
    
    // P1: URL params take priority
    if (hasValidContext(urlParams)) {
      platform = urlParams.platform;
      storeKey = urlParams.storeKey;
      chosenBy = 'url';
      trace.steps.push(traceStep('priority_url', { platform, storeKey }, true, 'Using URL context'));
    }
    // P2: Persisted context
    else if (hasValidContext(persisted)) {
      platform = persisted.platform;
      storeKey = persisted.storeKey;
      tenantId = persisted.tenantId;
      integrationId = persisted.integrationId;
      chosenBy = 'persisted';
      trace.steps.push(traceStep('priority_persisted', { platform, storeKey }, true, 'Using persisted context'));
    }
    
    // =====================
    // STEP 4: Lookup Integration
    // =====================
    if (platform && storeKey) {
      try {
        const integrations = await base44.entities.PlatformIntegration.filter({
          platform,
          store_key: storeKey
        });
        
        // Find connected one first, then any
        integration = integrations.find(i => i.status === 'connected') || integrations[0];
        
        if (integration) {
          integrationId = integration.id;
          tenantId = integration.tenant_id;
          trace.steps.push(traceStep(TRACE_STEP.LOOKUP_INTEGRATION, { id: integration.id, status: integration.status }, true, null));
          
          // Anti-stale: verify integration is still connected
          if (integration.status !== 'connected') {
            trace.steps.push(traceStep(TRACE_STEP.ANTI_STALE_CHECK, { status: integration.status }, false, 'Integration disconnected'));
            clearContext();
            platform = null;
            storeKey = null;
            integration = null;
            chosenBy = null;
          }
        } else {
          trace.steps.push(traceStep(TRACE_STEP.LOOKUP_INTEGRATION, null, false, 'No integration found for platform/storeKey'));
          // Persisted context is stale
          if (chosenBy === 'persisted') {
            clearContext();
            platform = null;
            storeKey = null;
            chosenBy = null;
          }
        }
      } catch (e) {
        trace.steps.push(traceStep(TRACE_STEP.LOOKUP_INTEGRATION, { error: e.message }, false, 'Integration lookup failed'));
      }
    }
    
    if (isStale()) return;
    
    // =====================
    // P3/P4: User Tenant Fallback
    // =====================
    if (!integration && user?.tenant_id) {
      tenantId = user.tenant_id;
      
      try {
        const userIntegrations = await base44.entities.PlatformIntegration.filter({
          tenant_id: tenantId
        });
        
        availableStores = userIntegrations;
        const connected = userIntegrations.filter(i => i.status === 'connected');
        
        trace.steps.push(traceStep('user_integrations', { total: userIntegrations.length, connected: connected.length }, true, null));
        
        if (connected.length === 1) {
          // Auto-select single store
          integration = connected[0];
          platform = integration.platform;
          storeKey = integration.store_key;
          integrationId = integration.id;
          chosenBy = 'user_single_store';
          trace.steps.push(traceStep('auto_select', { platform, storeKey }, true, 'Auto-selected single store'));
        } else if (connected.length > 1) {
          // Multiple stores - needs selection
          reason = 'multiple_stores';
          chosenBy = 'selection_required';
          availableStores = connected;
          trace.steps.push(traceStep('multiple_stores', { count: connected.length }, true, 'User must select store'));
        } else if (userIntegrations.length > 0) {
          // Has integrations but none connected
          reason = 'no_active_integrations';
          chosenBy = 'selection_required';
          trace.steps.push(traceStep('no_connected', { total: userIntegrations.length }, false, 'No connected integrations'));
        }
      } catch (e) {
        trace.steps.push(traceStep('user_integrations', { error: e.message }, false, 'Failed to load user integrations'));
      }
    }
    
    if (isStale()) return;
    
    // =====================
    // STEP 5: Lookup Tenant
    // =====================
    if (tenantId && !tenant) {
      try {
        const tenants = await base44.entities.Tenant.filter({ id: tenantId });
        tenant = tenants[0] || null;
        trace.steps.push(traceStep(TRACE_STEP.LOOKUP_TENANT, { found: !!tenant }, tenant ? true : false, null));
      } catch (e) {
        trace.steps.push(traceStep(TRACE_STEP.LOOKUP_TENANT, { error: e.message }, false, 'Tenant lookup failed'));
      }
    }
    
    // =====================
    // STEP 6: Validate Invariants
    // =====================
    if (integration) {
      const invariantsOk = 
        integration.tenant_id === tenantId &&
        integration.platform === platform &&
        integration.store_key === storeKey;
      
      trace.steps.push(traceStep(TRACE_STEP.VALIDATE_INVARIANTS, { ok: invariantsOk }, invariantsOk, null));
      
      // Shopify embedded requires host
      if (platform === 'shopify' && urlParams.embedded === '1' && !urlParams.host) {
        reason = 'missing_host_in_embedded';
        trace.steps.push(traceStep('shopify_embedded_check', { host: urlParams.host }, false, 'Missing host in embedded mode'));
      }
    }
    
    // =====================
    // STEP 7: Load Available Stores
    // =====================
    if (tenantId && availableStores.length === 0) {
      try {
        availableStores = await base44.entities.PlatformIntegration.filter({
          tenant_id: tenantId,
          status: 'connected'
        });
      } catch (e) {
        // Non-fatal
      }
    }
    
    if (isStale()) return;
    
    // =====================
    // FINAL DECISION
    // =====================
    let finalStatus;
    
    if (integration && integration.status === 'connected') {
      finalStatus = RESOLVER_STATUS.RESOLVED;
      reason = reason || 'resolved';
      
      // Persist the resolved context
      persistContext({
        platform,
        storeKey,
        tenantId,
        integrationId,
        shop: platform === 'shopify' ? storeKey : null,
        host: urlParams.host || persisted.host,
        embedded: urlParams.embedded || persisted.embedded,
        debug: urlParams.debug || persisted.debug,
        userHintEmail: user?.email
      });
      
    } else if (chosenBy === 'selection_required') {
      finalStatus = RESOLVER_STATUS.NEEDS_SELECTION;
    } else {
      finalStatus = RESOLVER_STATUS.ERROR;
      reason = reason || 'no_context';
      chosenBy = chosenBy || 'no_store';
    }
    
    trace.finishedAt = Date.now();
    trace.chosenBy = chosenBy;
    
    trace.steps.push(traceStep(TRACE_STEP.FINAL_DECISION, { status: finalStatus, reason }, finalStatus === RESOLVER_STATUS.RESOLVED, null));
    
    // Ensure availableStores is always an array
    const safeStores = Array.isArray(availableStores) ? availableStores : [];
    
    setState({
      status: finalStatus,
      tenantId,
      tenant,
      user,
      platform,
      storeKey,
      integration,
      integrationId,
      availableStores: safeStores,
      reason,
      trace
    });
    
  }, [location.search]);

  /**
   * Re-resolve on location change
   */
  useEffect(() => {
    resolve();
  }, [resolve]);

  /**
   * Manual store selection (P0 override)
   */
  const selectStore = useCallback(async (selectedIntegration) => {
    if (!selectedIntegration) return;
    
    const platform = selectedIntegration.platform;
    const storeKey = selectedIntegration.store_key;
    const tenantId = selectedIntegration.tenant_id;
    const integrationId = selectedIntegration.id;
    
    // Load tenant
    let tenant = null;
    try {
      const tenants = await base44.entities.Tenant.filter({ id: tenantId });
      tenant = tenants[0] || null;
    } catch (_) {}
    
    // Load all stores
    let allStores = [];
    try {
      allStores = await base44.entities.PlatformIntegration.filter({
        tenant_id: tenantId,
        status: 'connected'
      });
    } catch (_) {}
    
    // Persist with override flag
    persistContext({
      platform,
      storeKey,
      tenantId,
      integrationId,
      shop: platform === 'shopify' ? storeKey : null
    });
    
    setState(prev => ({
      ...prev,
      status: RESOLVER_STATUS.RESOLVED,
      tenantId,
      tenant,
      platform,
      storeKey,
      integration: selectedIntegration,
      integrationId,
      availableStores: Array.isArray(allStores) ? allStores : [],
      reason: 'manual_selection',
      trace: {
        ...prev.trace,
        chosenBy: 'override'
      }
    }));
  }, []);

  /**
   * Force re-resolution
   */
  const refresh = useCallback(() => {
    resolve();
  }, [resolve]);

  /**
   * Clear context and re-resolve
   */
  const reset = useCallback(() => {
    clearContext();
    resolve();
  }, [resolve]);

  // Build return object with safe defaults
  return {
    // Core state
    status: state.status || RESOLVER_STATUS.RESOLVING,
    tenantId: state.tenantId || null,
    tenant: state.tenant || null,
    user: state.user || null,
    platform: state.platform || null,
    storeKey: state.storeKey || null,
    integration: state.integration || null,
    integrationId: state.integrationId || null,
    availableStores: Array.isArray(state.availableStores) ? state.availableStores : [],
    reason: state.reason || null,
    trace: state.trace || { startedAt: null, finishedAt: null, chosenBy: null, steps: [] },
    
    // Actions
    selectStore,
    refresh,
    reset,
    
    // Legacy compatibility
    shopDomain: state.platform === 'shopify' ? state.storeKey : null,
    loading: state.status === RESOLVER_STATUS.RESOLVING
  };
}

/**
 * Helper to check if resolver is ready for data queries
 * @param {object} resolver - Resolver state
 * @returns {{ ok: boolean, tenantId: string|null, integrationId: string|null, status: string, reason: string|null }}
 */
export function requireResolved(resolver) {
  if (!resolver) {
    return { ok: false, tenantId: null, integrationId: null, status: RESOLVER_STATUS.ERROR, reason: 'resolver_undefined' };
  }
  
  if (resolver.status === RESOLVER_STATUS.RESOLVED && resolver.tenantId) {
    return { 
      ok: true, 
      tenantId: resolver.tenantId, 
      integrationId: resolver.integrationId,
      status: resolver.status,
      reason: null
    };
  }
  
  return { 
    ok: false, 
    tenantId: resolver.tenantId || null, 
    integrationId: resolver.integrationId || null,
    status: resolver.status || RESOLVER_STATUS.ERROR,
    reason: resolver.reason || 'not_resolved'
  };
}

export default usePlatformResolver;