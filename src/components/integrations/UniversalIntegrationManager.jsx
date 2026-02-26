import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import HolographicCard from '@/components/quantum/HolographicCard';
import QuantumButton from '@/components/quantum/QuantumButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Webhook, 
  Database, 
  Key,
  RefreshCw,
  Trash2,
  Plus,
  Activity
} from 'lucide-react';

/**
 * UNIVERSAL INTEGRATION MANAGER
 * Quantum-level platform integration with any ecommerce system
 */
export default function UniversalIntegrationManager({ tenantId }) {
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [credentials, setCredentials] = useState({});
  const [storeUrl, setStoreUrl] = useState('');
  const [webhookConfig, setWebhookConfig] = useState({ topic: 'orders_create', url: '' });
  const [selectedIntegration, setSelectedIntegration] = useState(null);

  // Fetch existing integrations
  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['integrations', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      return await base44.entities.PlatformIntegration.filter({ tenant_id: tenantId });
    },
    enabled: !!tenantId
  });

  // Auto-detect platform
  const detectMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('universalPlatformDetector', {
        action: 'detect',
        url: storeUrl,
        headers: {},
        sampleData: null
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data.platform) {
        setSelectedPlatform(data.data.platform);
        toast.success(`Detected: ${data.data.platform} (${Math.round(data.data.confidence * 100)}% confidence)`);
      } else {
        toast.error('Could not detect platform');
      }
    },
    onError: (error) => {
      toast.error(`Detection failed: ${error.message}`);
    }
  });

  // Test credentials
  const testCredentialsMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('universalPlatformDetector', {
        action: 'test_credentials',
        platform: selectedPlatform,
        credentials,
        store_url: storeUrl
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data.valid) {
        toast.success('Credentials validated successfully');
      } else {
        toast.error(`Invalid credentials: ${data.data.error}`);
      }
    }
  });

  // Auto-connect
  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('universalPlatformDetector', {
        action: 'auto_connect',
        url: storeUrl,
        headers: {},
        apiKey: credentials.api_key || credentials.access_token,
        storeId: extractStoreName(storeUrl)
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data.success) {
        toast.success(`Connected to ${data.data.platform}`);
        queryClient.invalidateQueries(['integrations']);
        setCredentials({});
        setStoreUrl('');
      } else {
        toast.error(`Connection failed: ${data.data.error}`);
      }
    }
  });

  // Sync data
  const syncMutation = useMutation({
    mutationFn: async ({ integrationId, dataTypes }) => {
      const response = await base44.functions.invoke('universalPlatformDetector', {
        action: 'sync_data',
        integration_id: integrationId,
        data_types: dataTypes,
        options: { limit: 100 }
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data.success) {
        toast.success(`Synced ${data.data.total_records} records`);
        queryClient.invalidateQueries(['integrations']);
      } else {
        toast.error(`Sync failed: ${data.data.error}`);
      }
    }
  });

  // Register webhook
  const registerWebhookMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('universalPlatformDetector', {
        action: 'register_webhook',
        integration_id: selectedIntegration,
        webhook_config: webhookConfig
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data.success) {
        toast.success('Webhook registered');
        queryClient.invalidateQueries(['integrations']);
        setWebhookConfig({ topic: 'orders_create', url: '' });
      } else {
        toast.error(`Failed: ${data.data.error}`);
      }
    }
  });

  const handleCredentialChange = (key, value) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
  };

  const getCredentialFields = () => {
    const fields = {
      shopify: [
        { key: 'access_token', label: 'Access Token', type: 'password' },
        { key: 'shop_domain', label: 'Shop Domain', type: 'text' }
      ],
      woocommerce: [
        { key: 'consumer_key', label: 'Consumer Key', type: 'text' },
        { key: 'consumer_secret', label: 'Consumer Secret', type: 'password' }
      ],
      bigcommerce: [
        { key: 'access_token', label: 'Access Token', type: 'password' },
        { key: 'store_hash', label: 'Store Hash', type: 'text' }
      ],
      stripe: [
        { key: 'api_key', label: 'API Key', type: 'password' }
      ]
    };

    return fields[selectedPlatform] || [
      { key: 'api_key', label: 'API Key', type: 'password' }
    ];
  };

  return (
    <div className="space-y-6">
      <HolographicCard glow scanline className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-6 h-6 text-cyan-400" />
          <h2 className="text-2xl font-bold text-cyan-400">Universal Integration Hub</h2>
        </div>

        <Tabs defaultValue="connect">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="connect">Connect</TabsTrigger>
            <TabsTrigger value="sync">Data Sync</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          </TabsList>

          {/* Connect Tab */}
          <TabsContent value="connect" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label className="text-cyan-300">Store URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={storeUrl}
                    onChange={(e) => setStoreUrl(e.target.value)}
                    placeholder="https://your-store.com"
                    className="bg-slate-800/40 border-cyan-500/30 text-white"
                  />
                  <QuantumButton
                    variant="primary"
                    onClick={() => detectMutation.mutate()}
                    loading={detectMutation.isPending}
                  >
                    Detect
                  </QuantumButton>
                </div>
              </div>

              {selectedPlatform && (
                <>
                  <Alert className="bg-emerald-500/10 border-emerald-500/30">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <AlertDescription className="text-emerald-300">
                      Detected platform: <strong>{selectedPlatform}</strong>
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-3">
                    {getCredentialFields().map(field => (
                      <div key={field.key}>
                        <Label className="text-cyan-300">{field.label}</Label>
                        <Input
                          type={field.type}
                          value={credentials[field.key] || ''}
                          onChange={(e) => handleCredentialChange(field.key, e.target.value)}
                          className="bg-slate-800/40 border-cyan-500/30 text-white"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <QuantumButton
                      variant="primary"
                      onClick={() => testCredentialsMutation.mutate()}
                      loading={testCredentialsMutation.isPending}
                      icon={Key}
                    >
                      Test Credentials
                    </QuantumButton>
                    <QuantumButton
                      variant="success"
                      onClick={() => connectMutation.mutate()}
                      loading={connectMutation.isPending}
                      icon={Plus}
                    >
                      Connect
                    </QuantumButton>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* Sync Tab */}
          <TabsContent value="sync" className="space-y-4">
            {integrations.length === 0 ? (
              <Alert className="bg-amber-500/10 border-amber-500/30">
                <AlertDescription className="text-amber-300">
                  No integrations connected yet
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {integrations.map(int => (
                  <HolographicCard key={int.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-cyan-300">{int.store_name}</p>
                        <p className="text-sm text-slate-400 capitalize">{int.platform}</p>
                        <Badge variant="outline" className={
                          int.status === 'connected' ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'
                        }>
                          {int.status}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <QuantumButton
                          size="sm"
                          onClick={() => syncMutation.mutate({ 
                            integrationId: int.id, 
                            dataTypes: ['orders', 'products', 'customers'] 
                          })}
                          loading={syncMutation.isPending}
                          icon={RefreshCw}
                        >
                          Sync All
                        </QuantumButton>
                      </div>
                    </div>
                  </HolographicCard>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Webhooks Tab */}
          <TabsContent value="webhooks" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label className="text-cyan-300">Select Integration</Label>
                <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
                  <SelectTrigger className="bg-slate-800/40 border-cyan-500/30 text-white">
                    <SelectValue placeholder="Choose integration" />
                  </SelectTrigger>
                  <SelectContent>
                    {integrations.map(int => (
                      <SelectItem key={int.id} value={int.id}>
                        {int.store_name} ({int.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedIntegration && (
                <>
                  <div>
                    <Label className="text-cyan-300">Webhook Topic</Label>
                    <Select 
                      value={webhookConfig.topic} 
                      onValueChange={(val) => setWebhookConfig(prev => ({ ...prev, topic: val }))}
                    >
                      <SelectTrigger className="bg-slate-800/40 border-cyan-500/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="orders_create">Order Created</SelectItem>
                        <SelectItem value="orders_updated">Order Updated</SelectItem>
                        <SelectItem value="orders_cancelled">Order Cancelled</SelectItem>
                        <SelectItem value="products_create">Product Created</SelectItem>
                        <SelectItem value="customers_create">Customer Created</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-cyan-300">Webhook URL</Label>
                    <Input
                      value={webhookConfig.url}
                      onChange={(e) => setWebhookConfig(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://your-app.com/webhook"
                      className="bg-slate-800/40 border-cyan-500/30 text-white"
                    />
                  </div>

                  <QuantumButton
                    variant="primary"
                    onClick={() => registerWebhookMutation.mutate()}
                    loading={registerWebhookMutation.isPending}
                    icon={Webhook}
                  >
                    Register Webhook
                  </QuantumButton>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </HolographicCard>

      {/* Active Integrations */}
      {integrations.length > 0 && (
        <HolographicCard glow className="p-6">
          <h3 className="text-xl font-bold text-cyan-400 mb-4">Active Integrations</h3>
          <div className="space-y-3">
            {integrations.map(int => (
              <div key={int.id} className="flex items-center justify-between p-4 bg-slate-800/20 rounded-lg border border-cyan-500/20">
                <div className="flex items-center gap-4">
                  <Database className="w-8 h-8 text-cyan-400" />
                  <div>
                    <p className="font-semibold text-white">{int.store_name}</p>
                    <p className="text-sm text-slate-400">Platform: {int.platform}</p>
                    <p className="text-xs text-slate-500">
                      Last sync: {int.last_sync_at ? new Date(int.last_sync_at).toLocaleString() : 'Never'}
                    </p>
                  </div>
                </div>
                <Badge className={
                  int.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }>
                  {int.status}
                </Badge>
              </div>
            ))}
          </div>
        </HolographicCard>
      )}
    </div>
  );
}

function extractStoreName(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.split('.')[0];
  } catch {
    return 'store';
  }
}