import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Crown, Target, AlertTriangle, CheckCircle2, RefreshCw, Rocket } from 'lucide-react';
import { toast } from 'sonner';

const statusColors = {
  on_track: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-amber-100 text-amber-700',
  behind: 'bg-red-100 text-red-700',
  ahead: 'bg-blue-100 text-blue-700'
};

export default function EmpireRoadmapPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['empireStatus'],
    queryFn: async () => {
      const res = await base44.functions.invoke('empirePlanner', {
        action: 'get_empire_status'
      });
      return res.data;
    }
  });

  const runPlannerMutation = useMutation({
    mutationFn: () => base44.functions.invoke('empirePlanner', {
      action: 'run_planner'
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['empireStatus'] });
      toast.success(`Empire planner: ${res.data?.horizons_updated || 0} horizons updated, ${res.data?.deviations_detected?.length || 0} deviations`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const horizons = data?.horizons || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Crown className="w-6 h-6 text-purple-600" />
            10-Year Empire Blueprint
          </h2>
          <p className="text-sm text-slate-500">Strategic execution roadmap</p>
        </div>
        <Button
          size="sm"
          onClick={() => runPlannerMutation.mutate()}
          disabled={runPlannerMutation.isPending}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {runPlannerMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Target className="w-4 h-4 mr-1" />}
          Update Plan
        </Button>
      </div>

      {/* Phase Cards */}
      {horizons.map((horizon) => (
        <Card key={horizon.id} className={horizon.status === 'at_risk' ? 'border-amber-300' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="w-4 h-4" />
                {horizon.phase_name}
              </CardTitle>
              <Badge className={statusColors[horizon.status] || statusColors.on_track}>
                {horizon.status?.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">{horizon.phase}</p>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Market Position</p>
                <p className="text-sm">{horizon.market_position_goal}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Infrastructure</p>
                <p className="text-sm">{horizon.infrastructure_goal}</p>
              </div>
            </div>

            {/* Targets */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-xs text-slate-500">ARR Target</p>
                <p className="text-lg font-bold">${((horizon.arr_target || 0) / 1e6).toFixed(0)}M</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Merchant Target</p>
                <p className="text-lg font-bold">{(horizon.merchant_target || 0).toLocaleString()}</p>
              </div>
            </div>

            {/* Deviations */}
            {horizon.deviation_alerts?.length > 0 && (
              <div className="mt-4 p-2 bg-amber-50 rounded">
                <p className="text-xs font-medium text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Deviations Detected
                </p>
                {horizon.deviation_alerts.slice(0, 2).map((d, i) => (
                  <p key={i} className="text-xs text-amber-700 mt-1">
                    {d.metric}: {d.actual?.toLocaleString()} vs {d.expected?.toLocaleString()} expected
                  </p>
                ))}
              </div>
            )}

            {/* Milestones Preview */}
            {horizon.milestones?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">Key Milestones</p>
                <div className="space-y-1">
                  {horizon.milestones.slice(0, 3).map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className={`w-3 h-3 ${m.status === 'completed' ? 'text-emerald-500' : 'text-slate-300'}`} />
                      <span className={m.status === 'completed' ? 'line-through text-slate-400' : ''}>{m.name}</span>
                      <span className="text-slate-400 ml-auto">{m.target_date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {horizons.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-slate-500">Run planner to initialize empire roadmap</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}