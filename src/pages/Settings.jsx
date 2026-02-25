import React, { useState, useEffect, Suspense } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import CustomRiskRulesManager from '@/components/risk/CustomRiskRulesManager';
import ProfitAlertRulesManager from '@/components/alerts/ProfitAlertRulesManager';
import RiskModelConfig from '@/components/settings/RiskModelConfig';
import RoleManagement from '@/components/settings/RoleManagement';
import DataExportPanel from '@/components/settings/DataExportPanel';
import DemoVideoGenerator from '@/components/settings/DemoVideoGeneratorFixed';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { usePermissions, RequirePermission } from '@/components/usePermissions';

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

// Pending requests component
function PendingRequests() {
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState(null);
  
  const { data: pendingRequests = [], isLoading, refetch } = useQuery({
    queryKey: ['pendingAccessRequests'],
    queryFn: async () => {
      try {
        // Fetch pending access requests from Base44 platform
        const requests = await base44.users.listPendingRequests();
        return requests || [];
      } catch (error) {
        console.error('Error fetching pending requests:', error);
        return [];
      }
    },
    refetchInterval: 10000 // Auto-refresh every 10 seconds
  });

  const handleApprove = async (request) => {
    setProcessingId(request.id);
    try {
      await base44.users.approveRequest(request.id, request.email, 'user');
      toast.success(`Access granted to ${request.email}`);
      refetch();
      queryClient.invalidateQueries(['allUsers']);
    } catch (error) {
      toast.error('Failed to approve request');
      console.error(error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeny = async (request) => {
    setProcessingId(request.id);
    try {
      await base44.users.denyRequest(request.id);
      toast.success('Request denied');
      refetch();
    } catch (error) {
      toast.error('Failed to deny request');
      console.error(error);
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-slate-500">Loading pending requests...</div>;
  }

  if (pendingRequests.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <Shield className="w-12 h-12 mx-auto mb-2 text-slate-300" />
        <p>No pending access requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingRequests.map((request) => (
        <div key={request.id} className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900">{request.email}</p>
              <p className="text-sm text-slate-500">
                Requested access {request.requested_at ? new Date(request.requested_at).toLocaleDateString() : 'recently'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDeny(request)}
              disabled={processingId === request.id}
              className="text-red-600 hover:bg-red-50"
            >
              {processingId === request.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Deny'}
            </Button>
            <Button
              size="sm"
              onClick={() => handleApprove(request)}
              disabled={processingId === request.id}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {processingId === request.id ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Approve
                </>
              )}
            </Button>
          </div>
        </div>
      ))}
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
        <div key={user.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-slate-600">
                {(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-slate-900">{user.full_name || user.email}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
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
        window.location.href = response.data.install_url;
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
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-emerald-600" />
          Settings
        </h1>
        <p className="text-slate-500 mt-1">Manage your account, integrations, and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="costs">Costs</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
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
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shopify Connection</CardTitle>
              <CardDescription>Manage your Shopify store connection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  {tokenStatus?.hasToken ? (
                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <div>
                    <p className="font-medium text-slate-900">
                      {shopDomain || 'Unknown Store'}
                    </p>
                    <p className="text-sm text-slate-500">
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
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-900">Shopify Connection Required</p>
                      <p className="text-sm text-red-700 mt-1">
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
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Demo Mode (Show Sample Data)</p>
                  <p className="text-sm text-slate-500">
                    When enabled, shows sample/demo orders alongside real data. 
                    Disable to see only real Shopify-synced orders.
                  </p>
                </div>
                <Switch 
                  checked={settings?.demo_mode !== false}
                  onCheckedChange={(v) => handleSettingsChange('demo_mode', v)}
                />
              </div>
              
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-900">Demo Mode is {settings?.demo_mode !== false ? 'ON' : 'OFF'}</p>
                    <p className="text-sm text-amber-700 mt-1">
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

        {/* Users Tab - Owner Only */}
        {user?.email === 'rohan.a.roberts@gmail.com' && (
          <TabsContent value="users" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  Pending Access Requests
                </CardTitle>
                <CardDescription>Review and approve user access requests</CardDescription>
              </CardHeader>
              <CardContent>
                <PendingRequests />
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
      </Tabs>
    </div>
  );
}