import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Building2, RefreshCw, TrendingUp, Shield, AlertTriangle,
  CheckCircle2, FileText, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

const statusColors = {
  passing: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  failing: 'bg-red-100 text-red-700'
};

const categoryIcons = {
  financial: TrendingUp,
  security: Shield,
  compliance: CheckCircle2,
  operational: BarChart3,
  governance: Building2
};

export default function IPOReadinessPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['ipoReadiness'],
    queryFn: async () => {
      const res = await base44.functions.invoke('governanceAudit', { action: 'get_ipo_readiness' });
      return res.data;
    }
  });

  const runAuditMutation = useMutation({
    mutationFn: () => base44.functions.invoke('governanceAudit', { action: 'run_audit' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ipoReadiness'] });
      toast.success(`Governance audit: ${res.data?.anomalies_detected?.length || 0} anomalies, status: ${res.data?.overall_status}`);
    }
  });

  const generateBriefMutation = useMutation({
    mutationFn: () => base44.functions.invoke('governanceAudit', { action: 'generate_investor_brief' }),
    onSuccess: (res) => {
      toast.success('Investor brief generated');
      // Could download or display the brief
      console.log('Investor Brief:', res.data?.investor_brief);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const readiness = data?.ipo_readiness || {};
  const metrics = data?.metrics || [];
  const overallScore = readiness.overall_score || 0;
  const scoreLevel = overallScore >= 80 ? 'strong' : overallScore >= 60 ? 'moderate' : 'weak';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-600" />
            IPO Readiness
          </h2>
          <p className="text-sm text-slate-500">Institutional-grade governance metrics</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => generateBriefMutation.mutate()} disabled={generateBriefMutation.isPending}>
            <FileText className="w-4 h-4 mr-1" />
            Investor Brief
          </Button>
          <Button size="sm" onClick={() => runAuditMutation.mutate()} disabled={runAuditMutation.isPending}>
            {runAuditMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
            Run Audit
          </Button>
        </div>
      </div>

      {/* Overall Score */}
      <Card className={`border-2 ${scoreLevel === 'strong' ? 'border-emerald-400' : scoreLevel === 'moderate' ? 'border-amber-400' : 'border-red-400'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-slate-500">Overall IPO Readiness Score</p>
              <p className="text-4xl font-bold">{overallScore.toFixed(0)}</p>
            </div>
            <Badge className={scoreLevel === 'strong' ? 'bg-emerald-500 text-white' : scoreLevel === 'moderate' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}>
              {scoreLevel.toUpperCase()}
            </Badge>
          </div>
          <Progress value={overallScore} className={`h-3 ${scoreLevel === 'strong' ? '[&>div]:bg-emerald-500' : scoreLevel === 'moderate' ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'}`} />
        </CardContent>
      </Card>

      {/* Category Scores */}
      <div className="grid grid-cols-5 gap-3">
        {Object.entries(readiness.category_scores || {}).map(([category, score]) => {
          const Icon = categoryIcons[category] || Building2;
          return (
            <Card key={category}>
              <CardContent className="pt-4 text-center">
                <Icon className="w-5 h-5 mx-auto text-slate-400 mb-2" />
                <p className="text-xl font-bold">{(score || 0).toFixed(0)}</p>
                <p className="text-xs text-slate-500 capitalize">{category}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Key Indices */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500">Margin Stability</p>
            <p className="text-2xl font-bold">{(readiness.margin_stability_index || 0).toFixed(0)}%</p>
            <Progress value={readiness.margin_stability_index || 0} className="h-1 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500">Infrastructure Resilience</p>
            <p className="text-2xl font-bold">{(readiness.infrastructure_resilience || 0).toFixed(0)}%</p>
            <Progress value={readiness.infrastructure_resilience || 0} className="h-1 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500">Revenue Predictability</p>
            <p className="text-2xl font-bold">{(readiness.revenue_predictability || 0).toFixed(0)}%</p>
            <Progress value={readiness.revenue_predictability || 0} className="h-1 mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500">Moat Strength</p>
            <p className="text-2xl font-bold">{(readiness.moat_strength || 0).toFixed(0)}</p>
            <Progress value={readiness.moat_strength || 0} className="h-1 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Risk Areas */}
      {readiness.risk_areas?.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              Risk Areas Requiring Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {readiness.risk_areas.map((risk, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-amber-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{risk.metric}</p>
                    <p className="text-xs text-slate-500">Current: {risk.current?.toFixed(1)} | Target: {risk.target}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[risk.status]}>{risk.status}</Badge>
                    <span className="text-sm text-red-600">Gap: {risk.gap?.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-auto">
            {metrics.map((metric, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs capitalize">{metric.category}</Badge>
                  <span className="text-sm">{metric.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{metric.current?.toFixed(1)}</span>
                  <span className="text-xs text-slate-400">/ {metric.target}</span>
                  <Badge className={statusColors[metric.status]}>{metric.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}