import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Shield,
  Globe,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';

const categoryIcons = {
  financial: DollarSign,
  growth: TrendingUp,
  risk: Shield,
  compliance: CheckCircle2,
  operational: Globe
};

const categoryColors = {
  financial: 'text-emerald-600 bg-emerald-50',
  growth: 'text-purple-600 bg-purple-50',
  risk: 'text-blue-600 bg-blue-50',
  compliance: 'text-amber-600 bg-amber-50',
  operational: 'text-slate-600 bg-slate-50'
};

export default function BoardReportPanel() {
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useQuery({
    queryKey: ['boardReport'],
    queryFn: async () => {
      const res = await base44.functions.invoke('governanceEngine', {
        action: 'generate_board_report'
      });
      return res.data?.report;
    }
  });

  const { data: governanceMetrics = [] } = useQuery({
    queryKey: ['governanceMetrics'],
    queryFn: async () => {
      const res = await base44.functions.invoke('governanceEngine', {
        action: 'get_governance_metrics',
        board_visible_only: true
      });
      return res.data?.metrics || [];
    }
  });

  const { data: auditResult } = useQuery({
    queryKey: ['governanceAudit'],
    queryFn: async () => {
      const res = await base44.functions.invoke('governanceEngine', {
        action: 'run_governance_audit'
      });
      return res.data;
    }
  });

  const refreshMutation = useMutation({
    mutationFn: () => base44.functions.invoke('governanceEngine', {
      action: 'generate_board_report'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boardReport'] });
      queryClient.invalidateQueries({ queryKey: ['governanceMetrics'] });
      toast.success('Board report refreshed');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-slate-600" />
            Board Report
          </h2>
          <p className="text-sm text-slate-500">IPO-grade metrics and governance status</p>
        </div>
        <div className="flex gap-2">
          <Badge className={auditResult?.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
            {auditResult?.passed ? 'Audit Passed' : 'Audit Issues'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Compliance Score */}
      <Card className={auditResult?.compliance_score >= 90 ? 'border-emerald-200 bg-emerald-50/50' : auditResult?.compliance_score >= 70 ? 'border-amber-200 bg-amber-50/50' : 'border-red-200 bg-red-50/50'}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Compliance Score</p>
              <p className="text-3xl font-bold">{auditResult?.compliance_score || 0}/100</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">{auditResult?.breaches?.length || 0} issue(s)</p>
              {auditResult?.breaches?.slice(0, 2).map((breach, i) => (
                <p key={i} className="text-xs text-red-600">{breach.type}</p>
              ))}
            </div>
          </div>
          <Progress value={auditResult?.compliance_score || 0} className="h-2 mt-3" />
        </CardContent>
      </Card>

      {/* Key Financial Metrics */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">ARR</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-700">
                ${(report.financial?.arr || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">NRR</span>
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-700">
                {(report.financial?.nrr || 0).toFixed(0)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">Merchants</span>
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-700">
                {report.growth?.total_merchants || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600">Fraud Prevented</span>
                <Shield className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-2xl font-bold text-red-700">
                ${(report.risk_intelligence?.total_revenue_saved || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Metrics by Category */}
      <div className="grid md:grid-cols-2 gap-4">
        {['financial', 'growth', 'risk', 'operational'].map(category => {
          const categoryMetrics = governanceMetrics.filter(m => m.category === category);
          const Icon = categoryIcons[category] || CheckCircle2;
          const colorClass = categoryColors[category] || categoryColors.operational;
          
          return (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 capitalize">
                  <div className={`p-1.5 rounded ${colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {category} Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categoryMetrics.slice(0, 4).map(metric => (
                    <div key={metric.id} className="flex items-center justify-between py-1 border-b last:border-0">
                      <span className="text-sm text-slate-600">{metric.metric_name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${metric.breach_detected ? 'text-red-600' : 'text-slate-900'}`}>
                          {metric.unit === '$' ? '$' : ''}{typeof metric.current_value === 'number' ? metric.current_value.toLocaleString() : metric.current_value}{metric.unit === '%' ? '%' : ''}
                        </span>
                        {metric.trend === 'improving' && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                        {metric.trend === 'declining' && <TrendingDown className="w-3 h-3 text-red-500" />}
                        {metric.breach_detected && <AlertTriangle className="w-3 h-3 text-red-500" />}
                      </div>
                    </div>
                  ))}
                  {categoryMetrics.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-2">No metrics</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}