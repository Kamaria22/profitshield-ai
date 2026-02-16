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
  hasValidContext,
  isPersistedContextExpired
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
 * Stable trace shape - NEVER returns null/undefined fields
 */
function getStableTrace() {
  return {
    startedAt: null,
    finishedAt: null,
    chosenBy: null,
    steps: []
  };
}

/**
 * Initial state factory - ALWAYS returns complete, stable shape
 * This ensures destructuring never fails
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
    trace: getStableTrace()
  };
}

/**
 * Ensures state shape is always valid - defensive normalization
 */
function normalizeState(state) {
  const base = getInitialState();
  if (!state || typeof state !== 'object') return base;
  
  return {
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
    trace: {
      startedAt: state.trace?.startedAt ?? null,
      finishedAt: state.trace?.finishedAt ?? null,
      chosenBy: state.trace?.chosenBy ?? null,
      steps: Array.isArray(state.trace?.steps) ? state.trace.steps : []
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
    // STEP 2: Parse Persisted (with TTL check)
    // =====================
    const persisted = getPersistedContext(); // TTL enforced internally
    const isExpired = isPersistedContextExpired();
    trace.steps.push(traceStep(TRACE_STEP.PARSE_PERSISTED, { ...persisted, isExpired }, !isExpired || !persisted.persistedAt, isExpired ? 'Context expired (TTL)' : null));
    
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
      
      // HARD VALIDATION: Shopify embedded requires host
      if (platform === 'shopify' && urlParams.embedded === '1' && !urlParams.host) {
        trace.steps.push(traceStep('embedded_validation', { embedded: urlParams.embedded, host: urlParams.host }, false, 'Missing host in embedded mode'));
        trace.finishedAt = Date.now();
        trace.chosenBy = 'url_invalid';
        
        setState({
          status: RESOLVER_STATUS.ERROR,
          tenantId: null,
          tenant: null,
          user,
          platform,
          storeKey,
          integration: null,
          integrationId: null,
          availableStores: [],
          reason: 'missing_host_in_embedded',
          trace
        });
        return;
      }
    }
    // P2: Persisted context (skip if expired - TTL already enforced in getPersistedContext)
    else if (hasValidContext(persisted) && !isExpired) {
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
        
        // HARD VALIDATION: Check for duplicate store_keys
        if (integrations.length > 1) {
          trace.steps.push(traceStep('duplicate_check', { count: integrations.length }, false, 'Multiple integrations for same store_key'));
          // This is ambiguous - needs selection
          trace.finishedAt = Date.now();
          trace.chosenBy = 'duplicate_store_key';
          
          setState({
            status: RESOLVER_STATUS.NEEDS_SELECTION,
            tenantId: null,
            tenant: null,
            user,
            platform,
            storeKey,
            integration: null,
            integrationId: null,
            availableStores: integrations,
            reason: 'duplicate_store_key',
            trace
          });
          return;
        }
        
        // Find connected one first, then any
        integration = integrations.find(i => i.status === 'connected') || integrations[0];
        
        if (integration) {
          integrationId = integration.id;
          tenantId = integration.tenant_id;
          trace.steps.push(traceStep(TRACE_STEP.LOOKUP_INTEGRATION, { id: integration.id, status: integration.status }, true, null));
          
          // HARD VALIDATION: Verify tenant exists and matches
          try {
            const tenantCheck = await base44.entities.Tenant.filter({ id: integration.tenant_id });
            if (!tenantCheck.length) {
              trace.steps.push(traceStep('tenant_validation', { tenant_id: integration.tenant_id }, false, 'Integration points to missing tenant'));
              clearContext();
              trace.finishedAt = Date.now();
              trace.chosenBy = 'invalid_tenant';
              
              setState({
                status: RESOLVER_STATUS.ERROR,
                tenantId: null,
                tenant: null,
                user,
                platform,
                storeKey,
                integration: null,
                integrationId: null,
                availableStores: [],
                reason: 'integration_tenant_mismatch',
                trace
              });
              return;
            }
            tenant = tenantCheck[0];
          } catch (tenantErr) {
            trace.steps.push(traceStep('tenant_validation', { error: tenantErr.message }, false, 'Tenant lookup failed'));
          }
          
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
          
          // AUTO-HEAL: Try to create PlatformIntegration from Tenant
          if (platform === 'shopify' && storeKey && chosenBy === 'url') {
            trace.steps.push(traceStep('auto_heal_attempt', { platform, storeKey }, true, 'Attempting auto-heal'));
            
            try {
              // Look for tenant with matching shop_domain
              const matchingTenants = await base44.entities.Tenant.filter({ shop_domain: storeKey });
              
              if (matchingTenants.length > 0) {
                const matchedTenant = matchingTenants[0];
                
                // Create PlatformIntegration (idempotent - already checked it doesn't exist)
                const newIntegration = await base44.entities.PlatformIntegration.create({
                  tenant_id: matchedTenant.id,
                  platform: 'shopify',
                  store_key: storeKey,
                  store_url: `https://${storeKey}`,
                  store_name: matchedTenant.shop_name || storeKey,
                  status: 'connected',
                  is_primary: true,
                  api_version: '2024-01',
                  scopes: ['read_orders', 'read_products', 'read_customers'],
                  sync_config: { auto_sync_enabled: true, sync_frequency_minutes: 15 }
                });
                
                // Log to AuditLogs
                try {
                  await base44.entities.AuditLog.create({
                    tenant_id: matchedTenant.id,
                    event_type: 'resolver_autocreate_integration',
                    action: 'create',
                    entity_type: 'PlatformIntegration',
                    entity_id: newIntegration.id,
                    details: { platform, store_key: storeKey, auto_healed: true },
                    user_email: user?.email || 'system'
                  });
                } catch (auditErr) {
                  console.warn('[Resolver] Audit log failed:', auditErr.message);
                }
                
                integration = newIntegration;
                integrationId = newIntegration.id;
                tenantId = matchedTenant.id;
                tenant = matchedTenant;
                
                trace.steps.push(traceStep('auto_heal_success', { integration_id: newIntegration.id, tenant_id: matchedTenant.id }, true, 'Auto-created PlatformIntegration'));
              } else {
                trace.steps.push(traceStep('auto_heal_failed', null, false, 'No matching tenant found for auto-heal'));
              }
            } catch (healErr) {
              trace.steps.push(traceStep('auto_heal_error', { error: healErr.message }, false, 'Auto-heal failed'));
            }
          }
          
          // If still no integration and was persisted, clear stale context
          if (!integration && chosenBy === 'persisted') {
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
    // STEP 5: Lookup Tenant (if not already loaded)
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
      
      trace.steps.push(traceStep(TRACE_STEP.VALIDATE_INVARIANTS, { ok: invariantsOk }, invariantsOk, invariantsOk ? null : 'Invariant mismatch detected'));
      
      // If invariants fail, this is a critical error
      if (!invariantsOk) {
        clearContext();
        reason = 'integration_tenant_mismatch';
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

  // Build return object with GUARANTEED stable shape using normalizeState
  const normalized = normalizeState(state);

  return {
    // Core state - all guaranteed non-undefined
    status: normalized.status,
    tenantId: normalized.tenantId,
    tenant: normalized.tenant,
    user: normalized.user,
    platform: normalized.platform,
    storeKey: normalized.storeKey,
    integration: normalized.integration,
    integrationId: normalized.integrationId,
    availableStores: normalized.availableStores,
    reason: normalized.reason,
    trace: normalized.trace,

    // Actions
    selectStore,
    refresh,
    reset,

    // Legacy compatibility
    shopDomain: normalized.platform === 'shopify' ? normalized.storeKey : null,
    loading: normalized.status === RESOLVER_STATUS.RESOLVING
  };
  }

/**
 * Helper to check if resolver is ready for data queries
 * GUARANTEED to return stable shape - never throws, never returns undefined fields
 * @param {object} resolver - Resolver state
 * @returns {{ ok: boolean, tenantId: string|null, integrationId: string|null, status: string, reason: string|null, platform: string|null, storeKey: string|null }}
 */
export function requireResolved(resolver) {
  // Defensive: handle null/undefined/invalid resolver
  if (!resolver || typeof resolver !== 'object') {
    return { 
      ok: false, 
      tenantId: null, 
      integrationId: null, 
      status: RESOLVER_STATUS.ERROR, 
      reason: 'resolver_undefined',
      platform: null,
      storeKey: null
    };
  }
  
  const status = resolver.status || RESOLVER_STATUS.ERROR;
  const tenantId = resolver.tenantId || null;
  const integrationId = resolver.integrationId || null;
  const reason = resolver.reason || null;
  const platform = resolver.platform || null;
  const storeKey = resolver.storeKey || null;
  
  // Only ok if RESOLVED AND has tenantId
  if (status === RESOLVER_STATUS.RESOLVED && tenantId) {
    return { 
      ok: true, 
      tenantId, 
      integrationId,
      status,
      reason: null,
      platform,
      storeKey
    };
  }
  
  return { 
    ok: false, 
    tenantId, 
    integrationId,
    status,
    reason: reason || 'not_resolved',
    platform,
    storeKey
  };
}

/**
 * Check if we can safely query tenant data
 * @param {object} resolverCheck - Result from requireResolved()
 * @returns {boolean}
 */
export function canQueryTenant(resolverCheck) {
  return resolverCheck?.ok === true && !!resolverCheck?.tenantId;
}

/**
 * Get a tenant filter object for queries, or null if not ready
 * @param {object} resolverCheck - Result from requireResolved()
 * @returns {{ tenant_id: string } | null}
 */
export function getTenantFilter(resolverCheck) {
  if (!canQueryTenant(resolverCheck)) return null;
  return { tenant_id: resolverCheck.tenantId };
}

/**
 * INVARIANT ENFORCER: Throws if filter doesn't match resolver's tenantId
 * Use this before any database query to catch bugs where wrong tenant data could leak
 * @param {object} resolverCheck - Result from requireResolved()
 * @param {object} filter - The filter object being used in query
 * @param {string} queryName - Name of the query for debugging
 * @throws {Error} If filter.tenant_id is missing or doesn't match
 */
export function assertTenantIsolation(resolverCheck, filter, queryName = 'unknown') {
  // Invariant 1: resolver must be ok
  if (!resolverCheck?.ok) {
    throw new Error(`[INVARIANT] ${queryName}: Cannot query without resolved context`);
  }
  
  // Invariant 2: filter must have tenant_id
  if (!filter || !filter.tenant_id) {
    throw new Error(`[INVARIANT] ${queryName}: Missing tenant_id in filter`);
  }
  
  // Invariant 3: tenant_id must match
  if (filter.tenant_id !== resolverCheck.tenantId) {
    throw new Error(`[INVARIANT] ${queryName}: tenant_id mismatch (filter=${filter.tenant_id}, resolver=${resolverCheck.tenantId})`);
  }
  
  return true;
}

/**
 * Build a deterministic query key that includes store identity (prevents cross-store cache bleed)
 * @param {string} base - Base query key name (e.g., 'orders', 'alerts')
 * @param {object} resolverCheck - Result from requireResolved()
 * @returns {Array} Query key array
 */
export function buildQueryKey(base, resolverCheck) {
  return [
    base,
    resolverCheck?.platform || null,
    resolverCheck?.storeKey || null,
    resolverCheck?.integrationId || null,
    resolverCheck?.tenantId || null
  ];
}

export default usePlatformResolver;