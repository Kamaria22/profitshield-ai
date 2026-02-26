import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import HolographicCard from '@/components/quantum/HolographicCard';
import QuantumButton from '@/components/quantum/QuantumButton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Shield, 
  Activity,
  Zap,
  CheckCircle
} from 'lucide-react';

/**
 * PREDICTIVE RISK PANEL
 * Shows AI-powered risk predictions and automated actions
 */
export default function PredictiveRiskPanel({ tenantId }) {
  const queryClient = useQueryClient();
  const [timeHorizon, setTimeHorizon] = React.useState('7d');

  const { data: prediction, isLoading } = useQuery({
    queryKey: ['risk-prediction', tenantId, timeHorizon],
    queryFn: async () => {
      const response = await base44.functions.invoke('neuralFraudEngine', {
        action: 'predict_risk',
        tenant_id: tenantId,
        time_horizon: timeHorizon
      });
      return response.data?.data;
    },
    enabled: !!tenantId,
    refetchInterval: 300000 // Refresh every 5 minutes
  });

  const flowMutation = useMutation({
    mutationFn: async (flowType) => {
      const response = await base44.functions.invoke('neuralFraudEngine', {
        action: 'trigger_automated_flow',
        flow_type: flowType,
        trigger_data: { tenant_id: tenantId }
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['risk-prediction']);
    }
  });

  if (isLoading) {
    return (
      <HolographicCard className="p-6">
        <div className="flex items-center justify-center h-40">
          <Activity className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      </HolographicCard>
    );
  }

  if (!prediction) return null;

  const getRiskColor = () => {
    if (prediction.risk_level === 'critical') return 'text-red-400';
    if (prediction.risk_level === 'high') return 'text-orange-400';
    if (prediction.risk_level === 'medium') return 'text-yellow-400';
    return 'text-emerald-400';
  };

  const getTrendIcon = () => {
    if (prediction.trend === 'escalating') return <TrendingUp className="w-5 h-5 text-red-400" />;
    if (prediction.trend === 'declining') return <TrendingDown className="w-5 h-5 text-emerald-400" />;
    return <Activity className="w-5 h-5 text-cyan-400" />;
  };

  return (
    <div className="space-y-6">
      <HolographicCard glow scanline className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-cyan-400" />
            <h2 className="text-2xl font-bold text-cyan-400">Predictive Risk Analysis</h2>
          </div>
          <Select value={timeHorizon} onValueChange={setTimeHorizon}>
            <SelectTrigger className="w-32 bg-slate-800/40 border-cyan-500/30 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 Hours</SelectItem>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Threat Score */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 mb-4">
            <div className={`text-5xl font-bold ${getRiskColor()}`}>
              {prediction.threat_score.toFixed(0)}
            </div>
          </div>
          <p className="text-sm text-slate-400">Predictive Threat Score</p>
          <Badge className={`mt-2 ${
            prediction.risk_level === 'critical' ? 'bg-red-500/20 text-red-400' :
            prediction.risk_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
            prediction.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-emerald-500/20 text-emerald-400'
          }`}>
            {prediction.risk_level.toUpperCase()}
          </Badge>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-slate-800/20 rounded-lg border border-cyan-500/20">
            <div className="flex items-center justify-center mb-2">
              {getTrendIcon()}
            </div>
            <p className="text-xs text-slate-400 mb-1">Trend</p>
            <p className="text-sm font-bold text-white capitalize">{prediction.trend}</p>
          </div>

          <div className="text-center p-4 bg-slate-800/20 rounded-lg border border-cyan-500/20">
            <AlertTriangle className="w-5 h-5 text-orange-400 mx-auto mb-2" />
            <p className="text-xs text-slate-400 mb-1">Predicted Incidents</p>
            <p className="text-sm font-bold text-white">{prediction.predicted_incidents}</p>
          </div>

          <div className="text-center p-4 bg-slate-800/20 rounded-lg border border-cyan-500/20">
            <CheckCircle className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
            <p className="text-xs text-slate-400 mb-1">Confidence</p>
            <p className="text-sm font-bold text-white">{(prediction.confidence * 100).toFixed(0)}%</p>
          </div>
        </div>

        {/* Recommended Action */}
        {prediction.recommended_action && (
          <Alert className="bg-purple-500/10 border-purple-500/30 mb-6">
            <Zap className="w-4 h-4 text-purple-400" />
            <AlertDescription className="text-purple-300">
              <strong>Recommended:</strong> {prediction.recommended_action}
            </AlertDescription>
          </Alert>
        )}

        {/* Preventative Measures */}
        {prediction.preventative_measures && prediction.preventative_measures.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-cyan-400 mb-3">Preventative Measures</h3>
            <ul className="space-y-2">
              {prediction.preventative_measures.map((measure, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  {measure}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Automated Actions */}
        <div className="border-t border-cyan-500/20 pt-6">
          <h3 className="text-sm font-bold text-cyan-400 mb-3">Automated Response Flows</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuantumButton
              size="sm"
              variant="danger"
              onClick={() => flowMutation.mutate('high_risk_lockdown')}
              loading={flowMutation.isPending}
            >
              High Risk Lockdown
            </QuantumButton>
            <QuantumButton
              size="sm"
              variant="default"
              onClick={() => flowMutation.mutate('velocity_limit')}
              loading={flowMutation.isPending}
            >
              Velocity Limits
            </QuantumButton>
            <QuantumButton
              size="sm"
              variant="primary"
              onClick={() => flowMutation.mutate('enhanced_verification')}
              loading={flowMutation.isPending}
            >
              Enhanced Verification
            </QuantumButton>
          </div>
        </div>
      </HolographicCard>
    </div>
  );
}