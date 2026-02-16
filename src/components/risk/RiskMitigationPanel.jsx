import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, 
  ShieldCheck, 
  Pause, 
  Ban, 
  UserCheck, 
  Truck,
  MessageSquare,
  Loader2,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

const actionConfig = {
  verify_identity: {
    icon: UserCheck,
    label: 'Request ID Verification',
    description: 'Ask customer to verify their identity before shipping',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  hold_shipment: {
    icon: Pause,
    label: 'Hold Shipment',
    description: 'Delay shipping until manual review is complete',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200'
  },
  require_signature: {
    icon: Truck,
    label: 'Require Signature',
    description: 'Upgrade to signature-required delivery',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  contact_customer: {
    icon: MessageSquare,
    label: 'Contact Customer',
    description: 'Reach out to verify order details',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200'
  },
  cancel_order: {
    icon: Ban,
    label: 'Cancel Order',
    description: 'Cancel and refund this order',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200'
  },
  approve: {
    icon: ShieldCheck,
    label: 'Approve Order',
    description: 'Mark as reviewed and proceed normally',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  }
};

export default function RiskMitigationPanel({ order, tenantId, onActionTaken }) {
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [actionTaken, setActionTaken] = useState(order?.recommended_action || null);

  const getAISuggestions = async () => {
    setLoadingAI(true);
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this e-commerce order for fraud/risk and provide mitigation recommendations:

Order Details:
- Order Number: ${order.order_number}
- Total: $${order.total_revenue?.toFixed(2)}
- Customer: ${order.customer_name} (${order.customer_email})
- First Order: ${order.is_first_order ? 'Yes' : 'No'}
- Risk Scores: Fraud=${order.fraud_score || 0}, Return=${order.return_score || 0}, Chargeback=${order.chargeback_score || 0}
- Risk Level: ${order.risk_level || 'unknown'}
- Risk Reasons: ${order.risk_reasons?.join(', ') || 'None specified'}
- Billing Address: ${JSON.stringify(order.billing_address || {})}
- Shipping Address: ${JSON.stringify(order.shipping_address || {})}
- Discount Applied: $${order.discount_total || 0}

Provide 2-3 specific, actionable recommendations based on the risk profile. Be concise.`,
        response_json_schema: {
          type: "object",
          properties: {
            risk_summary: { type: "string", description: "1-2 sentence summary of the risk" },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  action: { type: "string", enum: ["verify_identity", "hold_shipment", "require_signature", "contact_customer", "cancel_order", "approve"] },
                  priority: { type: "string", enum: ["recommended", "optional", "if_needed"] },
                  reason: { type: "string" }
                }
              }
            },
            additional_notes: { type: "string" }
          }
        }
      });
      setAiSuggestions(response);
    } catch (error) {
      toast.error('Failed to get AI suggestions');
      console.error(error);
    } finally {
      setLoadingAI(false);
    }
  };

  const takeActionMutation = useMutation({
    mutationFn: async (action) => {
      // Update order with the action taken
      await base44.entities.Order.update(order.id, {
        recommended_action: action,
        notes: `${order.notes || ''}\n[${new Date().toISOString()}] Risk action taken: ${action}`
      });
      
      // Create alert for tracking
      await base44.entities.Alert.create({
        tenant_id: tenantId,
        type: 'high_risk_order',
        severity: action === 'cancel_order' ? 'critical' : 'medium',
        title: `Risk action: ${actionConfig[action]?.label || action}`,
        message: `Action "${action}" taken on order ${order.order_number}`,
        entity_type: 'order',
        entity_id: order.id,
        status: 'action_taken'
      });

      return action;
    },
    onSuccess: (action) => {
      setActionTaken(action);
      toast.success(`Action "${actionConfig[action]?.label}" applied to order`);
      onActionTaken?.(action);
    },
    onError: (error) => {
      toast.error('Failed to apply action');
    }
  });

  const priorityBadge = (priority) => {
    const colors = {
      recommended: 'bg-green-100 text-green-700',
      optional: 'bg-slate-100 text-slate-700',
      if_needed: 'bg-yellow-100 text-yellow-700'
    };
    return <Badge className={`${colors[priority]} text-xs`}>{priority}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Risk Mitigation
          </CardTitle>
          {!aiSuggestions && (
            <Button
              size="sm"
              variant="outline"
              onClick={getAISuggestions}
              disabled={loadingAI}
              className="gap-2"
            >
              {loadingAI ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loadingAI ? 'Analyzing...' : 'Get AI Suggestions'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI Suggestions */}
        {aiSuggestions && (
          <div className="space-y-3">
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-purple-800">AI Analysis</span>
                <Badge className="bg-purple-100 text-purple-700 text-xs">
                  {aiSuggestions.confidence} confidence
                </Badge>
              </div>
              <p className="text-sm text-purple-700">{aiSuggestions.risk_summary}</p>
            </div>

            <div className="space-y-2">
              {aiSuggestions.recommendations?.map((rec, idx) => {
                const config = actionConfig[rec.action];
                if (!config) return null;
                const Icon = config.icon;
                const isSelected = actionTaken === rec.action;
                
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${config.borderColor} ${config.bgColor} ${
                      isSelected ? 'ring-2 ring-offset-1 ring-slate-400' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Icon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${config.color}`}>{config.label}</span>
                            {priorityBadge(rec.priority)}
                          </div>
                          <p className="text-sm text-slate-600 mt-0.5">{rec.reason}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => takeActionMutation.mutate(rec.action)}
                        disabled={takeActionMutation.isPending || isSelected}
                        className="shrink-0"
                      >
                        {isSelected ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Applied
                          </>
                        ) : (
                          'Apply'
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {aiSuggestions.additional_notes && (
              <p className="text-xs text-slate-500 italic">{aiSuggestions.additional_notes}</p>
            )}
          </div>
        )}

        {/* Quick Actions (always visible) */}
        {!aiSuggestions && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {['approve', 'hold_shipment', 'verify_identity', 'contact_customer'].map((action) => {
                const config = actionConfig[action];
                const Icon = config.icon;
                const isSelected = actionTaken === action;
                
                return (
                  <Button
                    key={action}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className={`justify-start ${isSelected ? '' : config.color}`}
                    onClick={() => takeActionMutation.mutate(action)}
                    disabled={takeActionMutation.isPending || isSelected}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {config.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        {/* Current Status */}
        {actionTaken && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500">Action taken:</span>
              <Badge variant="outline">{actionConfig[actionTaken]?.label || actionTaken}</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}