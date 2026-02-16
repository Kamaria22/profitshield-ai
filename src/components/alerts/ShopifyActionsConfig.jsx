import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Store, XCircle, Tag, Pause, AlertTriangle } from 'lucide-react';

const shopifyActionTypes = [
  { value: 'none', label: 'No Shopify Action', icon: null, description: 'Only execute internal actions' },
  { value: 'add_tag', label: 'Add Tag to Order', icon: Tag, description: 'Add a custom tag in Shopify' },
  { value: 'hold_fulfillment', label: 'Hold Fulfillment', icon: Pause, description: 'Add hold tag to prevent shipping' },
  { value: 'cancel_order', label: 'Cancel Order', icon: XCircle, description: 'Cancel the order in Shopify (destructive)', destructive: true }
];

export default function ShopifyActionsConfig({ value, onChange }) {
  const actionType = value?.shopify_action_type || 'none';
  const actionConfig = value?.shopify_action_config || {};

  const handleActionTypeChange = (type) => {
    const config = type === 'add_tag' ? { tag_name: 'Needs Review', require_confirmation: true } :
                   type === 'hold_fulfillment' ? { tag_name: 'HOLD-FULFILLMENT', require_confirmation: true } :
                   type === 'cancel_order' ? { cancel_reason: 'fraud', require_confirmation: true } :
                   { require_confirmation: true };
    
    onChange({
      shopify_action_type: type,
      shopify_action_config: config
    });
  };

  const handleConfigChange = (key, val) => {
    onChange({
      shopify_action_type: actionType,
      shopify_action_config: { ...actionConfig, [key]: val }
    });
  };

  const selectedAction = shopifyActionTypes.find(a => a.value === actionType);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Store className="w-4 h-4 text-slate-500" />
        <Label>Shopify Action</Label>
      </div>

      <Select value={actionType} onValueChange={handleActionTypeChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select Shopify action" />
        </SelectTrigger>
        <SelectContent>
          {shopifyActionTypes.map((action) => (
            <SelectItem key={action.value} value={action.value}>
              <div className="flex items-center gap-2">
                {action.icon && <action.icon className={`w-4 h-4 ${action.destructive ? 'text-red-500' : ''}`} />}
                <span>{action.label}</span>
                {action.destructive && (
                  <Badge variant="outline" className="text-red-500 border-red-200 text-xs ml-2">Destructive</Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedAction?.description && (
        <p className="text-xs text-slate-500">{selectedAction.description}</p>
      )}

      {actionType === 'add_tag' && (
        <div className="space-y-2 pl-4 border-l-2 border-emerald-200">
          <Label className="text-sm">Tag Name</Label>
          <Input
            value={actionConfig.tag_name || ''}
            onChange={(e) => handleConfigChange('tag_name', e.target.value)}
            placeholder="e.g., Needs Review"
          />
        </div>
      )}

      {actionType === 'hold_fulfillment' && (
        <div className="space-y-2 pl-4 border-l-2 border-amber-200">
          <Label className="text-sm">Hold Tag</Label>
          <Input
            value={actionConfig.tag_name || 'HOLD-FULFILLMENT'}
            onChange={(e) => handleConfigChange('tag_name', e.target.value)}
            placeholder="HOLD-FULFILLMENT"
          />
        </div>
      )}

      {actionType === 'cancel_order' && (
        <div className="space-y-3 pl-4 border-l-2 border-red-200">
          <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700">This action will cancel the order in Shopify</span>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Cancel Reason</Label>
            <Select 
              value={actionConfig.cancel_reason || 'other'} 
              onValueChange={(v) => handleConfigChange('cancel_reason', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fraud">Fraudulent order</SelectItem>
                <SelectItem value="customer">Customer changed/cancelled order</SelectItem>
                <SelectItem value="inventory">Items unavailable</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {actionType !== 'none' && (
        <div className="flex items-center gap-3 pt-2">
          <Switch
            checked={actionConfig.require_confirmation !== false}
            onCheckedChange={(v) => handleConfigChange('require_confirmation', v)}
          />
          <div>
            <Label className="font-normal">Require confirmation before executing</Label>
            <p className="text-xs text-slate-500">
              {actionConfig.require_confirmation !== false 
                ? 'Action will be queued for manual approval' 
                : 'Action will execute automatically'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}