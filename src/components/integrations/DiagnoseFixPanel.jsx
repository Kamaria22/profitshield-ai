import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Activity, CheckCircle, XCircle, AlertTriangle, Loader2,
  RefreshCw, Webhook, ShoppingCart, ExternalLink, Zap
} from 'lucide-react';

const STATUS_COLORS = {
  healthy: 'text-green-600 bg-green-50 border-green-200',
  degraded: 'text-amber-700 bg-amber-50 border-amber-200',
  critical: 'text-red-700 bg-red-50 border-red-200'
};

function DiagRow({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        {ok === true && <CheckCircle className="w-4 h-4 text-green-500" />}
        {ok === false && <XCircle className="w-4 h-4 text-red-500" />}
        {ok === null && <AlertTriangle className="w-4 h-4 text-amber-500" />}
        <span className={`font-medium ${ok === true ? 'text-green-700' : ok === false ? 'text-red-700' : 'text-slate-800'}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

export default function DiagnoseFixPanel({ tenantId, integrationId, shopDomain, onFixed }) {
  const [open, setOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [syncDays, setSyncDays] = useState('365');

  const runDiagnose = async () => {
    setDiagLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('diagnoseShopifyIngestion', {
        tenant_id: tenantId,
        integration_id: integrationId,
        shop_domain: shopDomain
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data);
    } catch (e) {
      toast.error(`Diagnose failed: ${e.message}`);
    } finally {
      setDiagLoading(false);
    }
  };

  const runAction = async (action, extra = {}) => {
    setActionLoading(action);
    try {
      const res = await base44.functions.invoke('diagnoseShopifyIngestion', {
        tenant_id: tenantId,
        integration_id: integrationId,
        shop_domain: shopDomain,
        action,
        ...extra
      });
      if (res.data?.error) throw new Error(res.data.error);
      
      if (action === 'fix_webhooks') {
        const count = res.data?.registered_count || 0;
        const errors = res.data?.error_count || 0;
        toast.success(`Webhooks registered: ${count} OK${errors > 0 ? `, ${errors} failed` : ''}`);
      } else if (action === 'fix_sync') {
        const total = res.data?.fetchedCount || res.data?.total || 0;
        const created = res.data?.createdCount || res.data?.created || 0;
        toast.success(`Sync complete: ${total} fetched, ${created} new orders imported`);
      }

      // Re-run diagnose to show updated state
      await runDiagnose();
      onFixed?.();
    } catch (e) {
      toast.error(`${action} failed: ${e.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    runDiagnose();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} className="gap-2">
        <Zap className="w-4 h-4 text-amber-500" />
        Diagnose + Fix
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              Diagnose + Fix Integration
            </DialogTitle>
            <DialogDescription>
              Full health check for Shopify OAuth, webhooks, and order sync.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Run button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={runDiagnose}
              disabled={diagLoading}
            >
              {diagLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running diagnostics...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Re-run Diagnostics</>
              )}
            </Button>

            {result && (
              <>
                {/* Overall health */}
                <div className={`rounded-lg border p-3 text-sm font-semibold text-center uppercase tracking-wide ${STATUS_COLORS[result.overall_health] || STATUS_COLORS.degraded}`}>
                  {result.overall_health === 'healthy' ? '✅' : result.overall_health === 'degraded' ? '⚠️' : '🚨'} {result.overall_health}
                </div>

                {/* Issues */}
                {result.issues_found?.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                    <p className="text-sm font-semibold text-red-800 mb-1">Issues Found</p>
                    {result.issues_found.map((issue, i) => (
                      <p key={i} className="text-sm text-red-700 flex items-start gap-1">
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {issue}
                      </p>
                    ))}
                  </div>
                )}

                {/* Diagnostic rows */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Auth & Token</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0">
                    <DiagRow label="OAuth token present" value={result.oauth_token_present ? 'Yes' : 'No'} ok={result.oauth_token_present} />
                    <DiagRow label="Token valid" value={result.oauth_token_valid ? 'Yes' : 'No'} ok={result.oauth_token_valid} />
                    <DiagRow label="Token decryptable" value={result.access_token_decryptable ? 'Yes' : 'No'} ok={result.access_token_decryptable} />
                    <DiagRow label="Shopify API reachable" value={result.shopify_api_reachable ? 'Yes' : 'No'} ok={result.shopify_api_reachable} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Webhooks</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0">
                    <DiagRow
                      label="Webhooks in Shopify"
                      value={`${result.our_webhooks_count} / ${result.our_webhook_topics?.length || 0} topics`}
                      ok={result.our_webhooks_count >= 5}
                    />
                    <DiagRow
                      label="Webhooks saved in DB"
                      value={`${result.platformintegration_webhooks_saved}`}
                      ok={result.platformintegration_webhooks_saved >= 5}
                    />
                    {result.missing_topics?.length > 0 && (
                      <DiagRow
                        label="Missing topics"
                        value={result.missing_topics.join(', ')}
                        ok={false}
                      />
                    )}
                    <div className="mt-2 text-xs text-slate-400 break-all">
                      <span className="font-medium">Endpoint: </span>{result.expected_webhook_url}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 pt-3 px-4">
                    <CardTitle className="text-sm text-slate-500 uppercase tracking-wide">Orders & Sync</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0">
                    <DiagRow
                      label="Orders in DB"
                      value={result.orders_in_db_count}
                      ok={result.orders_in_db_count > 0 ? true : null}
                    />
                    {result.last_sync_job && (
                      <DiagRow
                        label="Last sync"
                        value={`${result.last_sync_job.status} — ${result.last_sync_job.orders_synced || 0} orders`}
                        ok={result.last_sync_job.status === 'completed'}
                      />
                    )}
                    <DiagRow
                      label="Queue pending"
                      value={result.queue_depth?.pending || 0}
                      ok={result.queue_depth?.pending === 0 ? true : null}
                    />
                    {result.queue_depth?.dead_letter > 0 && (
                      <DiagRow
                        label="Dead-letter jobs"
                        value={result.queue_depth.dead_letter}
                        ok={false}
                      />
                    )}
                  </CardContent>
                </Card>

                <Separator />

                {/* Fix Actions */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700">Fix Actions</p>

                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={!!actionLoading || !result.access_token_decryptable}
                    onClick={() => runAction('fix_webhooks')}
                  >
                    {actionLoading === 'fix_webhooks' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4 text-purple-500" />}
                    Register / Re-register Webhooks
                    {!result.access_token_decryptable && <span className="ml-auto text-xs text-slate-400">needs OAuth first</span>}
                  </Button>

                  <div className="flex gap-2">
                    <Select value={syncDays} onValueChange={setSyncDays}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                        <SelectItem value="365">Last 365 days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="flex-1 justify-start gap-2"
                      disabled={!!actionLoading || !result.access_token_decryptable}
                      onClick={() => runAction('fix_sync', { days: parseInt(syncDays) })}
                    >
                      {actionLoading === 'fix_sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4 text-blue-500" />}
                      Sync Orders Now
                    </Button>
                  </div>

                  {result.overall_health === 'healthy' && (
                    <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      Everything looks good! Webhooks registered and orders synced.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}