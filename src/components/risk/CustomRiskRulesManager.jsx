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
import {
  AlertTriangle,
  Plus,
  Trash2,
  Settings,
  Shield,
  Zap,
  GripVertical,
  Pencil,
  Store,
  Brain
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ShopifyActionsConfig from '../alerts/ShopifyActionsConfig';
import AIRuleAssistant from './AIRuleAssistant';

const fieldOptions = [
  { value: 'order_value', label: 'Order Value ($)' },
  { value: 'discount_pct', label: 'Discount Percentage (%)' },
  { value: 'customer_orders', label: 'Customer Order Count' },
  { value: 'product_type', label: 'Product Type' },
  { value: 'shipping_country', label: 'Shipping Country' },
  { value: 'payment_method', label: 'Payment Method' },
  { value: 'is_first_order', label: 'Is First Order' },
  { value: 'has_discount_code', label: 'Has Discount Code' },
  { value: 'item_count', label: 'Number of Items' }
];

const operatorOptions = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' }
];

const actionOptions = [
  { value: 'flag', label: 'Flag for Review' },
  { value: 'hold', label: 'Hold Order' },
  { value: 'verify', label: 'Require Verification' },
  { value: 'cancel', label: 'Auto-Cancel' },
  { value: 'none', label: 'Score Adjustment Only' }
];

const emptyRule = {
  name: '',
  description: '',
  is_active: true,
  priority: 50,
  conditions: [{ field: 'order_value', operator: 'greater_than', value: '' }],
  risk_adjustment: 10,
  action: 'flag',
  notification: true,
  shopify_action_type: 'none',
  shopify_action_config: {}
};

export default function CustomRiskRulesManager({ tenantId }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState(emptyRule);
  const [showAI, setShowAI] = useState(false);
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['riskRules', tenantId],
    queryFn: () => base44.entities.RiskRule.filter({ tenant_id: tenantId }),
    enabled: !!tenantId
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.RiskRule.create({ ...data, tenant_id: tenantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riskRules'] });
      toast.success('Risk rule created');
      closeDialog();
    }
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RiskRule.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riskRules'] });
      toast.success('Risk rule updated');
      closeDialog();
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.RiskRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riskRules'] });
      toast.success('Risk rule deleted');
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.RiskRule.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['riskRules'] })
  });

  const openDialog = (rule = null) => {
    if (rule) {
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        description: rule.description || '',
        is_active: rule.is_active,
        priority: rule.priority || 50,
        conditions: rule.conditions || [{ field: 'order_value', operator: 'greater_than', value: '' }],
        risk_adjustment: rule.risk_adjustment || 10,
        action: rule.action || 'flag',
        notification: rule.notification !== false,
        shopify_action_type: rule.shopify_action_type || 'none',
        shopify_action_config: rule.shopify_action_config || {}
      });
    } else {
      setEditingRule(null);
      setFormData(emptyRule);
    }
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingRule(null);
    setFormData(emptyRule);
  };

  const handleAIApplyRule = (ruleData) => {
    setEditingRule(null);
    setFormData({ ...emptyRule, ...ruleData });
    setShowAI(false);
    setIsDialogOpen(true);
  };

  const addCondition = () => {
    setFormData({
      ...formData,
      conditions: [...formData.conditions, { field: 'order_value', operator: 'greater_than', value: '' }]
    });
  };

  const updateCondition = (index, field, value) => {
    const newConditions = [...formData.conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setFormData({ ...formData, conditions: newConditions });
  };

  const removeCondition = (index) => {
    if (formData.conditions.length > 1) {
      setFormData({
        ...formData,
        conditions: formData.conditions.filter((_, i) => i !== index)
      });
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (formData.conditions.some(c => !c.value && c.value !== 0)) {
      toast.error('All conditions must have a value');
      return;
    }

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data: formData });
    } else {
      createRuleMutation.mutate(formData);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-600" />
              Custom Risk Rules
            </CardTitle>
            <CardDescription>
              Define rules to automatically flag or adjust risk scores for orders
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAI(v => !v)}
              className={`gap-2 text-sm ${showAI ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300' : ''}`}
            >
              <Brain className="w-4 h-4" />
              AI Assistant
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openDialog()} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingRule ? 'Edit Rule' : 'Create Risk Rule'}</DialogTitle>
                <DialogDescription>
                  Define conditions that trigger risk adjustments or actions
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Rule Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., High Value First Orders"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What does this rule detect?"
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Conditions (all must match)</Label>
                  {formData.conditions.map((condition, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Select
                        value={condition.field}
                        onValueChange={(v) => updateCondition(index, 'field', v)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={condition.operator}
                        onValueChange={(v) => updateCondition(index, 'operator', v)}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operatorOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        className="flex-1"
                        value={condition.value}
                        onChange={(e) => updateCondition(index, 'value', e.target.value)}
                        placeholder="Value"
                      />

                      {formData.conditions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCondition(index)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addCondition}>
                    <Plus className="w-4 h-4 mr-1" /> Add Condition
                  </Button>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Risk Score Adjustment</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="-50"
                        max="50"
                        value={formData.risk_adjustment}
                        onChange={(e) => setFormData({ ...formData, risk_adjustment: parseInt(e.target.value) || 0 })}
                        className="w-20"
                      />
                      <span className="text-sm text-slate-500">points</span>
                    </div>
                    <p className="text-xs text-slate-400">Positive = increase risk, negative = decrease</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Action</Label>
                    <Select
                      value={formData.action}
                      onValueChange={(v) => setFormData({ ...formData, action: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {actionOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.notification}
                      onCheckedChange={(v) => setFormData({ ...formData, notification: v })}
                    />
                    <Label className="font-normal">Send notification when triggered</Label>
                  </div>
                </div>

                <Separator />

                <ShopifyActionsConfig
                  value={{ 
                    shopify_action_type: formData.shopify_action_type, 
                    shopify_action_config: formData.shopify_action_config 
                  }}
                  onChange={(v) => setFormData({ ...formData, ...v })}
                />
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
            <Shield className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500">No custom risk rules defined</p>
            <p className="text-sm text-slate-400 mb-3">Create rules to automatically detect risky orders</p>
            <Button variant="outline" onClick={() => openDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Rule
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`p-4 rounded-lg border ${rule.is_active ? 'bg-white' : 'bg-slate-50 opacity-60'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${rule.risk_adjustment > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                      <Zap className={`w-4 h-4 ${rule.risk_adjustment > 0 ? 'text-red-600' : 'text-green-600'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.name}</span>
                        <Badge variant="outline" className={rule.risk_adjustment > 0 ? 'text-red-600' : 'text-green-600'}>
                          {rule.risk_adjustment > 0 ? '+' : ''}{rule.risk_adjustment} pts
                        </Badge>
                        {rule.action !== 'none' && (
                          <Badge className="bg-slate-100 text-slate-600 text-xs">
                            {actionOptions.find(a => a.value === rule.action)?.label}
                          </Badge>
                        )}
                        {rule.shopify_action_type && rule.shopify_action_type !== 'none' && (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                            <Store className="w-3 h-3 mr-1" />
                            Shopify
                          </Badge>
                        )}
                      </div>
                      {rule.description && (
                        <p className="text-sm text-slate-500 mt-0.5">{rule.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {rule.conditions?.map((c, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-mono">
                            {fieldOptions.find(f => f.value === c.field)?.label} {c.operator.replace('_', ' ')} {c.value}
                          </Badge>
                        ))}
                      </div>
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}