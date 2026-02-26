import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import HolographicCard from '@/components/quantum/HolographicCard';
import { Badge } from '@/components/ui/badge';
import { Webhook, Activity, CheckCircle, XCircle, Clock } from 'lucide-react';

/**
 * WEBHOOK MONITOR
 * Real-time webhook event tracking and debugging
 */
export default function WebhookMonitor({ integrationId }) {
  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks', integrationId],
    queryFn: async () => {
      const response = await base44.functions.invoke('universalPlatformDetector', {
        action: 'list_webhooks',
        integration_id: integrationId
      });
      return response.data?.data?.webhooks || [];
    },
    enabled: !!integrationId,
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: recentEvents = [] } = useQuery({
    queryKey: ['webhook-events', integrationId],
    queryFn: async () => {
      return await base44.entities.WebhookEvent.filter(
        { integration_id: integrationId },
        '-created_date',
        20
      );
    },
    enabled: !!integrationId,
    refetchInterval: 10000
  });

  if (isLoading) {
    return (
      <HolographicCard className="p-6">
        <div className="flex items-center justify-center h-40">
          <Activity className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      </HolographicCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Registered Webhooks */}
      <HolographicCard glow scanline className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Webhook className="w-6 h-6 text-cyan-400" />
          <h3 className="text-xl font-bold text-cyan-400">Registered Webhooks</h3>
          <Badge className="ml-auto bg-cyan-500/20 text-cyan-400">
            {webhooks.length} Active
          </Badge>
        </div>

        {webhooks.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No webhooks registered</p>
        ) : (
          <div className="space-y-2">
            {webhooks.map((webhook) => (
              <div
                key={webhook.webhook_id}
                className="flex items-center justify-between p-3 bg-slate-800/20 rounded-lg border border-cyan-500/20"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="font-medium text-white">{webhook.topic}</p>
                    <p className="text-xs text-slate-500">{webhook.webhook_id}</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                  {webhook.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </HolographicCard>

      {/* Recent Events */}
      <HolographicCard glow className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Activity className="w-6 h-6 text-cyan-400" />
          <h3 className="text-xl font-bold text-cyan-400">Recent Events</h3>
        </div>

        {recentEvents.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No events yet</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 bg-slate-800/20 rounded-lg border border-cyan-500/20"
              >
                {event.status === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                ) : event.status === 'failed' ? (
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white truncate">{event.topic}</p>
                    <Badge 
                      variant="outline" 
                      className={
                        event.status === 'success' 
                          ? 'border-emerald-500/30 text-emerald-400' 
                          : event.status === 'failed'
                          ? 'border-red-500/30 text-red-400'
                          : 'border-amber-500/30 text-amber-400'
                      }
                    >
                      {event.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(event.created_date).toLocaleString()}
                  </p>
                  {event.error_message && (
                    <p className="text-xs text-red-400 mt-1">{event.error_message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </HolographicCard>
    </div>
  );
}