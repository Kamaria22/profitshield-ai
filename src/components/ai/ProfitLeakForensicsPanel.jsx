import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  Target,
  Zap
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

const PRIORITY_ICON = {
  immediate: Zap,
  this_week: Target,
  this_month: Eye
};

function parseError(data) {
  if (!data?.error && !data?.message) return null;
  return data?.detail || data?.message || data?.error;
}

export default function ProfitLeakForensicsPanel({ tenantId }) {
  const [showAllActions, setShowAllActions] = React.useState(false);

  const { data, isLoading, refetch, isFetching, isError, error } = useQuery({
    queryKey: ['profitLeakForensics', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiProfitLeakForensics', {
        tenant_id: tenantId
      });
      const maybeError = parseError(response.data);
      if (maybeError) throw new Error(maybeError);
      return response.data;
    },
    enabled: !!tenantId,
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => !/rate limit/i.test(err?.message || '') && failureCount < 1
  });

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: 'Running forensic analysis...',
      success: 'Forensics updated',
      error: 'Analysis failed'
    });
  };

  if (!tenantId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        <span>Running forensic analysis...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <CommandCard className="border-amber-400/20">
        <CommandCardContent className="py-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-9 w-9 text-amber-300" />
          <p className="text-sm font-medium text-white">Profit leak forensics is unavailable.</p>
          <p className="mt-2 text-xs text-slate-400">
            {/rate limit/i.test(error?.message || '')
              ? 'The AI forensics service is rate-limited right now. Retry shortly.'
              : error?.message || 'Unknown error'}
          </p>
        </CommandCardContent>
      </CommandCard>
    );
  }

  if (!data?.summary) {
    return (
      <div className="py-10 text-center">
        <Search className="mx-auto mb-3 h-10 w-10 text-slate-500" />
        <p className="text-sm text-slate-300">No forensic snapshot is available yet.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]"
          onClick={handleRefresh}
        >
          Run analysis
        </Button>
      </div>
    );
  }

  const visibleCauses = (data.root_causes || []).slice(0, 3);
  const visibleActions = showAllActions
    ? data.remediation_plan || []
    : (data.remediation_plan || []).slice(0, 3);
  const visiblePatterns = (data.hidden_patterns || []).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Leak recovery posture</p>
          <p className="mt-1 text-sm text-slate-400">
            {data.summary.total_identified_leaks} leak signals found
            {data.summary.top_priority ? ` · ${data.summary.top_priority}` : ''}
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
          Analyze
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <MetricCard label="Health Grade" value={data.summary.health_grade || '—'} />
        <MetricCard label="Total Leaks" value={`${data.summary.total_identified_leaks || 0}`} />
        <MetricCard label="Recoverable" value={data.summary.recoverable_profit || '—'} />
        <MetricCard label="Top Priority" value={data.summary.top_priority || 'Stable'} compact />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Primary Causes</CommandCardTitle>
          </CommandCardHeader>
          <CommandCardContent className="space-y-3">
            {visibleCauses.length > 0 ? (
              visibleCauses.map((cause, index) => (
                <div
                  key={`${cause.category}-${index}`}
                  className="rounded-[12px] border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-white">{cause.category}</p>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                      {cause.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{cause.cause}</p>
                  <p className="mt-2 text-xs text-slate-500">{cause.impact}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">No major leak causes were returned.</p>
            )}
          </CommandCardContent>
        </CommandCard>

        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Recommended Actions</CommandCardTitle>
          </CommandCardHeader>
          <CommandCardContent className="space-y-3">
            {visibleActions.length > 0 ? (
              <>
                {visibleActions.map((action, index) => {
                  const Icon = PRIORITY_ICON[action.priority] || Target;
                  return (
                    <div
                      key={`${action.action}-${index}`}
                      className="rounded-[12px] border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                          <Icon className="h-4 w-4 text-cyan-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white">{action.action}</p>
                          <p className="mt-1 text-xs text-slate-400">{action.target}</p>
                          <p className="mt-2 text-xs text-cyan-300">{action.expected_savings}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(data.remediation_plan || []).length > 3 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto px-0 text-sm text-cyan-300 hover:bg-transparent hover:text-cyan-200"
                    onClick={() => setShowAllActions((value) => !value)}
                  >
                    {showAllActions ? 'Show fewer actions' : 'View more actions'}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">No immediate actions were returned.</p>
            )}
          </CommandCardContent>
        </CommandCard>
      </div>

      {visiblePatterns.length > 0 && (
        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Hidden Patterns</CommandCardTitle>
          </CommandCardHeader>
          <CommandCardContent className="grid gap-3 lg:grid-cols-3">
            {visiblePatterns.map((pattern, index) => (
              <div
                key={`${pattern.pattern_name}-${index}`}
                className="rounded-[12px] border border-white/10 bg-white/[0.02] p-4"
              >
                <p className="text-sm font-medium text-white">{pattern.pattern_name}</p>
                <p className="mt-2 text-xs text-slate-400">{pattern.description}</p>
                <p className="mt-3 text-xs text-slate-500">
                  {pattern.affected_orders} affected · {pattern.potential_loss}
                </p>
              </div>
            ))}
          </CommandCardContent>
        </CommandCard>
      )}
    </div>
  );
}

function MetricCard({ label, value, compact = false }) {
  return (
    <CommandCard>
      <CommandCardContent className="py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className={`mt-2 font-semibold text-white ${compact ? 'text-sm' : 'text-3xl'}`}>{value}</p>
      </CommandCardContent>
    </CommandCard>
  );
}
