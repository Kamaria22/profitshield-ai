import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, CheckCircle, AlertTriangle, Play, RotateCcw, Clock } from 'lucide-react';

export default function RetrainingWorkflowPanel({ model, experiments = [] }) {
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const queryClient = useQueryClient();

  const proposeRetrainingMutation = useMutation({
    mutationFn: async (modelId) => {
      const { data } = await base44.functions.invoke('modelRetrainingWorkflow', {
        action: 'propose_retraining',
        model_id: modelId,
        config: {
          training_window_days: 90,
          validation_split: 0.2,
        },
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['modelExperiments']);
      queryClient.invalidateQueries(['governanceAudit']);
    },
  });

  const startRetrainingMutation = useMutation({
    mutationFn: async (experimentId) => {
      const { data } = await base44.functions.invoke('modelRetrainingWorkflow', {
        action: 'start_retraining',
        model_id: experimentId,
        version: model?.version,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['aiModels']);
      queryClient.invalidateQueries(['modelExperiments']);
    },
  });

  const deployModelMutation = useMutation({
    mutationFn: async (modelId) => {
      const { data } = await base44.functions.invoke('modelRetrainingWorkflow', {
        action: 'deploy_model',
        model_id: modelId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['aiModels']);
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async (modelName) => {
      const { data } = await base44.functions.invoke('modelRetrainingWorkflow', {
        action: 'rollback',
        model_name: modelName,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['aiModels']);
    },
  });

  if (!model) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-slate-500">
          Select a model to manage retraining workflow
        </CardContent>
      </Card>
    );
  }

  const needsRetraining = model.drift_score >= 50 || model.bias_score >= 50;
  const modelExperiments = experiments.filter(e => e.parent_version_id === model.id);

  return (
    <div className="space-y-4">
      {/* Current Model Status */}
      <Card className={needsRetraining ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {needsRetraining ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600" />
            )}
            Current Model: {model.model_name} v{model.version}
          </CardTitle>
          <CardDescription>
            {needsRetraining 
              ? 'This model requires retraining due to drift or bias issues' 
              : 'Model is performing within acceptable parameters'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-4">
              <div>
                <div className="text-xs text-slate-500">Drift Score</div>
                <div className="text-2xl font-bold">{model.drift_score || 0}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Bias Score</div>
                <div className="text-2xl font-bold">{model.bias_score || 0}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">F1 Score</div>
                <div className="text-2xl font-bold">{model.f1_score?.toFixed(3) || 'N/A'}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={needsRetraining ? 'default' : 'outline'}
                onClick={() => proposeRetrainingMutation.mutate(model.id)}
                disabled={proposeRetrainingMutation.isLoading}
              >
                {proposeRetrainingMutation.isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span className="ml-2">Propose Retraining</span>
              </Button>
              {model.is_deployed && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rollbackMutation.mutate(model.model_name)}
                  disabled={rollbackMutation.isLoading}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Rollback
                </Button>
              )}
            </div>
          </div>

          {needsRetraining && (
            <Alert className="bg-amber-100 border-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-900">
                <strong>Action Required:</strong> Propose retraining to address {
                  model.drift_score >= 50 && model.bias_score >= 50 ? 'drift and bias' :
                  model.drift_score >= 50 ? 'drift' : 'bias'
                } issues.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Retraining Experiments */}
      <Card>
        <CardHeader>
          <CardTitle>Retraining Pipeline</CardTitle>
          <CardDescription>
            Active and completed retraining experiments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modelExperiments.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No retraining experiments yet
            </div>
          ) : (
            <div className="space-y-3">
              {modelExperiments.map(exp => (
                <div key={exp.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Experiment {exp.id.slice(0, 8)}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">{exp.reason}</div>
                    </div>
                    <Badge variant={
                      exp.status === 'completed' ? 'default' :
                      exp.status === 'training' ? 'outline' :
                      exp.status === 'proposed' ? 'secondary' : 'destructive'
                    }>
                      {exp.status}
                    </Badge>
                  </div>

                  {exp.status === 'training' && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>Training Progress</span>
                        <span>75%</span>
                      </div>
                      <Progress value={75} className="h-2" />
                    </div>
                  )}

                  <div className="flex gap-2">
                    {exp.status === 'proposed' && (
                      <Button
                        size="sm"
                        onClick={() => startRetrainingMutation.mutate(exp.id)}
                        disabled={startRetrainingMutation.isLoading}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Training
                      </Button>
                    )}
                    {exp.status === 'completed' && exp.result_version_id && (
                      <Button
                        size="sm"
                        onClick={() => deployModelMutation.mutate(exp.result_version_id)}
                        disabled={deployModelMutation.isLoading}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Deploy New Version
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}