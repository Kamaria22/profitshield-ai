import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Play, Zap } from 'lucide-react';
import { toast } from 'sonner';

function StatusBadge({ ok, label }) {
  return ok
    ? <Badge className="bg-emerald-100 text-emerald-700 text-xs">{label || '✓'}</Badge>
    : <Badge className="bg-red-100 text-red-700 text-xs">{label || '✗'}</Badge>;
}

export default function ShopifyDebugPanel() {
  const [shopDomain, setShopDomain] = useState('');
  const [diagResult, setDiagResult] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [loading, setLoading] = useState({ diag: false, test: false, sync: false });

  const runDiag = async () => {
    if (!shopDomain) { toast.error('Enter shop domain first'); return; }
    setLoading(p => ({ ...p, diag: true }));
    setDiagResult(null);
    try {
      const { data } = await base44.functions.invoke('diagnoseShopifyIngestion', { shop_domain: shopDomain });
      setDiagResult(data);
    } catch (e) {
      toast.error('Diagnosis failed: ' + e.message);
    } finally {
      setLoading(p => ({ ...p, diag: false }));
    }
  };

  const runTest = async () => {
    if (!shopDomain) { toast.error('Enter shop domain first'); return; }
    setLoading(p => ({ ...p, test: true }));
    setTestResult(null);
    toast.info('Creating test order + polling up to 60s...');
    try {
      const { data } = await base44.functions.invoke('createShopifyTestOrder', { shop_domain: shopDomain });
      setTestResult(data);
      if (data?.passed) toast.success('E2E Test PASSED');
      else toast.error('E2E Test FAILED — check results');
    } catch (e) {
      toast.error('Test failed: ' + e.message);
    } finally {
      setLoading(p => ({ ...p, test: false }));
    }
  };

  const runSync = async () => {
    if (!diagResult?.tenant_id) { toast.error('Run diagnosis first to get tenant_id'); return; }
    setLoading(p => ({ ...p, sync: true }));
    setSyncResult(null);
    try {
      const { data } = await base44.functions.invoke('syncShopifyOrders', {
        tenant_id: diagResult.tenant_id,
        days: 30
      });
      setSyncResult(data);
      toast.success(`Sync complete: ${data?.createdCount || 0} created, ${data?.updatedCount || 0} updated`);
    } catch (e) {
      toast.error('Sync failed: ' + e.message);
    } finally {
      setLoading(p => ({ ...p, sync: false }));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-500" />
            Shopify Ingestion Debugger
          </CardTitle>
          <CardDescription>Diagnose order ingestion, webhook registration, and queue state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. profitshield-dev.myshopify.com"
              value={shopDomain}
              onChange={e => setShopDomain(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runDiag()}
            />
            <Button onClick={runDiag} disabled={loading.diag} className="shrink-0">
              {loading.diag ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Diagnose
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={runSync} disabled={loading.sync || !diagResult?.tenant_id}>
              {loading.sync ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync Now (30 days)
            </Button>
            <Button variant="outline" onClick={runTest} disabled={loading.test}>
              {loading.test ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Run E2E Order Test
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Diagnosis Results */}
      {diagResult && (
        <Card className={diagResult.overall_health === 'healthy' ? 'border-emerald-200' : diagResult.overall_health === 'degraded' ? 'border-amber-200' : 'border-red-200'}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Diagnosis: {diagResult.shop_domain}</CardTitle>
              <Badge className={
                diagResult.overall_health === 'healthy' ? 'bg-emerald-100 text-emerald-700' :
                diagResult.overall_health === 'degraded' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }>
                {diagResult.overall_health?.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">Checked: {diagResult.checked_at}</p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">

            {/* Issues */}
            {diagResult.issues_found?.length > 0 && (
              <div className="space-y-1">
                {diagResult.issues_found.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-red-50">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-red-700 text-xs">{issue}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Core Identity */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Tenant ID:</span>
                <span className="ml-1 font-mono text-slate-700">{diagResult.tenant_id?.slice(0, 12)}...</span>
              </div>
              <div>
                <span className="text-slate-500">Integration:</span>
                <StatusBadge ok={diagResult.integration_status === 'connected'} label={diagResult.integration_status} />
              </div>
              <div>
                <span className="text-slate-500">OAuth Token:</span>
                <StatusBadge ok={diagResult.oauth_token_valid} label={diagResult.oauth_token_valid ? 'Valid' : 'Invalid'} />
              </div>
              <div>
                <span className="text-slate-500">Token Decrypt:</span>
                <StatusBadge ok={diagResult.access_token_decryptable} label={diagResult.access_token_decryptable ? 'OK' : 'FAIL'} />
              </div>
              <div>
                <span className="text-slate-500">API Secret Set:</span>
                <StatusBadge ok={diagResult.shopify_api_secret_env_set} label={diagResult.shopify_api_secret_env_set ? 'Yes' : 'Missing!'} />
              </div>
            </div>

            {/* Webhook Coverage */}
            <div>
              <p className="font-medium text-slate-700 mb-2">Webhooks in Shopify ({diagResult.webhooks_registered_in_shopify?.length || 0} total, {diagResult.our_webhooks_count} ours)</p>
              <p className="text-xs text-slate-500 mb-1">Expected URL: <span className="font-mono">{diagResult.expected_webhook_url}</span></p>
              <div className="flex gap-1 flex-wrap">
                {['orders/create', 'orders/updated', 'orders/paid', 'refunds/create', 'app/uninstalled'].map(t => (
                  <Badge key={t} className={diagResult.our_webhook_topics?.includes(t)
                    ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                    {t}
                  </Badge>
                ))}
              </div>
              {diagResult.shopify_webhook_list_error && (
                <p className="text-xs text-red-600 mt-1">Error listing webhooks: {diagResult.shopify_webhook_list_error}</p>
              )}
            </div>

            {/* Queue */}
            <div>
              <p className="font-medium text-slate-700 mb-2">Queue Depth</p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(diagResult.queue_depth || {}).map(([status, count]) => (
                  <Badge key={status} variant="outline" className="text-xs">
                    {status}: {count}
                  </Badge>
                ))}
              </div>
              {diagResult.last_queue_error && (
                <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                  <p className="font-medium">Last Queue Error:</p>
                  <p>{diagResult.last_queue_error.error_message}</p>
                  <p className="text-red-500">Job: {diagResult.last_queue_error.job_id} | Retries: {diagResult.last_queue_error.retry_count}</p>
                </div>
              )}
            </div>

            {/* Orders */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-slate-50">
                <p className="text-xs text-slate-500">Orders in DB (all time)</p>
                <p className="text-2xl font-bold">{diagResult.orders_in_db_count_all_time}</p>
              </div>
              <div className="p-2 rounded bg-slate-50">
                <p className="text-xs text-slate-500">Orders last 30 days</p>
                <p className="text-2xl font-bold">{diagResult.orders_in_db_count_last_30d}</p>
              </div>
            </div>

            {diagResult.latest_order_in_db && (
              <div className="p-2 rounded bg-slate-50 text-xs">
                <p className="font-medium text-slate-700 mb-1">Latest Order in DB:</p>
                <p>#{diagResult.latest_order_in_db.order_number} | ID: {diagResult.latest_order_in_db.platform_order_id} | {diagResult.latest_order_in_db.order_date}</p>
                <p>Revenue: ${diagResult.latest_order_in_db.total_revenue} | Status: {diagResult.latest_order_in_db.status}</p>
              </div>
            )}

            {/* Full JSON toggle */}
            <details>
              <summary className="text-xs text-slate-500 cursor-pointer">View raw JSON</summary>
              <pre className="text-xs mt-2 p-2 bg-slate-900 text-slate-200 rounded overflow-auto max-h-64">
                {JSON.stringify(diagResult, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      {/* E2E Test Results */}
      {testResult && (
        <Card className={testResult.passed ? 'border-emerald-200' : 'border-red-200'}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              {testResult.passed
                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                : <XCircle className="w-5 h-5 text-red-500" />}
              <CardTitle className="text-base">E2E Test: {testResult.passed ? 'PASSED' : 'FAILED'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 mb-3">{testResult.message}</p>
            {testResult.evidence && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Shopify Order ID:</span> <span className="font-mono">{testResult.evidence.shopify_order_id}</span></div>
                <div><span className="text-slate-500">Found in DB:</span> <StatusBadge ok={testResult.evidence.found_in_db} label={testResult.evidence.found_in_db ? 'Yes' : 'No'} /></div>
                <div><span className="text-slate-500">Elapsed:</span> {testResult.evidence.elapsed_ms}ms</div>
                <div><span className="text-slate-500">Queue Job:</span> {testResult.evidence.queue_job_status || 'none'}</div>
                <div><span className="text-slate-500">Order Row ID:</span> <span className="font-mono text-xs">{testResult.evidence.order_row_id?.slice(0, 12) || 'N/A'}</span></div>
                {testResult.evidence.manual_sync_result && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Manual Sync: </span>
                    {testResult.evidence.manual_sync_result.error
                      ? <span className="text-red-600">{testResult.evidence.manual_sync_result.error}</span>
                      : <span className="text-emerald-600">{testResult.evidence.manual_sync_result.createdCount} created, {testResult.evidence.manual_sync_result.updatedCount} updated</span>
                    }
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sync Results */}
      {syncResult && (
        <Card className="border-blue-200">
          <CardContent className="pt-4">
            <p className="font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-500" />
              Sync Result
            </p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="p-2 bg-emerald-50 rounded">
                <p className="text-lg font-bold text-emerald-700">{syncResult.createdCount || 0}</p>
                <p className="text-xs text-emerald-600">Created</p>
              </div>
              <div className="p-2 bg-blue-50 rounded">
                <p className="text-lg font-bold text-blue-700">{syncResult.updatedCount || 0}</p>
                <p className="text-xs text-blue-600">Updated</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-lg font-bold text-slate-700">{syncResult.fetchedCount || 0}</p>
                <p className="text-xs text-slate-600">Fetched from Shopify</p>
              </div>
            </div>
            {syncResult.error && <p className="text-red-600 text-sm mt-2">{syncResult.error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}