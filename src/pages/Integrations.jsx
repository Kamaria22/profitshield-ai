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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Store, ShoppingCart, Link2, RefreshCw, Settings, CheckCircle, XCircle,
  AlertTriangle, Clock, ArrowUpDown, Trash2, Webhook, MoreVertical,
  TrendingUp, Shield, Activity, Loader2, ExternalLink, Unplug
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';

const PLATFORM_INFO = {
  shopify: {
    name: 'Shopify',
    icon: '🛒',
    color: 'bg-green-500',
    description: 'Connect your Shopify store for real-time order sync and risk scoring',
    webhookTopics: ['orders/create', 'orders/updated', 'orders/fulfilled', 'orders/cancelled', 'refunds/create']
  },
  woocommerce: {
    name: 'WooCommerce',
    icon: '🔌',
    color: 'bg-purple-500',
    description: 'Sync orders from your WooCommerce WordPress store',
    webhookTopics: ['order.created', 'order.updated', 'order.deleted']
  },
  bigcommerce: {
    name: 'BigCommerce',
    icon: '📦',
    color: 'bg-blue-500',
    description: 'Connect your BigCommerce store for automated order analysis',
    webhookTopics: ['store/order/created', 'store/order/updated', 'store/order/statusUpdated']
  }
};

const SYNC_FREQUENCIES = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 1440, label: 'Once daily' }
];

