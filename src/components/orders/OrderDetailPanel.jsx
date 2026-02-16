import React, { useState } from 'react';
import { format } from 'date-fns';
import { X, AlertTriangle, CheckCircle, Package, Truck, CreditCard, RotateCcw, Percent, MapPin, RefreshCw, Loader2, Ban, Eye, FileSignature, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { base44 } from '@/api/base44Client';
import RiskAnalysisCard from './RiskAnalysisCard';
import RiskBreakdownCard from '../risk/RiskBreakdownCard';
import RiskMitigationPanel from '../risk/RiskMitigationPanel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const actionConfig = {
  cancel: { 
    icon: Ban, 
    label: 'Cancel Order', 
    color: 'bg-red-600 hover:bg-red-700',
    description: 'This will mark the order as cancelled. This action cannot be undone.',
    newStatus: 'cancelled'
  },
  hold: { 
    icon: Pause, 
    label: 'Hold Shipment', 
    color: 'bg-amber-600 hover:bg-amber-700',
    description: 'This will put the order on hold pending review.',
    newStatus: 'pending',
    addTag: 'on-hold'
  },
  verify: { 
    icon: Eye, 
    label: 'Mark for Verification', 
    color: 'bg-blue-600 hover:bg-blue-700',
    description: 'This will flag the order for customer verification.',
    addTag: 'needs-verification'
  },
  signature: { 
    icon: FileSignature, 
    label: 'Require Signature', 
    color: 'bg-indigo-600 hover:bg-indigo-700',
    description: 'This will add a signature requirement note to the order.',
    addTag: 'signature-required'
  },
  release: {
    icon: Play,
    label: 'Release Order',
    color: 'bg-emerald-600 hover:bg-emerald-700',
    description: 'This will release the order from hold and clear risk flags.',
    removeTag: 'on-hold'
  }
};

