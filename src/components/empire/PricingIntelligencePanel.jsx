import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DollarSign, TrendingUp, RefreshCw, Zap, Target } from 'lucide-react';
import { toast } from 'sonner';

export default function PricingIntelligencePanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['pricingIntelligence'],
    queryFn: async () => {
      const res = await base44.functions.invoke('pricingOptimizer', {
        action: 'get_pricing_intelligence'
      });
      return res.data;
    }
  });

  const runOptimizerMutation = useMutation({
    mutationFn: () => base44.functions.invoke('pricingOptimizer', {
      action: 'run_optimization'
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['pricingIntelligence'] });
      toast.success(`Pricing analysis: ${res.data?.pricing_recommendations?.length || 0} recommendations`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const metrics = data?.value_metrics || [];
  const primaryMetric = data?.primary_metric;
  const experiments = data?.experiments || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-amber-600" />
            Pricing Intelligence
          </h2>
          <p className="text-sm text-slate-500">Value-based pricing optimization</p>
        </div>
        <Button
          size="sm"
          onClick={() => runOptimizerMutation.mutate()}
          disabled={runOptimizerMutation.isPending}
          className="bg-amber-600 hover:bg-amber-700"
        >
          {runOptimizerMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
          Optimize
        </Button>
      </div>

      {/* Primary Value Metric */}
      {primaryMetric && (
        <Card className="border-amber-200 border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-600" />
              Primary Value Metric
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold">{primaryMetric.display_name}</p>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <p className="text-xs text-slate-500">Retention Correlation</p>
                <Progress value={primaryMetric.correlation_to_retention * 100} className="h-2 mt-1" />
                <p className="text-xs mt-1">{(primaryMetric.correlation_to_retention * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Expansion Correlation</p>
                <Progress value={primaryMetric.correlation_to_expansion * 100} className="h-2 mt-1" />
                <p className="text-xs mt-1">{(primaryMetric.correlation_to_expansion * 100).toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Value Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Value Metrics Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {metrics.slice(0, 5).map((m) => (
              <div key={m.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                <div>
                  <p className="text-sm font-medium">{m.display_name || m.metric_name}</p>
                  <p className="text-xs text-slate-500">Avg: {m.current_avg_value?.toLocaleString() || 0}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{(m.correlation_to_retention * 100).toFixed(0)}% retention</Badge>
                  {m.is_primary && <Badge className="bg-amber-500 text-white">Primary</Badge>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Experiments */}
      {experiments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pricing Experiments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {experiments.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{exp.experiment_name}</p>
                    <p className="text-xs text-slate-500">{exp.experiment_type}</p>
                  </div>
                  <Badge className={
                    exp.status === 'running' ? 'bg-blue-100 text-blue-700' :
                    exp.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-slate-100 text-slate-700'
                  }>{exp.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}