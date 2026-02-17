import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, RefreshCw, AlertTriangle, GitBranch, Zap, 
  CheckCircle2, XCircle, RotateCcw, Scale, FileText, 
  Eye, Users, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

  const { data: fairnessData } = useQuery({
    queryKey: ['aiFairnessDashboard'],
    queryFn: async () => {
      const res = await base44.functions.invoke('aiModelGovernance', { action: 'get_fairness_dashboard' });
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

  const runFairnessMutation = useMutation({
    mutationFn: () => base44.functions.invoke('aiModelGovernance', { action: 'run_fairness_audit' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['aiFairnessDashboard'] });
      toast.success(`Fairness audit: ${res.data?.models_audited || 0} models, avg score ${res.data?.overall_fairness?.toFixed(0) || 0}%`);
    }
  });

  const runExplainabilityMutation = useMutation({
    mutationFn: () => base44.functions.invoke('aiModelGovernance', { action: 'run_explainability_check' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['aiFairnessDashboard'] });
      toast.success(`Explainability check: ${res.data?.models_checked || 0} models, avg score ${res.data?.avg_explainability?.toFixed(0) || 0}%`);
    }
  });

  const generateReportMutation = useMutation({
    mutationFn: () => base44.functions.invoke('aiModelGovernance', { action: 'generate_compliance_report', report_type: 'ai_governance', period_days: 30 }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['aiFairnessDashboard'] });
      toast.success(`Report generated: overall score ${res.data?.overall_score?.toFixed(0) || 0}%`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const dashboard = data || {};
  const fairness = fairnessData || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            AI Evolution Dashboard
          </h2>
          <p className="text-sm text-slate-500">Self-governing model lifecycle with fairness & explainability</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => generateReportMutation.mutate()} disabled={generateReportMutation.isPending}>
            <FileText className="w-4 h-4 mr-1" />
            Generate Report
          </Button>
          <Button size="sm" onClick={() => runDriftMutation.mutate()} disabled={runDriftMutation.isPending}>
            {runDriftMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
            Drift Detection
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fairness">Fairness & Bias</TabsTrigger>
          <TabsTrigger value="explainability">Explainability</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">

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
        </TabsContent>

        {/* Fairness & Bias Tab */}
        <TabsContent value="fairness" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => runFairnessMutation.mutate()} disabled={runFairnessMutation.isPending}>
              {runFairnessMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Scale className="w-4 h-4 mr-1" />}
              Run Fairness Audit
            </Button>
          </div>

          {/* Fairness Overview */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 text-center">
                <Scale className="w-6 h-6 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold">{(fairness.avg_fairness_score || 0).toFixed(0)}%</p>
                <p className="text-xs text-slate-500">Avg Fairness</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <Users className="w-6 h-6 mx-auto text-purple-600 mb-2" />
                <p className="text-2xl font-bold">{fairness.segment_summary?.length || 0}</p>
                <p className="text-xs text-slate-500">Segments Analyzed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <AlertTriangle className="w-6 h-6 mx-auto text-amber-600 mb-2" />
                <p className="text-2xl font-bold">{fairness.violations?.length || 0}</p>
                <p className="text-xs text-slate-500">Violations</p>
              </CardContent>
            </Card>
            <Card className={fairness.critical_violations > 0 ? 'border-red-300' : ''}>
              <CardContent className="pt-4 text-center">
                <XCircle className={`w-6 h-6 mx-auto mb-2 ${fairness.critical_violations > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
                <p className="text-2xl font-bold">{fairness.critical_violations || 0}</p>
                <p className="text-xs text-slate-500">Critical</p>
              </CardContent>
            </Card>
          </div>

          {/* Segment Performance Heatmap */}
          {fairness.segment_summary?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  Segment Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {fairness.segment_summary.map((seg, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span className="text-sm font-medium">{seg.segment}</span>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-slate-500">Accuracy</p>
                          <p className="text-sm font-medium">{seg.avg_accuracy?.toFixed(1)}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500">FPR</p>
                          <p className="text-sm font-medium">{(seg.avg_fpr * 100)?.toFixed(1)}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500">Disparate Impact</p>
                          <Badge className={seg.avg_disparate_impact >= 0.8 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                            {seg.avg_disparate_impact?.toFixed(2)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Model Audit Status */}
          {fairness.model_audits?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Model Fairness Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {fairness.model_audits.map((audit, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span className="text-sm font-medium">{audit.model}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={audit.fairness || 0} className="w-20 h-2" />
                        <span className="text-sm w-12">{audit.fairness?.toFixed(0)}%</span>
                        <Badge className={
                          audit.status === 'compliant' ? 'bg-emerald-100 text-emerald-700' :
                          audit.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }>{audit.status}</Badge>
                        {audit.violations > 0 && <Badge variant="outline">{audit.violations} issues</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Explainability Tab */}
        <TabsContent value="explainability" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => runExplainabilityMutation.mutate()} disabled={runExplainabilityMutation.isPending}>
              {runExplainabilityMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
              Run Explainability Check
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-600" />
                Explainability Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-center flex-1">
                  <p className="text-4xl font-bold text-purple-700">{(fairness.avg_explainability_score || 0).toFixed(0)}%</p>
                  <p className="text-sm text-slate-500">Average Explainability</p>
                </div>
                <Progress value={fairness.avg_explainability_score || 0} className="flex-1 h-4 [&>div]:bg-purple-600" />
              </div>
              <p className="text-sm text-slate-600">
                Explainability measures how well model decisions can be interpreted and explained to stakeholders. 
                Higher scores indicate better transparency through feature importance, SHAP values, and decision path clarity.
              </p>
            </CardContent>
          </Card>

          {fairness.model_audits?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Model Explainability Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {fairness.model_audits.map((audit, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span className="text-sm font-medium">{audit.model}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={audit.explainability || 0} className="w-20 h-2 [&>div]:bg-purple-500" />
                        <span className="text-sm w-12">{(audit.explainability || 0).toFixed(0)}%</span>
                        <Badge className={(audit.explainability || 0) >= 60 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                          {(audit.explainability || 0) >= 60 ? 'Good' : 'Needs Work'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => generateReportMutation.mutate()} disabled={generateReportMutation.isPending}>
              {generateReportMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
              Generate New Report
            </Button>
          </div>

          {fairness.recent_reports?.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent Compliance Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {fairness.recent_reports.map((report, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                      <div>
                        <p className="text-sm font-medium">{report.title}</p>
                        <p className="text-xs text-slate-500">{new Date(report.date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={report.score || 0} className="w-20 h-2" />
                        <span className="text-sm font-medium w-12">{report.score?.toFixed(0)}%</span>
                        <Badge className={
                          report.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          report.status === 'pending_review' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-700'
                        }>{report.status?.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                <FileText className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p>No compliance reports generated yet.</p>
                <Button size="sm" className="mt-3" onClick={() => generateReportMutation.mutate()}>
                  Generate First Report
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}