import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Globe, Shield, Users, RefreshCw, Database, Lock } from 'lucide-react';
import { toast } from 'sonner';

const tierColors = {
  bronze: 'bg-amber-100 text-amber-700',
  silver: 'bg-slate-200 text-slate-700',
  gold: 'bg-yellow-100 text-yellow-700',
  platinum: 'bg-purple-100 text-purple-700'
};

export default function NetworkStatusPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['networkStats'],
    queryFn: async () => {
      const res = await base44.functions.invoke('commerceDataNetwork', {
        action: 'get_network_stats'
      });
      return res.data?.stats;
    }
  });

  const runAggregationMutation = useMutation({
    mutationFn: () => base44.functions.invoke('commerceDataNetwork', {
      action: 'run_aggregation'
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['networkStats'] });
      toast.success(`Network aggregation: ${res.data?.contributions_created || 0} contributions, ${res.data?.network_patterns_detected || 0} patterns`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const stats = data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-600" />
            Commerce Data Network
          </h2>
          <p className="text-sm text-slate-500">Cross-merchant fraud intelligence</p>
        </div>
        <Button
          size="sm"
          onClick={() => runAggregationMutation.mutate()}
          disabled={runAggregationMutation.isPending}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {runAggregationMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Database className="w-4 h-4 mr-1" />}
          Aggregate
        </Button>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <Users className="w-6 h-6 mx-auto text-blue-600 mb-2" />
            <p className="text-2xl font-bold">{stats.active_contributors || 0}</p>
            <p className="text-xs text-slate-500">Active Contributors</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Shield className="w-6 h-6 mx-auto text-emerald-600 mb-2" />
            <p className="text-2xl font-bold">{stats.cross_merchant_signals || 0}</p>
            <p className="text-xs text-slate-500">Network Signals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Database className="w-6 h-6 mx-auto text-purple-600 mb-2" />
            <p className="text-2xl font-bold">{(stats.total_data_points || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500">Data Points</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <Lock className="w-6 h-6 mx-auto text-amber-600 mb-2" />
            <p className="text-2xl font-bold">{(stats.avg_trust_score || 0).toFixed(0)}</p>
            <p className="text-xs text-slate-500">Avg Trust Score</p>
          </CardContent>
        </Card>
      </div>

      {/* Trust Tier Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trust Tier Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            {['bronze', 'silver', 'gold', 'platinum'].map(tier => (
              <div key={tier} className={`p-3 rounded-lg text-center ${tierColors[tier]}`}>
                <p className="text-2xl font-bold">{stats.tier_distribution?.[tier] || 0}</p>
                <p className="text-xs capitalize">{tier}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Privacy Notice */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-800">Privacy-First Network</p>
              <p className="text-xs text-emerald-700">All data anonymized with differential privacy. Zero cross-tenant exposure.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}