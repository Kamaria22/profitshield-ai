import React, { useState, useEffect } from 'react';
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
  Check
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

import CostMappingTable from '../components/settings/CostMappingTable';

export default function Settings() {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('costs');
  const [newCostDialog, setNewCostDialog] = useState(false);
  const [newCost, setNewCost] = useState({ sku: '', product_title: '', cost_per_unit: '' });
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      if (currentUser?.tenant_id) {
        const tenants = await base44.entities.Tenant.filter({ id: currentUser.tenant_id });
        if (tenants.length > 0) setTenant(tenants[0]);
        
        const settingsData = await base44.entities.TenantSettings.filter({ tenant_id: currentUser.tenant_id });
        if (settingsData.length > 0) setSettings(settingsData[0]);
      }
    } catch (e) {
      console.log('Error loading user:', e);
    }
  };

  const { data: costMappings = [], isLoading: costsLoading } = useQuery({
    queryKey: ['costMappings', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      return base44.entities.CostMapping.filter({ tenant_id: tenant.id }, 'sku', 1000);
    },
    enabled: !!tenant?.id
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data) => {
      if (settings?.id) {
        await base44.entities.TenantSettings.update(settings.id, data);
      } else {
        await base44.entities.TenantSettings.create({ tenant_id: tenant.id, ...data });
      }
    },
    onSuccess: () => {
      toast.success('Settings saved');
      loadUserData();
    }
  });

  const createCostMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.CostMapping.create({
        tenant_id: tenant.id,
        ...data,
        source: 'manual',
        last_updated_by: user?.email
      });
    },
    onSuccess: () => {
      toast.success('Cost mapping added');
      queryClient.invalidateQueries(['costMappings', tenant?.id]);
      setNewCostDialog(false);
      setNewCost({ sku: '', product_title: '', cost_per_unit: '' });
    }
  });

  const updateCostMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await base44.entities.CostMapping.update(id, { ...data, last_updated_by: user?.email });
    },
    onSuccess: () => {
      toast.success('Cost updated');
      queryClient.invalidateQueries(['costMappings', tenant?.id]);
    }
  });

  const deleteCostMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.CostMapping.delete(id);
    },
    onSuccess: () => {
      toast.success('Cost mapping deleted');
      queryClient.invalidateQueries(['costMappings', tenant?.id]);
    }
  });

  const handleSettingsChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const saveSettings = () => {
    updateSettingsMutation.mutate(settings);
  };

  const handleAddCost = () => {
    if (!newCost.sku || !newCost.cost_per_unit) {
      toast.error('SKU and cost are required');
      return;
    }
    createCostMutation.mutate({
      sku: newCost.sku,
      product_title: newCost.product_title,
      cost_per_unit: parseFloat(newCost.cost_per_unit)
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Configure your ProfitShield preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="costs" className="gap-2">
            <DollarSign className="w-4 h-4" />
            Costs
          </TabsTrigger>
          <TabsTrigger value="fees" className="gap-2">
            <SettingsIcon className="w-4 h-4" />
            Fee Assumptions
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2">
            <Bell className="w-4 h-4" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="viral" className="gap-2">
            <Share2 className="w-4 h-4" />
            Viral Tools
          </TabsTrigger>
        </TabsList>

        {/* Costs Tab */}
        <TabsContent value="costs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Product Costs (COGS)</CardTitle>
                  <CardDescription>Set the cost per unit for each SKU to calculate accurate profit</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Import CSV
                  </Button>
                  <Dialog open={newCostDialog} onOpenChange={setNewCostDialog}>
                    <DialogTrigger asChild>
                      <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                        <Plus className="w-4 h-4" />
                        Add Cost
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Product Cost</DialogTitle>
                        <DialogDescription>Enter the cost per unit for this SKU</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label>SKU</Label>
                          <Input
                            value={newCost.sku}
                            onChange={(e) => setNewCost({ ...newCost, sku: e.target.value })}
                            placeholder="e.g., PROD-001"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Product Name (optional)</Label>
                          <Input
                            value={newCost.product_title}
                            onChange={(e) => setNewCost({ ...newCost, product_title: e.target.value })}
                            placeholder="e.g., Blue T-Shirt"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Cost per Unit ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={newCost.cost_per_unit}
                            onChange={(e) => setNewCost({ ...newCost, cost_per_unit: e.target.value })}
                            placeholder="0.00"
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setNewCostDialog(false)}>Cancel</Button>
                        <Button onClick={handleAddCost} className="bg-emerald-600 hover:bg-emerald-700">
                          Add Cost
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CostMappingTable
                costMappings={costMappings}
                loading={costsLoading}
                onUpdate={(id, data) => updateCostMutation.mutate({ id, data })}
                onDelete={(id) => deleteCostMutation.mutate(id)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Default Fee Assumptions</CardTitle>
              <CardDescription>These values are used when actual fee data is unavailable</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <Label>Payment Processing Fee (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={settings?.default_payment_fee_pct || 2.9}
                    onChange={(e) => handleSettingsChange('default_payment_fee_pct', parseFloat(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-slate-500 mt-1">e.g., Stripe/Shopify Payments: 2.9%</p>
                </div>
                <div>
                  <Label>Fixed Fee per Transaction ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={settings?.default_payment_fee_fixed || 0.30}
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
          <Card>
            <CardHeader>
              <CardTitle>Alert Settings</CardTitle>
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
                    <p className="font-medium">Shipping Loss Alerts</p>
                    <p className="text-sm text-slate-500">Alert when shipping cost exceeds charged amount</p>
                  </div>
                  <Switch 
                    checked={settings?.enable_shipping_alerts === true}
                    onCheckedChange={(v) => handleSettingsChange('enable_shipping_alerts', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Discount Protection</p>
                    <p className="text-sm text-slate-500">Alert on excessive discount stacking</p>
                  </div>
                  <Switch 
                    checked={settings?.enable_discount_protection === true}
                    onCheckedChange={(v) => handleSettingsChange('enable_discount_protection', v)}
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

        {/* Viral Tab */}
        <TabsContent value="viral" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profit Integrity Badge</CardTitle>
              <CardDescription>Share your store's profit health score publicly</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium">Enable Public Badge</p>
                  <p className="text-sm text-slate-500">Allow your score to be displayed via embed code</p>
                </div>
                <Switch 
                  checked={settings?.badge_public === true}
                  onCheckedChange={(v) => handleSettingsChange('badge_public', v)}
                />
              </div>

              {settings?.badge_public && (
                <>
                  <div>
                    <Label>Badge Style</Label>
                    <Select 
                      value={settings?.badge_style || 'light'}
                      onValueChange={(v) => handleSettingsChange('badge_style', v)}
                    >
                      <SelectTrigger className="mt-1 w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Embed Code</Label>
                    <div className="mt-2 p-3 bg-slate-900 rounded-lg text-green-400 text-sm font-mono">
                      {`<a href="https://profitshield.ai/badge/${tenant?.id}"><img src="https://profitshield.ai/api/badge/${tenant?.id}" alt="ProfitShield Score" /></a>`}
                    </div>
                    <Button variant="outline" size="sm" className="mt-2">
                      Copy Code
                    </Button>
                  </div>
                </>
              )}

              <Button onClick={saveSettings} className="gap-2">
                <Save className="w-4 h-4" />
                Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}