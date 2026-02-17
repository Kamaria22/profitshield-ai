import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, AlertTriangle, RefreshCw, Target, Zap, 
  TrendingDown, Users, DollarSign, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

const severityColors = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-blue-100 text-blue-700'
};

const signalTypeIcons = {
  competitor_pricing: DollarSign,
  competitor_feature: Zap,
  churn_spike: TrendingDown,
  regulatory_change: Shield,
  macro_shift: Target,
  funding_round: Users
};

export default function WarRoomConsole() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['warRoomDashboard'],
    queryFn: async () => {
      const res = await base44.functions.invoke('strategicWarRoom', { action: 'get_dashboard' });
      return res.data?.dashboard;
    }
  });

  const runScanMutation = useMutation({
    mutationFn: () => base44.functions.invoke('strategicWarRoom', { action: 'run_scan' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['warRoomDashboard'] });
      toast.success(`War Room: ${res.data?.signals_detected || 0} threats detected, ${res.data?.escalated_to_founder || 0} escalated`);
    }
  });

  const approvePlanMutation = useMutation({
    mutationFn: (planId) => base44.functions.invoke('strategicWarRoom', { action: 'approve_response', plan_id: planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warRoomDashboard'] });
      toast.success('Response plan approved');
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const dashboard = data || {};
  const riskLevel = dashboard.risk_meter >= 70 ? 'critical' : dashboard.risk_meter >= 50 ? 'high' : dashboard.risk_meter >= 30 ? 'medium' : 'low';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-600" />
            Strategic War Room
          </h2>
          <p className="text-sm text-slate-500">Real-time threat monitoring & response</p>
        </div>
        <Button size="sm" onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending} className="bg-red-600 hover:bg-red-700">
          {runScanMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Target className="w-4 h-4 mr-1" />}
          Scan Threats
        </Button>
      </div>

      {/* Risk Meter */}
      <Card className={`border-2 ${riskLevel === 'critical' ? 'border-red-500 bg-red-50' : riskLevel === 'high' ? 'border-orange-400' : 'border-slate-200'}`}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Strategic Risk Level</span>
            <Badge className={severityColors[riskLevel]}>{riskLevel.toUpperCase()}</Badge>
          </div>
          <Progress value={dashboard.risk_meter || 0} className={`h-3 ${riskLevel === 'critical' ? '[&>div]:bg-red-500' : ''}`} />
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Low</span>
            <span>Critical</span>
          </div>
        </CardContent>
      </Card>

      {/* Threat Radar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Threat Radar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(dashboard.threat_radar || {}).map(([type, count]) => (
              <div key={type} className={`p-3 rounded-lg text-center ${count > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <p className="text-xl font-bold">{count}</p>
                <p className="text-xs text-slate-500 capitalize">{type.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Threats */}
      {dashboard.top_threats?.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" />
              Escalated Threats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.top_threats.map((threat) => {
                const Icon = signalTypeIcons[threat.type] || AlertTriangle;
                return (
                  <div key={threat.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-red-600" />
                      <div>
                        <p className="font-medium text-sm">{threat.title}</p>
                        <p className="text-xs text-slate-500">{threat.source}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={severityColors[threat.severity >= 80 ? 'critical' : threat.severity >= 60 ? 'high' : 'medium']}>
                        {threat.severity}
                      </Badge>
                      <p className="text-xs text-red-600 mt-1">
                        {threat.impact < 0 ? '-' : '+'}${Math.abs(threat.impact / 1000).toFixed(0)}K
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Response Plans */}
      {dashboard.pending_plans?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Response Plans Awaiting Approval</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.pending_plans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div>
                    <p className="font-medium text-sm">{plan.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{plan.priority}</Badge>
                      <span className="text-xs text-slate-500">${(plan.capital / 1000).toFixed(0)}K required</span>
                      <span className="text-xs text-slate-500">Owner: {plan.owner}</span>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    onClick={() => approvePlanMutation.mutate(plan.id)}
                    disabled={approvePlanMutation.isPending}
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

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-600">{dashboard.active_threats || 0}</p>
            <p className="text-xs text-slate-500">Active Threats</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{dashboard.escalated_threats || 0}</p>
            <p className="text-xs text-slate-500">Escalated</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{dashboard.pending_responses || 0}</p>
            <p className="text-xs text-slate-500">Pending Plans</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{dashboard.executing_responses || 0}</p>
            <p className="text-xs text-slate-500">Executing</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}