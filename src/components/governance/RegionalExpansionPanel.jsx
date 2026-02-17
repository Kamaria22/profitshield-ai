import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Globe,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';

export default function RegionalExpansionPanel() {
  const queryClient = useQueryClient();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['regionalProfiles'],
    queryFn: async () => {
      const res = await base44.functions.invoke('globalExpansionEngine', {
        action: 'get_regional_profiles'
      });
      return res.data?.profiles || [];
    }
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ['expansionRecommendations'],
    queryFn: async () => {
      const res = await base44.functions.invoke('globalExpansionEngine', {
        action: 'get_expansion_recommendations'
      });
      return res.data?.recommendations || [];
    }
  });

  const runScanMutation = useMutation({
    mutationFn: () => base44.functions.invoke('globalExpansionEngine', {
      action: 'run_regional_scan'
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['regionalProfiles'] });
      queryClient.invalidateQueries({ queryKey: ['expansionRecommendations'] });
      toast.success(`Regional scan: ${res.data?.profiles_updated || 0} profiles updated`);
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

  const readyRegions = profiles.filter(p => p.expansion_readiness === 'ready').length;
  const totalOrders = profiles.reduce((s, p) => s + (p.orders_processed || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-600" />
            Global Expansion
          </h2>
          <p className="text-sm text-slate-500">{profiles.length} regions tracked</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runScanMutation.mutate()}
          disabled={runScanMutation.isPending}
        >
          {runScanMutation.isPending ? (
            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          Scan Regions
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{profiles.length}</p>
            <p className="text-xs text-slate-500">Regions Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-emerald-700">{readyRegions}</p>
            <p className="text-xs text-slate-500">Ready for Scale</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-purple-700">{totalOrders.toLocaleString()}</p>
            <p className="text-xs text-slate-500">Orders Processed</p>
          </CardContent>
        </Card>
      </div>

      {/* Regional Profiles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Regional Risk Profiles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-64 overflow-auto">
            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="font-medium text-sm">{profile.region_name}</p>
                    <p className="text-xs text-slate-500">{profile.orders_processed?.toLocaleString() || 0} orders</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <p className={profile.avg_fraud_rate > 0.02 ? 'text-red-600' : 'text-slate-600'}>
                      {((profile.avg_fraud_rate || 0) * 100).toFixed(2)}% fraud
                    </p>
                    <p className="text-slate-500">{profile.model_accuracy?.toFixed(0) || 0}% accuracy</p>
                  </div>
                  <Badge className={
                    profile.expansion_readiness === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                    profile.expansion_readiness === 'needs_work' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-700'
                  }>
                    {profile.expansion_readiness}
                  </Badge>
                </div>
              </div>
            ))}
            {profiles.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-4">Run a regional scan to populate data</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expansion Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Expansion Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.slice(0, 5).map((rec, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-emerald-50 rounded">
                  <div>
                    <p className="font-medium text-sm">{rec.region_name}</p>
                    <p className="text-xs text-slate-500">{rec.recommendation}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {((rec.base_fraud_rate || 0) * 100).toFixed(1)}% baseline
                    </Badge>
                    <Badge className={rec.priority === 'high' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'}>
                      {rec.priority}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}