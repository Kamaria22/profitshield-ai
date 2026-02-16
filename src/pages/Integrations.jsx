import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Store, ShoppingCart, Link2, RefreshCw, Settings, CheckCircle, XCircle,
  AlertTriangle, Clock, ArrowUpDown, Play, Pause, Trash2, Eye, Zap,
  TrendingUp, Shield, Activity, Loader2
} from 'lucide-react';
import {
  normalizeShopDomain,
  parseQuery,
  getPersistedShopifyContext,
  persistShopifyContext
} from '@/components/shopifyContext';

const PLATFORM_INFO = {
  shopify: {
    name: 'Shopify',
    icon: '🛒',
    color: 'bg-green-500',
    description: 'Connect your Shopify store for real-time order sync and risk scoring'
  },
  woocommerce: {
    name: 'WooCommerce',
    icon: '🔌',
    color: 'bg-purple-500',
    description: 'Sync orders from your WooCommerce WordPress store'
  },
  bigcommerce: {
    name: 'BigCommerce',
    icon: '📦',
    color: 'bg-blue-500',
    description: 'Connect your BigCommerce store for automated order analysis'
  }
};

export default function Integrations() {
  const [tenantId, setTenantId] = useState(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [credentials, setCredentials] = useState({});
  const [syncConfig, setSyncConfig] = useState({
    auto_sync_enabled: true,
    sync_frequency_minutes: 15,
    sync_products: true,
    sync_customers: true
  });
  const [twoWaySync, setTwoWaySync] = useState({
    enabled: false,
    push_tags: true,
    push_notes: true,
    auto_hold_high_risk: false
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    loadTenant();
  }, []);

  const loadTenant = async () => {
    try {
      const user = await base44.auth.me();
      const urlParams = parseQuery(window.location.search);
      const persisted = getPersistedShopifyContext();
      
      let resolvedTenantId = null;
      
      // PRIORITY A: URL shop param
      if (urlParams.shop) {
        const shopDomain = normalizeShopDomain(urlParams.shop);
        const tenants = await base44.entities.Tenant.filter({ shop_domain: shopDomain });
        if (tenants.length) {
          resolvedTenantId = tenants[0].id;
          persistShopifyContext({ shop: shopDomain, host: urlParams.host, tenantId: resolvedTenantId });
        }
      }
      
      // PRIORITY B: localStorage
      if (!resolvedTenantId && persisted.shopDomain) {
        const tenants = await base44.entities.Tenant.filter({ shop_domain: persisted.shopDomain });
        if (tenants.length) resolvedTenantId = tenants[0].id;
      } else if (!resolvedTenantId && persisted.tenantId) {
        const tenants = await base44.entities.Tenant.filter({ id: persisted.tenantId });
        if (tenants.length) resolvedTenantId = tenants[0].id;
      }
      
      // PRIORITY C: user.tenant_id
      if (!resolvedTenantId && user?.tenant_id) {
        resolvedTenantId = user.tenant_id;
      }
      
      if (resolvedTenantId) setTenantId(resolvedTenantId);
    } catch (e) {
      console.error('Error loading tenant:', e);
    }
  };

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations', tenantId],
    queryFn: () => base44.entities.PlatformIntegration.filter({ tenant_id: tenantId }),
    enabled: !!tenantId
  });

  const { data: syncJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['syncJobs', tenantId],
    queryFn: async () => {
      const jobs = [];
      for (const integration of integrations) {
        const result = await base44.functions.invoke('syncEngine', {
          action: 'list_sync_jobs',
          integration_id: integration.id,
          limit: 5
        });
        jobs.push(...(result.data?.jobs || []));
      }
      return jobs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: integrations.length > 0
  });

  const { data: outcomes = [] } = useQuery({
    queryKey: ['outcomes', tenantId],
    queryFn: () => base44.entities.OrderOutcome.filter({ tenant_id: tenantId }),
    enabled: !!tenantId
  });

  const connectMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.functions.invoke('platformConnector', {
        action: 'connect_platform',
        tenant_id: tenantId,
        ...data
      });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['integrations']);
      setConnectDialogOpen(false);
      toast.success('Platform connected successfully');
    },
    onError: (error) => {
      toast.error(`Connection failed: ${error.message}`);
    }
  });

  const syncMutation = useMutation({
    mutationFn: async ({ integration_id, job_type }) => {
      const result = await base44.functions.invoke('syncEngine', {
        action: 'start_sync',
        integration_id,
        job_type
      });
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['syncJobs']);
      toast.success(`Sync completed: ${data.results?.orders_created || 0} orders synced`);
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
    }
  });

  const pushRiskMutation = useMutation({
    mutationFn: async (integration_id) => {
      const result = await base44.functions.invoke('syncEngine', {
        action: 'push_risk_scores',
        integration_id
      });
      return result.data;
    },
    onSuccess: (data) => {
      toast.success(`Pushed risk scores for ${data.results?.pushed || 0} orders`);
    }
  });

  const handleConnect = () => {
    if (!selectedPlatform) return;
    
    connectMutation.mutate({
      platform: selectedPlatform,
      store_url: credentials.store_url,
      credentials: selectedPlatform === 'shopify' 
        ? { access_token: credentials.access_token }
        : selectedPlatform === 'woocommerce'
        ? { consumer_key: credentials.consumer_key, consumer_secret: credentials.consumer_secret }
        : { store_hash: credentials.store_hash, access_token: credentials.access_token },
      sync_config: syncConfig,
      two_way_sync: twoWaySync
    });
  };

  const getStatusBadge = (status) => {
    const configs = {
      connected: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      error: { color: 'bg-red-100 text-red-800', icon: XCircle },
      disconnected: { color: 'bg-gray-100 text-gray-800', icon: XCircle },
      rate_limited: { color: 'bg-orange-100 text-orange-800', icon: AlertTriangle }
    };
    const config = configs[status] || configs.pending;
    const Icon = config.icon;
    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  // Calculate learning stats
  const learningStats = {
    total_outcomes: outcomes.length,
    true_positives: outcomes.filter(o => o.prediction_analysis === 'true_positive').length,
    false_positives: outcomes.filter(o => o.prediction_analysis === 'false_positive').length,
    precision: 0
  };
  if (learningStats.true_positives + learningStats.false_positives > 0) {
    learningStats.precision = Math.round(
      (learningStats.true_positives / (learningStats.true_positives + learningStats.false_positives)) * 100
    );
  }

  if (!tenantId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500 mb-4" />
            <p>No store connected. Please connect via Shopify.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Integrations</h1>
          <p className="text-slate-500">Connect e-commerce platforms for two-way order sync and risk scoring</p>
        </div>
        <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Link2 className="w-4 h-4 mr-2" />
              Connect Platform
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Connect E-commerce Platform</DialogTitle>
              <DialogDescription>
                Select a platform and enter your API credentials
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Platform</Label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLATFORM_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <span>{info.icon}</span>
                          {info.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPlatform && (
                <>
                  <div>
                    <Label>Store URL</Label>
                    <Input
                      placeholder={selectedPlatform === 'shopify' ? 'mystore.myshopify.com' : 'mystore.com'}
                      value={credentials.store_url || ''}
                      onChange={(e) => setCredentials({ ...credentials, store_url: e.target.value })}
                    />
                  </div>

                  {selectedPlatform === 'shopify' && (
                    <div>
                      <Label>Access Token</Label>
                      <Input
                        type="password"
                        placeholder="shpat_..."
                        value={credentials.access_token || ''}
                        onChange={(e) => setCredentials({ ...credentials, access_token: e.target.value })}
                      />
                    </div>
                  )}

                  {selectedPlatform === 'woocommerce' && (
                    <>
                      <div>
                        <Label>Consumer Key</Label>
                        <Input
                          type="password"
                          placeholder="ck_..."
                          value={credentials.consumer_key || ''}
                          onChange={(e) => setCredentials({ ...credentials, consumer_key: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Consumer Secret</Label>
                        <Input
                          type="password"
                          placeholder="cs_..."
                          value={credentials.consumer_secret || ''}
                          onChange={(e) => setCredentials({ ...credentials, consumer_secret: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  {selectedPlatform === 'bigcommerce' && (
                    <>
                      <div>
                        <Label>Store Hash</Label>
                        <Input
                          placeholder="abc123"
                          value={credentials.store_hash || ''}
                          onChange={(e) => setCredentials({ ...credentials, store_hash: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Access Token</Label>
                        <Input
                          type="password"
                          value={credentials.access_token || ''}
                          onChange={(e) => setCredentials({ ...credentials, access_token: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Two-Way Sync Options</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Enable Two-Way Sync</Label>
                        <Switch
                          checked={twoWaySync.enabled}
                          onCheckedChange={(v) => setTwoWaySync({ ...twoWaySync, enabled: v })}
                        />
                      </div>
                      {twoWaySync.enabled && (
                        <>
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Push Risk Tags to Orders</Label>
                            <Switch
                              checked={twoWaySync.push_tags}
                              onCheckedChange={(v) => setTwoWaySync({ ...twoWaySync, push_tags: v })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Add Risk Notes</Label>
                            <Switch
                              checked={twoWaySync.push_notes}
                              onCheckedChange={(v) => setTwoWaySync({ ...twoWaySync, push_notes: v })}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Auto-Hold High Risk Orders</Label>
                            <Switch
                              checked={twoWaySync.auto_hold_high_risk}
                              onCheckedChange={(v) => setTwoWaySync({ ...twoWaySync, auto_hold_high_risk: v })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={handleConnect}
                    disabled={connectMutation.isPending}
                  >
                    {connectMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
                    ) : (
                      <><Link2 className="w-4 h-4 mr-2" /> Connect Platform</>
                    )}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Link2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Connected Platforms</p>
                <p className="text-2xl font-bold">{integrations.filter(i => i.status === 'connected').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <RefreshCw className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Recent Syncs</p>
                <p className="text-2xl font-bold">{syncJobs.filter(j => j.status === 'completed').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Learning Outcomes</p>
                <p className="text-2xl font-bold">{learningStats.total_outcomes}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Shield className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Model Precision</p>
                <p className="text-2xl font-bold">{learningStats.precision}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="integrations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="integrations">Connected Platforms</TabsTrigger>
          <TabsTrigger value="sync">Sync History</TabsTrigger>
          <TabsTrigger value="learning">Adaptive Learning</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-4">
          {integrationsLoading ? (
            <Card><CardContent className="pt-6 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>
          ) : integrations.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <Store className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">No platforms connected yet</p>
                <Button variant="outline" className="mt-4" onClick={() => setConnectDialogOpen(true)}>
                  Connect Your First Platform
                </Button>
              </CardContent>
            </Card>
          ) : (
            integrations.map((integration) => (
              <Card key={integration.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-lg ${PLATFORM_INFO[integration.platform]?.color || 'bg-gray-500'}`}>
                        <span className="text-2xl">{PLATFORM_INFO[integration.platform]?.icon || '🔗'}</span>
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {integration.store_name || integration.store_url}
                          {getStatusBadge(integration.status)}
                        </CardTitle>
                        <CardDescription>
                          {PLATFORM_INFO[integration.platform]?.name} • API v{integration.api_version}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMutation.mutate({ integration_id: integration.id, job_type: 'incremental_sync' })}
                        disabled={syncMutation.isPending}
                      >
                        {syncMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <><RefreshCw className="w-4 h-4 mr-1" /> Sync Now</>
                        )}
                      </Button>
                      {integration.two_way_sync?.enabled && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => pushRiskMutation.mutate(integration.id)}
                          disabled={pushRiskMutation.isPending}
                        >
                          <ArrowUpDown className="w-4 h-4 mr-1" /> Push Scores
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Last Sync</p>
                      <p className="font-medium">
                        {integration.last_sync_at 
                          ? new Date(integration.last_sync_at).toLocaleString() 
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Orders Synced</p>
                      <p className="font-medium">{integration.last_sync_stats?.orders_synced || 0}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Two-Way Sync</p>
                      <p className="font-medium">
                        {integration.two_way_sync?.enabled ? (
                          <Badge className="bg-emerald-100 text-emerald-800">Enabled</Badge>
                        ) : (
                          <Badge variant="outline">Disabled</Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Auto Hold</p>
                      <p className="font-medium">
                        {integration.two_way_sync?.auto_hold_high_risk ? 'Yes' : 'No'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Sync Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {syncJobs.length === 0 ? (
                <p className="text-center text-slate-500 py-4">No sync jobs yet</p>
              ) : (
                <div className="space-y-3">
                  {syncJobs.slice(0, 10).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded ${
                          job.status === 'completed' ? 'bg-green-100' :
                          job.status === 'running' ? 'bg-blue-100' :
                          job.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                        }`}>
                          {job.status === 'running' ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          ) : job.status === 'completed' ? (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          ) : job.status === 'failed' ? (
                            <XCircle className="w-4 h-4 text-red-600" />
                          ) : (
                            <Clock className="w-4 h-4 text-gray-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{job.job_type.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(job.created_date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        {job.results && (
                          <p className="text-slate-600">
                            {job.results.orders_created + job.results.orders_updated} orders
                          </p>
                        )}
                        {job.error_message && (
                          <p className="text-red-600 text-xs">{job.error_message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="learning" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Adaptive Learning Status
              </CardTitle>
              <CardDescription>
                The system learns from order outcomes to improve risk predictions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500">Total Outcomes</p>
                  <p className="text-2xl font-bold">{learningStats.total_outcomes}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600">True Positives</p>
                  <p className="text-2xl font-bold text-green-700">{learningStats.true_positives}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-red-600">False Positives</p>
                  <p className="text-2xl font-bold text-red-700">{learningStats.false_positives}</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600">Model Precision</p>
                  <p className="text-2xl font-bold text-blue-700">{learningStats.precision}%</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">How It Works</h4>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">1</div>
                    <div>
                      <p className="font-medium">Ingest Order Updates</p>
                      <p className="text-slate-500">Webhooks capture fulfillments, refunds, and chargebacks</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">2</div>
                    <div>
                      <p className="font-medium">Track Outcomes</p>
                      <p className="text-slate-500">Compare predictions vs actual results</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xs">3</div>
                    <div>
                      <p className="font-medium">Suggest Improvements</p>
                      <p className="text-slate-500">AI analyzes patterns and recommends weight adjustments</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {outcomes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {outcomes.slice(0, 10).map((outcome) => (
                    <div key={outcome.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">Order #{outcome.platform_order_id}</p>
                        <p className="text-xs text-slate-500">{outcome.outcome_type?.replace(/_/g, ' ')}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={
                          outcome.prediction_analysis === 'true_positive' ? 'bg-green-100 text-green-800' :
                          outcome.prediction_analysis === 'true_negative' ? 'bg-blue-100 text-blue-800' :
                          outcome.prediction_analysis === 'false_positive' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }>
                          {outcome.prediction_analysis?.replace(/_/g, ' ')}
                        </Badge>
                        <p className="text-xs text-slate-500 mt-1">
                          Risk: {outcome.risk_score_at_creation || 'N/A'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}