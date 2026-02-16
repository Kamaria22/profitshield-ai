import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  Globe, 
  TrendingUp, 
  Shield, 
  AlertTriangle,
  Zap,
  RefreshCw,
  CheckCircle,
  Activity,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function GlobalIntelligenceDashboard({ tenantId }) {
  const { data: modelData, isLoading: modelLoading, refetch: refetchModel } = useQuery({
    queryKey: ['activeModel'],
    queryFn: async () => {
      const models = await base44.entities.ModelVersion.filter({ 
        model_type: 'fraud_detection', 
        status: 'active' 
      });
      return models[0] || null;
    }
  });

  const { data: signals = [], isLoading: signalsLoading } = useQuery({
    queryKey: ['globalSignals'],
    queryFn: () => base44.entities.GlobalRiskSignal.filter({ is_active: true })
  });

  const { data: patterns = [], isLoading: patternsLoading } = useQuery({
    queryKey: ['anomalyPatterns'],
    queryFn: () => base44.entities.AnomalyPattern.filter({ is_active: true })
  });

  const { data: benchmarks = [] } = useQuery({
    queryKey: ['industryBenchmarks'],
    queryFn: () => base44.entities.IndustryBenchmark.filter({})
  });

  const handleCheckDrift = async () => {
    try {
      const result = await base44.functions.invoke('globalRiskBrain', {
        action: 'check_drift'
      });
      if (result.data?.drift_detected) {
        toast.warning(`Model drift detected! F1 dropped from ${result.data.baseline_f1?.toFixed(2)} to ${result.data.current_f1?.toFixed(2)}`);
      } else {
        toast.success('Model performance is stable');
      }
      refetchModel();
    } catch (e) {
      toast.error('Drift check failed');
    }
  };

  const handleRetrain = async () => {
    try {
      const result = await base44.functions.invoke('globalRiskBrain', {
        action: 'retrain_model',
        model_type: 'fraud_detection',
        scope: 'tenant',
        tenant_id: tenantId
      });
      if (result.data?.success) {
        toast.success(`New model version ${result.data.new_version} created`);
        refetchModel();
      } else {
        toast.warning(result.data?.reason || 'Retraining not triggered');
      }
    } catch (e) {
      toast.error('Retraining failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            Global Risk Intelligence
          </h2>
          <p className="text-slate-500">Self-improving AI risk detection system</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCheckDrift}>
            <Activity className="w-4 h-4 mr-2" />
            Check Drift
          </Button>
          <Button size="sm" onClick={handleRetrain} className="bg-purple-600 hover:bg-purple-700">
            <Zap className="w-4 h-4 mr-2" />
            Trigger Retrain
          </Button>
        </div>
      </div>

      {/* Model Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            Active Model
          </CardTitle>
        </CardHeader>
        <CardContent>
          {modelLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          ) : modelData ? (
            <div className="grid md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">Version</p>
                <p className="text-xl font-bold">{modelData.version}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">Accuracy</p>
                <p className="text-xl font-bold text-emerald-600">
                  {((modelData.performance_metrics?.accuracy || 0) * 100).toFixed(1)}%
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">F1 Score</p>
                <p className="text-xl font-bold">
                  {(modelData.performance_metrics?.f1_score || 0).toFixed(3)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">Drift Status</p>
                <div className="flex items-center gap-2">
                  {modelData.drift_metrics?.drift_alert_triggered ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <span className="font-medium text-amber-600">Drift Detected</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <span className="font-medium text-emerald-600">Stable</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">No active model found</p>
          )}
        </CardContent>
      </Card>

      {/* Global Signals & Patterns */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Global Risk Signals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" />
                Global Risk Signals
              </span>
              <Badge variant="outline">{signals.length} active</Badge>
            </CardTitle>
            <CardDescription>Cross-merchant fraud patterns</CardDescription>
          </CardHeader>
          <CardContent>
            {signalsLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            ) : signals.length === 0 ? (
              <p className="text-slate-500 text-center py-4">No signals detected yet</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {signals.slice(0, 10).map((signal) => (
                  <div key={signal.id} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm capitalize">
                        {signal.signal_type.replace(/_/g, ' ')}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        +{signal.impact_weight || 0} pts
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Occurrences: {signal.occurrence_count || 0}</span>
                      <span>Precision: {signal.precision ? (signal.precision * 100).toFixed(0) + '%' : 'N/A'}</span>
                    </div>
                    <Progress 
                      value={signal.confidence_score || 50} 
                      className="h-1 mt-2" 
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Anomaly Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Anomaly Patterns
              </span>
              <Badge variant="outline">{patterns.length} detected</Badge>
            </CardTitle>
            <CardDescription>Statistical outlier detection</CardDescription>
          </CardHeader>
          <CardContent>
            {patternsLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            ) : patterns.length === 0 ? (
              <p className="text-slate-500 text-center py-4">No patterns detected yet</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {patterns.slice(0, 10).map((pattern) => (
                  <div key={pattern.id} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm capitalize">
                        {pattern.pattern_type.replace(/_/g, ' ')}
                      </span>
                      <Badge 
                        className={
                          pattern.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          pattern.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                          pattern.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-700'
                        }
                      >
                        {pattern.severity}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Occurrences: {pattern.occurrence_count || 0}</span>
                      <span>Multiplier: {pattern.risk_multiplier || 1}x</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Industry Benchmarks */}
      {benchmarks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              Industry Benchmarks
            </CardTitle>
            <CardDescription>How you compare to peers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              {benchmarks.slice(0, 4).map((benchmark) => (
                <div key={benchmark.id} className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500 capitalize">{benchmark.industry_vertical}</p>
                  <p className="text-lg font-bold">{benchmark.fraud_rate_pct?.toFixed(2)}%</p>
                  <p className="text-xs text-slate-400">Avg Fraud Rate</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}