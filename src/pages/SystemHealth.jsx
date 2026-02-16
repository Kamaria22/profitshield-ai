import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Server,
  Webhook,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Zap,
  Database
} from 'lucide-react';
import { usePlatformResolver, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '@/components/usePlatformResolver';

export default function SystemHealth() {
  // SINGLE SOURCE OF TRUTH: Platform Resolver
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const eventLogsQueryKey = buildQueryKey('eventLogs', resolverCheck);

  const { data: eventLogs = [] } = useQuery({
    queryKey: eventLogsQueryKey,
    queryFn: () => base44.entities.EventLog.filter({ tenant_id: queryFilter.tenant_id }, '-created_date', 100),
    enabled: canQuery,
    ...queryDefaults.realtime // System health should refresh often
  });

  const { data: healthMetrics = [] } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: () => base44.entities.SystemHealth.filter({}, '-period', 1),
    ...queryDefaults.standard
  });

  // Calculate live metrics from event logs
  const metrics = React.useMemo(() => {
    const total = eventLogs.length;
    const completed = eventLogs.filter(e => e.processing_status === 'completed').length;
    const failed = eventLogs.filter(e => e.processing_status === 'failed').length;
    const pending = eventLogs.filter(e => e.processing_status === 'pending').length;
    const deadLetter = eventLogs.filter(e => e.processing_status === 'dead_letter').length;
    const processing = eventLogs.filter(e => e.processing_status === 'processing').length;

    const avgProcessingTime = eventLogs
      .filter(e => e.processing_duration_ms)
      .reduce((sum, e) => sum + e.processing_duration_ms, 0) / (completed || 1);

    return {
      total,
      completed,
      failed,
      pending,
      deadLetter,
      processing,
      successRate: total > 0 ? ((completed / total) * 100).toFixed(1) : 100,
      avgProcessingTime: avgProcessingTime.toFixed(0),
      errorRate: total > 0 ? ((failed + deadLetter) / total * 100).toFixed(1) : 0
    };
  }, [eventLogs]);

  const latestHealth = healthMetrics[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-7 h-7 text-emerald-600" />
            System Health
          </h1>
          <p className="text-slate-500 mt-1">Monitor performance and operational metrics</p>
        </div>
        <Badge className={metrics.errorRate < 5 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
          {metrics.errorRate < 5 ? 'Healthy' : 'Degraded'}
        </Badge>
      </div>

      {/* Overview Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Success Rate</p>
                <p className="text-2xl font-bold text-emerald-600">{metrics.successRate}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-emerald-200" />
            </div>
            <Progress value={parseFloat(metrics.successRate)} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Avg Processing</p>
                <p className="text-2xl font-bold text-slate-900">{metrics.avgProcessingTime}ms</p>
              </div>
              <Zap className="w-8 h-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Queue Pending</p>
                <p className="text-2xl font-bold text-blue-600">{metrics.pending}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Dead Letter</p>
                <p className={`text-2xl font-bold ${metrics.deadLetter > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {metrics.deadLetter}
                </p>
              </div>
              <AlertTriangle className={`w-8 h-8 ${metrics.deadLetter > 0 ? 'text-red-200' : 'text-slate-200'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Event Processing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="w-5 h-5 text-slate-600" />
              Event Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Total Events</span>
                <span className="font-medium">{metrics.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Completed</span>
                <Badge className="bg-emerald-100 text-emerald-700">{metrics.completed}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Processing</span>
                <Badge className="bg-blue-100 text-blue-700">{metrics.processing}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Pending</span>
                <Badge className="bg-amber-100 text-amber-700">{metrics.pending}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Failed</span>
                <Badge className="bg-red-100 text-red-700">{metrics.failed}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Dead Letter Queue</span>
                <Badge variant="outline" className={metrics.deadLetter > 0 ? 'border-red-300 text-red-600' : ''}>
                  {metrics.deadLetter}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-600" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">API Status</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-emerald-600">Operational</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Webhook Receiver</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-emerald-600">Operational</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Event Processor</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-emerald-600">Operational</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Risk Engine</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-emerald-600">Operational</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Shopify Integration</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-emerald-600">Connected</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>Latest event processing activity</CardDescription>
        </CardHeader>
        <CardContent>
          {eventLogs.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No recent events</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {eventLogs.slice(0, 20).map((event) => (
                <div key={event.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      event.processing_status === 'completed' ? 'bg-emerald-500' :
                      event.processing_status === 'failed' ? 'bg-red-500' :
                      event.processing_status === 'dead_letter' ? 'bg-red-700' :
                      event.processing_status === 'processing' ? 'bg-blue-500' :
                      'bg-amber-500'
                    }`}></div>
                    <div>
                      <p className="text-sm font-medium">{event.event_type}</p>
                      <p className="text-xs text-slate-500">{event.source} • {event.event_id?.slice(-8)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-xs">
                      {event.processing_status}
                    </Badge>
                    {event.processing_duration_ms && (
                      <p className="text-xs text-slate-400 mt-1">{event.processing_duration_ms}ms</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}