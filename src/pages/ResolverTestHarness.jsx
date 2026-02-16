import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { 
  usePlatformResolver, 
  RESOLVER_STATUS, 
  requireResolved 
} from '@/components/usePlatformResolver';
import {
  parseQuery,
  getPersistedContext,
  persistContext,
  clearContext,
  createPageUrl,
  isPersistedContextExpired,
  getContextTTL
} from '@/components/platformContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Bug,
  Database,
  Link2,
  Copy,
  Play
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * ResolverTestHarness - Admin-only page for testing resolver logic
 * Accessible via: /resolvertestharness OR /resolvertestharness?debug=1
 */
export default function ResolverTestHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  const urlParams = parseQuery(location.search);
  
  // Check if admin or debug mode
  const isDebugMode = urlParams.debug === '1';
  
  // Get resolver state
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  // Local state for test controls
  const [testShop, setTestShop] = useState('');
  const [testPlatform, setTestPlatform] = useState('shopify');
  const [selfTestResult, setSelfTestResult] = useState(null);
  const [selfTestLoading, setSelfTestLoading] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  
  // Load integrations and tenants for testing
  useEffect(() => {
    loadTestData();
  }, []);
  
  const loadTestData = async () => {
    setLoadingData(true);
    try {
      const [ints, tens] = await Promise.all([
        base44.entities.PlatformIntegration.filter({}, '-created_date', 50),
        base44.entities.Tenant.filter({}, '-created_date', 20)
      ]);
      setIntegrations(ints);
      setTenants(tens);
    } catch (e) {
      console.error('Failed to load test data:', e);
    }
    setLoadingData(false);
  };
  
  // Get persisted context safely
  const persisted = (() => {
    try {
      return getPersistedContext() || {};
    } catch (e) {
      return { error: e.message };
    }
  })();
  
  const isExpired = (() => {
    try {
      return isPersistedContextExpired();
    } catch (e) {
      return true;
    }
  })();
  
  // Test actions
  const handleClearLocalStorage = () => {
    clearContext();
    toast.success('Cleared persisted context');
    window.location.reload();
  };
  
  const handleNavigateNoParams = () => {
    navigate('/orders');
  };
  
  const handleSetPersistedShopify = (storeKey) => {
    persistContext({
      platform: 'shopify',
      storeKey: storeKey,
      shop: storeKey
    });
    toast.success(`Set persisted context to Shopify: ${storeKey}`);
  };
  
  const handleSetPersistedWoo = (storeUrl) => {
    persistContext({
      platform: 'woocommerce',
      storeKey: storeUrl
    });
    toast.success(`Set persisted context to WooCommerce: ${storeUrl}`);
  };
  
  const handleSimulateMultiStore = () => {
    // Clear context to trigger NEEDS_SELECTION if user has multiple stores
    clearContext();
    navigate('/home');
  };
  
  const handleRunSelfTest = async () => {
    setSelfTestLoading(true);
    setSelfTestResult(null);
    
    try {
      const response = await base44.functions.invoke('runResolverSelfTest', {
        urlParams: {
          shop: urlParams.shop || testShop || null,
          platform: urlParams.platform || testPlatform || null,
          storeKey: urlParams.storeKey || null,
          host: urlParams.host || null,
          embedded: urlParams.embedded || null,
          debug: '1'
        },
        persistedContext: {
          platform: persisted.platform,
          storeKey: persisted.storeKey,
          tenantId: persisted.tenantId,
          integrationId: persisted.integrationId,
          persistedAt: persisted.persistedAt
        }
      });
      
      setSelfTestResult(response.data);
    } catch (e) {
      setSelfTestResult({ error: e.message });
    }
    setSelfTestLoading(false);
  };
  
  const copyToClipboard = (data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success('Copied to clipboard');
  };
  
  // Status badge helper
  const getStatusBadge = (status) => {
    const config = {
      [RESOLVER_STATUS.RESOLVED]: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      [RESOLVER_STATUS.NEEDS_SELECTION]: { color: 'bg-amber-100 text-amber-800', icon: AlertTriangle },
      [RESOLVER_STATUS.ERROR]: { color: 'bg-red-100 text-red-800', icon: XCircle },
      [RESOLVER_STATUS.RESOLVING]: { color: 'bg-blue-100 text-blue-800', icon: Loader2 }
    };
    const cfg = config[status] || config[RESOLVER_STATUS.ERROR];
    const Icon = cfg.icon;
    return (
      <Badge className={cfg.color}>
        <Icon className={`w-3 h-3 mr-1 ${status === RESOLVER_STATUS.RESOLVING ? 'animate-spin' : ''}`} />
        {status}
      </Badge>
    );
  };
  
  // Check if user is admin
  const user = resolver?.user;
  const isAdmin = user && (user.app_role === 'admin' || user.app_role === 'owner' || user.role === 'admin' || user.role === 'owner');
  
  if (!isAdmin && !isDebugMode) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-slate-500 mb-4">This page is only accessible to admins or with ?debug=1</p>
            <Button onClick={() => navigate(createPageUrl('Home', location.search))}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bug className="w-6 h-6 text-amber-500" />
            Resolver Test Harness
          </h1>
          <p className="text-slate-500">Debug and test the platform resolver system</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadTestData} disabled={loadingData}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingData ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
          <Button variant="outline" onClick={() => copyToClipboard({ resolver, persisted, urlParams })}>
            <Copy className="w-4 h-4 mr-2" />
            Copy All
          </Button>
        </div>
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Current State */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Current Resolver State
              {getStatusBadge(resolver?.status)}
            </CardTitle>
            <CardDescription>Live output from usePlatformResolver()</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-500 text-xs">Status</p>
                <p className="font-medium">{resolver?.status || 'null'}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-500 text-xs">Reason</p>
                <p className="font-medium truncate">{resolver?.reason || 'null'}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-500 text-xs">Platform</p>
                <p className="font-medium">{resolver?.platform || 'null'}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-500 text-xs">Store Key</p>
                <p className="font-medium truncate">{resolver?.storeKey || 'null'}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-500 text-xs">Tenant ID</p>
                <p className="font-medium text-xs truncate">{resolver?.tenantId || 'null'}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-slate-500 text-xs">Integration ID</p>
                <p className="font-medium text-xs truncate">{resolver?.integrationId || 'null'}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded col-span-2">
                <p className="text-slate-500 text-xs">Available Stores</p>
                <p className="font-medium">{Array.isArray(resolver?.availableStores) ? resolver.availableStores.length : 0}</p>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <p className="text-sm font-medium mb-2">requireResolved() Output:</p>
              <div className="p-3 bg-slate-900 rounded text-xs text-slate-100 font-mono">
                <pre>{JSON.stringify(resolverCheck, null, 2)}</pre>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* URL & Persisted Context */}
        <Card>
          <CardHeader>
            <CardTitle>Context Sources</CardTitle>
            <CardDescription>URL params and localStorage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Link2 className="w-4 h-4" /> URL Parameters
              </p>
              <div className="p-3 bg-slate-50 rounded text-xs font-mono overflow-auto max-h-32">
                <pre>{JSON.stringify(urlParams, null, 2)}</pre>
              </div>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Database className="w-4 h-4" /> Persisted Context
                {isExpired && <Badge variant="outline" className="text-red-600">Expired</Badge>}
              </p>
              <div className="p-3 bg-slate-50 rounded text-xs font-mono overflow-auto max-h-32">
                <pre>{JSON.stringify(persisted, null, 2)}</pre>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                TTL: {Math.round(getContextTTL() / (1000 * 60 * 60 * 24))} days
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium mb-2">Trace ({resolver?.trace?.steps?.length || 0} steps):</p>
              <ScrollArea className="h-40 border rounded p-2 bg-slate-900">
                <div className="text-xs font-mono text-slate-100 space-y-1">
                  {(resolver?.trace?.steps || []).map((step, i) => (
                    <div key={i} className={step?.ok ? 'text-green-400' : 'text-red-400'}>
                      {step?.ok ? '✓' : '✗'} {step?.step || 'unknown'} {step?.note ? `- ${step.note}` : ''}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Test Controls</CardTitle>
          <CardDescription>Simulate different resolver scenarios</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button 
              variant="outline" 
              className="justify-start gap-2"
              onClick={handleClearLocalStorage}
            >
              <Trash2 className="w-4 h-4 text-red-500" />
              Clear localStorage
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-2"
              onClick={handleNavigateNoParams}
            >
              <Link2 className="w-4 h-4" />
              Navigate to /orders (no params)
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-2"
              onClick={handleSimulateMultiStore}
            >
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Simulate multi-store selection
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-2"
              onClick={() => navigate('/orders?shop=profitshield-dev.myshopify.com')}
            >
              <Play className="w-4 h-4 text-green-500" />
              Load with shop= param
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-2"
              onClick={() => navigate('/orders?shop=profitshield-dev.myshopify.com&embedded=1')}
            >
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Test embedded without host (error)
            </Button>
            
            <Button 
              variant="outline" 
              className="justify-start gap-2"
              onClick={() => {
                resolver?.refresh?.();
                toast.info('Triggered resolver refresh');
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Force resolver refresh
            </Button>
          </div>
          
          <Separator className="my-4" />
          
          {/* Set persisted context */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Set Persisted to Shopify Store</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="store.myshopify.com" 
                  value={testShop}
                  onChange={(e) => setTestShop(e.target.value)}
                />
                <Button 
                  onClick={() => testShop && handleSetPersistedShopify(testShop)}
                  disabled={!testShop}
                >
                  Set
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Quick Set from Existing Integrations</Label>
              <div className="flex flex-wrap gap-2">
                {integrations.slice(0, 4).map((int) => (
                  <Button 
                    key={int.id} 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      persistContext({
                        platform: int.platform,
                        storeKey: int.store_key,
                        tenantId: int.tenant_id,
                        integrationId: int.id
                      });
                      toast.success(`Set to ${int.store_name || int.store_key}`);
                    }}
                  >
                    {int.platform}: {int.store_name || int.store_key?.substring(0, 15)}...
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Backend Self-Test */}
      <Card>
        <CardHeader>
          <CardTitle>Backend Self-Test</CardTitle>
          <CardDescription>Run the resolver logic server-side for diagnostics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleRunSelfTest} 
            disabled={selfTestLoading}
            className="w-full"
          >
            {selfTestLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Run Backend Self-Test</>
            )}
          </Button>
          
          {selfTestResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selfTestResult.status === 'resolved' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : selfTestResult.status === 'needs_selection' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className="font-medium capitalize">{selfTestResult.status || 'Error'}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(selfTestResult)}>
                  <Copy className="w-4 h-4 mr-1" /> Copy
                </Button>
              </div>
              
              {selfTestResult.error ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {selfTestResult.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="p-2 bg-slate-50 rounded">
                      <p className="text-slate-500 text-xs">Priority</p>
                      <p className="font-medium">{selfTestResult.chosenPriority || 'null'}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <p className="text-slate-500 text-xs">Reason</p>
                      <p className="font-medium">{selfTestResult.reason || 'null'}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <p className="text-slate-500 text-xs">Platform</p>
                      <p className="font-medium">{selfTestResult.resolvedPlatform || 'null'}</p>
                    </div>
                    <div className="p-2 bg-slate-50 rounded">
                      <p className="text-slate-500 text-xs">Store Key</p>
                      <p className="font-medium truncate">{selfTestResult.resolvedStoreKey || 'null'}</p>
                    </div>
                  </div>
                  
                  {selfTestResult.flags && Object.values(selfTestResult.flags).some(Boolean) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                      <p className="text-sm font-medium text-amber-800 mb-2">Flags:</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(selfTestResult.flags).filter(([_, v]) => v).map(([key]) => (
                          <Badge key={key} variant="outline" className="text-amber-700 border-amber-300">
                            {key.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selfTestResult.trace && (
                    <ScrollArea className="h-40 border rounded p-2 bg-slate-900">
                      <div className="text-xs font-mono text-slate-100 space-y-1">
                        {selfTestResult.trace.map((step, i) => (
                          <div key={i} className={step?.ok ? 'text-green-400' : 'text-red-400'}>
                            {step?.ok ? '✓' : '✗'} {step?.step || 'unknown'} {step?.note ? `- ${step.note}` : ''}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Data Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Data Overview</CardTitle>
          <CardDescription>PlatformIntegration and Tenant records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">Integrations ({integrations.length})</h4>
              <ScrollArea className="h-48 border rounded">
                <div className="p-2 space-y-2">
                  {integrations.map((int) => (
                    <div 
                      key={int.id} 
                      className={`p-2 rounded text-xs ${
                        int.id === resolver?.integrationId ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{int.store_name || int.store_key}</span>
                        <Badge variant={int.status === 'connected' ? 'default' : 'outline'} className="text-xs">
                          {int.status}
                        </Badge>
                      </div>
                      <p className="text-slate-500">{int.platform} · {int.tenant_id?.substring(0, 8)}...</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Tenants ({tenants.length})</h4>
              <ScrollArea className="h-48 border rounded">
                <div className="p-2 space-y-2">
                  {tenants.map((t) => (
                    <div 
                      key={t.id} 
                      className={`p-2 rounded text-xs ${
                        t.id === resolver?.tenantId ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{t.shop_name || t.shop_domain}</span>
                        <Badge variant={t.status === 'active' ? 'default' : 'outline'} className="text-xs">
                          {t.status}
                        </Badge>
                      </div>
                      <p className="text-slate-500 truncate">{t.id}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}