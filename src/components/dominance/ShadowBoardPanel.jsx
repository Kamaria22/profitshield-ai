import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Brain, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Shield } from 'lucide-react';
import { toast } from 'sonner';

const voteColors = {
  approve: 'bg-emerald-100 text-emerald-700',
  reject: 'bg-red-100 text-red-700',
  split: 'bg-amber-100 text-amber-700',
  abstain: 'bg-slate-100 text-slate-700'
};

const resilienceColors = {
  very_strong: 'bg-emerald-100 text-emerald-700',
  strong: 'bg-blue-100 text-blue-700',
  moderate: 'bg-amber-100 text-amber-700',
  weak: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700'
};

export default function ShadowBoardPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['shadowBoardSummary'],
    queryFn: async () => {
      const res = await base44.functions.invoke('shadowBoard', { action: 'get_summary' });
      return res.data?.summary;
    }
  });

  const runSessionMutation = useMutation({
    mutationFn: () => base44.functions.invoke('shadowBoard', { action: 'run_session' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['shadowBoardSummary'] });
      toast.success(`Shadow Board: ${res.data?.scenarios_analyzed || 0} scenarios, ${res.data?.votes_recorded || 0} votes, health ${res.data?.strategic_health_score?.toFixed(0) || 0}`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const summary = data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-slate-700" />
            Shadow Board Council
          </h2>
          <p className="text-sm text-slate-500">AI governance oversight</p>
        </div>
        <Button size="sm" onClick={() => runSessionMutation.mutate()} disabled={runSessionMutation.isPending}>
          {runSessionMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Brain className="w-4 h-4 mr-1" />}
          Run Session
        </Button>
      </div>

      {/* Divergence Warning */}
      {summary.latest_session?.divergence_count > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <p className="font-medium text-amber-800">{summary.latest_session.divergence_count} strategic divergence warning(s)</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Scenarios */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            Active Risk Scenarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-48 overflow-auto">
            {(summary.active_scenarios || []).map((scenario, i) => (
              <div key={i} className="p-2 bg-slate-50 rounded flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{scenario.title}</p>
                  <p className="text-xs text-slate-500 capitalize">{scenario.type?.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{scenario.risk_score} risk</Badge>
                  <Badge className={resilienceColors[scenario.resilience]}>{scenario.resilience}</Badge>
                </div>
              </div>
            ))}
            {!summary.active_scenarios?.length && <p className="text-sm text-slate-400 text-center py-4">Run session to analyze scenarios</p>}
          </div>
        </CardContent>
      </Card>

      {/* Latest Session Votes */}
      {summary.latest_session?.votes?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Latest Session Votes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.latest_session.votes.map((vote, i) => (
                <div key={i} className={`p-3 rounded-lg ${vote.divergence_warning ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-sm">{vote.title}</p>
                    <Badge className={voteColors[vote.recommendation]}>{vote.recommendation}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 capitalize">{vote.category}</span>
                    <span>{(vote.confidence * 100).toFixed(0)}% confidence</span>
                  </div>
                  {vote.divergence_warning && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="w-3 h-3" />
                      Strategic divergence - review recommended
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* High Risk Decisions */}
      {summary.high_risk_decisions?.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              High-Risk Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.high_risk_decisions.map((d, i) => (
                <div key={i} className="p-2 bg-red-50 rounded">
                  <p className="font-medium text-sm">{d.title}</p>
                  <p className="text-xs text-red-600">{d.divergence_warning ? 'Board split on decision' : 'Rejected by board'}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}