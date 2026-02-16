/**
 * RESOLVER SELF-TEST FUNCTION
 * Runs a dry-run of the platform resolver logic and returns detailed diagnostics.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admin users
    const role = (user.app_role || user.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'owner') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { 
      urlParams = {}, 
      persistedContext = {},
      simulateScenario = null // 'incognito', 'embedded_no_host', 'stale_persisted', 'multi_store'
    } = body;

    const trace = [];
    const flags = {
      missingHostInEmbedded: false,
      stalePersistedContext: false,
      ambiguousStores: false,
      invalidIntegration: false,
      tenantMismatch: false,
      duplicateStoreKey: false,
      autoHealTriggered: false
    };

    let status = 'resolving';
    let chosenPriority = null;
    let reason = null;
    let resolvedTenantId = null;
    let resolvedPlatform = null;
    let resolvedStoreKey = null;
    let resolvedIntegrationId = null;

    trace.push({ step: 'start', ts: Date.now(), ok: true, note: 'Self-test started' });

    // Step 1: Parse URL context
    const platform = urlParams.platform || (urlParams.shop ? 'shopify' : null);
    const storeKey = urlParams.shop || urlParams.storeKey || urlParams.store || null;
    const embedded = urlParams.embedded === '1' || urlParams.embedded === 'true';
    const host = urlParams.host || null;

    trace.push({ 
      step: 'parse_url', 
      ts: Date.now(), 
      ok: true, 
      data: { platform, storeKey, embedded, host } 
    });

    // Step 2: Check persisted context
    const persistedPlatform = persistedContext.platform || null;
    const persistedStoreKey = persistedContext.storeKey || null;
    const persistedTenantId = persistedContext.tenantId || null;
    const persistedIntegrationId = persistedContext.integrationId || null;
    const persistedAt = persistedContext.persistedAt || null;

    // TTL check (7 days)
    const TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const isPersistedStale = persistedAt && (Date.now() - persistedAt > TTL_MS);
    if (isPersistedStale) {
      flags.stalePersistedContext = true;
      trace.push({ step: 'ttl_check', ts: Date.now(), ok: false, note: 'Persisted context expired (>7 days)' });
    } else {
      trace.push({ step: 'parse_persisted', ts: Date.now(), ok: true, data: { persistedPlatform, persistedStoreKey, persistedTenantId } });
    }

    // Step 3: Determine priority
    let activePlatform = null;
    let activeStoreKey = null;

    // P1: URL params
    if (platform && storeKey) {
      activePlatform = platform;
      activeStoreKey = storeKey;
      chosenPriority = 'P1_URL';
      trace.push({ step: 'priority_url', ts: Date.now(), ok: true, note: 'Using URL context' });
    }
    // P2: Persisted context (if not stale)
    else if (!isPersistedStale && persistedPlatform && persistedStoreKey) {
      activePlatform = persistedPlatform;
      activeStoreKey = persistedStoreKey;
      chosenPriority = 'P2_PERSISTED';
      trace.push({ step: 'priority_persisted', ts: Date.now(), ok: true, note: 'Using persisted context' });
    }

    // Step 4: Shopify embedded validation
    if (activePlatform === 'shopify' && embedded && !host) {
      flags.missingHostInEmbedded = true;
      status = 'error';
      reason = 'missing_host_in_embedded';
      trace.push({ step: 'embedded_check', ts: Date.now(), ok: false, note: 'Missing host param in embedded mode' });
      
      return Response.json({
        status,
        chosenPriority,
        reason,
        resolvedTenantId: null,
        resolvedPlatform: activePlatform,
        resolvedStoreKey: activeStoreKey,
        resolvedIntegrationId: null,
        flags,
        trace
      });
    }

    // Step 5: Lookup integration
    let integration = null;
    let integrations = [];

    if (activePlatform && activeStoreKey) {
      try {
        integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
          platform: activePlatform,
          store_key: activeStoreKey
        });

        // Check for duplicates
        if (integrations.length > 1) {
          flags.duplicateStoreKey = true;
          flags.ambiguousStores = true;
          trace.push({ step: 'duplicate_check', ts: Date.now(), ok: false, note: `Found ${integrations.length} integrations for same store_key` });
        }

        integration = integrations.find(i => i.status === 'connected') || integrations[0];

        if (integration) {
          trace.push({ step: 'lookup_integration', ts: Date.now(), ok: true, data: { id: integration.id, status: integration.status } });
        } else {
          trace.push({ step: 'lookup_integration', ts: Date.now(), ok: false, note: 'No integration found' });

          // Check if we should auto-heal
          if (activePlatform === 'shopify' && activeStoreKey) {
            // Look for tenant with matching shop_domain
            const tenants = await base44.asServiceRole.entities.Tenant.filter({
              shop_domain: activeStoreKey
            });

            if (tenants.length > 0) {
              flags.autoHealTriggered = true;
              trace.push({ step: 'auto_heal_check', ts: Date.now(), ok: true, note: `Found tenant ${tenants[0].id} for auto-heal` });
            } else {
              trace.push({ step: 'auto_heal_check', ts: Date.now(), ok: false, note: 'No tenant found for auto-heal' });
            }
          }
        }
      } catch (e) {
        trace.push({ step: 'lookup_integration', ts: Date.now(), ok: false, note: e.message });
      }
    }

    // Step 6: Validate tenant consistency
    if (integration) {
      resolvedIntegrationId = integration.id;
      resolvedTenantId = integration.tenant_id;
      resolvedPlatform = integration.platform;
      resolvedStoreKey = integration.store_key;

      // Validate persisted context matches
      if (persistedTenantId && persistedTenantId !== integration.tenant_id) {
        flags.tenantMismatch = true;
        trace.push({ step: 'tenant_validation', ts: Date.now(), ok: false, note: 'Persisted tenant_id does not match integration' });
      }

      // Lookup tenant
      try {
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: integration.tenant_id });
        if (!tenants.length) {
          flags.invalidIntegration = true;
          trace.push({ step: 'lookup_tenant', ts: Date.now(), ok: false, note: 'Integration points to missing tenant' });
        } else {
          trace.push({ step: 'lookup_tenant', ts: Date.now(), ok: true, data: { id: tenants[0].id, shop_name: tenants[0].shop_name } });
        }
      } catch (e) {
        trace.push({ step: 'lookup_tenant', ts: Date.now(), ok: false, note: e.message });
      }

      // Check integration status
      if (integration.status !== 'connected') {
        flags.invalidIntegration = true;
        trace.push({ step: 'integration_status', ts: Date.now(), ok: false, note: `Integration status: ${integration.status}` });
      }
    }

    // Step 7: User fallback (P3/P4)
    if (!integration && user.tenant_id) {
      try {
        const userIntegrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
          tenant_id: user.tenant_id,
          status: 'connected'
        });

        if (userIntegrations.length === 1) {
          chosenPriority = 'P3_USER_SINGLE';
          integration = userIntegrations[0];
          resolvedIntegrationId = integration.id;
          resolvedTenantId = integration.tenant_id;
          resolvedPlatform = integration.platform;
          resolvedStoreKey = integration.store_key;
          trace.push({ step: 'user_fallback', ts: Date.now(), ok: true, note: 'Auto-selected single connected store' });
        } else if (userIntegrations.length > 1) {
          chosenPriority = 'P4_SELECTION_REQUIRED';
          flags.ambiguousStores = true;
          trace.push({ step: 'user_fallback', ts: Date.now(), ok: true, note: `${userIntegrations.length} stores - selection required` });
        } else {
          chosenPriority = 'P5_NO_STORES';
          trace.push({ step: 'user_fallback', ts: Date.now(), ok: false, note: 'No connected integrations for user' });
        }
      } catch (e) {
        trace.push({ step: 'user_fallback', ts: Date.now(), ok: false, note: e.message });
      }
    }

    // Final decision
    if (integration && integration.status === 'connected' && !flags.invalidIntegration && !flags.tenantMismatch) {
      status = 'resolved';
      reason = 'success';
    } else if (flags.ambiguousStores || chosenPriority === 'P4_SELECTION_REQUIRED') {
      status = 'needs_selection';
      reason = flags.duplicateStoreKey ? 'duplicate_store_key' : 'multiple_stores';
    } else {
      status = 'error';
      reason = flags.missingHostInEmbedded ? 'missing_host_in_embedded' :
               flags.tenantMismatch ? 'integration_tenant_mismatch' :
               flags.invalidIntegration ? 'invalid_integration' :
               'no_context';
    }

    trace.push({ step: 'final_decision', ts: Date.now(), ok: status === 'resolved', data: { status, reason } });

    return Response.json({
      status,
      chosenPriority,
      reason,
      resolvedTenantId,
      resolvedPlatform,
      resolvedStoreKey,
      resolvedIntegrationId,
      flags,
      trace,
      user: { email: user.email, tenant_id: user.tenant_id }
    });

  } catch (error) {
    console.error('[runResolverSelfTest] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});