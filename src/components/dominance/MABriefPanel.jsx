import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building, Target, RefreshCw, TrendingUp, DollarSign, Star } from 'lucide-react';
import { toast } from 'sonner';

const categoryColors = {
  fraud_tool: 'bg-red-100 text-red-700',
  analytics_tool: 'bg-blue-100 text-blue-700',
  returns_tool: 'bg-purple-100 text-purple-700',
  chargeback: 'bg-amber-100 text-amber-700',
  payments: 'bg-emerald-100 text-emerald-700'
};

const recommendationColors = {
  strong_buy: 'bg-emerald-500 text-white',
  buy: 'bg-emerald-100 text-emerald-700',
  hold: 'bg-amber-100 text-amber-700',
  pass: 'bg-slate-100 text-slate-700'
};

export default function MABriefPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['maBrief'],
    queryFn: async () => {
      const res = await base44.functions.invoke('maEngine', { action: 'get_brief' });
      return res.data?.brief;
    }
  });

  const runScanMutation = useMutation({
    mutationFn: () => base44.functions.invoke('maEngine', { action: 'run_scan' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['maBrief'] });
      toast.success(`M&A scan: ${res.data?.targets_analyzed || 0} targets, ${res.data?.simulations_created || 0} simulations`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building className="w-6 h-6 text-purple-600" />
            M&A Engine
          </h2>
          <p className="text-sm text-slate-500">Strategic acquisition intelligence</p>
        </div>
        <Button size="sm" onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
          {runScanMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Target className="w-4 h-4 mr-1" />}
          Run Scan
        </Button>
      </div>

      {/* Strong Buy Recommendations */}
      {data?.strong_buy_recommendations?.length > 0 && (
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-emerald-600" />
              Strong Buy Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.strong_buy_recommendations.map((rec, i) => (
                <div key={i} className="p-3 bg-emerald-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{rec.name}</p>
                    <Badge className={recommendationColors.strong_buy}>+{rec.roi_36m?.toFixed(0)}% ROI</Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{rec.reasoning}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Buy Recommendations */}
      {data?.buy_recommendations?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Buy Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.buy_recommendations.map((rec, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <span className="font-medium text-sm">{rec.name}</span>
                  <Badge className={recommendationColors.buy}>+{rec.roi_36m?.toFixed(0)}% ROI</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Highest Priority Target */}
      {data?.highest_priority && (
        <Card className="border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Priority Target</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-lg">{data.highest_priority.company_name}</p>
                <Badge className={categoryColors[data.highest_priority.category] || 'bg-slate-100'}>{data.highest_priority.category?.replace('_', ' ')}</Badge>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Priority Score</p>
                <p className="text-2xl font-bold text-purple-700">{data.highest_priority.acquisition_priority_score?.toFixed(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!data && (
        <Card><CardContent className="py-8 text-center text-slate-500">Run M&A scan to identify acquisition targets</CardContent></Card>
      )}
    </div>
  );
}