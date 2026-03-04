import React from 'react';
import { GuardianErrorBoundary } from '@/components/FrontendGuardian';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  DollarSign, 
  Gift, 
  ShieldAlert,
  Loader2,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';

const actionIcons = {
  ai_auto_price_proposal: DollarSign,
  ai_auto_discount_created: Gift,
  ai_auto_leak_detection: ShieldAlert
};

const actionColors = {
  ai_auto_price_proposal: 'bg-blue-100 text-blue-700 border-blue-200',
  ai_auto_discount_created: 'bg-purple-100 text-purple-700 border-purple-200',
  ai_auto_leak_detection: 'bg-amber-100 text-amber-700 border-amber-200'
};

function AIAutoActionsPanelInner({ tenantId }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['aiAutoActions', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiAutoActions', {
        tenant_id: tenantId,
        action: 'get_pending'
      });
      return response.data?.actions || [];
    },
    enabled: !!tenantId,
    refetchInterval: 30000
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, action_id }) => {
      const response = await base44.functions.invoke('aiAutoActions', {
        tenant_id: tenantId,
        action,
        action_id
      });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data, variables) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['aiAutoActions'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const pendingActions = data || [];

  if (!tenantId || pendingActions.length === 0) return null;

  return (
    <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="w-5 h-5" />
          AI Auto-Actions
          <Badge className="ml-auto bg-white/20 text-white">
            {pendingActions.length} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm text-slate-600 mb-3">
          ProfitShield AI has taken these actions based on high-confidence recommendations. 
          Review and confirm or rollback.
        </p>

        <AnimatePresence>
          {pendingActions.map((action, i) => {
            const Icon = actionIcons[action.action] || Bot;
            const colorClass = actionColors[action.action] || 'bg-slate-100 text-slate-700';
            
            return (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: i * 0.05 }}
                className={`p-3 rounded-lg border ${colorClass}`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-white/50 rounded-lg">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm">{action.description}</p>
                    </div>
                    <p className="text-xs opacity-80 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(action.created_date), 'MMM d, h:mm a')}
                    </p>
                    
                    {action.changes && (
                      <div className="mt-2 p-2 bg-white/50 rounded text-xs space-y-1">
                        {action.changes.product_name && (
                          <p><strong>Product:</strong> {action.changes.product_name}</p>
                        )}
                        {action.changes.discount_code && (
                          <p><strong>Discount Code:</strong> {action.changes.discount_code} ({action.changes.value}% off)</p>
                        )}
                        {action.changes.leak_type && (
                          <p><strong>Leak Type:</strong> {action.changes.leak_type}</p>
                        )}
                        {action.changes.expected_impact && (
                          <p><strong>Expected Impact:</strong> {action.changes.expected_impact}</p>
                        )}
                        {action.changes.estimated_savings && (
                          <p><strong>Estimated Savings:</strong> {action.changes.estimated_savings}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/30">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 bg-white/50 hover:bg-emerald-100 text-emerald-700 border-emerald-300"
                    onClick={() => actionMutation.mutate({ action: 'confirm', action_id: action.id })}
                    disabled={actionMutation.isPending}
                  >
                    {actionMutation.isPending ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                    )}
                    Confirm
                  </Button>
                  
                  {action.auto_action_type === 'discount_creation' || action.auto_action_type === 'price_update' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 bg-white/50 hover:bg-red-100 text-red-700 border-red-300"
                      onClick={() => actionMutation.mutate({ action: 'rollback', action_id: action.id })}
                      disabled={actionMutation.isPending}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Rollback
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 bg-white/50 hover:bg-slate-100 text-slate-700 border-slate-300"
                      onClick={() => actionMutation.mutate({ action: 'dismiss', action_id: action.id })}
                      disabled={actionMutation.isPending}
                    >
                      <XCircle className="w-3 h-3 mr-1" />
                      Dismiss
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div className="text-xs text-slate-500 text-center pt-2 border-t border-slate-200">
          <AlertTriangle className="w-3 h-3 inline mr-1" />
          Auto-actions are based on AI analysis. Always review before confirming.
        </div>
      </CardContent>
    </Card>
  );
}