import React, { useState, useEffect, Suspense } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createApp from '@shopify/app-bridge';
import { Redirect } from '@shopify/app-bridge/actions';
import { 
  Settings as SettingsIcon, 
  DollarSign, 
  Bell, 
  Users, 
  Share2, 
  Upload,
  Plus,
  Save,
  AlertTriangle,
  Store,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  Shield,
  Download,
  Film
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

import CostMappingTable from '@/components/settings/CostMappingTable';
import ShopifyIntegrationPanel from '@/components/settings/ShopifyIntegrationPanel';
import CustomRiskRulesManager from '@/components/risk/CustomRiskRulesManager';
import ProfitAlertRulesManager from '@/components/alerts/ProfitAlertRulesManager';
import RiskModelConfig from '@/components/settings/RiskModelConfig';
import RoleManagement from '@/components/settings/RoleManagement';
import DataExportPanel from '@/components/settings/DataExportPanel';
import DemoVideoGenerator from '@/components/settings/DemoVideoGeneratorFixed';
import BiometricSettings from '@/components/settings/BiometricSettings';
import ShopifySubmitButton from '@/components/appstore/ShopifySubmitButton';
import ScreenshotGenerator from '@/components/appstore/ScreenshotGenerator';
import { Fingerprint } from 'lucide-react';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { usePermissions, RequirePermission } from '@/components/usePermissions';
import { hasValidAppBridgeContext } from '@/components/shopify/AppBridgeAuth';

function redirectWithAppBridge(url) {
  try {
    if (!hasValidAppBridgeContext()) return false;
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    const shop = params.get('shop');
    const apiKey = window.__SHOPIFY_API_KEY__;
    if (!host || !apiKey) throw new Error('missing_host_or_api_key');
    const normalizedShop = shop && (shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`);
    const app = createApp({
      apiKey,
      host,
      shopOrigin: normalizedShop ? `https://${normalizedShop}` : undefined,
      forceRedirect: true,
    });
    Redirect.create(app).dispatch(Redirect.Action.REMOTE, url);
    return true;
  } catch {
    return false;
  }
}

// User invitation form component
function InviteUserForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('user');
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    setInviting(true);
    try {
      await base44.users.inviteUser(email, role);
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
      setRole('user');
    } catch (error) {
      toast.error('Failed to send invitation');
      console.error(error);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Email Address</Label>
          <Input
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button onClick={handleInvite} disabled={inviting} className="gap-2">
        {inviting ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Send Invitation
          </>
        )}
      </Button>
    </div>
  );
}

