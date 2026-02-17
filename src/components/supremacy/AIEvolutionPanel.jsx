import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, RefreshCw, AlertTriangle, GitBranch, Zap, 
  CheckCircle2, XCircle, RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';

const driftRiskColors = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700'
};

export default function AIEvolutionPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['aiEvolutionDashboard'],
    queryFn: async () => {
      const res = await base44.functions.invoke('aiModelGovernance', { action: 'get_evolution_dashboard' });
      return res.data?.dashboard;
    }
  });

  const runDriftMutation = useMutation({
    mutationFn: () => base44.functions.invoke('aiModelGovernance', { action: 'run_drift_detection' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['aiEvolutionDashboard'] });
      toast.success(`Drift detection: ${res.data?.models_checked || 0} checked, ${res.data?.drift_events?.length || 0} events, health: ${res.data?.overall_health}`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const dashboard = data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            AI Evolution Dashboard
          </h2>
          <p className="text-sm text-slate-500">Self-governing model lifecycle management</p>
        </div>
        <Button size="sm" onClick={() => runDriftMutation.mutate()} disabled={runDriftMutation.isPending}>
          {runDriftMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
          Run Drift Detection
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <GitBranch className="w-6 h-6 mx-auto text-blue-600 mb-2" />
            <p className="text-2xl font-bold">{dashboard.total_models || 0}</p>
            <p className="text-xs text-slate-500">Total Versions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
            <p className="text-2xl font-bold">{dashboard.deployed_models || 0}</p>
            <p className="text-xs text-slate-500">Deployed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Zap className="w-6 h-6 mx-auto text-purple-600 mb-2" />
            <p className="text-2xl font-bold">{dashboard.experiments || 0}</p>
            <p className="text-xs text-slate-500">Experiments</p>
          </CardContent>
        </Card>
        <Card className={`border ${dashboard.drift_risk === 'high' ? 'border-red-300' : dashboard.drift_risk === 'medium' ? 'border-amber-300' : 'border-emerald-300'}`}>
          <CardContent className="pt-4 text-center">
            <AlertTriangle className={`w-6 h-6 mx-auto mb-2 ${dashboard.drift_risk === 'high' ? 'text-red-600' : dashboard.drift_risk === 'medium' ? 'text-amber-600' : 'text-emerald-600'}`} />
            <p className="text-2xl font-bold">{(dashboard.avg_drift_score || 0).toFixed(1)}</p>
            <p className="text-xs text-slate-500">Avg Drift</p>
          </CardContent>
        </Card>
      </div>

      {/* Drift Risk Gauge */}
      <Card className={dashboard.drift_risk === 'high' ? 'border-red-300' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Drift Risk Level</span>
            <Badge className={driftRiskColors[dashboard.drift_risk || 'low']}>{dashboard.drift_risk || 'low'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={dashboard.avg_drift_score || 0} className={`h-3 ${dashboard.drift_risk === 'high' ? '[&>div]:bg-red-500' : ''}`} />
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Safe (0)</span>
            <span>Threshold (15)</span>
            <span>Critical (100)</span>
          </div>
        </CardContent>
      </Card>

      {/* Model Lineage Tree */}
      {Object.keys(dashboard.lineage_tree || {}).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-600" />
              Model Lineage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(dashboard.lineage_tree || {}).map(([type, versions]) => (
                <div key={type}>
                  <p className="text-sm font-medium text-slate-700 mb-2 capitalize">{type.replace('_', ' ')}</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {versions.map((v, i) => (
                      <div 
                        key={i} 
                        className={`flex-shrink-0 p-2 rounded border ${v.is_deployed ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}
                      >
                        <p className="text-sm font-medium">{v.version}</p>
                        <p className="text-xs text-slate-500">Score: {v.evaluation_score || 0}</p>
                        <div className="flex gap-1 mt-1">
                          {v.is_deployed && <Badge className="text-xs bg-emerald-500">Live</Badge>}
                          {v.drift_score > 15 && <Badge className="text-xs bg-red-100 text-red-700">Drift</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Retraining Proposals */}
      {dashboard.retraining_proposals?.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <RotateCcw className="w-4 h-4" />
              Retraining Proposals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.retraining_proposals.map((proposal, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-amber-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{proposal.model_name} v{proposal.version}</p>
                    <p className="text-xs text-amber-700">Drift: {proposal.drift?.toFixed(1)} | Bias: {proposal.bias?.toFixed(1)}</p>
                  </div>
                  <Badge className={proposal.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                    {proposal.priority} priority
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Deployments */}
      {dashboard.recent_deployments?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Deployments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.recent_deployments.map((deployment, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{deployment.model} v{deployment.version}</p>
                    <p className="text-xs text-slate-500">{new Date(deployment.deployed_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="outline">Score: {deployment.evaluation}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}