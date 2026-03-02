import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Layers, RefreshCw, AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

export default function QueueObservabilityPanel({ tenantId }) {
  const { data: queueItems = [], refetch, isLoading } = useQuery({
    queryKey: ['webhookQueue', tenantId],
    queryFn: () => base44.entities.WebhookQueue.filter(
      tenantId ? { tenant_id: tenantId } : {},
      '-created_date',
      200
    ),
    refetchInterval: 15000,
  });

  const metrics = React.useMemo(() => {
    const total = queueItems.length;
    const pending = queueItems.filter(j => j.status === 'pending').length;
    const processing = queueItems.filter(j => j.status === 'processing').length;
    const complete = queueItems.filter(j => j.status === 'complete').length;
    const failed = queueItems.filter(j => j.status === 'failed').length;
    const deadLetter = queueItems.filter(j => j.status === 'dead_letter').length;
    const retries = queueItems.filter(j => (j.retry_count || 0) > 0).length;

    const durations = queueItems
      .filter(j => j.processing_duration_ms)
      .map(j => j.processing_duration_ms)
      .sort((a, b) => a - b);
    const p95 = durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;
    const p50 = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;

    const retryRate = total > 0 ? ((retries / total) * 100).toFixed(1) : '0.0';
    const errorRate = total > 0 ? (((failed + deadLetter) / total) * 100).toFixed(1) : '0.0';

    return { total, pending, processing, complete, failed, deadLetter, retries, p95, p50, avgDuration, retryRate, errorRate };
  }, [queueItems]);

  // Last security events from recent dead-letters
  const recentDeadLetter = queueItems.filter(j => j.status === 'dead_letter').slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Layers className="w-4 h-4" /> Webhook Queue Observability
        </h3>
        <button onClick={() => refetch()} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Depth metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Queue Depth', value: metrics.pending + metrics.processing, color: 'text-blue-600', icon: Clock },
          { label: 'Processing Rate', value: `${metrics.complete}`, sub: 'completed', color: 'text-emerald-600', icon: TrendingUp },
          { label: 'Retry Rate', value: `${metrics.retryRate}%`, color: metrics.retryRate > 10 ? 'text-amber-600' : 'text-slate-700', icon: RefreshCw },
          { label: 'Dead Letter', value: metrics.deadLetter, color: metrics.deadLetter > 0 ? 'text-red-600' : 'text-slate-700', icon: AlertTriangle },
        ].map(m => (
          <div key={m.label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
            {m.sub && <p className="text-xs text-slate-400">{m.sub}</p>}
          </div>
        ))}
      </div>

      {/* Latency */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'P50 Latency', value: `${metrics.p50}ms` },
          { label: 'P95 Latency', value: `${metrics.p95}ms` },
          { label: 'Avg Latency', value: `${metrics.avgDuration}ms` },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-lg p-2 border text-center">
            <p className="text-xs text-slate-400">{m.label}</p>
            <p className="text-sm font-semibold text-slate-800">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Status breakdown */}
      <div className="space-y-1">
        {[
          { label: 'Complete', value: metrics.complete, color: 'bg-emerald-500', total: metrics.total },
          { label: 'Pending', value: metrics.pending, color: 'bg-blue-400', total: metrics.total },
          { label: 'Failed (retry)', value: metrics.failed, color: 'bg-amber-400', total: metrics.total },
          { label: 'Dead Letter', value: metrics.deadLetter, color: 'bg-red-500', total: metrics.total },
        ].map(row => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-28">{row.label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${row.color} rounded-full transition-all`}
                style={{ width: row.total > 0 ? `${(row.value / row.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-xs font-medium text-slate-700 w-6 text-right">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Dead letter items */}
      {recentDeadLetter.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Dead Letter Queue
          </p>
          {recentDeadLetter.map(j => (
            <div key={j.id} className="p-2 bg-red-50 rounded text-xs border border-red-100">
              <p className="font-mono text-slate-600">{j.event_type} — {j.error_message?.slice(0, 80)}</p>
              <p className="text-slate-400 mt-0.5">Retries: {j.retry_count} | Last: {j.last_attempt_at ? new Date(j.last_attempt_at).toLocaleTimeString() : 'N/A'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}