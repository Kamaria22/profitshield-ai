import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, RefreshCw, Globe, Server, Lock, AlertTriangle,
  CheckCircle2, XCircle, Radar, Eye, Activity, Zap,
  AlertCircle, Search, FileWarning
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

  const { data: securityData } = useQuery({
    queryKey: ['dataFortressSecurity'],
    queryFn: async () => {
      const res = await base44.functions.invoke('dataFortress', { action: 'get_security_dashboard' });
      return res.data?.security_dashboard;
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

  const anomalyDetectionMutation = useMutation({
    mutationFn: () => base44.functions.invoke('dataFortress', { action: 'run_anomaly_detection' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dataFortressSecurity'] });
      toast.success(`Scan complete: ${res.data?.anomalies_detected || 0} anomalies, threat level: ${res.data?.threat_level}`);
    }
  });

  const threatIntelMutation = useMutation({
    mutationFn: () => base44.functions.invoke('dataFortress', { action: 'update_threat_intel' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dataFortressSecurity'] });
      toast.success(`Threat intel updated: ${res.data?.total_indicators || 0} indicators`);
    }
  });

  const crossRegionMutation = useMutation({
    mutationFn: () => base44.functions.invoke('dataFortress', { action: 'detect_cross_region_leaks' }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dataFortressSecurity'] });
      toast.success(`Cross-region scan: ${res.data?.leaks_detected || 0} leaks detected`);
    }
  });

  const calibrateBaselinesMutation = useMutation({
    mutationFn: () => base44.functions.invoke('dataFortress', { action: 'calibrate_baselines' }),
    onSuccess: (res) => {
      toast.success(`Baselines calibrated: ${res.data?.total_baselines || 0} baselines`);
    }
  });

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>;
  }

  const status = data || {};
  const security = securityData || {};

  const threatLevelColors = {
    critical: 'bg-red-500 text-white',
    high: 'bg-orange-500 text-white',
    elevated: 'bg-amber-500 text-white',
    normal: 'bg-emerald-500 text-white'
  };

  const severityColors = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-slate-100 text-slate-700'
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            Data Fortress Monitor
          </h2>
          <p className="text-sm text-slate-500">Regional data sovereignty, anomaly detection & threat intelligence</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => auditMutation.mutate()} disabled={auditMutation.isPending}>
            {auditMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
            Audit
          </Button>
          <Button size="sm" onClick={() => anomalyDetectionMutation.mutate()} disabled={anomalyDetectionMutation.isPending} className="bg-red-600 hover:bg-red-700">
            {anomalyDetectionMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Radar className="w-4 h-4 mr-1" />}
            Scan Anomalies
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="security">Security & Threats</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
          <TabsTrigger value="regions">Regions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">

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
        </TabsContent>

        {/* Security & Threats Tab */}
        <TabsContent value="security" className="space-y-4 mt-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => calibrateBaselinesMutation.mutate()} disabled={calibrateBaselinesMutation.isPending}>
              <Activity className="w-4 h-4 mr-1" />
              Calibrate Baselines
            </Button>
            <Button size="sm" variant="outline" onClick={() => crossRegionMutation.mutate()} disabled={crossRegionMutation.isPending}>
              <FileWarning className="w-4 h-4 mr-1" />
              Check Leaks
            </Button>
            <Button size="sm" onClick={() => threatIntelMutation.mutate()} disabled={threatIntelMutation.isPending}>
              {threatIntelMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
              Update Threat Intel
            </Button>
          </div>

          {/* Threat Level Banner */}
          <Card className={`border-2 ${security.threat_level === 'critical' ? 'border-red-400' : security.threat_level === 'high' ? 'border-orange-400' : security.threat_level === 'elevated' ? 'border-amber-400' : 'border-emerald-400'}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Current Threat Level</p>
                  <p className="text-2xl font-bold">{security.anomalies_24h || 0} anomalies in 24h</p>
                </div>
                <Badge className={`text-lg px-4 py-2 ${threatLevelColors[security.threat_level || 'normal']}`}>
                  {(security.threat_level || 'normal').toUpperCase()}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-red-600">{security.anomaly_breakdown?.by_severity?.critical || 0}</p>
                  <p className="text-xs text-slate-500">Critical</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-orange-600">{security.anomaly_breakdown?.by_severity?.high || 0}</p>
                  <p className="text-xs text-slate-500">High</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-600">{security.anomaly_breakdown?.by_severity?.medium || 0}</p>
                  <p className="text-xs text-slate-500">Medium</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold">{security.pending_investigations || 0}</p>
                  <p className="text-xs text-slate-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Threat Intel Feeds */}
          {security.threat_intel?.feeds?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-600" />
                  Threat Intelligence Feeds
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {security.threat_intel.feeds.map((feed, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div>
                        <p className="text-sm font-medium">{feed.name}</p>
                        <p className="text-xs text-slate-500">{feed.type}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-sm font-medium">{feed.indicators || 0}</p>
                          <p className="text-xs text-slate-500">Indicators</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium">{feed.matches || 0}</p>
                          <p className="text-xs text-slate-500">Matches 24h</p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {feed.last_updated ? new Date(feed.last_updated).toLocaleDateString() : 'Never'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                  <span>Total Indicators: <strong>{security.threat_intel?.total_indicators || 0}</strong></span>
                  <span>Matches 24h: <strong>{security.threat_intel?.matches_24h || 0}</strong></span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cross-Region Leaks */}
          {security.cross_region_leaks?.count > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  Cross-Region Data Leaks Detected
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {security.cross_region_leaks.leaks.map((leak, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-200">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{leak.source}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-medium">{leak.destination}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{leak.records?.toLocaleString()} records</span>
                        <Badge className={severityColors[leak.severity]}>{leak.severity}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => anomalyDetectionMutation.mutate()} disabled={anomalyDetectionMutation.isPending}>
              {anomalyDetectionMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Radar className="w-4 h-4 mr-1" />}
              Run Detection Scan
            </Button>
          </div>

          {/* Anomaly Type Breakdown */}
          {security.anomaly_breakdown?.by_type && Object.keys(security.anomaly_breakdown.by_type).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Anomaly Types (24h)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(security.anomaly_breakdown.by_type).map(([type, count]) => (
                    <div key={type} className="p-3 bg-slate-50 rounded text-center">
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs text-slate-500">{type.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Critical Anomalies */}
          {security.critical_anomalies?.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  Critical Anomalies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {security.critical_anomalies.map((anomaly, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded border border-red-200">
                      <div>
                        <p className="text-sm font-medium">{anomaly.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">Region: {anomaly.region} • Confidence: {anomaly.confidence}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{new Date(anomaly.detected_at).toLocaleString()}</span>
                        <Button size="sm" variant="outline">
                          <Search className="w-3 h-3 mr-1" />
                          Investigate
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Regional Anomaly Distribution */}
          {security.anomaly_breakdown?.by_region && Object.keys(security.anomaly_breakdown.by_region).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Anomalies by Region</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(security.anomaly_breakdown.by_region)
                    .sort(([,a], [,b]) => b - a)
                    .map(([region, count]) => (
                      <div key={region} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <span className="font-medium">{region}</span>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, (count / (security.anomalies_24h || 1)) * 100)} className="w-32 h-2" />
                          <span className="text-sm font-medium w-8">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(!security.anomaly_breakdown?.by_type || Object.keys(security.anomaly_breakdown.by_type).length === 0) && (
            <Card>
              <CardContent className="py-8 text-center text-slate-500">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
                <p>No anomalies detected in the last 24 hours.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Regions Tab */}
        <TabsContent value="regions" className="space-y-4 mt-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => enforceRetentionMutation.mutate()} disabled={enforceRetentionMutation.isPending}>
              <Lock className="w-4 h-4 mr-1" />
              Enforce Retention
            </Button>
            <Button size="sm" onClick={() => auditMutation.mutate()} disabled={auditMutation.isPending}>
              {auditMutation.isPending ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
              Audit All Regions
            </Button>
          </div>

          {/* Regional Grid (reused from overview) */}
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}