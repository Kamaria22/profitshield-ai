import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Crown,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  UserCheck,
  UserX,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  CommandCard,
  CommandCardContent,
  CommandCardHeader,
  CommandCardTitle
} from '@/components/ui/command-card';

const RISK_TONES = {
  high: 'border-red-400/25 bg-red-400/10 text-red-200',
  medium: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  low: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
};

function getSegmentIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('champion') || n.includes('high value')) return Crown;
  if (n.includes('loyal')) return UserCheck;
  if (n.includes('churn') || n.includes('at risk')) return UserX;
  if (n.includes('risk')) return AlertTriangle;
  if (n.includes('new')) return Sparkles;
  if (n.includes('potential')) return Target;
  return Users;
}

function getErrorMessage(error) {
  const msg = error?.message || 'Unknown error';
  if (/rate limit/i.test(msg)) return 'AI analysis is rate-limited right now. Retry shortly.';
  return msg;
}

async function invokeSegmentation(tenantId, extra = {}) {
  const payload = { tenant_id: tenantId, ...extra };
  const functionNames = ['customerSegmentationRuntime'];
  let lastError = null;

  for (const name of functionNames) {
    try {
      const res = await base44.functions.invoke(name, payload);
      if (res.data?.error) throw new Error(res.data?.detail || res.data?.message || res.data.error);
      return res.data;
    } catch (error) {
      lastError = error;
      if (!/404|does not exist/i.test(error?.message || '')) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Customer segmentation endpoint unavailable');
}

function CustomerSegmentationPanel({ tenantId }) {
  const queryClient = useQueryClient();
  const [showAllSegments, setShowAllSegments] = React.useState(false);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['customerSegmentation', tenantId],
    queryFn: () => invokeSegmentation(tenantId),
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => !/rate limit/i.test(err?.message || '') && failureCount < 1
  });

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: ['customerSegmentation', tenantId] });
    toast.promise(
      invokeSegmentation(tenantId, { force_refresh: true }).then((freshData) => {
        queryClient.setQueryData(['customerSegmentation', tenantId], freshData);
        return freshData;
      }),
      {
        loading: 'Refreshing segmentation...',
        success: 'Segmentation updated',
        error: 'Analysis failed'
      }
    );
  };

  if (!tenantId) return null;

  const segments = data?.segments || [];
  const hasData = segments.length > 0;
  const visibleSegments = showAllSegments ? segments : segments.slice(0, 4);
  const visibleInsights = (data?.insights || []).slice(0, 3);

  if ((isLoading || isFetching) && !hasData) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        <span>Analyzing customer base...</span>
      </div>
    );
  }

  if (isError && !hasData) {
    return (
      <CommandCard className="border-red-400/20">
        <CommandCardContent className="py-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-red-300" />
          <p className="text-sm font-medium text-white">Customer segmentation is unavailable.</p>
          <p className="mt-2 text-xs text-slate-400">{getErrorMessage(error)}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]"
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </CommandCardContent>
      </CommandCard>
    );
  }

  if (!hasData) {
    return (
      <div className="py-10 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-slate-500" />
        <p className="text-sm text-slate-300">No customer segments are available yet.</p>
        <p className="mt-1 text-xs text-slate-500">Sync more order data to build segment intelligence.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Customer segment health</p>
          <p className="mt-1 text-sm text-slate-400">
            {data.total_customers} customers analyzed
            {data.churn_risk_summary ? ` · ${data.churn_risk_summary}` : ''}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={isFetching}
          className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CommandCard>
          <CommandCardContent className="py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Health Score
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">{data.health_score ?? '—'}</p>
          </CommandCardContent>
        </CommandCard>
        <CommandCard>
          <CommandCardContent className="py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Active Segments
            </p>
            <p className="mt-2 text-3xl font-semibold text-white">{segments.length}</p>
          </CommandCardContent>
        </CommandCard>
        <CommandCard>
          <CommandCardContent className="py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Analysis State
            </p>
            <p className="mt-2 text-sm font-medium text-slate-200">
              {data.cached ? 'Cached snapshot' : 'Fresh analysis'}
            </p>
          </CommandCardContent>
        </CommandCard>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.25fr_0.75fr]">
        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Segments</CommandCardTitle>
          </CommandCardHeader>
          <CommandCardContent className="space-y-3">
            {visibleSegments.map((segment, index) => {
              const Icon = getSegmentIcon(segment.name);
              return (
                <div
                  key={`${segment.name}-${index}`}
                  className="rounded-[12px] border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                        <Icon className="h-4 w-4 text-slate-200" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{segment.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{segment.description}</p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        RISK_TONES[segment.risk_level] || RISK_TONES.medium
                      }`}
                    >
                      {segment.risk_level || 'medium'}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <MetricPill label="Customers" value={`${segment.size}`} />
                    <MetricPill label="Value" value={`${segment.value_potential}`} />
                    <MetricPill
                      label="LTV"
                      value={`$${Number(segment.avg_lifetime_value || 0).toFixed(0)}`}
                    />
                  </div>
                </div>
              );
            })}

            {segments.length > 4 && (
              <Button
                type="button"
                variant="ghost"
                className="h-auto px-0 text-sm text-cyan-300 hover:bg-transparent hover:text-cyan-200"
                onClick={() => setShowAllSegments((value) => !value)}
              >
                {showAllSegments ? 'Show fewer segments' : `View ${segments.length - 4} more segments`}
              </Button>
            )}
          </CommandCardContent>
        </CommandCard>

        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Key Insights</CommandCardTitle>
          </CommandCardHeader>
          <CommandCardContent className="space-y-3">
            {visibleInsights.length > 0 ? (
              visibleInsights.map((insight, index) => (
                <div
                  key={`${insight.insight}-${index}`}
                  className="rounded-[12px] border border-white/10 bg-white/[0.02] px-3 py-3"
                >
                  <p className="text-sm text-slate-200">{insight.insight}</p>
                  <p className="mt-1 text-xs text-cyan-300">{insight.action}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">No immediate insights were returned.</p>
            )}
          </CommandCardContent>
        </CommandCard>
      </div>
    </div>
  );
}

function MetricPill({ label, value }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}

export { CustomerSegmentationPanel };
export default CustomerSegmentationPanel;