// Users list component
function UsersList() {
  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      const allUsers = await base44.entities.User.list();
      return allUsers;
    }
  });

  if (isLoading) {
    return <div className="text-center py-8 text-slate-500">Loading users...</div>;
  }

  if (users.length === 0) {
    return <div className="text-center py-8 text-slate-500">No users found</div>;
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div key={user.id} className="flex items-center justify-between p-4 rounded-lg" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
              <span className="text-sm font-medium text-white">
                {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-slate-100">{user.full_name || user.email}</p>
              <p className="text-sm text-slate-400">{user.email}</p>
            </div>
          </div>
          <Badge variant="outline" className="capitalize">
            {user.role || 'user'}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  // Use platform resolver instead of deprecated tenant resolver
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  const tenant = resolver?.tenant || null;
  const tenantId = resolverCheck.tenantId;
  const shopDomain = resolver?.storeKey || null;
  const user = resolver?.user || null;
  const tenantLoading = resolver?.status === RESOLVER_STATUS.RESOLVING;
  const { hasPermission } = usePermissions();
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const [newCostDialog, setNewCostDialog] = useState(false);
  const [newCost, setNewCost] = useState({ sku: '', product_title: '', cost_per_unit: '' });
  const [connecting, setConnecting] = useState(false);
  const queryClient = useQueryClient();

  // Check if we have a valid OAuth token
  const { data: tokenStatus, refetch: refetchToken } = useQuery({
    queryKey: ['oauthToken', tenantId],
    queryFn: async () => {
      if (!tenantId) return { hasToken: false };
      const tokens = await base44.entities.OAuthToken.filter({ 
        tenant_id: tenantId, 
        platform: 'shopify',
        is_valid: true 
      });
      return { hasToken: tokens.length > 0, token: tokens[0] };
    },
    enabled: !!tenantId && !tenantLoading
  });

  useEffect(() => {
    if (tenantId) {
      loadSettings();
    }
  }, [tenantId]);

  const loadSettings = async () => {
    try {
      const settingsData = await base44.entities.TenantSettings.filter({ tenant_id: tenantId });
      if (settingsData.length > 0) setSettings(settingsData[0]);
    } catch (e) {
      console.log('Error loading settings:', e);
    }
  };

  const handleReconnectShopify = async () => {
    if (!shopDomain) {
      toast.error('No shop domain found');
      return;
    }
    
    setConnecting(true);
    try {
      const response = await base44.functions.invoke('shopifyAuth', { 
        action: 'install', 
        shop: shopDomain 
      });
      
      if (response.data?.install_url) {
        if (!redirectWithAppBridge(response.data.install_url)) {
          window.location.assign(response.data.install_url);
        }
      } else {
        toast.error('Failed to get install URL');
      }
    } catch (e) {
      toast.error('Failed to initiate Shopify connection');
      console.error(e);
    } finally {
      setConnecting(false);
    }
  };

  const { data: costMappings = [], isLoading: costsLoading } = useQuery({
    queryKey: ['costMappings', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      return base44.entities.CostMapping.filter({ tenant_id: tenantId }, 'sku', 1000);
    },
    enabled: !!tenantId && !tenantLoading
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data) => {
      if (settings?.id) {
        return base44.entities.TenantSettings.update(settings.id, data);
      } else {
        return base44.entities.TenantSettings.create({ 
          tenant_id: tenantId,
          ...data 
        });
      }
    }
  });

  const handleSettingsChange = async (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const saveSettings = async () => {
    try {
      await updateSettingsMutation.mutateAsync(settings);
      queryClient.invalidateQueries({ queryKey: ['settings', tenantId] });
      toast.success('Settings saved');
    } catch (e) {
      toast.error('Failed to save settings');
      console.error(e);
    }
  };

  const addCostMutation = useMutation({
    mutationFn: async () => {
      return base44.entities.CostMapping.create({
        tenant_id: tenantId,
        ...newCost
      });
    },
    onSuccess: () => {
      setNewCost({ sku: '', product_title: '', cost_per_unit: '' });
      setNewCostDialog(false);
      queryClient.invalidateQueries({ queryKey: ['costMappings', tenantId] });
      toast.success('Cost mapping added');
    },
    onError: () => {
      toast.error('Failed to add cost mapping');
    }
  });

  if (!tenantId && !tenantLoading) {
    return (
      <div className="p-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-8">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-3" />
            <p className="text-center text-amber-900 font-medium">No store connected</p>
            <p className="text-center text-amber-700 text-sm mt-1">Please connect a store to access settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-emerald-400" />
          Settings
        </h1>
        <p className="text-slate-400 mt-1">Manage your account, integrations, and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="shopify" className="flex items-center gap-1">
            <Store className="w-3 h-3" />
            Shopify
          </TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1">
            <Fingerprint className="w-3 h-3" />
            Security
          </TabsTrigger>
          {user?.email === 'rohan.a.roberts@gmail.com' && (
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
          )}
          {(user?.role === 'admin' || user?.role === 'owner') && (
            <TabsTrigger value="demo-video" className="flex items-center gap-2">
              <Film className="w-4 h-4" />
              Demo Video
            </TabsTrigger>
          )}
          {(user?.role === 'admin' || user?.role === 'owner') && (
            <TabsTrigger value="app-store" className="flex items-center gap-2">
              <Store className="w-3 h-3" />
              App Store
            </TabsTrigger>
          )}
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shopify Connection</CardTitle>
              <CardDescription>Manage your Shopify store connection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="flex items-center gap-3">
                  {tokenStatus?.hasToken ? (
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400" />
                  )}
                  <div>
                    <p className="font-medium text-slate-100">
                      {shopDomain || 'Unknown Store'}
                    </p>
                    <p className="text-sm text-slate-400">
                      {tokenStatus?.hasToken 
                        ? 'Connected and syncing orders' 
                        : 'Not connected - orders will not sync'}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={handleReconnectShopify}
                  disabled={connecting || !shopDomain}
                  variant={tokenStatus?.hasToken ? 'outline' : 'default'}
                  className={!tokenStatus?.hasToken ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                >
                  {connecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : tokenStatus?.hasToken ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reconnect
                    </>
                  ) : (
                    <>
                      <Store className="w-4 h-4 mr-2" />
                      Connect Shopify
                    </>
                  )}
                </Button>
              </div>
              
              {!tokenStatus?.hasToken && (
                <div className="p-4 rounded-lg" style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.25)'}}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-300">Shopify Connection Required</p>
                      <p className="text-sm text-red-400/80 mt-1">
                        Your Shopify access token is missing or expired. Click "Connect Shopify" to authorize and start syncing orders.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Data Display Settings</CardTitle>
              <CardDescription>Control what data is displayed in the app</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <div>
                  <p className="font-medium text-slate-100">Demo Mode (Show Sample Data)</p>
                  <p className="text-sm text-slate-400">
                    When enabled, shows sample/demo orders alongside real data. 
                    Disable to see only real Shopify-synced orders.
                  </p>
                </div>
                <Switch 
                  checked={settings?.demo_mode !== false}
                  onCheckedChange={(v) => handleSettingsChange('demo_mode', v)}
                />
              </div>
              
              <div className="p-4 rounded-lg" style={{background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.25)'}}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-300">Demo Mode is {settings?.demo_mode !== false ? 'ON' : 'OFF'}</p>
                    <p className="text-sm text-amber-400/80 mt-1">
                      {settings?.demo_mode !== false 
                        ? 'Sample data is included in your views. Turn off to see only real orders from Shopify.'
                        : 'Only real Shopify-synced orders are shown. Turn on to include demo data for testing.'}
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={saveSettings} className="gap-2">
                <Save className="w-4 h-4" />
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shopify Integration Tab */}
        <TabsContent value="shopify" className="mt-6">
          <ShopifyIntegrationPanel
            tenantId={tenantId}
            shopDomain={shopDomain}
            resolver={resolver}
          />
        </TabsContent>

        {/* Costs Tab */}
        <TabsContent value="costs" className="mt-6 space-y-6">
          <CostMappingTable tenantId={tenantId} costMappings={costMappings} isLoading={costsLoading} />
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fee Configuration</CardTitle>
              <CardDescription>Set default transaction and platform fees</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-3 gap-6">
                <div>
                  <Label>Payment Processor Fee ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings?.default_payment_fee_fixed || 0}
                    onChange={(e) => handleSettingsChange('default_payment_fee_fixed', parseFloat(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">e.g., Stripe: $0.30 per transaction</p>
                </div>
                <div>
                  <Label>Platform Transaction Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={settings?.default_platform_fee_pct || 0}
                    onChange={(e) => handleSettingsChange('default_platform_fee_pct', parseFloat(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">Additional platform fees if any</p>
                </div>
                <div>
                  <Label>Shipping Buffer Alert Threshold (%)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={settings?.shipping_buffer_pct || 10}
                    onChange={(e) => handleSettingsChange('shipping_buffer_pct', parseFloat(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">Alert when shipping cost exceeds charged by this %</p>
                </div>
              </div>
              <Button onClick={saveSettings} className="gap-2">
                <Save className="w-4 h-4" />
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="mt-6 space-y-6">
          <ProfitAlertRulesManager tenantId={tenantId} userEmail={user?.email} />

          <Card>
            <CardHeader>
              <CardTitle>Risk Alert Settings</CardTitle>
              <CardDescription>Configure risk thresholds and notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <Label>High Risk Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={settings?.high_risk_threshold || 70}
                    onChange={(e) => handleSettingsChange('high_risk_threshold', parseInt(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">Risk score above this = high risk</p>
                </div>
                <div>
                  <Label>Medium Risk Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={settings?.medium_risk_threshold || 40}
                    onChange={(e) => handleSettingsChange('medium_risk_threshold', parseInt(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">Risk score above this = medium risk</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">High-Risk Order Alerts</p>
                    <p className="text-sm text-slate-500">Get notified of potentially fraudulent orders</p>
                  </div>
                  <Switch 
                    checked={settings?.enable_risk_alerts !== false}
                    onCheckedChange={(v) => handleSettingsChange('enable_risk_alerts', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Weekly Profit Report</p>
                    <p className="text-sm text-slate-500">Receive weekly profit summary via email</p>
                  </div>
                  <Switch 
                    checked={settings?.weekly_report_enabled !== false}
                    onCheckedChange={(v) => handleSettingsChange('weekly_report_enabled', v)}
                  />
                </div>
              </div>

              <Button onClick={saveSettings} className="gap-2">
                <Save className="w-4 h-4" />
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Export Tab */}
        <TabsContent value="export" className="mt-6">
          <DataExportPanel tenantId={tenantId} />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage authentication and access security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <BiometricSettings />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab - Owner Only */}
        {user?.email === 'rohan.a.roberts@gmail.com' && (
          <TabsContent value="users" className="mt-6 space-y-6">
            <Card className="border-blue-500/20" style={{background:'rgba(59,130,246,0.08)'}}>
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-300">Access Requests</p>
                    <p className="text-sm text-blue-400/80 mt-1">
                      When users request access, you'll receive an email notification. 
                      Invite them below to grant access to ProfitShield.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invite User</CardTitle>
                <CardDescription>Send an invitation to grant access to ProfitShield</CardDescription>
              </CardHeader>
              <CardContent>
                <InviteUserForm />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Registered Users</CardTitle>
                <CardDescription>Manage user access and roles</CardDescription>
              </CardHeader>
              <CardContent>
                <UsersList />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Demo Video Tab */}
        {(user?.role === 'admin' || user?.role === 'owner') && (
          <TabsContent value="demo-video" className="mt-6">
            <Suspense fallback={
              <Card>
                <CardContent className="py-8">
                  <div className="text-center text-slate-500">Loading demo video generator...</div>
                </CardContent>
              </Card>
            }>
              <DemoVideoGenerator resolver={resolver} />
            </Suspense>
          </TabsContent>
        )}

        {/* App Store Tab - Admin Only */}
        {(user?.role === 'admin' || user?.role === 'owner') && (
          <TabsContent value="app-store" className="mt-6 space-y-6">
            <ShopifySubmitButton />
            <ScreenshotGenerator />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
