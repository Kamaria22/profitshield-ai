import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DollarSign,
  TrendingUp,
  Shield,
  Rocket,
  RefreshCw,
  Building,
  Users,
  Globe
} from 'lucide-react';
import { toast } from 'sonner';

const allocationIcons = {
  feature_dev: Rocket,
  marketing: TrendingUp,
  acquisition: Building,
  infra: Shield,
  hiring: Users,
  region_expansion: Globe,
  network_growth: Globe,
  enterprise_sales: DollarSign
};

const categoryColors = {
  high_roi: 'bg-emerald-100 text-emerald-700',
  defensive: 'bg-amber-100 text-amber-700',
  moat_investment: 'bg-purple-100 text-purple-700'
};

export default function CapitalAllocationPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['capitalAllocation'],
    queryFn: async () => {
      const res = await base44.functions.invoke('capitalAllocator', {
        action: 'get_allocation_brief'
      });
      return res.data;
    }
  });

  const runAllocationMutation = useMutation({
    mutationFn: () => base44.functions.invoke('capitalAllocator', {
      action: 'run_allocation'
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['capitalAllocation'] });
      toast.success(`Capital allocation: ${res.data?.recommendations?.length || 0} recommendations`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const decisions = data?.decisions || [];
  const highRoi = decisions.find(d => d.category === 'high_roi');
  const defensive = decisions.find(d => d.category === 'defensive');
  const moat = decisions.find(d => d.category === 'moat_investment');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" />
            Capital Allocation
          </h2>
          <p className="text-sm text-slate-500">AI-driven resource optimization</p>
        </div>
        <Button
          size="sm"
          onClick={() => runAllocationMutation.mutate()}
          disabled={runAllocationMutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {runAllocationMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Run Allocator
        </Button>
      </div>

      {/* Key Recommendations */}
      <div className="grid md:grid-cols-3 gap-4">
        {[
          { label: 'High ROI Move', data: highRoi, color: 'border-emerald-200' },
          { label: 'Defensive Move', data: defensive, color: 'border-amber-200' },
          { label: 'Moat Investment', data: moat, color: 'border-purple-200' }
        ].map(({ label, data: d, color }) => (
          <Card key={label} className={`${color} border-2`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              {d ? (
                <div>
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{d.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">${(d.budget_allocated || 0).toLocaleString()}</Badge>
                    <Badge className="bg-emerald-100 text-emerald-700">+{d.expected_roi}% ROI</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Run allocator to generate</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* All Decisions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Allocation Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-auto">
            {decisions.map((d) => {
              const Icon = allocationIcons[d.allocation_type] || DollarSign;
              return (
                <div key={d.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-slate-500">{d.time_horizon} term</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">${(d.budget_allocated || 0).toLocaleString()}</Badge>
                    <Badge className={categoryColors[d.category] || 'bg-slate-100'}>{d.category?.replace('_', ' ')}</Badge>
                  </div>
                </div>
              );
            })}
            {decisions.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Run allocator to generate recommendations</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}