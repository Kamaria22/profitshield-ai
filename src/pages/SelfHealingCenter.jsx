import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { invokeSelfHealSafe } from '@/lib/safeApi';
import { Shield, RefreshCw, Activity, AlertTriangle, CheckCircle, Zap, Loader2, Play, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SubsystemHealthCard from '@/components/selfheal/SubsystemHealthCard';
import IncidentRow from '@/components/selfheal/IncidentRow';
import PatchBundleCard from '@/components/selfheal/PatchBundleCard';

export default function SelfHealingCenter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [healingSubsystem, setHealingSubsystem] = useState(null);
  const [data, setData] = useState(null);
  const [watchdogResult, setWatchdogResult] = useState(null);
  const [tab, setTab] = useState('overview');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => {
      const role = (u?.role || u?.app_role || '').toLowerCase();
      if (role !== 'admin' && role !== 'owner') {
        navigate(createPageUrl('Home', location.search), { replace: true });
        return;
      }
      loadData();
    }).catch(() => { navigate(createPageUrl('Home', location.search), { replace: true }); });
  }, [loadData, navigate, location.search]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const resolved = await invokeSelfHealSafe({ action: 'get_incidents', limit: 100 });
      setData(resolved?.data || { events: [], queue: { pending: 0, dead_letter: 0 }, pending_patches: [] });
      setLastUpdatedAt(new Date().toISOString());
      setErrorMessage('');
    } catch (e) {
      console.error('Failed to load self-healing data:', e);
      setErrorMessage(e?.message || 'Failed to load self-healing data');
    }
    setLoading(false);
  }, []);

  const runWatchdog = async () => {
    setRunning(true);
    try {
      const res = await invokeSelfHealSafe({ action: 'run_watchdog' });
      setWatchdogResult(res.data);
      await loadData();
      setErrorMessage('');
    } catch (e) {
      console.error('Watchdog failed:', e);
      setErrorMessage(e?.message || 'Watchdog execution failed');
    }
    setRunning(false);
  };

  const healSubsystem = async (action, extra = {}) => {
    setHealingSubsystem(action);
    try {
      await invokeSelfHealSafe({ action, ...extra });
      await loadData();
      setErrorMessage('');
    } catch (e) {
      console.error('Heal failed:', e);
      setErrorMessage(e?.message || `Failed to run ${action}`);
    }
    setHealingSubsystem(null);
  };

  const acknowledgeEvent = async (eventId) => {
    try {
      await invokeSelfHealSafe({ action: 'acknowledge_event', event_id: eventId });
      setData(prev => prev ? {
        ...prev,
        events: prev.events.map(e => e.id === eventId ? { ...e, acknowledged: true } : e)
      } : prev);
      setErrorMessage('');
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to acknowledge incident');
    }
  };

  const approveP = async (patchId) => {
    try {
      await invokeSelfHealSafe({ action: 'approve_patch', patch_bundle_id: patchId });
      await loadData();
      setErrorMessage('');
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to approve patch proposal');
    }
  };

  const rejectP = async (patchId) => {
    try {
      await invokeSelfHealSafe({ action: 'reject_patch', patch_bundle_id: patchId });
      await loadData();
      setErrorMessage('');
    } catch (e) {
      setErrorMessage(e?.message || 'Failed to reject patch proposal');
    }
  };

  // Derive subsystem health from events
  const getSubsystemStatus = (subsystem) => {
    if (!data?.events) return 'unknown';
    const recent = data.events.filter(e =>
      e.subsystem === subsystem &&
      !e.acknowledged &&
      new Date(e.detected_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    if (recent.some(e => e.severity === 'critical' && e.fix_result !== 'success')) return 'critical';
    if (recent.some(e => ['high','medium'].includes(e.severity) && e.fix_result !== 'success')) return 'degraded';
    if (recent.length === 0 || recent.every(e => e.fix_result === 'success' || e.auto_healed)) return 'healthy';
    return 'degraded';
  };

  const subsystems = [
    { key: 'SHOPIFY_OAUTH', name: 'Shopify Auth', healAction: 'heal_shopify_token' },
    { key: 'SHOPIFY_WEBHOOKS', name: 'Shopify Webhooks', healAction: 'heal_shopify_webhooks' },
    { key: 'SHOPIFY_SYNC', name: 'Order Sync', healAction: null },
    { key: 'STRIPE_BILLING', name: 'Stripe Billing', healAction: 'heal_stripe_webhook' },
    { key: 'QUEUE', name: 'Webhook Queue', healAction: 'heal_queue' },
    { key: 'SECRETS', name: 'Secrets', healAction: 'heal_missing_secrets' },
    { key: 'AUTOMATION', name: 'Automations', healAction: null },
    { key: 'AUTH', name: 'User Auth', healAction: null },
  ];

  const activeIncidents = data?.events?.filter(e => !e.acknowledged && e.fix_result !== 'success') || [];
  const recentHeals = data?.events?.filter(e => e.auto_healed && e.fixed_at) || [];
  const queueDepth = data?.queue?.pending || 0;
  const deadLetters = data?.queue?.dead_letter || 0;
  const pendingPatches = data?.pending_patches?.filter(p => p.status === 'proposed') || [];

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading Self-Healing Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Self-Healing Center</h1>
              <p className="text-sm text-slate-500">Autonomous detection, healing & patch management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}
              className="border-slate-700 text-slate-300 hover:bg-slate-800">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={runWatchdog} disabled={running}
              className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Run Watchdog Now
            </Button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">{errorMessage}</p>
          </div>
        )}

        {/* Pending patches banner */}
        {pendingPatches.length > 0 && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-violet-400" />
              <div>
                <p className="font-semibold text-violet-200 text-sm">{pendingPatches.length} Fix{pendingPatches.length > 1 ? 'es' : ''} Available — Approval Required</p>
                <p className="text-xs text-violet-400">Proposal-only. Approvals require manual code application and deployment.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => setTab('patches')} className="bg-violet-600 hover:bg-violet-700 text-white">
              Review Patches
            </Button>
          </div>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Active Incidents', value: activeIncidents.length, color: activeIncidents.length > 0 ? 'text-red-400' : 'text-emerald-400', icon: AlertTriangle },
            { label: 'Auto-Healed Today', value: recentHeals.length, color: 'text-emerald-400', icon: Zap },
            { label: 'Queue Depth', value: queueDepth, color: queueDepth > 100 ? 'text-amber-400' : 'text-slate-300', icon: Activity },
            { label: 'Dead Letters', value: deadLetters, color: deadLetters > 0 ? 'text-red-400' : 'text-slate-300', icon: XCircle },
          ].map((kpi, i) => (
            <div key={i} className="rounded-xl border border-white/5 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                <span className="text-xs text-slate-500">{kpi.label}</span>
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-slate-900 border border-white/5">
            <TabsTrigger value="overview">Subsystems</TabsTrigger>
            <TabsTrigger value="incidents">
              Incidents {activeIncidents.length > 0 && <Badge className="ml-1 bg-red-500/80 text-white text-xs">{activeIncidents.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="patches">
              Patches {pendingPatches.length > 0 && <Badge className="ml-1 bg-violet-500/80 text-white text-xs">{pendingPatches.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="runs">Run Logs</TabsTrigger>
          </TabsList>

          {/* ── Overview ────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {subsystems.map(s => {
                const status = getSubsystemStatus(s.key);
                return (
                  <SubsystemHealthCard
                    key={s.key}
                    name={s.name}
                    status={status}
                    detail={s.key === 'QUEUE' ? `${queueDepth} pending · ${deadLetters} dead` : undefined}
                    onHeal={s.healAction ? () => healSubsystem(s.healAction) : undefined}
                    healing={healingSubsystem === s.healAction}
                  />
                );
              })}
            </div>

            {watchdogResult && (
              <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <p className="text-sm font-semibold text-indigo-300 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Watchdog Completed
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-slate-500">Shopify Checked:</span> <span className="text-slate-200">{watchdogResult.subsystems?.shopify?.total || 0}</span></div>
                  <div><span className="text-slate-500">Healthy:</span> <span className="text-emerald-400">{watchdogResult.subsystems?.shopify?.healthy || 0}</span></div>
                  <div><span className="text-slate-500">Heals Applied:</span> <span className="text-emerald-400">{watchdogResult.heals?.length || 0}</span></div>
                  <div><span className="text-slate-500">Incidents Found:</span> <span className="text-red-400">{watchdogResult.incidents?.length || 0}</span></div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Incidents ────────────────────────────────── */}
          <TabsContent value="incidents" className="mt-4 space-y-2">
            {!data?.events?.length ? (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-slate-400">No incidents recorded yet</p>
              </div>
            ) : (
              <>
                {activeIncidents.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Active</p>
                    {activeIncidents.slice(0, 20).map(e => (
                      <IncidentRow key={e.id} event={e} onAcknowledge={acknowledgeEvent} />
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">History</p>
                  {(data.events || []).filter(e => e.acknowledged || e.fix_result === 'success').slice(0, 30).map(e => (
                    <IncidentRow key={e.id} event={e} />
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Patches ────────────────────────────────── */}
          <TabsContent value="patches" className="mt-4 space-y-3">
            {!data?.pending_patches?.length ? (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-slate-400">No patch bundles pending</p>
              </div>
            ) : (
              data.pending_patches.map(p => (
                <PatchBundleCard key={p.id} patch={p} onApprove={approveP} onReject={rejectP} />
              ))
            )}
          </TabsContent>

          {/* ── Run Logs ────────────────────────────────── */}
          <TabsContent value="runs" className="mt-4">
            <div className="rounded-xl border border-white/5 bg-slate-900/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500">
                    <th className="text-left p-3">Automation</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Triggered By</th>
                    <th className="text-left p-3">Duration</th>
                    <th className="text-left p-3">Ran At</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent_runs || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-slate-500 py-8">No run logs yet</td></tr>
                  ) : (
                    (data.recent_runs || []).map((run, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="p-3 text-slate-300 font-mono">{run.automation_name}</td>
                        <td className="p-3">
                          <Badge className={run.status === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}>
                            {run.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-slate-400">{run.triggered_by || '—'}</td>
                        <td className="p-3 text-slate-400">{run.duration_ms ? `${run.duration_ms}ms` : '—'}</td>
                        <td className="p-3 text-slate-500">{run.run_at ? new Date(run.run_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {lastUpdatedAt && (
              <p className="text-xs text-slate-500 mt-2">
                Last refreshed: {new Date(lastUpdatedAt).toLocaleString()}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