export default function Integrations() {
  const { tenantId, status } = usePlatformResolver();
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [webhooksDialogOpen, setWebhooksDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [credentials, setCredentials] = useState({});
  const [syncConfig, setSyncConfig] = useState({
    auto_sync_enabled: true,
    sync_frequency_minutes: 15,
    sync_products: true,
    sync_customers: true,
    sync_historical_days: 90
  });
  const [twoWaySync, setTwoWaySync] = useState({
    enabled: false,
    push_tags: true,
    push_notes: true,
    auto_hold_high_risk: false,
    auto_cancel_threshold: null
  });

  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading: integrationsLoading, refetch: refetchIntegrations } = useQuery({
    queryKey: ['integrations', tenantId],
    queryFn: () => base44.entities.PlatformIntegration.filter({ tenant_id: tenantId }),
    enabled: !!tenantId
  });

  const { data: syncJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['syncJobs', tenantId, integrations],
    queryFn: async () => {
      if (!integrations.length) return [];
      const jobs = [];
      for (const integration of integrations) {
        try {
          const result = await base44.functions.invoke('syncEngine', {
            action: 'list_sync_jobs',
            integration_id: integration.id,
            limit: 10
          });
          jobs.push(...(result.data?.jobs || []));
        } catch (e) {
          console.error('Failed to load sync jobs:', e);
        }
      }
      return jobs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: integrations.length > 0
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
    onSuccess: async (data) => {
      queryClient.invalidateQueries(['integrations']);
      
      // Auto-register webhooks
      if (data.integration_id) {
        try {
          const webhookBaseUrl = window.location.origin.replace('app.', 'api.');
          await base44.functions.invoke('platformConnector', {
            action: 'register_webhooks',
            integration_id: data.integration_id,
            webhook_base_url: webhookBaseUrl
          });
          toast.success('Platform connected and webhooks registered!');
        } catch (e) {
          toast.success('Platform connected! Webhook registration had issues.');
        }
      } else {
        toast.success('Platform connected successfully');
      }
      
      setConnectDialogOpen(false);
      resetConnectionForm();
    },
    onError: (error) => {
      toast.error(`Connection failed: ${error.message}`);
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: async (integrationId) => {
      // Deregister webhooks first
      try {
        await base44.functions.invoke('platformConnector', {
          action: 'deregister_webhooks',
          integration_id: integrationId
        });
      } catch (e) {
        console.error('Webhook deregistration failed:', e);
      }
      
      // Update status to disconnected
      await base44.entities.PlatformIntegration.update(integrationId, {
        status: 'disconnected',
        webhook_endpoints: {}
      });
      
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['integrations']);
      toast.success('Platform disconnected');
      setDisconnectDialogOpen(false);
      setSelectedIntegration(null);
    },
    onError: (error) => {
      toast.error(`Disconnect failed: ${error.message}`);
    }
  });

  const updateIntegrationMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await base44.entities.PlatformIntegration.update(id, data);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['integrations']);
      toast.success('Settings updated');
      setSettingsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Update failed: ${error.message}`);
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
      queryClient.invalidateQueries(['integrations']);
      toast.success(`Sync completed: ${data.results?.orders_created || 0} new, ${data.results?.orders_updated || 0} updated`);
    },
    onError: (error) => {
      toast.error(`Sync failed: ${error.message}`);
    }
  });

  const registerWebhooksMutation = useMutation({
    mutationFn: async (integrationId) => {
      const webhookBaseUrl = window.location.origin.replace('app.', 'api.');
      const result = await base44.functions.invoke('platformConnector', {
        action: 'register_webhooks',
        integration_id: integrationId,
        webhook_base_url: webhookBaseUrl
      });
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['integrations']);
      const successCount = Object.keys(data.webhooks || {}).length;
      const errorCount = (data.errors || []).length;
      toast.success(`Registered ${successCount} webhooks${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
    },
    onError: (error) => {
      toast.error(`Webhook registration failed: ${error.message}`);
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

  const resetConnectionForm = () => {
    setSelectedPlatform(null);
    setCredentials({});
    setSyncConfig({
      auto_sync_enabled: true,
      sync_frequency_minutes: 15,
      sync_products: true,
      sync_customers: true,
      sync_historical_days: 90
    });
    setTwoWaySync({
      enabled: false,
      push_tags: true,
      push_notes: true,
      auto_hold_high_risk: false,
      auto_cancel_threshold: null
    });
  };

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

  const openSettingsDialog = (integration) => {
    setSelectedIntegration(integration);
    setSyncConfig(integration.sync_config || {
      auto_sync_enabled: true,
      sync_frequency_minutes: 15,
      sync_products: true,
      sync_customers: true
    });
    setTwoWaySync(integration.two_way_sync || {
      enabled: false,
      push_tags: true,
      push_notes: true,
      auto_hold_high_risk: false
    });
    setSettingsDialogOpen(true);
  };

  const handleSaveSettings = () => {
    if (!selectedIntegration) return;
    updateIntegrationMutation.mutate({
      id: selectedIntegration.id,
      data: { sync_config: syncConfig, two_way_sync: twoWaySync }
    });
  };

  const getStatusBadge = (status) => {
    const configs = {
      connected: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      error: { color: 'bg-red-100 text-red-800', icon: XCircle },
      disconnected: { color: 'bg-gray-100 text-gray-800', icon: Unplug },
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

  const getJobStatusIcon = (status) => {
    if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-blue-600" />;
    if (status === 'completed') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-red-600" />;
    return <Clock className="w-4 h-4 text-gray-600" />;
  };

  if (status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-slate-400 mb-4" />
            <p className="text-slate-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tenantId && status !== RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500 mb-4" />
            <p className="text-slate-600">No store connected. Please connect a platform first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Integrations</h1>
          <p className="text-slate-500">Connect e-commerce platforms for two-way order sync and risk scoring</p>
        </div>
        <Dialog open={connectDialogOpen} onOpenChange={(open) => { setConnectDialogOpen(open); if (!open) resetConnectionForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Link2 className="w-4 h-4 mr-2" />
              Connect Platform
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Connect E-commerce Platform</DialogTitle>
              <DialogDescription>
                Select a platform and enter your API credentials
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Platform Selection */}
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
                  {/* Credentials */}
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
                      <p className="text-xs text-slate-500 mt-1">Get this from your Shopify Admin → Settings → Apps → Develop apps</p>
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

                  <Separator />

                  {/* Sync Settings */}
                  <div>
                    <h4 className="font-medium mb-3">Sync Settings</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Auto Sync Enabled</Label>
                        <Switch
                          checked={syncConfig.auto_sync_enabled}
                          onCheckedChange={(v) => setSyncConfig({ ...syncConfig, auto_sync_enabled: v })}
                        />
                      </div>
                      <div>
                        <Label>Sync Frequency</Label>
                        <Select 
                          value={String(syncConfig.sync_frequency_minutes)} 
                          onValueChange={(v) => setSyncConfig({ ...syncConfig, sync_frequency_minutes: parseInt(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SYNC_FREQUENCIES.map(f => (
                              <SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Sync Products</Label>
                        <Switch
                          checked={syncConfig.sync_products}
                          onCheckedChange={(v) => setSyncConfig({ ...syncConfig, sync_products: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Sync Customers</Label>
                        <Switch
                          checked={syncConfig.sync_customers}
                          onCheckedChange={(v) => setSyncConfig({ ...syncConfig, sync_customers: v })}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Two-Way Sync */}
                  <div>
                    <h4 className="font-medium mb-3">Two-Way Sync (Push to Platform)</h4>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Link2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Connected</p>
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
                <p className="text-sm text-slate-500">Syncs Today</p>
                <p className="text-2xl font-bold">
                  {syncJobs.filter(j => new Date(j.created_date).toDateString() === new Date().toDateString()).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Webhook className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Active Webhooks</p>
                <p className="text-2xl font-bold">
                  {integrations.reduce((sum, i) => sum + Object.keys(i.webhook_endpoints || {}).length, 0)}
                </p>
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
                <p className="text-sm text-slate-500">Two-Way Sync</p>
                <p className="text-2xl font-bold">{integrations.filter(i => i.two_way_sync?.enabled).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Status Overview */}
      {integrations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Sync Status Overview</CardTitle>
                <CardDescription>Quick view of all platform sync statuses</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  integrations
                    .filter(i => i.status === 'connected')
                    .forEach(i => syncMutation.mutate({ integration_id: i.id, job_type: 'incremental_sync' }));
                }}
                disabled={syncMutation.isPending || integrations.filter(i => i.status === 'connected').length === 0}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Sync All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {integrations.map((integration) => {
                const platformInfo = PLATFORM_INFO[integration.platform] || {};
                const lastSync = integration.last_sync_at ? new Date(integration.last_sync_at) : null;
                const timeSinceSync = lastSync ? Math.round((Date.now() - lastSync.getTime()) / 60000) : null;
                const syncStatus = integration.last_sync_status;
                
                return (
                  <div 
                    key={integration.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-slate-50/50"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${platformInfo.color || 'bg-gray-500'}`}>
                        <span className="text-xl">{platformInfo.icon || '🔗'}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{integration.store_name || integration.store_key}</p>
                          {getStatusBadge(integration.status)}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {lastSync ? (
                              timeSinceSync < 60 
                                ? `${timeSinceSync}m ago`
                                : timeSinceSync < 1440
                                ? `${Math.round(timeSinceSync / 60)}h ago`
                                : `${Math.round(timeSinceSync / 1440)}d ago`
                            ) : 'Never synced'}
                          </span>
                          {syncStatus && (
                            <span className={`flex items-center gap-1 ${
                              syncStatus === 'success' ? 'text-green-600' :
                              syncStatus === 'failed' ? 'text-red-600' : 'text-yellow-600'
                            }`}>
                              {syncStatus === 'success' ? <CheckCircle className="w-3 h-3" /> :
                               syncStatus === 'failed' ? <XCircle className="w-3 h-3" /> :
                               <AlertTriangle className="w-3 h-3" />}
                              {syncStatus}
                            </span>
                          )}
                          {integration.last_sync_stats?.orders_synced > 0 && (
                            <span>{integration.last_sync_stats.orders_synced} orders</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {integration.status === 'connected' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => syncMutation.mutate({ integration_id: integration.id, job_type: 'incremental_sync' })}
                            disabled={syncMutation.isPending}
                          >
                            {syncMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <><RefreshCw className="w-4 h-4 mr-1" /> Sync</>
                            )}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => syncMutation.mutate({ integration_id: integration.id, job_type: 'full_sync' })}>
                                <RefreshCw className="w-4 h-4 mr-2" /> Full Sync
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => syncMutation.mutate({ integration_id: integration.id, job_type: 'orders_only' })}>
                                <ShoppingCart className="w-4 h-4 mr-2" /> Orders Only
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => syncMutation.mutate({ integration_id: integration.id, job_type: 'products_only' })}>
                                <Store className="w-4 h-4 mr-2" /> Products Only
                              </DropdownMenuItem>
                              {integration.two_way_sync?.enabled && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => pushRiskMutation.mutate(integration.id)}>
                                    <ArrowUpDown className="w-4 h-4 mr-2" /> Push Risk Scores
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                      {integration.status === 'disconnected' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedIntegration(integration);
                            setSelectedPlatform(integration.platform);
                            setCredentials({ store_url: integration.store_url });
                            setConnectDialogOpen(true);
                          }}
                        >
                          <Link2 className="w-4 h-4 mr-1" /> Reconnect
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="integrations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="integrations">Connected Platforms</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="sync">Sync History</TabsTrigger>
        </TabsList>

        {/* Integrations Tab */}
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
                          {PLATFORM_INFO[integration.platform]?.name} • API v{integration.api_version || 'latest'}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {integration.status === 'connected' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => syncMutation.mutate({ integration_id: integration.id, job_type: 'incremental_sync' })}
                            disabled={syncMutation.isPending}
                          >
                            {syncMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <><RefreshCw className="w-4 h-4 mr-1" /> Sync</>
                            )}
                          </Button>
                          {integration.two_way_sync?.enabled && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => pushRiskMutation.mutate(integration.id)}
                              disabled={pushRiskMutation.isPending}
                            >
                              <ArrowUpDown className="w-4 h-4 mr-1" /> Push
                            </Button>
                          )}
                        </>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openSettingsDialog(integration)}>
                            <Settings className="w-4 h-4 mr-2" /> Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelectedIntegration(integration); setWebhooksDialogOpen(true); }}>
                            <Webhook className="w-4 h-4 mr-2" /> Webhooks
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => syncMutation.mutate({ integration_id: integration.id, job_type: 'full_sync' })}>
                            <RefreshCw className="w-4 h-4 mr-2" /> Full Sync
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => { setSelectedIntegration(integration); setDisconnectDialogOpen(true); }}
                          >
                            <Unplug className="w-4 h-4 mr-2" /> Disconnect
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
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
                      <p className="text-slate-500">Auto Sync</p>
                      <Badge variant={integration.sync_config?.auto_sync_enabled ? "default" : "outline"} className="text-xs">
                        {integration.sync_config?.auto_sync_enabled ? 'On' : 'Off'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-slate-500">Two-Way</p>
                      <Badge variant={integration.two_way_sync?.enabled ? "default" : "outline"} className="text-xs">
                        {integration.two_way_sync?.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-slate-500">Webhooks</p>
                      <p className="font-medium">{Object.keys(integration.webhook_endpoints || {}).length} active</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="space-y-4">
          {integrations.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-slate-500">
                Connect a platform first to manage webhooks
              </CardContent>
            </Card>
          ) : (
            integrations.map((integration) => (
              <Card key={integration.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span>{PLATFORM_INFO[integration.platform]?.icon}</span>
                      {integration.store_name || integration.store_url}
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => registerWebhooksMutation.mutate(integration.id)}
                      disabled={registerWebhooksMutation.isPending || integration.status !== 'connected'}
                    >
                      {registerWebhooksMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Webhook className="w-4 h-4 mr-1" />
                      )}
                      Register All
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(PLATFORM_INFO[integration.platform]?.webhookTopics || []).map((topic) => {
                      const topicKey = topic.replace('/', '_').replace('.', '_');
                      const isRegistered = integration.webhook_endpoints?.[topicKey];
                      return (
                        <div key={topic} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            {isRegistered ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-300" />
                            )}
                            <div>
                              <p className="font-medium text-sm">{topic}</p>
                              <p className="text-xs text-slate-500">
                                {isRegistered ? `ID: ${isRegistered}` : 'Not registered'}
                              </p>
                            </div>
                          </div>
                          <Badge variant={isRegistered ? "default" : "outline"}>
                            {isRegistered ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Sync History Tab */}
        <TabsContent value="sync" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sync History</CardTitle>
              <CardDescription>Recent synchronization jobs across all platforms</CardDescription>
            </CardHeader>
            <CardContent>
              {syncJobs.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No sync jobs yet. Connect a platform and run a sync.</p>
              ) : (
                <div className="space-y-3">
                  {syncJobs.slice(0, 20).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded ${
                          job.status === 'completed' ? 'bg-green-100' :
                          job.status === 'running' ? 'bg-blue-100' :
                          job.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                        }`}>
                          {getJobStatusIcon(job.status)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{job.job_type?.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-500">
                            {job.platform} • {new Date(job.created_date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        {job.results && (
                          <p className="text-slate-600">
                            {(job.results.orders_created || 0) + (job.results.orders_updated || 0)} orders
                          </p>
                        )}
                        {job.error_message && (
                          <p className="text-red-600 text-xs truncate max-w-[200px]">{job.error_message}</p>
                        )}
                        {job.results?.duration_ms && (
                          <p className="text-xs text-slate-400">{(job.results.duration_ms / 1000).toFixed(1)}s</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Integration Settings</DialogTitle>
            <DialogDescription>
              Configure sync and two-way communication settings
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-3">Sync Settings</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Auto Sync Enabled</Label>
                  <Switch
                    checked={syncConfig.auto_sync_enabled}
                    onCheckedChange={(v) => setSyncConfig({ ...syncConfig, auto_sync_enabled: v })}
                  />
                </div>
                <div>
                  <Label>Sync Frequency</Label>
                  <Select 
                    value={String(syncConfig.sync_frequency_minutes || 15)} 
                    onValueChange={(v) => setSyncConfig({ ...syncConfig, sync_frequency_minutes: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYNC_FREQUENCIES.map(f => (
                        <SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Sync Products</Label>
                  <Switch
                    checked={syncConfig.sync_products}
                    onCheckedChange={(v) => setSyncConfig({ ...syncConfig, sync_products: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Sync Customers</Label>
                  <Switch
                    checked={syncConfig.sync_customers}
                    onCheckedChange={(v) => setSyncConfig({ ...syncConfig, sync_customers: v })}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-3">Two-Way Sync</h4>
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
                      <Label className="text-sm">Push Risk Tags</Label>
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
                      <Label className="text-sm">Auto-Hold High Risk</Label>
                      <Switch
                        checked={twoWaySync.auto_hold_high_risk}
                        onCheckedChange={(v) => setTwoWaySync({ ...twoWaySync, auto_hold_high_risk: v })}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSettings} disabled={updateIntegrationMutation.isPending}>
              {updateIntegrationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Platform</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect {selectedIntegration?.store_name || selectedIntegration?.store_url}? 
              This will deregister all webhooks and stop syncing data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={() => disconnectMutation.mutate(selectedIntegration?.id)}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unplug className="w-4 h-4 mr-2" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}