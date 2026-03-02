/**
 * ORDER SYNC STATUS COMPONENT
 * Shows real-time sync health: last sync, queue depth, webhook status
 * and a manual "Sync Now" button that calls syncShopifyOrders directly.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle, AlertTriangle, Clock, Loader2, Webhook } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function OrderSyncStatus({ tenantId, integrationId, onSynced }) {
  const queryClient = useQueryClient();

  // Load integration for sync health
  const { data: integration } = useQuery({
    queryKey: ['integration-sync-status', integrationId],
    queryFn: async () => {
      if (!integrationId) return null;
      const rows = await base44.entities.PlatformIntegration.filter({ id: integrationId });
      return rows[0] || null;
    },
    enabled: !!integrationId,
    refetchInterval: 30000,
  });

  // Queue depth - pending jobs
  const { data: queueDepth = 0 } = useQuery({
    queryKey: ['queue-depth', tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const items = await base44.entities.WebhookQueue.filter(
        { tenant_id: tenantId, status: 'pending' },
        '-created_date',
        50
      );
      return items.length;
    },
    enabled: !!tenantId,
    refetchInterval: 20000,
  });

  // Sync Now mutation — uses syncShopifyOrders which handles OAuth token decryption
  const syncMutation = useMutation({
    mutationFn: async () => {
      const resp = await base44.functions.invoke('syncShopifyOrders', {
        tenant_id: tenantId,
        days: 30,
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      return resp.data;
    },
    onSuccess: (data) => {
      const created = data.createdCount ?? data.created ?? 0;
      const updated = data.updatedCount ?? data.updated ?? 0;
      toast.success(`Sync complete: ${created} new, ${updated} updated`);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['integration-sync-status'] });
      onSynced?.();
    },
    onError: (err) => {
      // Token missing = need re-auth, guide the user
      if (err.message?.toLowerCase().includes('token') || err.message?.toLowerCase().includes('reconnect')) {
        toast.error('No Shopify token found. Please reconnect your store via Integrations → re-authenticate.', { duration: 6000 });
      } else {
        toast.error(`Sync failed: ${err.message}`);
      }
    },
  });

  const lastSyncAt = integration?.last_sync_at ? new Date(integration.last_sync_at) : null;
  const syncStatus = integration?.last_sync_status;
  const webhookCount = Object.keys(integration?.webhook_endpoints || {}).length;

  const statusColor =
    syncStatus === 'success' ? 'text-emerald-400' :
    syncStatus === 'partial'  ? 'text-amber-400' :
    syncStatus === 'failed'   ? 'text-red-400' :
    'text-slate-400';

  const StatusIcon =
    syncStatus === 'success' ? CheckCircle :
    syncStatus === 'failed'  ? AlertTriangle :
    Clock;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Last sync time */}
        {lastSyncAt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`flex items-center gap-1 text-xs ${statusColor}`}>
                <StatusIcon className="w-3 h-3" />
                {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Last sync: {lastSyncAt.toLocaleString()}</p>
              <p>Status: {syncStatus || 'unknown'}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Webhook badge */}
        {webhookCount > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 gap-1">
                <Webhook className="w-3 h-3" />
                {webhookCount} webhooks
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Webhooks active — orders sync in real-time</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 gap-1">
                <AlertTriangle className="w-3 h-3" />
                No webhooks
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Webhooks not registered — use Sync Now to pull orders manually</TooltipContent>
          </Tooltip>
        )}

        {/* Queue depth */}
        {queueDepth > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {queueDepth} queued
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{queueDepth} webhook events pending processing</TooltipContent>
          </Tooltip>
        )}

        {/* Sync Now button */}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 border-white/10 text-slate-300 hover:text-white hover:bg-white/5"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !tenantId}
        >
          {syncMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>
    </TooltipProvider>
  );
}