import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Target, RefreshCw, AlertTriangle, DollarSign, Users, 
  TrendingUp, CheckCircle2, Crosshair
} from 'lucide-react';
import { toast } from 'sonner';

const playTypeColors = {
  pricing_attack: 'bg-red-100 text-red-700',
  feature_leap: 'bg-blue-100 text-blue-700',
  acquisition_offer: 'bg-purple-100 text-purple-700',
  customer_migration: 'bg-emerald-100 text-emerald-700',
  talent_poach: 'bg-amber-100 text-amber-700'
};

export default function AbsorptionRadarPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['absorptionRadar'],
    queryFn: async () => {
      const res = await base44.functions.invoke('absorptionEngine', { action: 'get_radar' });
      return res.data?.radar;
    }
  });

  const runScanMutation = useMutation({
    mutationFn: () => base44.functions.invoke('absorptionEngine', { action: 'run_scan' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['absorptionRadar'] });
      toast.success(`Absorption scan: ${res.data?.competitors_scanned || 0} analyzed, ${res.data?.plays_generated || 0} plays generated`);
    }
  });

  const approvePlayMutation = useMutation({
    mutationFn: (playId) => base44.functions.invoke('absorptionEngine', { action: 'approve_play', play_id: playId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absorptionRadar'] });
      toast.success('Play approved for execution');
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const radar = data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Crosshair className="w-6 h-6 text-red-600" />
            Competitive Absorption Radar
          </h2>
          <p className="text-sm text-slate-500">Algorithmic competitor vulnerability detection</p>
        </div>
        <Button size="sm" onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending} className="bg-red-600 hover:bg-red-700">
          {runScanMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Target className="w-4 h-4 mr-1" />}
          Scan Competitors
        </Button>
      </div>

      {/* Vulnerability Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vulnerability Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 rounded-lg text-center border border-red-200">
              <p className="text-3xl font-bold text-red-700">{radar.vulnerability_heatmap?.high || 0}</p>
              <p className="text-sm text-red-600">High Vulnerability</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg text-center border border-amber-200">
              <p className="text-3xl font-bold text-amber-700">{radar.vulnerability_heatmap?.medium || 0}</p>
              <p className="text-sm text-amber-600">Medium Vulnerability</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg text-center border border-emerald-200">
              <p className="text-3xl font-bold text-emerald-700">{radar.vulnerability_heatmap?.low || 0}</p>
              <p className="text-sm text-emerald-600">Low Vulnerability</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Priority Ranking */}
      {radar.priority_ranking?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-red-600" />
              Priority Targets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-auto">
              {radar.priority_ranking.map((target, i) => (
                <div key={target.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{target.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs capitalize">{target.segment?.replace('_', ' ')}</Badge>
                        {target.weakness_signals > 0 && (
                          <Badge className="bg-red-100 text-red-700 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {target.weakness_signals} signals
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Priority</span>
                      <Progress value={target.absorption_priority} className="w-20 h-2" />
                      <span className="text-sm font-bold w-8">{target.absorption_priority?.toFixed(0)}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Est. ARR: ${(target.estimated_arr / 1000).toFixed(0)}K
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Plays */}
      {radar.pending_plays?.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending Absorption Plays</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {radar.pending_plays.map((play) => (
                <div key={play.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={playTypeColors[play.type]}>{play.type?.replace('_', ' ')}</Badge>
                      <span className="font-medium text-sm">{play.competitor}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span><DollarSign className="w-3 h-3 inline" /> ${(play.capital / 1000).toFixed(0)}K</span>
                      <span><Users className="w-3 h-3 inline" /> +{play.conversion} customers</span>
                      <span><TrendingUp className="w-3 h-3 inline" /> {play.roi?.toFixed(1)}x ROI</span>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => approvePlayMutation.mutate(play.id)}
                    disabled={approvePlayMutation.isPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capital Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <DollarSign className="w-6 h-6 mx-auto text-amber-600 mb-2" />
            <p className="text-2xl font-bold">${((radar.total_capital_required || 0) / 1000).toFixed(0)}K</p>
            <p className="text-xs text-slate-500">Capital Required</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <TrendingUp className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
            <p className="text-2xl font-bold">{(radar.avg_roi_projection || 0).toFixed(1)}x</p>
            <p className="text-xs text-slate-500">Avg ROI</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Target className="w-6 h-6 mx-auto text-red-600 mb-2" />
            <p className="text-2xl font-bold">{radar.high_priority_count || 0}</p>
            <p className="text-xs text-slate-500">High Priority</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}