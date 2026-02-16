import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertTriangle,
  Plus,
  Trash2,
  Bell,
  DollarSign,
  TrendingDown,
  Truck,
  Pencil,
  Mail,
  Flag,
  Pause,
  ClipboardList
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const alertTypeConfig = {
  low_margin: {
    icon: TrendingDown,
    label: 'Low Margin Alert',
    description: 'Trigger when order profit margin falls below threshold',
    defaultThreshold: 10,
    unit: '%'
  },
  cogs_change: {
    icon: DollarSign,
    label: 'COGS Change Detection',
    description: 'Alert when product cost changes significantly',
    defaultThreshold: 10,
    unit: '%'
  },
  shipping_discrepancy: {
    icon: Truck,
    label: 'Shipping Cost Discrepancy',
    description: 'Alert when shipping cost exceeds charged amount',
    defaultThreshold: 20,
    unit: '%'
  },
  negative_profit: {
    icon: AlertTriangle,
    label: 'Negative Profit Alert',
    description: 'Alert on orders with negative profit',
    defaultThreshold: 0,
    unit: '$'
  },
  high_discount: {
    icon: DollarSign,
    label: 'High Discount Alert',
    description: 'Alert when discount exceeds threshold',
    defaultThreshold: 30,
    unit: '%'
  }
};

const actionTypes = [
  { value: 'email', label: 'Send Email', icon: Mail },
  { value: 'flag_order', label: 'Flag Order', icon: Flag },
  { value: 'hold_order', label: 'Hold Order', icon: Pause },
  { value: 'create_task', label: 'Create Task', icon: ClipboardList }
];

const emptyRule = {
  name: '',
  type: 'low_margin',
  is_active: true,
  threshold_value: 10,
  threshold_type: 'percentage',
  comparison_period_days: 30,
  actions: [],
  notify_email: '',
  severity: 'medium'
};

export default function ProfitAlertRulesManager({ tenantId, userEmail }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState(emptyRule);
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['alertRules', tenantId],
    queryFn: () => base44.entities.AlertRule.filter({ tenant_id: tenantId }),
    enabled: !!tenantId
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.AlertRule.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      toast.success('Alert rule created');
      closeDialog();
    }
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AlertRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      toast.success('Alert rule updated');
      closeDialog();
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.AlertRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      toast.success('Alert rule deleted');
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.AlertRule.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alertRules'] })
  });

  const openDialog = (rule = null) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        type: rule.type,
        is_active: rule.is_active,
        threshold_value: rule.threshold_value,
        threshold_type: rule.threshold_type || 'percentage',
        comparison_period_days: rule.comparison_period_days || 30,
        actions: rule.actions || [],
        notify_email: rule.notify_email || userEmail || '',
        severity: rule.severity || 'medium'
      });
    } else {
      setEditingRule(null);
      setFormData({ ...emptyRule, notify_email: userEmail || '' });
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
    setFormData(emptyRule);
  };

  const toggleAction = (actionType) => {
    const exists = formData.actions.find(a => a.type === actionType);
    if (exists) {
      setFormData({
        ...formData,
        actions: formData.actions.filter(a => a.type !== actionType)
      });
    } else {
      setFormData({
        ...formData,
        actions: [...formData.actions, { type: actionType, config: {} }]
      });
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Rule name is required');
      return;
    }

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: formData });
    } else {
      createRuleMutation.mutate(formData);
    }
  };

  const handleTypeChange = (type) => {
    const config = alertTypeConfig[type];
    setFormData({
      ...formData,
      type,
      threshold_value: config.defaultThreshold
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              Profit Alert Rules
            </CardTitle>
            <CardDescription>
              Set up automated alerts for profit anomalies and cost changes
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Alert Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}</DialogTitle>
                <DialogDescription>
                  Configure when and how to be notified about profit issues
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Low Margin Warning"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Alert Type</Label>
                  <Select value={formData.type} onValueChange={handleTypeChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(alertTypeConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <config.icon className="w-4 h-4" />
                            {config.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {alertTypeConfig[formData.type]?.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Threshold</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={formData.threshold_value}
                        onChange={(e) => setFormData({ ...formData, threshold_value: parseFloat(e.target.value) || 0 })}
                        className="w-24"
                      />
                      <span className="text-sm text-slate-500">
                        {alertTypeConfig[formData.type]?.unit}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.type === 'cogs_change' && (
                  <div className="space-y-2">
                    <Label>Comparison Period (days)</Label>
                    <Input
                      type="number"
                      value={formData.comparison_period_days}
                      onChange={(e) => setFormData({ ...formData, comparison_period_days: parseInt(e.target.value) || 30 })}
                      className="w-24"
                    />
                    <p className="text-xs text-slate-500">Look back period for detecting COGS changes</p>
                  </div>
                )}

                <Separator />

                <div className="space-y-3">
                  <Label>Automated Actions</Label>
                  <p className="text-xs text-slate-500">Select actions to perform when this alert triggers</p>
                  
                  <div className="space-y-2">
                    {actionTypes.map((action) => {
                      const isSelected = formData.actions.some(a => a.type === action.value);
                      const Icon = action.icon;
                      return (
                        <div
                          key={action.value}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50 border-emerald-200' : 'hover:bg-slate-50'
                          }`}
                          onClick={() => toggleAction(action.value)}
                        >
                          <Checkbox checked={isSelected} />
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                          <span className={isSelected ? 'text-emerald-700 font-medium' : ''}>{action.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {formData.actions.some(a => a.type === 'email') && (
                  <div className="space-y-2">
                    <Label>Notification Email</Label>
                    <Input
                      type="email"
                      value={formData.notify_email}
                      onChange={(e) => setFormData({ ...formData, notify_email: e.target.value })}
                      placeholder="your@email.com"
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>Cancel</Button>
                <Button 
                  onClick={handleSubmit}
                  disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                >
                  {editingRule ? 'Save Changes' : 'Create Rule'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-slate-500">Loading rules...</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <Bell className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">No profit alert rules defined</p>
            <p className="text-sm text-slate-400 mb-3">Create rules to monitor margin, COGS, and shipping costs</p>
            <Button variant="outline" onClick={() => openDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Rule
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => {
              const config = alertTypeConfig[rule.type];
              const Icon = config?.icon || AlertTriangle;
              
              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-lg border ${rule.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        rule.severity === 'critical' ? 'bg-red-100' :
                        rule.severity === 'high' ? 'bg-orange-100' :
                        rule.severity === 'medium' ? 'bg-yellow-100' : 'bg-blue-100'
                      }`}>
                        <Icon className={`w-4 h-4 ${
                          rule.severity === 'critical' ? 'text-red-600' :
                          rule.severity === 'high' ? 'text-orange-600' :
                          rule.severity === 'medium' ? 'text-yellow-600' : 'text-blue-600'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{rule.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {rule.threshold_value}{config?.unit} threshold
                          </Badge>
                          <Badge className={`text-xs ${
                            rule.severity === 'critical' ? 'bg-red-100 text-red-700' :
                            rule.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                            rule.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {rule.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{config?.description}</p>
                        {rule.actions?.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {rule.actions.map((action, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {actionTypes.find(a => a.value === action.type)?.label}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {rule.triggered_count > 0 && (
                          <p className="text-xs text-slate-400 mt-1">
                            Triggered {rule.triggered_count} times
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(v) => toggleRuleMutation.mutate({ id: rule.id, is_active: v })}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openDialog(rule)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}