export default function OrderDetailPanel({ order, onClose, onOrderUpdated }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  if (!order) return null;

  const isProfitable = (order.net_profit || 0) >= 0;

  const profitBreakdown = [
    { label: 'Revenue', value: order.total_revenue, type: 'positive' },
    { label: 'Cost of Goods', value: -(order.total_cogs || 0), type: 'negative' },
    { label: 'Payment Fees', value: -(order.payment_fee || 0), type: 'negative' },
    { label: 'Platform Fees', value: -(order.platform_fee || 0), type: 'negative' },
    { label: 'Shipping Cost', value: -(order.shipping_cost || 0), type: 'negative' },
    { label: 'Discounts', value: -(order.discount_total || 0), type: 'negative' },
    { label: 'Refunds', value: -(order.refund_amount || 0), type: 'negative' },
  ].filter(item => item.value !== 0);

  const handleAnalyzeRisk = async () => {
    setAnalyzing(true);
    try {
      const result = await base44.functions.invoke('analyzeOrderRisk', {
        order_id: order.id,
        tenant_id: order.tenant_id
      });
      if (result.data?.success && onOrderUpdated) {
        onOrderUpdated();
      }
    } catch (error) {
      console.error('Risk analysis failed:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAction = async (actionType) => {
    setActionLoading(true);
    try {
      const config = actionConfig[actionType];
      const currentTags = order.tags || [];
      let newTags = [...currentTags];
      
      // Handle tag modifications
      if (config.addTag && !newTags.includes(config.addTag)) {
        newTags.push(config.addTag);
      }
      if (config.removeTag) {
        newTags = newTags.filter(t => t !== config.removeTag);
      }
      
      // Build update object
      const updateData = { tags: newTags };
      if (config.newStatus) {
        updateData.status = config.newStatus;
      }
      
      // Clear recommended action after taking it
      updateData.recommended_action = 'none';
      
      // Update the order
      await base44.entities.Order.update(order.id, updateData);
      
      // Log the action
      const user = await base44.auth.me();
      await base44.entities.AuditLog.create({
        tenant_id: order.tenant_id,
        actor_email: user?.email || 'unknown',
        actor_role: user?.role || 'user',
        action: `risk_action_${actionType}`,
        entity_type: 'order',
        entity_id: order.id,
        old_value: { 
          status: order.status, 
          tags: order.tags,
          recommended_action: order.recommended_action 
        },
        new_value: updateData,
        metadata: {
          order_number: order.order_number,
          risk_level: order.risk_level,
          fraud_score: order.fraud_score
        }
      });
      
      if (onOrderUpdated) {
        onOrderUpdated();
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const isOnHold = (order.tags || []).includes('on-hold');
  const needsVerification = (order.tags || []).includes('needs-verification');
  const signatureRequired = (order.tags || []).includes('signature-required');

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 border-l border-slate-200">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Order #{order.order_number}</h2>
            <p className="text-sm text-slate-500">
              {order.order_date ? format(new Date(order.order_date), 'MMMM d, yyyy h:mm a') : '-'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Profit Summary */}
            <div className={`p-4 rounded-xl ${isProfitable ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-sm font-medium text-slate-500 mb-1">Net Profit</p>
              <p className={`text-3xl font-bold ${isProfitable ? 'text-emerald-700' : 'text-red-700'}`}>
                {isProfitable ? '+' : ''}${order.net_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className={`text-sm mt-1 ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                {order.margin_pct?.toFixed(1)}% margin • {order.confidence} confidence
              </p>
            </div>

            {/* Status Tags */}
            {(isOnHold || needsVerification || signatureRequired) && (
              <div className="flex flex-wrap gap-2">
                {isOnHold && (
                  <Badge className="bg-amber-100 text-amber-700">
                    <Pause className="w-3 h-3 mr-1" /> On Hold
                  </Badge>
                )}
                {needsVerification && (
                  <Badge className="bg-blue-100 text-blue-700">
                    <Eye className="w-3 h-3 mr-1" /> Needs Verification
                  </Badge>
                )}
                {signatureRequired && (
                  <Badge className="bg-indigo-100 text-indigo-700">
                    <FileSignature className="w-3 h-3 mr-1" /> Signature Required
                  </Badge>
                )}
              </div>
            )}

            {/* Risk Analysis Tabs */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900">Risk Analysis</h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAnalyzeRisk}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-1" />
                  )}
                  {analyzing ? 'Analyzing...' : 'Re-analyze'}
                </Button>
              </div>
              
              <Tabs defaultValue="breakdown" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-3">
                  <TabsTrigger value="breakdown">Risk Breakdown</TabsTrigger>
                  <TabsTrigger value="mitigation">Mitigation</TabsTrigger>
                </TabsList>
                
                <TabsContent value="breakdown" className="mt-0">
                  <RiskBreakdownCard order={order} />
                </TabsContent>
                
                <TabsContent value="mitigation" className="mt-0">
                  <RiskMitigationPanel 
                    order={order} 
                    tenantId={order.tenant_id}
                    onActionTaken={() => onOrderUpdated?.()}
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* Action Buttons */}
            {(order.recommended_action && order.recommended_action !== 'none' || isOnHold) && (
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900">Quick Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {order.recommended_action === 'cancel' && order.status !== 'cancelled' && (
                    <Button 
                      size="sm" 
                      className={actionConfig.cancel.color}
                      onClick={() => setConfirmAction('cancel')}
                      disabled={actionLoading}
                    >
                      <Ban className="w-4 h-4 mr-1" /> Cancel Order
                    </Button>
                  )}
                  {order.recommended_action === 'hold' && !isOnHold && (
                    <Button 
                      size="sm" 
                      className={actionConfig.hold.color}
                      onClick={() => setConfirmAction('hold')}
                      disabled={actionLoading}
                    >
                      <Pause className="w-4 h-4 mr-1" /> Hold Shipment
                    </Button>
                  )}
                  {order.recommended_action === 'verify' && !needsVerification && (
                    <Button 
                      size="sm" 
                      className={actionConfig.verify.color}
                      onClick={() => setConfirmAction('verify')}
                      disabled={actionLoading}
                    >
                      <Eye className="w-4 h-4 mr-1" /> Mark for Verification
                    </Button>
                  )}
                  {order.recommended_action === 'signature' && !signatureRequired && (
                    <Button 
                      size="sm" 
                      className={actionConfig.signature.color}
                      onClick={() => setConfirmAction('signature')}
                      disabled={actionLoading}
                    >
                      <FileSignature className="w-4 h-4 mr-1" /> Require Signature
                    </Button>
                  )}
                  {isOnHold && (
                    <Button 
                      size="sm" 
                      className={actionConfig.release.color}
                      onClick={() => setConfirmAction('release')}
                      disabled={actionLoading}
                    >
                      <Play className="w-4 h-4 mr-1" /> Release Order
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Profit Breakdown */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Profit Breakdown</h3>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                {profitBreakdown.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-slate-600">{item.label}</span>
                    <span className={`font-medium ${item.value >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                      {item.value >= 0 ? '+' : ''}${Math.abs(item.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Net Profit</span>
                  <span className={isProfitable ? 'text-emerald-600' : 'text-red-600'}>
                    {isProfitable ? '+' : ''}${order.net_profit?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Info */}
            <div>
              <h3 className="font-semibold text-slate-900 mb-3">Customer</h3>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="font-medium text-slate-900">{order.customer_name || 'Guest'}</p>
                <p className="text-sm text-slate-500">{order.customer_email}</p>
                {order.is_first_order && (
                  <Badge className="mt-2 bg-blue-100 text-blue-700 hover:bg-blue-100">
                    First Order
                  </Badge>
                )}
              </div>
            </div>

            {/* Addresses */}
            {(order.billing_address || order.shipping_address) && (
              <div className="grid grid-cols-2 gap-4">
                {order.billing_address && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-500 mb-2">Billing</h4>
                    <div className="text-sm text-slate-700">
                      <p>{order.billing_address.city}, {order.billing_address.province}</p>
                      <p>{order.billing_address.country}</p>
                    </div>
                  </div>
                )}
                {order.shipping_address && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-500 mb-2">Shipping</h4>
                    <div className="text-sm text-slate-700">
                      <p>{order.shipping_address.city}, {order.shipping_address.province}</p>
                      <p>{order.shipping_address.country}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Discount Codes */}
            {order.discount_codes?.length > 0 && (
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Discounts Applied</h3>
                <div className="flex flex-wrap gap-2">
                  {order.discount_codes.map((code, i) => (
                    <Badge key={i} variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                      <Percent className="w-3 h-3 mr-1" />
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction && actionConfig[confirmAction]?.label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction && actionConfig[confirmAction]?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleAction(confirmAction)}
              disabled={actionLoading}
              className={confirmAction && actionConfig[confirmAction]?.color}
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}