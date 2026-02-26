import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlatformResolver, requireResolved } from '@/components/usePlatformResolver';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, RefreshCw, Activity, History, Play, Lightbulb } from 'lucide-react';
import ModelExplainabilityPanel from '@/components/ai/ModelExplainabilityPanel';
import RetrainingWorkflowPanel from '@/components/ai/RetrainingWorkflowPanel';

export default function AIModelGovernance() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const tenantId = resolverCheck.tenantId;
  const queryClient = useQueryClient();

  const [selectedModel, setSelectedModel] = useState(null);
  const [explainability, setExplainability] = useState(null);

  // Fetch AI model versions
  const { data: models = [], isLoading: loadingModels } = useQuery({
    queryKey: ['aiModels', tenantId],
    queryFn: async () => {
      const all = await base44.entities.AIModelVersion.list();
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!tenantId,
  });

  // Fetch telemetry for drift detection history
  const { data: telemetry = [] } = useQuery({
    queryKey: ['modelTelemetry', tenantId],
    queryFn: async () => {
      const all = await base44.entities.ClientTelemetry.filter({
        kind: 'AI_MODEL_DRIFT_DETECTION'
      });
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 30);
    },
    enabled: !!tenantId,
  });

  // Fetch governance audit events
  const { data: auditEvents = [] } = useQuery({
    queryKey: ['governanceAudit', tenantId],
    queryFn: async () => {
      const all = await base44.entities.GovernanceAuditEvent.filter({
        entity_affected: 'AIModelVersion'
      });
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 20);
    },
    enabled: !!tenantId,
  });

  // Fetch model experiments
  const { data: experiments = [] } = useQuery({
    queryKey: ['modelExperiments', tenantId],
    queryFn: async () => {
      const all = await base44.entities.ModelExperiment.list();
      return all.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!tenantId,
  });

  // Mutation to trigger drift detection
  const triggerDriftDetection = useMutation({
    mutationFn: async () => {
      const { data } = await base44.functions.invoke('aiModelGovernance', {
        tenant_id: tenantId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['modelTelemetry']);
    },
  });

  // Load explainability data
  const loadExplainability = async (modelId) => {
    try {
      const { data } = await base44.functions.invoke('modelRetrainingWorkflow', {
        action: 'get_explainability',
        model_id: modelId,
      });
      setExplainability(data);
    } catch (error) {
      console.error('Failed to load explainability:', error);
    }
  };

  // Calculate summary statistics
  const deployedModels = models.filter(m => m.is_deployed).length;
  const highDriftModels = models.filter(m => m.drift_score >= 75).length;
  const highBiasModels = models.filter(m => m.bias_score >= 75).length;
  const avgDrift = models.length > 0 ? models.reduce((sum, m) => sum + (m.drift_score || 0), 0) / models.length : 0;
  const avgBias = models.length > 0 ? models.reduce((sum, m) => sum + (m.bias_score || 0), 0) / models.length : 0;

  // Prepare historical drift data
  const driftHistory = telemetry.map(t => ({
    date: new Date(t.created_date).toLocaleDateString(),
    timestamp: new Date(t.created_date).getTime(),
    high: t.context_json?.summary?.high || 0,
    medium: t.context_json?.summary?.med || 0,
    low: t.context_json?.summary?.low || 0,
  })).reverse();

  // Generate retraining proposals
  const retrainingProposals = models
    .filter(m => m.is_deployed && (m.drift_score >= 50 || m.bias_score >= 50))
    .map(m => ({
      model: m,
      priority: m.drift_score >= 75 || m.bias_score >= 75 ? 'high' : m.drift_score >= 50 || m.bias_score >= 50 ? 'medium' : 'low',
      reasons: [
        m.drift_score >= 75 && 'Critical drift detected',
        m.bias_score >= 75 && 'Critical bias detected',
        m.drift_score >= 50 && m.drift_score < 75 && 'Moderate drift',
        m.bias_score >= 50 && m.bias_score < 75 && 'Moderate bias',
      ].filter(Boolean),
    }));

  if (loadingModels) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading AI models...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Brain className="w-8 h-8 text-purple-600" />
            AI Model Governance
          </h1>
          <p className="text-slate-500 mt-1">Monitor model performance, drift, bias, and automate retraining decisions</p>
        </div>
        <Button
          onClick={() => triggerDriftDetection.mutate()}
          disabled={triggerDriftDetection.isLoading}
        >
          {triggerDriftDetection.isLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Run Drift Detection
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{models.length}</div>
            <p className="text-xs text-slate-500 mt-1">{deployedModels} deployed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Avg Drift Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{avgDrift.toFixed(1)}</div>
              {avgDrift >= 75 ? (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              ) : avgDrift >= 50 ? (
                <TrendingUp className="w-5 h-5 text-amber-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">{highDriftModels} models at risk</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Avg Bias Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{avgBias.toFixed(1)}</div>
              {avgBias >= 75 ? (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              ) : avgBias >= 50 ? (
                <TrendingUp className="w-5 h-5 text-amber-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">{highBiasModels} models flagged</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Retraining Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{retrainingProposals.length}</div>
            <p className="text-xs text-slate-500 mt-1">{retrainingProposals.filter(p => p.priority === 'high').length} high priority</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Last Check</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {telemetry[0] ? new Date(telemetry[0].created_date).toLocaleString() : 'Never'}
            </div>
            <p className="text-xs text-slate-500 mt-1">{telemetry.length} runs total</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="drift">Drift Trends</TabsTrigger>
          <TabsTrigger value="retraining">Retraining</TabsTrigger>
          <TabsTrigger value="explainability">Explainability</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {retrainingProposals.length > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-900">
                <strong>{retrainingProposals.length} models</strong> require attention. Review the Retraining tab for automated proposals.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Drift History Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Drift Detection History</CardTitle>
                <CardDescription>Issues detected over time</CardDescription>
              </CardHeader>
              <CardContent>
                {driftHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={driftHistory}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={12} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="high" fill="#ef4444" name="High" />
                      <Bar dataKey="medium" fill="#f59e0b" name="Medium" />
                      <Bar dataKey="low" fill="#3b82f6" name="Low" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-400">
                    No drift history available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Model Performance Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Model Performance Distribution</CardTitle>
                <CardDescription>Drift vs Bias scores</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {models.slice(0, 5).map(model => (
                    <div key={model.id} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{model.model_name}</div>
                        <div className="text-xs text-slate-500">{model.version}</div>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={model.drift_score >= 75 ? 'destructive' : model.drift_score >= 50 ? 'outline' : 'secondary'}>
                          Drift: {model.drift_score || 0}
                        </Badge>
                        <Badge variant={model.bias_score >= 75 ? 'destructive' : model.bias_score >= 50 ? 'outline' : 'secondary'}>
                          Bias: {model.bias_score || 0}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Models Tab */}
        <TabsContent value="models" className="space-y-4">
          <div className="grid gap-4">
            {models.map(model => (
              <Card key={model.id} className={selectedModel?.id === model.id ? 'ring-2 ring-purple-500' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {model.model_name}
                        {model.is_deployed && <Badge className="bg-green-500">Deployed</Badge>}
                        {model.compliance_status === 'approved' && <Badge variant="outline">Approved</Badge>}
                      </CardTitle>
                      <CardDescription>
                        Version {model.version} • {model.model_type}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedModel(model)}>
                        View Details
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setSelectedModel(model);
                          loadExplainability(model.id);
                        }}
                      >
                        <Lightbulb className="w-4 h-4 mr-2" />
                        Explain
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-500">Drift Score</div>
                      <div className="text-2xl font-bold flex items-center gap-2">
                        {model.drift_score || 0}
                        {model.drift_score >= 75 ? (
                          <TrendingUp className="w-4 h-4 text-red-500" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Bias Score</div>
                      <div className="text-2xl font-bold">{model.bias_score || 0}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Precision</div>
                      <div className="text-2xl font-bold">{model.precision ? (model.precision * 100).toFixed(1) : 'N/A'}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">F1 Score</div>
                      <div className="text-2xl font-bold">{model.f1_score ? model.f1_score.toFixed(3) : 'N/A'}</div>
                    </div>
                  </div>
                  {model.changelog && (
                    <div className="mt-4 text-sm text-slate-600 bg-slate-50 p-3 rounded">
                      {model.changelog}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Drift Trends Tab */}
        <TabsContent value="drift" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historical Drift Trends</CardTitle>
              <CardDescription>Drift detection results over time</CardDescription>
            </CardHeader>
            <CardContent>
              {driftHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={driftHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="high" stroke="#ef4444" strokeWidth={2} name="High Severity" />
                    <Line type="monotone" dataKey="medium" stroke="#f59e0b" strokeWidth={2} name="Medium Severity" />
                    <Line type="monotone" dataKey="low" stroke="#3b82f6" strokeWidth={2} name="Low Severity" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-96 flex items-center justify-center text-slate-400">
                  No drift trend data available
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {telemetry.slice(0, 6).map(t => (
              <Card key={t.id}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {new Date(t.created_date).toLocaleString()}
                  </CardTitle>
                  <CardDescription>
                    {t.message}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Badge variant="destructive">{t.context_json?.summary?.high || 0} High</Badge>
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      {t.context_json?.summary?.med || 0} Med
                    </Badge>
                    <Badge variant="outline">{t.context_json?.summary?.low || 0} Low</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Retraining Tab */}
        <TabsContent value="retraining" className="space-y-4">
          <Alert className="bg-purple-50 border-purple-300">
            <Activity className="w-4 h-4 text-purple-600" />
            <AlertDescription className="text-purple-900">
              <strong>Automated Retraining Proposals</strong> are generated based on drift and bias thresholds. 
              Review and approve proposals to maintain model performance.
            </AlertDescription>
          </Alert>

          {retrainingProposals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">All Models Performing Well</h3>
                <p className="text-slate-500 mt-1">No retraining needed at this time</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {retrainingProposals.map(({ model, priority, reasons }) => (
                <Card key={model.id} className={
                  priority === 'high' ? 'border-red-300 bg-red-50' : 
                  priority === 'medium' ? 'border-amber-300 bg-amber-50' : 
                  'border-blue-300 bg-blue-50'
                }>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {model.model_name}
                          <Badge variant={priority === 'high' ? 'destructive' : priority === 'medium' ? 'outline' : 'secondary'}>
                            {priority.toUpperCase()} Priority
                          </Badge>
                        </CardTitle>
                        <CardDescription>Version {model.version}</CardDescription>
                      </div>
                      <Button size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Start Retraining
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium mb-2">Reasons for Retraining:</div>
                        <ul className="space-y-1">
                          {reasons.map((reason, i) => (
                            <li key={i} className="text-sm text-slate-700 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid grid-cols-3 gap-4 pt-3 border-t">
                        <div>
                          <div className="text-xs text-slate-500">Drift Score</div>
                          <div className="text-lg font-bold">{model.drift_score || 0}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Bias Score</div>
                          <div className="text-lg font-bold">{model.bias_score || 0}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Current F1</div>
                          <div className="text-lg font-bold">{model.f1_score ? model.f1_score.toFixed(3) : 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Explainability Tab */}
        <TabsContent value="explainability" className="space-y-4">
          <ModelExplainabilityPanel explainability={explainability} />
        </TabsContent>

        {/* Workflow Tab */}
        <TabsContent value="workflow" className="space-y-4">
          <RetrainingWorkflowPanel model={selectedModel} experiments={experiments} />
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Governance Audit Trail
              </CardTitle>
              <CardDescription>Complete history of model governance events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditEvents.map(event => (
                  <div key={event.id} className="border-l-2 border-purple-500 pl-4 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{event.message}</div>
                        <div className="text-sm text-slate-500">
                          {new Date(event.created_date).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant={event.severity === 'high' ? 'destructive' : 'outline'}>
                        {event.level}
                      </Badge>
                    </div>
                    {event.details && (
                      <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                        {JSON.stringify(event.details, null, 2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}