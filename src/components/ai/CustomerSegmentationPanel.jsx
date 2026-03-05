import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Users, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw,
  DollarSign,
  UserCheck,
  UserX,
  Crown,
  Loader2,
  Target
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';



const priorityColors = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

const riskColors = {
  high: 'text-red-600 bg-red-50 border-red-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  low: 'text-emerald-600 bg-emerald-50 border-emerald-200'
};

function getSegmentIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('champion') || n.includes('high value')) return Crown;
  if (n.includes('loyal')) return UserCheck;
  if (n.includes('risk') || n.includes('churn')) return UserX;
  if (n.includes('new')) return Sparkles;
  if (n.includes('potential')) return Target;
  if (n.includes('at risk')) return AlertTriangle;
  return Users;
}

function CustomerSegmentationPanelInner({ tenantId }) {
  const queryClient = useQueryClient();

  // Auto-fetch on mount — no manual "Analyze" click required
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['customerSegmentation', tenantId],
    queryFn: async () => {
      const res = await base44.functions.invoke('aiCustomerSegmentation', { tenant_id: tenantId });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: ['customerSegmentation', tenantId] });
    toast.promise(refetch(), {
      loading: 'Re-analyzing customers...',
      success: 'Segmentation updated!',
      error: 'Analysis failed'
    });
  };

  if (!tenantId) return null;

  const segments = data?.segments || [];
  const hasData = segments.length > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-5 h-5" />
            AI Customer Segments
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="bg-white/20 hover:bg-white/30 text-white border-0"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {(isLoading || isFetching) && !hasData ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            <span className="text-slate-500 text-sm">Analyzing customer base...</span>
          </div>
        ) : hasData ? (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center gap-4 p-3 bg-violet-50 rounded-lg border border-violet-100">
              <div className="text-center min-w-[60px]">
                <div className="text-2xl font-bold text-violet-700">{data.health_score ?? '—'}</div>
                <div className="text-xs text-violet-500">Health Score</div>
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 mb-0.5">{data.total_customers} customers analyzed</p>
                <p className="text-sm text-slate-600">{data.churn_risk_summary}</p>
              </div>
            </div>

            {/* Segments grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {segments.map((seg, i) => {
                const Icon = getSegmentIcon(seg.name);
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`p-3 rounded-lg border ${priorityColors[seg.priority] || priorityColors.medium}`}
                  >
                    <div className="flex items-start gap-2 mb-1.5">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{seg.name}</p>
                        <p className="text-xs opacity-75">{seg.size} customers · {seg.percentage}</p>
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${riskColors[seg.risk_level] || riskColors.medium}`}>
                        {seg.risk_level}
                      </span>
                    </div>
                    <p className="text-xs mb-2 opacity-80">{seg.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 font-medium">
                        <DollarSign className="w-3 h-3" />
                        {seg.value_potential}
                      </span>
                      <span className="opacity-60">Avg LTV: ${seg.avg_lifetime_value?.toFixed(0)}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Insights */}
            {data.insights?.length > 0 && (
              <div className="border-t pt-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Key Insights
                </h4>
                <div className="space-y-2">
                  {data.insights.map((ins, i) => (
                    <div key={i} className="p-2 bg-amber-50 rounded-lg text-xs border border-amber-100">
                      <p className="font-medium text-amber-800">{ins.insight}</p>
                      <p className="text-amber-600 mt-0.5">→ {ins.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-violet-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No order data found to segment.</p>
            <p className="text-xs text-slate-400 mt-1">Sync your Shopify store to start analyzing customers.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { CustomerSegmentationPanelInner };
export default CustomerSegmentationPanelInner;