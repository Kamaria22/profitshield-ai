import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  AlertTriangle,
  Webhook,
  Loader2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { maskDomain } from '@/components/utils/safeLog';

/**
 * Sync Health Card - displays sync status for integrations
 * Shows: last_webhook, last_sync, orders_synced_24h, errors
 */
export default function SyncHealthCard({ 
  integration, 
  syncJobs = [], 
  onSync,
  syncing = false
}) {
  if (!integration) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-slate-500">
          No integration connected
        </CardContent>
      </Card>
    );
  }
  
  // Calculate metrics
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const recentJobs = syncJobs.filter(j => 
    j.integration_id === integration.id && 
    new Date(j.created_date) > last24h
  );
  
  const ordersIn24h = recentJobs.reduce((sum, j) => {
    return sum + (j.results?.orders_created || 0) + (j.results?.orders_updated || 0);
  }, 0);
  
  const failedJobs = recentJobs.filter(j => j.status === 'failed');
  const lastError = failedJobs.length > 0 
    ? failedJobs[0].error_message 
    : null;
  
  const lastSyncAt = integration.last_sync_at 
    ? new Date(integration.last_sync_at) 
    : null;
  
  const lastSyncStatus = integration.last_sync_status;
  
  // Webhook health (from webhook_endpoints)
  const webhookCount = Object.keys(integration.webhook_endpoints || {}).length;
  
  // Health score
  const isHealthy = 
    integration.status === 'connected' && 
    lastSyncStatus !== 'failed' &&
    failedJobs.length === 0;
  
  const isWarning = 
    integration.status === 'connected' && 
    (lastSyncStatus === 'partial' || failedJobs.length > 0);
  
  const isError = 
    integration.status !== 'connected' || 
    lastSyncStatus === 'failed';
  
  return (
    <Card className={`border-l-4 ${
      isHealthy ? 'border-l-green-500' : 
      isWarning ? 'border-l-amber-500' : 
      'border-l-red-500'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Sync Health
              {isHealthy && <CheckCircle className="w-4 h-4 text-green-500" />}
              {isWarning && <AlertTriangle className="w-4 h-4 text-amber-500" />}
              {isError && <XCircle className="w-4 h-4 text-red-500" />}
            </CardTitle>
            <CardDescription>
              {maskDomain(integration.store_key || integration.store_url)}
            </CardDescription>
          </div>
          {onSync && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onSync(integration.id)}
              disabled={syncing || integration.status !== 'connected'}
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Last Sync */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Last Sync</p>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium">
                {lastSyncAt 
                  ? formatDistanceToNow(lastSyncAt, { addSuffix: true })
                  : 'Never'
                }
              </span>
            </div>
            {lastSyncStatus && (
              <Badge 
                variant={lastSyncStatus === 'success' ? 'default' : 'destructive'}
                className="text-xs"
              >
                {lastSyncStatus}
              </Badge>
            )}
          </div>
          
          {/* Orders Synced (24h) */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Orders (24h)</p>
            <p className="text-2xl font-bold">{ordersIn24h}</p>
          </div>
          
          {/* Webhooks */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Webhooks</p>
            <div className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium">{webhookCount} active</span>
            </div>
          </div>
          
          {/* Errors */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Errors (24h)</p>
            <p className={`text-2xl font-bold ${failedJobs.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {failedJobs.length}
            </p>
          </div>
        </div>
        
        {/* Last Error (masked) */}
        {lastError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-800 font-medium mb-1">Last Error:</p>
            <p className="text-xs text-red-700 truncate">
              {lastError.length > 100 ? `${lastError.slice(0, 100)}...` : lastError}
            </p>
          </div>
        )}
        
        {/* Rate Limit Warning */}
        {integration.rate_limit_status?.is_throttled && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800 font-medium">
              Rate limited - requests remaining: {integration.rate_limit_status.requests_remaining || 0}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}