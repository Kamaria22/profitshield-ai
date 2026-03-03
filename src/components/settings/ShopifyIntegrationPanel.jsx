/**
 * ShopifyIntegrationPanel
 * 
 * Manages Shopify re-authentication, sync config, two-way sync options,
 * auto-hold settings, and manual sync trigger.
 * 
 * Works in BOTH embedded Shopify (no Base44 session) and normal login contexts.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle, XCircle, RefreshCw, Store, AlertTriangle,
  Shield, Zap, Tag, FileText, ArrowUpDown, Clock, ExternalLink, Loader2, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { getFreshAppBridgeToken } from '@/components/shopify/AppBridgeAuth';
import TwoWaySyncPanel from '@/components/shopify/TwoWaySyncPanel';

function isEmbedded() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return !!(p.get('shop') && (p.get('host') || p.get('embedded') === '1'));
}

async function getSessionToken() {
  if (!isEmbedded()) return null;
  try { return await getFreshAppBridgeToken({ force: false }); } catch { return null; }
}

async function callSettingsApi(payload) {
  const token = await getSessionToken();
  const body = { ...payload, ...(token ? { session_token: token } : {}) };
  const { data } = await base44.functions.invoke('shopifyIntegrationSettings', body);
  return data;
}

export default function ShopifyIntegrationPanel({ tenantId, shopDomain, resolver }) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['shopifyIntegrationPanel', tenantId],
    queryFn: () => callSettingsApi({ action: 'get', tenant_id: tenantId }),
    enabled: !!tenantId,
  });

  const integration = data?.integration || null;
  const settings    = data?.settings    || {};

  // Local editable state
  const [syncConfig, setSyncConfig] = useState(null);
  const [twoWaySync, setTwoWaySync] = useState(null);
  const [autoHold,   setAutoHold]   = useState(null);
  const [autoCancelThreshold, setAutoCancelThreshold] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null); // 'connected' | 'failed' | null
  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [pendingOAuthUrl, setPendingOAuthUrl] = useState(null);

  // Hydrate local state once data loads
  useEffect(() => {
    if (!data) return;
    setSyncConfig(integration?.sync_config || {
      auto_sync_enabled: true,
      sync_frequency_minutes: 15,
      sync_historical_days: 90,
      sync_products: true,
      sync_customers: true,
    });
    setTwoWaySync(integration?.two_way_sync || {
      enabled: false,
      push_risk_scores: false,
      push_tags: true,
      push_notes: true,
      auto_hold_high_risk: false,
    });
    setAutoHold(settings?.auto_hold_high_risk ?? false);
    setAutoCancelThreshold(settings?.auto_cancel_threshold ?? '');
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => callSettingsApi({
      action: 'save',
      tenant_id: tenantId,
      sync_config: syncConfig,
      two_way_sync: twoWaySync,
      auto_hold_high_risk: autoHold,
      auto_cancel_threshold: autoCancelThreshold !== '' ? Number(autoCancelThreshold) : null,
    }),
    onSuccess: () => {
      toast.success('Shopify integration settings saved');
      queryClient.invalidateQueries({ queryKey: ['shopifyIntegrationPanel', tenantId] });
    },
    onError: (e) => toast.error('Failed to save: ' + e.message),
  });

  const [reconciling, setReconciling] = useState(false);
  const [syncDays, setSyncDays] = useState('90');

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await base44.functions.invoke('syncShopifyOrders', {
        tenant_id: tenantId,
        days: parseInt(syncDays)
      });
      if (data?.success) {
        toast.success(`Sync complete — ${data.createdCount || 0} created, ${data.updatedCount || 0} updated`);
        queryClient.invalidateQueries({ queryKey: ['shopifyIntegrationPanel', tenantId] });
      } else {
        toast.error(data?.error || 'Sync failed');
      }
    } catch (e) {
      toast.error('Sync failed: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleReconcileWebhooks = async () => {
    setReconciling(true);
    try {
      const { data } = await base44.functions.invoke('shopifyReconcileWebhooks', {
        tenant_id: tenantId
      });
      if (data?.ok !== false) {
        toast.success(`Webhooks reconciled — ${data?.topics_ok || 0}/${data?.topics_required || 7} topics active, ${data?.registered_count || 0} registered, ${data?.deleted_count || 0} stale removed`);
        queryClient.invalidateQueries({ queryKey: ['shopifyIntegrationPanel', tenantId] });
      } else if (data?.needs_reauth) {
        toast.error('Token invalid — please reconnect Shopify OAuth');
      } else {
        toast.error(data?.error || 'Reconciliation had errors');
      }
    } catch (e) {
      toast.error('Reconcile failed: ' + e.message);
    } finally {
      setReconciling(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    setConnectionStatus(null);
    try {
      const result = await callSettingsApi({ action: 'reconnect', tenant_id: tenantId, shop: shopDomain });
      if (result?.install_url) {
        const oauthUrl = result.install_url;
        const embedded = isEmbedded();

        console.log('[ShopifyIntegrationPanel] OAuth start — url:', oauthUrl,
          '| embedded:', embedded,
          '| shopDomain:', shopDomain);

        // Embedded: use App Bridge Redirect to break out of iframe properly
        if (embedded) {
          try {
            const { Redirect } = await import('@shopify/app-bridge/actions');
            const { default: createApp } = await import('@shopify/app-bridge');
            const urlParams = new URLSearchParams(window.location.search);
            const app = createApp({
              apiKey: window.__SHOPIFY_API_KEY__ || '',
              host: urlParams.get('host') || '',
            });
            const redirect = Redirect.create(app);
            console.log('[ShopifyIntegrationPanel] Using App Bridge Redirect');
            redirect.dispatch(Redirect.Action.REMOTE, oauthUrl);
            return;
          } catch (bridgeErr) {
            console.warn('[ShopifyIntegrationPanel] App Bridge failed, falling back to window.top:', bridgeErr.message);
          }
        }

        // Non-embedded or App Bridge fallback: redirect top window
        try {
          if (window.top && window.top !== window) {
            console.log('[ShopifyIntegrationPanel] Redirecting window.top to OAuth URL');
            window.top.location.href = oauthUrl;
          } else {
            console.log('[ShopifyIntegrationPanel] Redirecting window.location to OAuth URL');
            window.location.href = oauthUrl;
          }
        } catch (_) {
          // Cross-origin restriction — show modal with "open new tab"
          console.warn('[ShopifyIntegrationPanel] window.top inaccessible — showing new-tab modal');
          setPendingOAuthUrl(oauthUrl);
          setShowNewTabModal(true);
          setReconnecting(false);
        }
      } else {
        toast.error('Failed to get installation URL');
        setReconnecting(false);
      }
    } catch (e) {
      toast.error('Reconnect failed: ' + e.message);
      setReconnecting(false);
    }
  };

  const handleCheckConnection = async () => {
    if (!tenantId) return;
    try {
      const result = await callSettingsApi({ action: 'get', tenant_id: tenantId });
      const status = result?.integration?.status;
      const tokenId = result?.integration?.token_id;
      const connected = status === 'connected' && !!tokenId;
      console.log('[ShopifyIntegrationPanel] Connection check — status:', status, '| token_id:', tokenId, '| connected:', connected);
      setConnectionStatus(connected ? 'connected' : 'failed');
      if (connected) {
        toast.success('Shopify connected ✅');
        queryClient.invalidateQueries({ queryKey: ['shopifyIntegrationPanel', tenantId] });
      } else {
        toast.error('Shopify not connected ❌ — token may be missing');
      }
    } catch (e) {
      setConnectionStatus('failed');
      toast.error('Connection check failed: ' + e.message);
    }
  };

  if (isLoading || !syncConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  const isConnected = integration?.status === 'connected';
  const lastSync = integration?.last_sync_at;

  return (
    <div className="space-y-6">

      {/* ── New Tab Modal (iframe fallback) ── */}
      <Dialog open={showNewTabModal} onOpenChange={setShowNewTabModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-400" />
              Open Shopify Authorization
            </DialogTitle>
            <DialogDescription>
              The Shopify authorization page must be opened outside this frame. Click below to continue in a new tab.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowNewTabModal(false)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              onClick={() => {
                window.open(pendingOAuthUrl, '_blank', 'noopener,noreferrer');
                setShowNewTabModal(false);
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Continue in new tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Connection Status ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="w-5 h-5 text-emerald-400" />
            Shopify Connection
          </CardTitle>
          <CardDescription>Re-authenticate or manage your Shopify store connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              {isConnected
                ? <CheckCircle className="w-6 h-6 text-emerald-400" />
                : <XCircle className="w-6 h-6 text-red-400" />}
              <div>
                <p className="font-semibold text-slate-100">{shopDomain || integration?.store_url || 'Unknown Store'}</p>
                <p className="text-sm text-slate-400">
                  {isConnected ? 'Connected' : 'Not connected — orders will not sync'}
                  {lastSync && ` · Last synced ${new Date(lastSync).toLocaleString()}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected && (
                <Badge style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  Active
                </Badge>
              )}
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="outline"
                  onClick={handleReconnect}
                  disabled={reconnecting}
                  className="gap-2"
                >
                  {reconnecting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                    : <><Lock className="w-4 h-4" /> Connect Shopify (opens securely)</>}
                </Button>
                <p className="text-xs text-slate-500">This will open a secure Shopify authorization page.</p>
              </div>
            </div>
          </div>

          {/* Post-OAuth connection check indicator */}
          {connectionStatus && (
            <div className={`p-3 rounded-lg flex items-center gap-3 ${connectionStatus === 'connected'
              ? 'bg-emerald-500/10 border border-emerald-500/25'
              : 'bg-red-500/10 border border-red-500/25'}`}>
              {connectionStatus === 'connected'
                ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
              <p className={`text-sm font-medium ${connectionStatus === 'connected' ? 'text-emerald-300' : 'text-red-300'}`}>
                {connectionStatus === 'connected' ? 'Connected ✅ — token verified and saved.' : 'Not connected ❌ — token may be missing or expired.'}
              </p>
              <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setConnectionStatus(null)}>
                Dismiss
              </Button>
            </div>
          )}

          {!isConnected && (
            <div className="p-3 rounded-lg flex items-start gap-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-300">
                  Your Shopify access token is missing or expired. Click "Connect Shopify" to reconnect.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-slate-400 hover:text-slate-200 shrink-0"
                onClick={handleCheckConnection}
              >
                Check connection
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Manual Sync ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-400" />
            Manual Data Sync
          </CardTitle>
          <CardDescription>Trigger a full pull of recent orders from Shopify right now</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-slate-400 max-w-md">
            Normally, orders sync automatically on the configured schedule. Use this to force an immediate sync.
          </p>
          <Button onClick={handleSync} disabled={syncing || !isConnected} className="gap-2 shrink-0">
            {syncing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
              : <><Zap className="w-4 h-4" /> Sync Now</>}
          </Button>
        </CardContent>
      </Card>

      {/* ── Sync Frequency ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-violet-400" />
            Sync Frequency
          </CardTitle>
          <CardDescription>How often ProfitShield pulls data from Shopify</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-200">Auto-sync enabled</p>
              <p className="text-sm text-slate-500">Automatically pull orders on a schedule</p>
            </div>
            <Switch
              checked={syncConfig?.auto_sync_enabled ?? true}
              onCheckedChange={v => setSyncConfig(p => ({ ...p, auto_sync_enabled: v }))}
            />
          </div>

          {syncConfig?.auto_sync_enabled && (
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label className="text-slate-300">Sync frequency (minutes)</Label>
                <Select
                  value={String(syncConfig?.sync_frequency_minutes || 15)}
                  onValueChange={v => setSyncConfig(p => ({ ...p, sync_frequency_minutes: Number(v) }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Every 5 minutes</SelectItem>
                    <SelectItem value="15">Every 15 minutes</SelectItem>
                    <SelectItem value="30">Every 30 minutes</SelectItem>
                    <SelectItem value="60">Every hour</SelectItem>
                    <SelectItem value="360">Every 6 hours</SelectItem>
                    <SelectItem value="1440">Daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-slate-300">Historical sync (days)</Label>
                <Select
                  value={String(syncConfig?.sync_historical_days || 90)}
                  onValueChange={v => setSyncConfig(p => ({ ...p, sync_historical_days: Number(v) }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="180">6 months</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-300">What to sync</p>
            {[
              { key: 'sync_products',  label: 'Products',  desc: 'Sync product catalog' },
              { key: 'sync_customers', label: 'Customers', desc: 'Sync customer profiles' },
              { key: 'sync_inventory', label: 'Inventory', desc: 'Sync stock levels' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
                <Switch
                  checked={syncConfig?.[key] ?? false}
                  onCheckedChange={v => setSyncConfig(p => ({ ...p, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Two-Way Sync ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="w-5 h-5 text-amber-400" />
            Two-Way Sync
          </CardTitle>
          <CardDescription>Push data back to Shopify from ProfitShield</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-200">Enable two-way sync</p>
              <p className="text-sm text-slate-500">Allow ProfitShield to write back to Shopify</p>
            </div>
            <Switch
              checked={twoWaySync?.enabled ?? false}
              onCheckedChange={v => setTwoWaySync(p => ({ ...p, enabled: v }))}
            />
          </div>

          {twoWaySync?.enabled && (
            <div className="space-y-4 pt-2 pl-1 border-l-2 border-indigo-500/30 ml-1">
              {[
                { key: 'push_tags',         icon: Tag,        label: 'Push risk tags',     desc: 'Add risk-level tags to Shopify orders (e.g. "high-risk")' },
                { key: 'push_notes',        icon: FileText,   label: 'Push order notes',   desc: 'Add profit & risk summary notes to Shopify orders' },
                { key: 'push_risk_scores',  icon: Shield,     label: 'Push risk scores',   desc: 'Store risk scores as order metafields' },
              ].map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <Icon className="w-4 h-4 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-200">{label}</p>
                      <p className="text-xs text-slate-500">{desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={twoWaySync?.[key] ?? false}
                    onCheckedChange={v => setTwoWaySync(p => ({ ...p, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Auto-Hold / Risk Actions ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" />
            High-Risk Order Automation
          </CardTitle>
          <CardDescription>Automatically act on orders that trigger high risk scores</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-200">Auto-hold high-risk orders</p>
              <p className="text-sm text-slate-500">
                Automatically put a fulfillment hold on orders with high risk scores
              </p>
            </div>
            <Switch
              checked={autoHold ?? false}
              onCheckedChange={setAutoHold}
            />
          </div>

          <div>
            <Label className="text-slate-300">
              Auto-cancel threshold (risk score 0–100)
            </Label>
            <p className="text-xs text-slate-500 mb-2">
              Orders scoring above this will be automatically cancelled. Leave blank to disable.
            </p>
            <Input
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 90 (leave blank to disable)"
              value={autoCancelThreshold}
              onChange={e => setAutoCancelThreshold(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {autoHold && (
            <div className="p-3 rounded-lg flex items-start gap-3"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-300">
                Auto-hold is active. High-risk orders will be held for review before fulfillment.
                Make sure two-way sync is enabled for holds to take effect in Shopify.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Save Button ── */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save Shopify Settings
        </Button>
      </div>

      {/* ── Two-Way Sync Actions ── */}
      {isConnected && (
        <div>
          <h3 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-indigo-400" />
            Push to Shopify
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Manually sync inventory levels and fulfill orders in your Shopify store.
          </p>
          <TwoWaySyncPanel tenantId={tenantId} />
        </div>
      )}
    </div>
  );
}