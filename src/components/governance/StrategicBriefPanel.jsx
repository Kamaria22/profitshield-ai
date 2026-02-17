import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  Target,
  Shield,
  DollarSign,
  Globe,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  Building,
  Rocket
} from 'lucide-react';
import { toast } from 'sonner';

const opportunityTypeConfig = {
  acquisition: { icon: Building, color: 'bg-purple-100 text-purple-700' },
  partnership: { icon: Target, color: 'bg-blue-100 text-blue-700' },
  market_entry: { icon: Globe, color: 'bg-emerald-100 text-emerald-700' },
  pricing_shift: { icon: DollarSign, color: 'bg-amber-100 text-amber-700' },
  vertical_expansion: { icon: Rocket, color: 'bg-pink-100 text-pink-700' }
};

export default function StrategicBriefPanel() {
  const queryClient = useQueryClient();

  const { data: brief, isLoading } = useQuery({
    queryKey: ['strategicBrief'],
    queryFn: async () => {
      const res = await base44.functions.invoke('aiCeoEngine', {
        action: 'get_strategic_brief'
      });
      return res.data?.brief;
    }
  });

  const runScanMutation = useMutation({
    mutationFn: () => base44.functions.invoke('aiCeoEngine', {
      action: 'run_strategic_scan'
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['strategicBrief'] });
      toast.success(`Strategic scan complete: ${res.data?.opportunities_created || 0} opportunities identified`);
    }
  });

  const runCompetitiveMutation = useMutation({
    mutationFn: () => base44.functions.invoke('aiCeoEngine', {
      action: 'run_competitive_scan'
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['strategicBrief'] });
      toast.success(`Competitive scan: ${res.data?.signals_updated || 0} signals updated`);
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-600" />
            AI CEO Strategic Brief
          </h2>
          <p className="text-sm text-slate-500">Executive-level intelligence</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCompetitiveMutation.mutate()}
            disabled={runCompetitiveMutation.isPending}
          >
            {runCompetitiveMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Shield className="w-4 h-4 mr-1" />
            )}
            Competitive
          </Button>
          <Button
            size="sm"
            onClick={() => runScanMutation.mutate()}
            disabled={runScanMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {runScanMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Brain className="w-4 h-4 mr-1" />
            )}
            Run Scan
          </Button>
        </div>
      </div>

      {/* Strategic Opportunities */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" />
            Strategic Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brief?.opportunities?.length > 0 ? (
            <div className="space-y-3">
              {brief.opportunities.map((opp) => {
                const config = opportunityTypeConfig[opp.opportunity_type] || opportunityTypeConfig.market_entry;
                const Icon = config.icon;
                return (
                  <div key={opp.id} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 rounded ${config.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{opp.title}</p>
                          <p className="text-xs text-slate-500 mt-1">{opp.description}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {Math.round((opp.confidence_score || 0) * 100)}% conf
                        </Badge>
                        {opp.expected_roi && (
                          <p className="text-xs text-emerald-600 mt-1">+{opp.expected_roi}% ROI</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">Run a strategic scan to identify opportunities</p>
          )}
        </CardContent>
      </Card>

      {/* Competitive Landscape */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            Competitive Landscape
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brief?.competitive_landscape?.length > 0 ? (
            <div className="space-y-2">
              {brief.competitive_landscape.slice(0, 5).map((signal) => (
                <div key={signal.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{signal.competitor_name}</p>
                    <p className="text-xs text-slate-500">{signal.weakness_detected}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={
                      signal.threat_level === 'critical' ? 'bg-red-100 text-red-700' :
                      signal.threat_level === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-100 text-slate-700'
                    }>
                      {signal.threat_level}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-4">Run competitive scan to analyze market</p>
          )}
        </CardContent>
      </Card>

      {/* Market Signals */}
      {brief?.market_signals?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Market Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {brief.market_signals.map((signal) => (
                <div key={signal.id} className="flex items-center justify-between p-2 bg-amber-50 rounded">
                  <div>
                    <p className="text-sm font-medium">{signal.title}</p>
                    <p className="text-xs text-slate-500">{signal.description}</p>
                  </div>
                  <Badge className={
                    signal.impact_level === 'critical' ? 'bg-red-500 text-white' :
                    signal.impact_level === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-amber-100 text-amber-700'
                  }>
                    {signal.impact_level}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}