import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Store,
  XCircle,
  Tag,
  Pause,
  CheckCircle,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const actionTypeConfig = {
  cancel_order: { icon: XCircle, label: 'Cancel Order', color: 'text-red-600 bg-red-100', destructive: true },
  add_tag: { icon: Tag, label: 'Add Tag', color: 'text-blue-600 bg-blue-100' },
  hold_fulfillment: { icon: Pause, label: 'Hold Fulfillment', color: 'text-amber-600 bg-amber-100' }
};

export default function PendingShopifyActionsPanel({ tenantId }) {
  const queryClient = useQueryClient();

  const { data: pendingActions = [], isLoading } = useQuery({
    queryKey: ['pendingShopifyActions', tenantId],
    queryFn: () => base44.entities.PendingShopifyAction.filter({ 
      tenant_id: tenantId, 
      status: 'pending_confirmation' 
    }, '-created_date'),
    enabled: !!tenantId,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const executeMutation = useMutation({
    mutationFn: ({ actionId, action }) => base44.functions.invoke('shopifyOrderActions', {
      action,
      tenant_id: tenantId,
      pending_action_id: actionId
    }),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['pendingShopifyActions'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success(action === 'approve' ? 'Action executed successfully' : 'Action rejected');
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`);
    }
  });

  if (isLoading || pendingActions.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Store className="w-5 h-5 text-amber-600" />
          Pending Shopify Actions
          <Badge className="bg-amber-500 text-white">{pendingActions.length}</Badge>
        </CardTitle>
        <CardDescription>
          These actions require your approval before executing in Shopify
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pendingActions.map((action) => {
          const config = actionTypeConfig[action.action_type] || actionTypeConfig.add_tag;
          const Icon = config.icon;

          return (
            <div 
              key={action.id} 
              className="flex items-start justify-between p-3 bg-white rounded-lg border shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${config.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{config.label}</span>
                    <Link 
                      to={`${createPageUrl('Orders')}?id=${action.order_id}`}
                      className="text-sm text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      Order {action.order_number}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{action.reason}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {action.source_type === 'alert_rule' ? 'Profit Alert' : 'Risk Rule'}: {action.source_rule_name}
                    </Badge>
                    {action.action_config?.tag_name && (
                      <Badge variant="outline" className="text-xs">
                        Tag: {action.action_config.tag_name}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {format(new Date(action.created_date), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => executeMutation.mutate({ actionId: action.id, action: 'reject' })}
                  disabled={executeMutation.isPending}
                >
                  <X className="w-4 h-4 mr-1" />
                  Reject
                </Button>

                {config.destructive ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        size="sm" 
                        className="bg-red-600 hover:bg-red-700"
                        disabled={executeMutation.isPending}
                      >
                        {executeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <CheckCircle className="w-4 h-4 mr-1" />
                        )}
                        Approve
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-500" />
                          Confirm Order Cancellation
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will cancel order <strong>{action.order_number}</strong> in Shopify. 
                          The customer will be notified. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => executeMutation.mutate({ actionId: action.id, action: 'approve' })}
                        >
                          Yes, Cancel Order
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => executeMutation.mutate({ actionId: action.id, action: 'approve' })}
                    disabled={executeMutation.isPending}
                  >
                    {executeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-1" />
                    )}
                    Approve
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}