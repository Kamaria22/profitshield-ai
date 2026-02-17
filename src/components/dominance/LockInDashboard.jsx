import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Lock, Shield, RefreshCw, AlertTriangle, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const churnRiskColors = {
  very_low: 'bg-emerald-100 text-emerald-700',
  low: 'bg-blue-100 text-blue-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700'
};

const tierColors = {
  bronze: 'bg-amber-100 text-amber-700',
  silver: 'bg-slate-200 text-slate-700',
  gold: 'bg-yellow-100 text-yellow-700',
  platinum: 'bg-purple-100 text-purple-700'
};

export default function LockInDashboard() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['lockInDashboard'],
    queryFn: async () => {
      const res = await base44.functions.invoke('lockInCalculator', { action: 'get_dashboard' });
      return res.data?.dashboard;
    }
  });

  const calculateMutation = useMutation({
    mutationFn: () => base44.functions.invoke('lockInCalculator', { action: 'calculate_all' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['lockInDashboard'] });
      toast.success(`Lock-in calculated: ${res.data?.tenants_analyzed || 0} tenants, avg index ${res.data?.avg_lock_in_index?.toFixed(0) || 0}`);
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
            <Lock className="w-6 h-6 text-blue-600" />
            Platform Lock-In
          </h2>
          <p className="text-sm text-slate-500">Switching friction & dependency metrics</p>
        </div>
        <Button size="sm" onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending}>
          {calculateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Calculate
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="w-6 h-6 mx-auto text-blue-600 mb-2" />
            <p className="text-2xl font-bold">{dashboard.total_tenants || 0}</p>
            <p className="text-xs text-slate-500">Tenants Analyzed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Lock className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
            <p className="text-2xl font-bold">{(dashboard.avg_lock_in_index || 0).toFixed(0)}</p>
            <p className="text-xs text-slate-500">Avg Lock-In Index</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="pt-4 text-center">
            <Shield className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
            <p className="text-2xl font-bold text-emerald-700">{(dashboard.risk_distribution?.very_low || 0) + (dashboard.risk_distribution?.low || 0)}</p>
            <p className="text-xs text-slate-500">Low Churn Risk</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="pt-4 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto text-red-600 mb-2" />
            <p className="text-2xl font-bold text-red-700">{(dashboard.risk_distribution?.high || 0) + (dashboard.risk_distribution?.critical || 0)}</p>
            <p className="text-xs text-slate-500">At Risk</p>
          </CardContent>
        </Card>
      </div>

      {/* Churn Risk Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Churn Risk Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {['very_low', 'low', 'medium', 'high', 'critical'].map(risk => (
              <div key={risk} className={`p-3 rounded-lg text-center ${churnRiskColors[risk]}`}>
                <p className="text-xl font-bold">{dashboard.risk_distribution?.[risk] || 0}</p>
                <p className="text-xs capitalize">{risk.replace('_', ' ')}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Locked-In Tenants */}
      {dashboard.top_locked_in?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Highest Lock-In Tenants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-auto">
              {dashboard.top_locked_in.slice(0, 10).map((tenant) => (
                <div key={tenant.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{tenant.tenant_name || tenant.tenant_id?.slice(0, 8)}</p>
                    <p className="text-xs text-slate-500">{tenant.switching_cost_months || 0} months switching cost</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={tenant.lock_in_index} className="w-20 h-2" />
                    <span className="text-sm font-bold w-8">{tenant.lock_in_index?.toFixed(0)}</span>
                    <Badge className={tierColors[tenant.network_tier]}>{tenant.network_tier}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* At Risk Tenants */}
      {dashboard.at_risk?.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" />
              At-Risk Tenants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.at_risk.map((tenant) => (
                <div key={tenant.id} className="flex items-center justify-between p-2 bg-red-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{tenant.tenant_name || tenant.tenant_id?.slice(0, 8)}</p>
                    <p className="text-xs text-red-600">Lock-in: {tenant.lock_in_index?.toFixed(0)}</p>
                  </div>
                  <Badge className={churnRiskColors[tenant.churn_risk]}>{tenant.churn_risk}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}