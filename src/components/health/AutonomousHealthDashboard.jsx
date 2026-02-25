import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Brain,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  FileText,
  Wrench,
  TrendingUp
} from 'lucide-react';

export default function AutonomousHealthDashboard({ tenantId }) {
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  // Fetch latest health report
  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ['autonomous-health-report', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('autonomousDebugBot', {
        action: 'report',
        tenant_id: tenantId
      });
      return response.data;
    },
    refetchInterval: 60000 // Refresh every minute
  });

  // Fetch recent auto-fixed tasks
  const { data: autoFixedTasks } = useQuery({
    queryKey: ['auto-fixed-tasks', tenantId],
    queryFn: async () => {
      const logs = await base44.entities.AuditLog.filter({
        tenant_id: tenantId,
        action: 'autonomous_fix_applied',
        is_auto_action: true
      }, '-created_date', 20);
      return logs;
    }
  });

  // Manual scan mutation
  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('autonomousDebugBot', {
        action: 'diagnose',
        tenant_id: tenantId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['autonomous-health-report', tenantId]);
    }
  });

  // Manual fix mutation
  const fixMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('autonomousDebugBot', {
        action: 'auto_fix',
        tenant_id: tenantId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['autonomous-health-report', tenantId]);
      queryClient.invalidateQueries(['auto-fixed-tasks', tenantId]);
    }
  });

  const report = reportData?.report || {};
  const diagnosis = scanMutation.data?.diagnosis || {};

  const getHealthScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSeverityBadge = (severity) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };
    return <Badge className={colors[severity] || 'bg-slate-100 text-slate-800'}>{severity}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-emerald-600" />
            Autonomous Health Monitor
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            AI-powered system diagnostics and auto-healing
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            {scanMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Activity className="w-4 h-4 mr-2" />
            )}
            Run Scan
          </Button>
          <Button
            onClick={() => fixMutation.mutate()}
            disabled={fixMutation.isPending}
          >
            {fixMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="w-4 h-4 mr-2" />
            )}
            Auto-Fix Issues
          </Button>
        </div>
      </div>

      {/* Status Alert */}
      {scanMutation.isSuccess && diagnosis.issues_found > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Found {diagnosis.issues_found} issue{diagnosis.issues_found !== 1 ? 's' : ''} that {diagnosis.issues_found === 1 ? 'needs' : 'need'} attention
          </AlertDescription>
        </Alert>
      )}

      {fixMutation.isSuccess && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-900">
            Applied {fixMutation.data.fixes_applied} fix{fixMutation.data.fixes_applied !== 1 ? 'es' : ''} successfully
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="issues">Current Issues</TabsTrigger>
          <TabsTrigger value="history">Fix History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${getHealthScoreColor(diagnosis.health_score || report.tasks_resolution_rate || 100)}`}>
                    {diagnosis.health_score || report.tasks_resolution_rate || 100}%
                  </span>
                  <TrendingUp className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-xs text-slate-500 mt-1">Overall system score</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Auto-Fixes Applied</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{report.auto_fixes_applied || 0}</div>
                <p className="text-xs text-slate-500 mt-1">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Tasks Resolved</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{report.tasks_resolved || 0}</span>
                  <span className="text-sm text-slate-500">/ {report.tasks_total || 0}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{report.tasks_resolution_rate || 0}% resolution rate</p>
              </CardContent>
            </Card>
          </div>

          {reportLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {report.system_status && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  System Status
                </CardTitle>
                <CardDescription>
                  Last checked: {report.last_check ? new Date(report.last_check).toLocaleString() : 'Never'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Alerts</p>
                    <p className="text-2xl font-bold">{report.alerts_total || 0}</p>
                    <p className="text-xs text-slate-500">{report.alerts_resolution_rate || 0}% resolved</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Status</p>
                    <Badge className="mt-1 bg-green-100 text-green-800">
                      {report.system_status || 'operational'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Issues Tab */}
        <TabsContent value="issues" className="space-y-4">
          {scanMutation.isPending && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          )}

          {diagnosis.issues && diagnosis.issues.length > 0 ? (
            <div className="space-y-3">
              {diagnosis.issues.map((issue, idx) => (
                <Card key={idx}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{issue.type.replace(/_/g, ' ').toUpperCase()}</CardTitle>
                      {getSeverityBadge(issue.severity)}
                    </div>
                    <CardDescription>{issue.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      {issue.auto_fixable ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Auto-fixable
                        </Badge>
                      ) : (
                        <Badge variant="outline">Manual fix required</Badge>
                      )}
                      {issue.fix_action && (
                        <span className="text-xs text-slate-500">Action: {issue.fix_action}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-medium">No Issues Found</p>
                <p className="text-sm text-slate-500 mt-1">System is running smoothly</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {autoFixedTasks && autoFixedTasks.length > 0 ? (
            <div className="space-y-3">
              {autoFixedTasks.map((log) => (
                <Card key={log.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{log.description}</CardTitle>
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Auto-fixed
                      </Badge>
                    </div>
                    <CardDescription>
                      {new Date(log.created_date).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  {log.changes && (
                    <CardContent>
                      <div className="text-sm space-y-1">
                        {log.changes.root_cause && (
                          <p><span className="font-medium">Root cause:</span> {log.changes.root_cause}</p>
                        )}
                        {log.changes.confidence && (
                          <p><span className="font-medium">Confidence:</span> {log.changes.confidence}%</p>
                        )}
                        {log.changes.actions_taken && (
                          <div>
                            <span className="font-medium">Actions:</span>
                            <ul className="list-disc list-inside ml-2">
                              {log.changes.actions_taken.map((action, idx) => (
                                <li key={idx}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-lg font-medium">No Auto-Fixes Yet</p>
                <p className="text-sm text-slate-500 mt-1">Fix history will appear here</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}