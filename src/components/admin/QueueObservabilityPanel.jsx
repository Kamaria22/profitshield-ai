import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Layers, RefreshCw, AlertTriangle, TrendingUp, Clock,
  ChevronDown, ChevronRight, RotateCcw, Trash2, Play
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLE = {
  complete:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  pending:     'bg-blue-500/15 text-blue-400 border-blue-500/20',
  processing:  'bg-violet-500/15 text-violet-400 border-violet-500/20',
  failed:      'bg-amber-500/15 text-amber-400 border-amber-500/20',
  dead_letter: 'bg-red-500/15 text-red-400 border-red-500/20',
};

function DeadLetterRow({ job, onRetry, onDiscard, retrying, discarding }) {
  const [expanded, setExpanded] = useState(false);
  const isDiscarded = job.error_message?.includes('[DISCARDED');

  return (
    <div className={`rounded-lg border text-xs ${isDiscarded ? 'border-slate-700 bg-slate-800/30 opacity-60' : 'border-red-500/20 bg-red-500/5'}`}>
      <div
        className="flex items-center gap-2 p-2 cursor-pointer"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />}
        <span className="font-mono text-slate-300 flex-1 truncate">{job.event_type}</span>
        <span className="text-slate-500 flex-shrink-0">×{job.retry_count || 0} retries</span>
        {isDiscarded && <span className="text-slate-500 italic">discarded</span>}
        {!isDiscarded && (
          <div className="flex gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              disabled={retrying || discarding}
              onClick={() => onRetry(job.id)}
            >
              {retrying ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
              disabled={retrying || discarding}
              onClick={() => onDiscard(job.id)}
            >
              {discarding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-slate-700/50 pt-2">
          {job.error_message && (
            <div className="bg-red-950/40 border border-red-500/20 rounded p-2 font-mono text-red-300 break-all text-[11px] max-h-32 overflow-y-auto">
              {job.error_message}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 text-slate-500 text-[11px]">
            <span>Topic: <span className="text-slate-300">{job.event_type}</span></span>
            <span>Platform: <span className="text-slate-300">{job.platform || 'shopify'}</span></span>
            <span>Retries: <span className="text-slate-300">{job.retry_count || 0}</span></span>
            <span>Last attempt: <span className="text-slate-300">{job.last_attempt_at ? new Date(job.last_attempt_at).toLocaleString() : 'N/A'}</span></span>
            <span className="col-span-2 truncate">Idempotency: <span className="text-slate-400 font-mono">{job.idempotency_key || '—'}</span></span>
          </div>
          {job.payload && (
            <details className="group">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-300 text-[11px] select-none">
                Show payload
              </summary>
              <pre className="mt-1 bg-slate-900 border border-slate-700 rounded p-2 text-[10px] text-slate-400 max-h-48 overflow-auto font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function QueueObservabilityPanel({ tenantId }) {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const { data: queueItems = [], refetch, isFetching } = useQuery({
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

    return {
      total, pending, processing, complete, failed, deadLetter, retries,
      p95, p50, avgDuration,
      retryRate: total > 0 ? ((retries / total) * 100).toFixed(1) : '0.0',
      errorRate: total > 0 ? (((failed + deadLetter) / total) * 100).toFixed(1) : '0.0',
    };
  }, [queueItems]);

  // Dead-letter jobs: non-discarded first, then discarded
  const allDeadLetter = queueItems.filter(j => j.status === 'dead_letter');
  const activeDeadLetter = allDeadLetter.filter(j => !j.error_message?.includes('[DISCARDED'));
  const discardedDeadLetter = allDeadLetter.filter(j => j.error_message?.includes('[DISCARDED'));
  const displayedDeadLetter = showAll ? allDeadLetter : activeDeadLetter.slice(0, 10);

  // Per-job action tracking
  const [actioningJob, setActioningJob] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(null);

  const callRetry = async (actionPayload) => {
    const res = await base44.functions.invoke('retryDeadLetterJobs', actionPayload);
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  };

  const handleRetryOne = async (jobId) => {
    setActioningJob(jobId + '_retry');
    try {
      await callRetry({ action: 'retry_one', job_id: jobId });
      toast.success('Job reset to pending — will be picked up on next queue run');
      queryClient.invalidateQueries({ queryKey: ['webhookQueue', tenantId] });
    } catch (e) {
      toast.error(`Retry failed: ${e.message}`);
    } finally {
      setActioningJob(null);
    }
  };

  const handleDiscardOne = async (jobId) => {
    setActioningJob(jobId + '_discard');
    try {
      await callRetry({ action: 'discard_one', job_id: jobId });
      toast.success('Job discarded');
      queryClient.invalidateQueries({ queryKey: ['webhookQueue', tenantId] });
    } catch (e) {
      toast.error(`Discard failed: ${e.message}`);
    } finally {
      setActioningJob(null);
    }
  };

  const handleBulkRetry = async () => {
    if (!tenantId) return;
    setBulkLoading('retry');
    try {
      const data = await callRetry({ action: 'retry_all', tenant_id: tenantId });
      toast.success(`${data.retried} job(s) reset to pending`);
      queryClient.invalidateQueries({ queryKey: ['webhookQueue', tenantId] });
    } catch (e) {
      toast.error(`Bulk retry failed: ${e.message}`);
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkDiscard = async () => {
    if (!tenantId) return;
    setBulkLoading('discard');
    try {
      const data = await callRetry({ action: 'discard_all', tenant_id: tenantId });
      toast.success(`${data.discarded} job(s) discarded`);
      queryClient.invalidateQueries({ queryKey: ['webhookQueue', tenantId] });
    } catch (e) {
      toast.error(`Bulk discard failed: ${e.message}`);
    } finally {
      setBulkLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" /> Webhook Queue
        </h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Queue Depth', value: metrics.pending + metrics.processing, color: 'text-blue-400', Icon: Clock },
          { label: 'Completed', value: metrics.complete, color: 'text-emerald-400', Icon: TrendingUp },
          { label: 'Retry Rate', value: `${metrics.retryRate}%`, color: parseFloat(metrics.retryRate) > 10 ? 'text-amber-400' : 'text-slate-300', Icon: RefreshCw },
          { label: 'Dead Letter', value: metrics.deadLetter, color: metrics.deadLetter > 0 ? 'text-red-400' : 'text-slate-300', Icon: AlertTriangle },
        ].map(m => (
          <div key={m.label} className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Latency row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'P50', value: `${metrics.p50}ms` },
          { label: 'P95', value: `${metrics.p95}ms` },
          { label: 'Avg', value: `${metrics.avgDuration}ms` },
        ].map(m => (
          <div key={m.label} className="rounded bg-slate-800/30 border border-slate-700/40 p-2 text-center">
            <p className="text-[11px] text-slate-500">{m.label}</p>
            <p className="text-sm font-semibold text-slate-300">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Status bars */}
      <div className="space-y-1.5">
        {[
          { label: 'Complete',      value: metrics.complete,    color: 'bg-emerald-500' },
          { label: 'Pending',       value: metrics.pending,     color: 'bg-blue-500' },
          { label: 'Failed (retry)',value: metrics.failed,      color: 'bg-amber-500' },
          { label: 'Dead Letter',   value: metrics.deadLetter,  color: 'bg-red-500' },
        ].map(row => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-28 flex-shrink-0">{row.label}</span>
            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${row.color} rounded-full transition-all`}
                style={{ width: metrics.total > 0 ? `${(row.value / metrics.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-xs font-medium text-slate-400 w-5 text-right flex-shrink-0">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Dead Letter Section */}
      {allDeadLetter.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Dead Letter Queue
              <span className="ml-1 bg-red-500/20 border border-red-500/30 text-red-300 text-[10px] px-1.5 py-0.5 rounded">
                {activeDeadLetter.length} active
              </span>
              {discardedDeadLetter.length > 0 && (
                <span className="bg-slate-700/40 border border-slate-600/30 text-slate-500 text-[10px] px-1.5 py-0.5 rounded">
                  {discardedDeadLetter.length} discarded
                </span>
              )}
            </p>

            {/* Bulk actions */}
            {activeDeadLetter.length > 0 && tenantId && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-[11px] gap-1"
                  disabled={!!bulkLoading}
                  onClick={handleBulkRetry}
                >
                  {bulkLoading === 'retry' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Retry All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 text-[11px] gap-1"
                  disabled={!!bulkLoading}
                  onClick={handleBulkDiscard}
                >
                  {bulkLoading === 'discard' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Discard All
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {displayedDeadLetter.map(job => (
              <DeadLetterRow
                key={job.id}
                job={job}
                onRetry={handleRetryOne}
                onDiscard={handleDiscardOne}
                retrying={actioningJob === job.id + '_retry'}
                discarding={actioningJob === job.id + '_discard'}
              />
            ))}
          </div>

          {(activeDeadLetter.length > 10 || discardedDeadLetter.length > 0) && (
            <button
              className="text-xs text-slate-500 hover:text-slate-300 w-full text-center pt-1 transition-colors"
              onClick={() => setShowAll(v => !v)}
            >
              {showAll ? 'Show less' : `Show all ${allDeadLetter.length} jobs`}
            </button>
          )}
        </div>
      )}

      {allDeadLetter.length === 0 && (
        <div className="text-center py-3 text-xs text-slate-500">
          No dead-letter jobs 🎉
        </div>
      )}
    </div>
  );
}