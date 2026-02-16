import React, { useState, useCallback } from 'react';
import { CheckCircle, XCircle, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { 
  getPersistedContext, 
  persistContext, 
  clearContext,
  hasValidContext,
  hardResetAllContexts,
  listPersistedStores,
  getActiveStoreKey
} from '@/components/platformContext';

/**
 * Resolver Self-Test Component
 * DEV/DEBUG only - validates resolver logic scenarios
 */

const TEST_CASES = [
  {
    id: 'url_params_resolve',
    name: 'URL params → RESOLVED',
    description: 'With valid URL params, should resolve immediately',
    run: async () => {
      // Simulate URL params by checking if resolver would accept them
      const mockParams = { platform: 'shopify', storeKey: 'test.myshopify.com' };
      return { 
        pass: hasValidContext(mockParams),
        detail: hasValidContext(mockParams) ? 'URL params recognized' : 'URL params not valid'
      };
    }
  },
  {
    id: 'no_context_error',
    name: 'No context → ERROR/NEEDS_SELECTION',
    description: 'Without any context, should not resolve',
    run: async () => {
      const emptyContext = {};
      return { 
        pass: !hasValidContext(emptyContext),
        detail: !hasValidContext(emptyContext) ? 'Empty context correctly rejected' : 'Empty context incorrectly accepted'
      };
    }
  },
  {
    id: 'persist_roundtrip',
    name: 'Persist → Retrieve roundtrip',
    description: 'Context should survive localStorage roundtrip',
    run: async () => {
      const testContext = {
        platform: 'shopify',
        storeKey: 'test-roundtrip.myshopify.com',
        tenantId: 'test-tenant-123',
        integrationId: 'test-integration-456'
      };
      
      // Save current context
      const original = getPersistedContext();
      
      try {
        // Persist test context
        persistContext(testContext);
        
        // Retrieve it
        const retrieved = getPersistedContext();
        
        // Validate
        const pass = retrieved.platform === testContext.platform &&
                     retrieved.storeKey === testContext.storeKey &&
                     retrieved.tenantId === testContext.tenantId;
        
        // Restore original
        if (original.platform) {
          persistContext(original);
        } else {
          clearContext();
        }
        
        return { 
          pass, 
          detail: pass ? 'Roundtrip successful' : `Mismatch: ${JSON.stringify(retrieved)}`
        };
      } catch (e) {
        return { pass: false, detail: e.message };
      }
    }
  },
  {
    id: 'clear_context',
    name: 'Clear context works',
    description: 'clearContext should remove persisted data',
    run: async () => {
      // Save current
      const original = getPersistedContext();
      
      try {
        // Persist something
        persistContext({ platform: 'shopify', storeKey: 'to-be-cleared.myshopify.com' });
        
        // Clear it
        clearContext();
        
        // Check it's gone
        const after = getPersistedContext();
        const pass = !after.platform && !after.storeKey;
        
        // Restore original
        if (original.platform) {
          persistContext(original);
        }
        
        return { pass, detail: pass ? 'Context cleared' : 'Context still present after clear' };
      } catch (e) {
        return { pass: false, detail: e.message };
      }
    }
  },
  {
    id: 'query_key_isolation',
    name: 'Query keys include store identity',
    description: 'Different stores should have different query keys',
    run: async () => {
      // Import buildQueryKey
      const { buildQueryKey } = await import('@/components/usePlatformResolver');
      
      const check1 = { ok: true, tenantId: 'tenant-1', platform: 'shopify', storeKey: 'store1.myshopify.com', integrationId: 'int-1' };
      const check2 = { ok: true, tenantId: 'tenant-1', platform: 'shopify', storeKey: 'store2.myshopify.com', integrationId: 'int-2' };
      
      const key1 = buildQueryKey('orders', check1);
      const key2 = buildQueryKey('orders', check2);
      
      // Keys should be different (different storeKey)
      const pass = JSON.stringify(key1) !== JSON.stringify(key2);
      
      return { 
        pass, 
        detail: pass ? 'Keys isolated by store' : `Keys identical: ${JSON.stringify(key1)}`
      };
    }
  },
  {
    id: 'data_isolation_null_filter',
    name: 'Null tenant filter blocked',
    description: 'Query with null tenant_id should be rejected',
    run: async () => {
      const { canQueryTenant, getTenantFilter } = await import('@/components/usePlatformResolver');
      
      // Simulate unresolved state
      const unresolvedCheck = { ok: false, tenantId: null };
      
      const canQuery = canQueryTenant(unresolvedCheck);
      const filter = getTenantFilter(unresolvedCheck);
      
      const pass = canQuery === false && filter === null;
      
      return { 
        pass, 
        detail: pass ? 'Null filter correctly blocked' : `canQuery=${canQuery}, filter=${JSON.stringify(filter)}`
      };
    }
  },
  {
    id: 'store_partitioned_persistence',
    name: 'Store-partitioned localStorage',
    description: 'Multiple stores should persist independently',
    run: async () => {
      // Save current context
      const original = getPersistedContext(true);
      const originalStores = listPersistedStores();
      
      try {
        // Persist two different stores
        const store1 = { platform: 'shopify', storeKey: 'test-store1.myshopify.com', tenantId: 'tenant-1' };
        const store2 = { platform: 'woocommerce', storeKey: 'test-store2.example.com', tenantId: 'tenant-2' };
        
        persistContext(store1);
        persistContext(store2);
        
        // Retrieve each store's context
        const ctx1 = getPersistedContext(true, store1.storeKey);
        const ctx2 = getPersistedContext(true, store2.storeKey);
        
        // Verify they're separate
        const pass = ctx1.platform === 'shopify' && 
                     ctx2.platform === 'woocommerce' &&
                     ctx1.tenantId === 'tenant-1' &&
                     ctx2.tenantId === 'tenant-2';
        
        // Cleanup test stores
        clearContext(store1.storeKey);
        clearContext(store2.storeKey);
        
        // Restore original if any
        if (original.storeKey) {
          persistContext(original);
        }
        
        return { 
          pass, 
          detail: pass ? 'Stores persisted independently' : `ctx1=${JSON.stringify(ctx1)}, ctx2=${JSON.stringify(ctx2)}`
        };
      } catch (e) {
        return { pass: false, detail: e.message };
      }
    }
  },
  {
    id: 'cache_isolation_switch',
    name: 'Cache isolation on store switch',
    description: 'Query keys change when switching stores',
    run: async () => {
      const { buildQueryKey } = await import('@/components/usePlatformResolver');
      
      const store1Check = { ok: true, tenantId: 'tenant-1', platform: 'shopify', storeKey: 'store-a.myshopify.com', integrationId: 'int-a' };
      const store2Check = { ok: true, tenantId: 'tenant-1', platform: 'shopify', storeKey: 'store-b.myshopify.com', integrationId: 'int-b' };
      
      // Build keys for multiple query types
      const ordersKey1 = buildQueryKey('orders', store1Check);
      const ordersKey2 = buildQueryKey('orders', store2Check);
      const alertsKey1 = buildQueryKey('alerts', store1Check);
      const alertsKey2 = buildQueryKey('alerts', store2Check);
      
      const ordersIsolated = JSON.stringify(ordersKey1) !== JSON.stringify(ordersKey2);
      const alertsIsolated = JSON.stringify(alertsKey1) !== JSON.stringify(alertsKey2);
      
      const pass = ordersIsolated && alertsIsolated;
      
      return { 
        pass, 
        detail: pass ? 'All query types isolated' : `orders=${ordersIsolated}, alerts=${alertsIsolated}`
      };
    }
  },
  {
    id: 'hard_reset_clears_all',
    name: 'Hard reset clears all stores',
    description: 'hardResetAllContexts removes all persisted data',
    run: async () => {
      // Save current state
      const originalStores = listPersistedStores();
      const originalActive = getPersistedContext(true);
      
      try {
        // Add test stores
        persistContext({ platform: 'shopify', storeKey: 'reset-test-1.myshopify.com', tenantId: 't1' });
        persistContext({ platform: 'shopify', storeKey: 'reset-test-2.myshopify.com', tenantId: 't2' });
        
        // Hard reset
        const result = hardResetAllContexts();
        
        // Check all cleared
        const afterStores = listPersistedStores();
        const pass = result.cleared >= 2 && afterStores.length === 0;
        
        // Restore original stores
        for (const store of originalStores) {
          persistContext({ 
            platform: store.platform, 
            storeKey: store.storeKey, 
            tenantId: store.tenantId 
          });
        }
        
        return { 
          pass, 
          detail: pass ? `Cleared ${result.cleared} keys` : `After reset: ${afterStores.length} stores remain`
        };
      } catch (e) {
        return { pass: false, detail: e.message };
      }
    }
  }
];

export default function ResolverSelfTest() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);

  const runAllTests = useCallback(async () => {
    setRunning(true);
    const newResults = {};
    
    for (const test of TEST_CASES) {
      try {
        newResults[test.id] = { status: 'running' };
        setResults({ ...newResults });
        
        const result = await test.run();
        newResults[test.id] = { 
          status: result.pass ? 'pass' : 'fail',
          detail: result.detail
        };
      } catch (e) {
        newResults[test.id] = { 
          status: 'fail',
          detail: e.message
        };
      }
    }
    
    setResults(newResults);
    setRunning(false);
  }, []);

  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  const totalRun = passCount + failCount;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
          Resolver Self-Test
        </span>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={runAllTests}
          disabled={running}
          className="h-6 text-xs"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          <span className="ml-1">Run</span>
        </Button>
      </div>
      
      {totalRun > 0 && (
        <div className="text-xs">
          <span className={passCount === TEST_CASES.length ? 'text-green-600' : 'text-amber-600'}>
            {passCount}/{TEST_CASES.length} PASS
          </span>
          {failCount > 0 && (
            <span className="text-red-600 ml-2">{failCount} FAIL</span>
          )}
        </div>
      )}
      
      <div className="space-y-1.5">
        {TEST_CASES.map(test => {
          const result = results[test.id];
          return (
            <div key={test.id} className="flex items-start gap-2 text-xs">
              {result?.status === 'pass' ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : result?.status === 'fail' ? (
                <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              ) : result?.status === 'running' ? (
                <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin mt-0.5 flex-shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-slate-300 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${result?.status === 'fail' ? 'text-red-700' : 'text-slate-700'}`}>
                  {test.name}
                </p>
                {result?.detail && (
                  <p className="text-slate-500 truncate">{result.detail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}