import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Brain,
  Zap,
  Shield,
  Rocket,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Settings,
  TrendingUp,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

const modeConfig = {
  off: { label: 'Off', color: 'bg-slate-100 text-slate-700', desc: 'Only suggestions, no automation' },
  advisory: { label: 'Advisory', color: 'bg-blue-100 text-blue-700', desc: 'Proposes decisions, requires approval' },
  semi_auto: { label: 'Semi-Auto', color: 'bg-amber-100 text-amber-700', desc: 'Auto-executes low-risk decisions' },
  full_auto: { label: 'Full-Auto', color: 'bg-emerald-100 text-emerald-700', desc: 'Executes within guardrails' }
};

const riskColors = {
  low: 'text-emerald-600',
  medium: 'text-amber-600',
  high: 'text-red-600'
};

export default function AutopilotStatusPanel() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['autopilotStatus'],
    queryFn: async () => {
      const res = await base44.functions.invoke('founderAutopilot', {
        action: 'get_autopilot_status'
      });
      return res.data;
    },
    refetchInterval: 60000 // Refresh every minute
  });

  const { data: configData } = useQuery({
    queryKey: ['autopilotConfig'],
    queryFn: async () => {
      const res = await base44.functions.invoke('founderAutopilot', {
        action: 'get_config'
      });
      return res.data?.config;
    }
  });

  const updateModeMutation = useMutation({
    mutationFn: async (mode) => {
      return base44.functions.invoke('founderAutopilot', {
        action: 'update_config',
        autopilot_mode: mode
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autopilotStatus'] });
      queryClient.invalidateQueries({ queryKey: ['autopilotConfig'] });
      toast.success('Autopilot mode updated');
    }
  });

  const runGrowthMutation = useMutation({
    mutationFn: () => base44.functions.invoke('founderAutopilot', { action: 'run_growth_optimizer' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['autopilotStatus'] });
      toast.success(`Growth optimizer: ${res.data?.signals_generated || 0} signals generated`);
    }
  });

  const runMoatMutation = useMutation({
    mutationFn: () => base44.functions.invoke('founderAutopilot', { action: 'run_moat_optimizer' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['autopilotStatus'] });
      toast.success(`Moat optimizer: ${res.data?.signals_generated || 0} signals generated`);
    }
  });

  const runStrategyMutation = useMutation({
    mutationFn: () => base44.functions.invoke('founderAutopilot', { action: 'weekly_strategy_review' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['autopilotStatus'] });
      queryClient.invalidateQueries({ queryKey: ['founderDecisions'] });
      toast.success(`Strategy review: ${res.data?.decisions_created || 0} decisions proposed`);
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  const currentMode = status?.autopilot_mode || 'advisory';
  const modeInfo = modeConfig[currentMode];

  return (
    <div className="space-y-4">
      {/* Main Status Card */}
      <Card className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-white">
              <Brain className="w-5 h-5 text-emerald-400" />
              AI Autopilot
            </CardTitle>
            <Badge className={modeInfo.color}>{modeInfo.label}</Badge>
          </div>
          <CardDescription className="text-slate-400">{modeInfo.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Score Gauges */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Rocket className="w-3 h-3" /> Growth Velocity
                </span>
                <span className="text-emerald-400 font-bold">{status?.growth_velocity_score || 0}</span>
              </div>
              <Progress value={status?.growth_velocity_score || 0} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Moat Strength
                </span>
                <span className="text-blue-400 font-bold">{status?.moat_strength_score || 0}</span>
              </div>
              <Progress value={status?.moat_strength_score || 0} className="h-2" />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 text-center pt-2">
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-lg font-bold text-white">{status?.ai_confidence_index || 0}%</p>
              <p className="text-xs text-slate-400">AI Confidence</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-lg font-bold text-amber-400">{status?.active_experiments || 0}</p>
              <p className="text-xs text-slate-400">Experiments</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2">
              <p className="text-lg font-bold text-purple-400">{status?.pending_decisions || 0}</p>
              <p className="text-xs text-slate-400">Pending</p>
            </div>
          </div>

          {/* Strategic Risk */}
          <div className="flex items-center justify-between bg-white/5 rounded-lg p-3">
            <span className="text-sm text-slate-400">Strategic Risk Index</span>
            <Badge className={
              status?.strategic_risk_index === 'high' ? 'bg-red-500/20 text-red-400' :
              status?.strategic_risk_index === 'medium' ? 'bg-amber-500/20 text-amber-400' :
              'bg-emerald-500/20 text-emerald-400'
            }>
              {status?.strategic_risk_index?.toUpperCase() || 'LOW'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Controls Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Autopilot Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Selector */}
          <div>
            <label className="text-sm text-slate-600 mb-1 block">Operating Mode</label>
            <Select 
              value={currentMode} 
              onValueChange={(v) => updateModeMutation.mutate(v)}
              disabled={updateModeMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off - Manual only</SelectItem>
                <SelectItem value="advisory">Advisory - Suggestions only</SelectItem>
                <SelectItem value="semi_auto">Semi-Auto - Low-risk automation</SelectItem>
                <SelectItem value="full_auto">Full-Auto - Within guardrails</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Manual Triggers */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runGrowthMutation.mutate()}
              disabled={runGrowthMutation.isPending}
              className="text-xs"
            >
              {runGrowthMutation.isPending ? (
                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <TrendingUp className="w-3 h-3 mr-1" />
              )}
              Growth
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runMoatMutation.mutate()}
              disabled={runMoatMutation.isPending}
              className="text-xs"
            >
              {runMoatMutation.isPending ? (
                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Shield className="w-3 h-3 mr-1" />
              )}
              Moat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runStrategyMutation.mutate()}
              disabled={runStrategyMutation.isPending}
              className="text-xs"
            >
              {runStrategyMutation.isPending ? (
                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Brain className="w-3 h-3 mr-1" />
              )}
              Strategy
            </Button>
          </div>

          {/* Last Run Times */}
          <div className="text-xs text-slate-500 space-y-1">
            {status?.last_growth_run && (
              <p>Growth: {new Date(status.last_growth_run).toLocaleString()}</p>
            )}
            {status?.last_moat_run && (
              <p>Moat: {new Date(status.last_moat_run).toLocaleString()}</p>
            )}
            {status?.last_strategy_review && (
              <p>Strategy: {new Date(status.last_strategy_review).toLocaleString()}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}