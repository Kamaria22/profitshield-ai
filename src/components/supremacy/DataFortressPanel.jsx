import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, RefreshCw, Globe, Server, Lock, AlertTriangle,
  CheckCircle2, XCircle
} from 'lucide-react';
import { toast } from 'sonner';

const healthColors = {
  healthy: 'bg-emerald-100 text-emerald-700',
  degraded: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
  offline: 'bg-slate-100 text-slate-700'
};

const replicationColors = {
  healthy: 'text-emerald-600',
  degraded: 'text-amber-600',
  offline: 'text-red-600'
};

export default function DataFortressPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dataFortressStatus'],
    queryFn: async () => {
      const res = await base44.functions.invoke('dataFortress', { action: 'get_fortress_status' });
      return res.data?.fortress_status;
    }
  });

  const auditMutation = useMutation({
    mutationFn: () => base44.functions.invoke('dataFortress', { action: 'audit_regions' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dataFortressStatus'] });
      toast.success(`Audit complete: ${res.data?.overall_status}`);
    }
  });

  const enforceRetentionMutation = useMutation({
    mutationFn: () => base44.functions.invoke('dataFortress', { action: 'enforce_retention' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dataFortressStatus'] });
      toast.success(`Retention enforced: ${res.data?.enforcements?.length || 0} actions`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const status = data || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Data Fortress Monitor
          </h2>
          <p className="text-sm text-slate-500">Regional data sovereignty & compliance</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => enforceRetentionMutation.mutate()} disabled={enforceRetentionMutation.isPending}>
            <Lock className="w-4 h-4 mr-1" />
            Enforce Retention
          </Button>
          <Button size="sm" onClick={() => auditMutation.mutate()} disabled={auditMutation.isPending}>
            {auditMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
            Audit Regions
          </Button>
        </div>
      </div>

      {/* Overall Health */}
      <Card className={`border-2 ${status.overall_health === 'healthy' ? 'border-emerald-400' : status.overall_health === 'degraded' ? 'border-amber-400' : 'border-red-400'}`}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Fortress Status</p>
              <p className="text-2xl font-bold">{status.healthy_regions || 0} / {status.total_regions || 0} Healthy</p>
            </div>
            <Badge className={healthColors[status.overall_health || 'healthy']} size="lg">
              {status.overall_health?.toUpperCase() || 'HEALTHY'}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center">
              <p className="text-xl font-bold">{status.total_tenants || 0}</p>
              <p className="text-xs text-slate-500">Total Tenants</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{status.pending_compliance_events || 0}</p>
              <p className="text-xs text-slate-500">Pending Events</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold">{(status.avg_risk_score || 0).toFixed(0)}</p>
              <p className="text-xs text-slate-500">Avg Risk Score</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regional Grid */}
      {Object.keys(status.region_stats || {}).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              Regional Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(status.region_stats || {}).map(([code, region]) => (
                <div key={code} className={`p-3 rounded-lg border ${region.replication_status === 'healthy' ? 'border-emerald-200 bg-emerald-50' : region.replication_status === 'degraded' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold">{code}</span>
                    <span className={replicationColors[region.replication_status]}>
                      {region.replication_status === 'healthy' ? <CheckCircle2 className="w-4 h-4" /> : 
                       region.replication_status === 'degraded' ? <AlertTriangle className="w-4 h-4" /> :
                       <XCircle className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{region.name}</p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Uptime</span>
                      <span>{region.uptime?.toFixed(1)}%</span>
                    </div>
                    <Progress value={region.uptime || 0} className="h-1" />
                    <div className="flex justify-between text-xs">
                      <span>Compliance</span>
                      <span>{region.compliance_score?.toFixed(0)}%</span>
                    </div>
                    <Progress value={region.compliance_score || 0} className="h-1" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{region.tenant_count || 0} tenants</span>
                    <span>→ {region.failover_region}</span>
                  </div>
                  {(region.pending_events > 0 || region.overdue_events > 0) && (
                    <div className="mt-2 flex gap-1">
                      {region.pending_events > 0 && <Badge variant="outline" className="text-xs">{region.pending_events} pending</Badge>}
                      {region.overdue_events > 0 && <Badge className="bg-red-100 text-red-700 text-xs">{region.overdue_events} overdue</Badge>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No regions configured */}
      {Object.keys(status.region_stats || {}).length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-slate-500">
            <Server className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p>No data regions configured. Run audit to initialize.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}