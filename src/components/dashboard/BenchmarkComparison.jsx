import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Award, Users } from 'lucide-react';

export default function BenchmarkComparison({ tenantId }) {
  const { data: comparison, isLoading } = useQuery({
    queryKey: ['benchmarkComparison', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('benchmarkEngine', {
        action: 'get_tenant_comparison',
        tenant_id: tenantId
      });
      return response.data?.comparison;
    },
    enabled: !!tenantId,
    staleTime: 60 * 60 * 1000 // 1 hour
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-slate-500">
          Loading benchmark data...
        </CardContent>
      </Card>
    );
  }

  if (!comparison) {
    return null;
  }

  const outperforms = comparison.percentile_rank || 50;
  const marginDiff = comparison.tenant_margin - comparison.benchmark_avg_margin;

  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Award className="w-5 h-5 text-indigo-600" />
          Industry Benchmark
        </CardTitle>
        <CardDescription>
          ProfitShield Industry Risk Index™ for {comparison.segment}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-slate-500">You outperform</p>
            <p className="text-3xl font-bold text-indigo-600">{outperforms.toFixed(0)}%</p>
            <p className="text-sm text-slate-500">of stores in your segment</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Your Margin</p>
            <p className="text-2xl font-bold">{comparison.tenant_margin.toFixed(1)}%</p>
            <div className="flex items-center gap-1 justify-end">
              {marginDiff >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm ${marginDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {marginDiff >= 0 ? '+' : ''}{marginDiff.toFixed(1)}% vs avg
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Segment Average</span>
            <span>{comparison.benchmark_avg_margin.toFixed(1)}%</span>
          </div>
          <Progress value={comparison.benchmark_avg_margin} className="h-2" />
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t text-sm text-slate-500">
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            Based on {comparison.sample_size} stores
          </div>
          <Badge variant="outline" className="text-xs">
            Risk Index: {comparison.risk_index}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}