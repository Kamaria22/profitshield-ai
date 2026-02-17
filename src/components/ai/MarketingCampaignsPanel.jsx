import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Megaphone, 
  Mail, 
  Gift, 
  TrendingUp, 
  Play, 
  RefreshCw,
  Target,
  Clock,
  DollarSign,
  Loader2,
  Rocket,
  CheckCircle2
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const campaignTypeIcons = {
  email: Mail,
  discount: Gift,
  winback: TrendingUp,
  upsell: Rocket,
  loyalty: Target,
  bundle: Gift
};

const urgencyColors = {
  immediate: 'bg-red-100 text-red-700',
  this_week: 'bg-amber-100 text-amber-700',
  this_month: 'bg-blue-100 text-blue-700'
};

export default function MarketingCampaignsPanel({ tenantId }) {
  const [launchedCampaigns, setLaunchedCampaigns] = useState(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['marketingCampaigns', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('aiMarketingCampaigns', {
        tenant_id: tenantId
      });
      return response.data;
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false
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
    onSuccess: (data, campaignId) => {
      setLaunchedCampaigns(prev => new Set([...prev, campaignId]));
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: 'Generating campaigns...',
      success: 'Campaigns ready!',
      error: 'Generation failed'
    });
  };

  if (!tenantId) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-pink-500 to-rose-600 text-white">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="w-5 h-5" />
            AI Marketing Campaigns
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="bg-white/20 hover:bg-white/30 text-white border-0"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Generate
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
            <span className="ml-2 text-slate-500">Creating campaigns...</span>
          </div>
        ) : data?.campaigns ? (
          <div className="space-y-4">
            {/* Strategy Overview */}
            {data.overall_strategy && (
              <div className="p-3 bg-pink-50 rounded-lg">
                <p className="text-sm text-pink-800">{data.overall_strategy}</p>
              </div>
            )}

            {/* Quick Win */}
            {data.quick_win && (
              <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Rocket className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-amber-800 text-sm">Quick Win</span>
                </div>
                <p className="text-xs text-amber-700">{data.quick_win}</p>
              </div>
            )}

            {/* Campaigns */}
            <div className="space-y-3">
              {data.campaigns?.map((campaign, i) => {
                const Icon = campaignTypeIcons[campaign.type] || Megaphone;
                const isLaunched = launchedCampaigns.has(campaign.id);
                
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="p-3 border rounded-lg hover:border-pink-200 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-pink-100 rounded-lg">
                        <Icon className="w-4 h-4 text-pink-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm text-slate-800">{campaign.name}</p>
                          <Badge className={urgencyColors[campaign.urgency]} variant="outline">
                            {campaign.urgency?.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600 mb-2">{campaign.goal}</p>
                        
                        <div className="flex flex-wrap gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            <Target className="w-3 h-3 mr-1" />
                            {campaign.target_segment}
                          </Badge>
                          {campaign.discount_value && (
                            <Badge variant="outline" className="text-xs">
                              <Gift className="w-3 h-3 mr-1" />
                              {campaign.discount_value}% off
                            </Badge>
                          )}
                        </div>

                        {campaign.email_subject && (
                          <div className="p-2 bg-slate-50 rounded text-xs mb-2">
                            <p className="font-medium text-slate-700">📧 {campaign.email_subject}</p>
                            <p className="text-slate-500 mt-1">{campaign.email_preview}</p>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {campaign.expected_revenue}
                            </span>
                            <span>ROI: {campaign.expected_roi}</span>
                          </div>
                          <Button
                            size="sm"
                            disabled={isLaunched || launchMutation.isPending}
                            onClick={() => launchMutation.mutate(campaign.id)}
                            className={isLaunched ? 'bg-emerald-500' : 'bg-pink-600 hover:bg-pink-700'}
                          >
                            {isLaunched ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Launched
                              </>
                            ) : launchMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <Play className="w-3 h-3 mr-1" />
                                Launch
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Megaphone className="w-12 h-12 text-pink-300 mx-auto mb-3" />
            <p className="text-slate-600">Click "Generate" to create AI campaigns</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}