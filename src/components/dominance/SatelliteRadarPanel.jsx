import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Globe, Satellite, RefreshCw, AlertTriangle, TrendingUp, MapPin } from 'lucide-react';
import { toast } from 'sonner';

const readinessColors = {
  ready: 'bg-emerald-100 text-emerald-700',
  developing: 'bg-blue-100 text-blue-700',
  early: 'bg-amber-100 text-amber-700',
  not_ready: 'bg-slate-100 text-slate-700'
};

const complianceColors = {
  compliant: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  needs_work: 'bg-orange-100 text-orange-700',
  blocked: 'bg-red-100 text-red-700'
};

export default function SatelliteRadarPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['satelliteRadar'],
    queryFn: async () => {
      const res = await base44.functions.invoke('globalSatellite', { action: 'get_expansion_radar' });
      return res.data?.radar;
    }
  });

  const runAggregationMutation = useMutation({
    mutationFn: () => base44.functions.invoke('globalSatellite', { action: 'run_aggregation' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['satelliteRadar'] });
      toast.success(`Satellite: ${res.data?.nodes_updated || 0} nodes, ${res.data?.signals_detected || 0} signals`);
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
            <Satellite className="w-6 h-6 text-blue-600" />
            Global Intelligence Satellite
          </h2>
          <p className="text-sm text-slate-500">Regional commerce intelligence</p>
        </div>
        <Button size="sm" onClick={() => runAggregationMutation.mutate()} disabled={runAggregationMutation.isPending}>
          {runAggregationMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Globe className="w-4 h-4 mr-1" />}
          Aggregate
        </Button>
      </div>

      {/* Regional Nodes */}
      {radar.nodes?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Regional Intelligence Nodes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-auto">
              {radar.nodes.map((node, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">{node.region_name}</p>
                      <p className="text-xs text-slate-500">TAM: ${(node.tam_opportunity / 1e9).toFixed(0)}B</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={readinessColors[node.market_readiness]}>{node.market_readiness}</Badge>
                      <Badge className={complianceColors[node.compliance_readiness]}>{node.compliance_readiness}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Accuracy</p>
                      <p className="font-medium">{node.model_accuracy?.toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Patterns</p>
                      <p className="font-medium">{node.fraud_patterns_count}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Priority</p>
                      <Progress value={node.expansion_priority} className="h-2 mt-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fraud Migration Signals */}
      {radar.fraud_migration_signals?.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              Fraud Migration Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {radar.fraud_migration_signals.map((signal, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-amber-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{signal.source_region} → {signal.target_region}</p>
                    <p className="text-xs text-amber-700">{signal.risk_vector}</p>
                  </div>
                  <Badge variant="outline">{(signal.confidence_score * 100).toFixed(0)}% conf</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Signals */}
      {radar.active_signals?.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-700">Action Required</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {radar.active_signals.map((signal, i) => (
                <div key={i} className="p-2 bg-red-50 rounded">
                  <p className="text-sm font-medium">{signal.signal_type?.replace('_', ' ')}</p>
                  <p className="text-xs text-red-600">{signal.recommended_action}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!radar.nodes && (
        <Card><CardContent className="py-8 text-center text-slate-500">Run aggregation to populate satellite data</CardContent></Card>
      )}
    </div>
  );
}