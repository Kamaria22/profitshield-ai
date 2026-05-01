import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Gift,
  Loader2,
  Mail,
  Megaphone,
  Play,
  RefreshCw,
  Rocket,
  Target,
  TrendingUp
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

const CAMPAIGN_ICONS = {
  email: Mail,
  discount: Gift,
  winback: TrendingUp,
  upsell: Rocket,
  loyalty: Target,
  bundle: Gift
};

function parseError(data) {
  if (!data?.error && !data?.message) return null;
  return data?.detail || data?.message || data?.error;
}

export default function MarketingCampaignsPanel({ tenantId }) {
  const [launchedCampaigns, setLaunchedCampaigns] = useState(new Set());
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);

  const { data, isLoading, refetch, isFetching, isError, error } = useQuery({
    queryKey: ['marketingCampaigns', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiMarketingCampaigns', {
        tenant_id: tenantId
      });
      const maybeError = parseError(response.data);
      if (maybeError) throw new Error(maybeError);
      return response.data;
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, err) => !/rate limit/i.test(err?.message || '') && failureCount < 1
  });

  const launchMutation = useMutation({
    mutationFn: async (campaignId) => {
      const response = await base44.functions.invoke('aiMarketingCampaigns', {
        tenant_id: tenantId,
        action: 'execute_campaign',
        campaign_id: campaignId
      });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (result, campaignId) => {
      setLaunchedCampaigns((previous) => new Set([...previous, campaignId]));
      toast.success(result.message);
    },
    onError: (launchError) => {
      toast.error(launchError.message);
    }
  });

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: 'Generating campaigns...',
      success: 'Campaigns updated',
      error: 'Generation failed'
    });
  };

  if (!tenantId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        <span>Generating campaigns...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <CommandCard className="border-red-400/20">
        <CommandCardContent className="py-8 text-center">
          <Megaphone className="mx-auto mb-3 h-9 w-9 text-red-300" />
          <p className="text-sm font-medium text-white">Marketing campaigns are unavailable.</p>
          <p className="mt-2 text-xs text-slate-400">
            {/rate limit/i.test(error?.message || '')
              ? 'The AI campaign service is rate-limited right now. Retry shortly.'
              : error?.message || 'Unknown error'}
          </p>
        </CommandCardContent>
      </CommandCard>
    );
  }

  if (!data?.campaigns?.length) {
    return (
      <div className="py-10 text-center">
        <Megaphone className="mx-auto mb-3 h-10 w-10 text-slate-500" />
        <p className="text-sm text-slate-300">No campaigns are ready yet.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]"
          onClick={handleRefresh}
        >
          Generate campaigns
        </Button>
      </div>
    );
  }

  const campaigns = showAllCampaigns ? data.campaigns : data.campaigns.slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Launch-ready campaign ideas</p>
          <p className="mt-1 text-sm text-slate-400">
            {data.overall_strategy || 'AI-generated campaigns based on current customer and profit signals.'}
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

      {data.quick_win && (
        <CommandCard>
          <CommandCardHeader className="pb-2">
            <CommandCardTitle>Quick Win</CommandCardTitle>
          </CommandCardHeader>
          <CommandCardContent>
            <p className="text-sm text-slate-300">{data.quick_win}</p>
          </CommandCardContent>
        </CommandCard>
      )}

      <div className="grid gap-3">
        {campaigns.map((campaign, index) => {
          const Icon = CAMPAIGN_ICONS[campaign.type] || Megaphone;
          const isLaunched = launchedCampaigns.has(campaign.id);

          return (
            <CommandCard key={`${campaign.id || campaign.name}-${index}`}>
              <CommandCardContent className="py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                    <Icon className="h-4 w-4 text-cyan-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{campaign.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{campaign.target_segment}</p>
                      </div>
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {campaign.urgency?.replace('_', ' ') || 'planned'}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <CampaignMeta label="Offer" value={campaign.discount_value ? `${campaign.discount_value}% off` : campaign.goal} />
                      <CampaignMeta label="Projected ROI" value={campaign.expected_roi || '—'} />
                      <CampaignMeta label="Revenue" value={campaign.expected_revenue || '—'} />
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        disabled={isLaunched || launchMutation.isPending}
                        onClick={() => launchMutation.mutate(campaign.id)}
                        className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                      >
                        {isLaunched ? (
                          <>
                            <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                            Launched
                          </>
                        ) : launchMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Play className="mr-2 h-3.5 w-3.5" />
                            Launch
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CommandCardContent>
            </CommandCard>
          );
        })}
      </div>

      {data.campaigns.length > 4 && (
        <Button
          type="button"
          variant="ghost"
          className="h-auto px-0 text-sm text-cyan-300 hover:bg-transparent hover:text-cyan-200"
          onClick={() => setShowAllCampaigns((value) => !value)}
        >
          {showAllCampaigns ? 'Show fewer campaigns' : `View ${data.campaigns.length - 4} more campaigns`}
        </Button>
      )}
    </div>
  );
}

function CampaignMeta({ label, value }) {
  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}
