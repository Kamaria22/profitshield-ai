import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Landmark, RefreshCw, TrendingUp, DollarSign, Target,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { toast } from 'sonner';

const priorityColors = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700'
};

const trendIcons = {
  improving: ArrowUpRight,
  stable: Minus,
  declining: ArrowDownRight
};

const trendColors = {
  improving: 'text-emerald-600',
  stable: 'text-slate-500',
  declining: 'text-red-600'
};

export default function CapitalReadinessPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['capitalReadinessConsole'],
    queryFn: async () => {
      const res = await base44.functions.invoke('capitalAttraction', { action: 'get_readiness_console' });
      return res.data?.console;
    }
  });

  const runScanMutation = useMutation({
    mutationFn: () => base44.functions.invoke('capitalAttraction', { action: 'run_optimization_scan' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['capitalReadinessConsole'] });
      toast.success(`Capital scan: readiness ${res.data?.capital_readiness_score?.toFixed(0)}%, ${res.data?.suggestions?.length || 0} optimizations`);
    }
  });

  const matchInvestorsMutation = useMutation({
    mutationFn: () => base44.functions.invoke('capitalAttraction', { action: 'match_investors' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['capitalReadinessConsole'] });
      toast.success(`Matched ${res.data?.matches?.length || 0} investors`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const console = data || {};
  const trajectoryLabels = {
    ipo_ready: 'IPO Ready',
    acquisition_attractive: 'Acquisition Attractive',
    growth_stage: 'Growth Stage'
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-indigo-600" />
            Capital Readiness Console
          </h2>
          <p className="text-sm text-slate-500">Institutional capital attraction metrics</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => matchInvestorsMutation.mutate()} disabled={matchInvestorsMutation.isPending}>
            <Target className="w-4 h-4 mr-1" />
            Match Investors
          </Button>
          <Button size="sm" onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {runScanMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-1" />}
            Optimize
          </Button>
        </div>
      </div>

      {/* Capital Readiness Score */}
      <Card className="border-2 border-indigo-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-slate-500">Capital Readiness Score</p>
              <p className="text-4xl font-bold text-indigo-700">{(console.capital_readiness_score || 0).toFixed(0)}</p>
            </div>
            <Badge className="bg-indigo-100 text-indigo-700 text-lg px-4 py-2">
              {trajectoryLabels[console.trajectory] || 'Growth Stage'}
            </Badge>
          </div>
          <Progress value={console.capital_readiness_score || 0} className="h-3 [&>div]:bg-indigo-600" />
        </CardContent>
      </Card>

      {/* Valuation Projection */}
      {console.valuation_projection && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Valuation Projection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="text-center">
                <p className="text-sm text-slate-500">Low</p>
                <p className="text-xl font-bold">${(console.valuation_projection.low / 1e6).toFixed(1)}M</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-500">Mid</p>
                <p className="text-2xl font-bold text-emerald-700">${(console.valuation_projection.mid / 1e6).toFixed(1)}M</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-500">High</p>
                <p className="text-xl font-bold">${(console.valuation_projection.high / 1e6).toFixed(1)}M</p>
              </div>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="text-lg">{console.valuation_projection.multiple?.toFixed(1)}x Revenue Multiple</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      {console.metrics?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Institutional Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-auto">
              {console.metrics.map((metric, i) => {
                const TrendIcon = trendIcons[metric.trend] || Minus;
                return (
                  <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <div className="flex items-center gap-2">
                      <TrendIcon className={`w-4 h-4 ${trendColors[metric.trend]}`} />
                      <span className="text-sm">{metric.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{metric.current?.toFixed(1)}</span>
                      <span className="text-xs text-slate-400">/ {metric.benchmark}</span>
                      <Progress value={metric.attractiveness || 0} className="w-16 h-2" />
                      <Badge className={priorityColors[metric.priority]}>{metric.priority}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matched Investors */}
      {console.matched_investors?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Investor Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {console.matched_investors.map((investor, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{investor.firm}</p>
                    <p className="text-xs text-slate-500">{investor.check_size}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={investor.alignment} className="w-16 h-2" />
                    <span className="text-sm font-medium">{investor.alignment}%</span>
                    <Badge variant="outline" className="text-xs">{investor.status?.replace('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Optimization Priorities */}
      {console.optimization_priorities?.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-700">Optimization Priorities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {console.optimization_priorities.map((opt, i) => (
                <div key={i} className="p-2 bg-amber-50 rounded">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{opt.metric}</span>
                    <Badge className={priorityColors[opt.priority]}>{opt.priority}</Badge>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">{opt.suggestion}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}