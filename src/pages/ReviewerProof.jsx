import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { usePlatformResolver, requireResolved } from '@/components/usePlatformResolver';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, ShieldCheck,
  Webhook, CreditCard, Lock, Unplug, ShoppingCart, Wifi, AlertTriangle
} from 'lucide-react';
import RouteGuard from '@/components/RouteGuard';

const CHECK_META = {
  webhooks:  { label: 'Webhook Registration',       icon: Webhook,       desc: 'All required Shopify topics registered' },
  billing:   { label: 'Billing / Subscription',      icon: CreditCard,    desc: 'Active subscription state confirmed' },
  gdpr:      { label: 'GDPR Endpoint Health',        icon: Lock,          desc: 'Customer/shop redact queue health' },
  uninstall: { label: 'Uninstall Cleanup',           icon: Unplug,        desc: 'PlatformIntegration record present' },
  sync:      { label: 'Order Sync',                  icon: ShoppingCart,  desc: 'Orders exist or confirmed 0' },
  rateLimit: { label: 'API Rate Limit Resilience',   icon: Wifi,          desc: 'Not currently throttled' },
};

function CheckRow({ name, result }) {
  const meta = CHECK_META[name] || { label: name, icon: ShieldCheck, desc: '' };
  const Icon = meta.icon;
  const ok = result?.ok;

  // Build a human-readable detail string
  let detail = '';
  if (name === 'webhooks' && !ok && result?.missing?.length) {
    detail = `Missing: ${result.missing.join(', ')}`;
  } else if (name === 'billing' && !ok) {
    detail = result?.reason || 'No subscription found';
  } else if (name === 'billing' && ok) {
    detail = `${result.plan || 'plan'} · ${result.status}`;
  } else if (name === 'gdpr') {
    detail = `${result?.total_gdpr_jobs ?? 0} jobs · ${result?.completed ?? 0} completed`;
  } else if (name === 'uninstall') {
    detail = result?.status || result?.reason || '';
  } else if (name === 'sync') {
    detail = `${result?.orders_found ?? 0} orders found${result?.is_demo ? ' (demo data)' : ''}`;
  } else if (name === 'rateLimit' && !ok) {
    detail = result?.reason || 'Throttled or no integration';
  } else if (name === 'rateLimit' && ok) {
    detail = result?.is_throttled === false ? 'Not throttled' : '';
  }

  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl transition-colors ${ok ? 'bg-emerald-500/5 border border-emerald-500/10' : 'bg-red-500/5 border border-red-500/15'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ok ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
        <Icon className={`w-4 h-4 ${ok ? 'text-emerald-400' : 'text-red-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-slate-200">{meta.label}</p>
          {ok
            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          }
        </div>
        <p className="text-xs text-slate-500">{meta.desc}</p>
        {detail && (
          <p className={`text-xs mt-1 font-mono ${ok ? 'text-slate-400' : 'text-red-400'}`}>{detail}</p>
        )}
      </div>
    </div>
  );
}

function ReviewerProofContent({ shopDomain, tenantId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!shopDomain) { setError('No store connected — select a store first.'); return; }
    setLoading(true);
    setError(null);

    const res = await base44.functions.invoke('reviewerProof', {
      shop_domain: shopDomain,
      tenant_id: tenantId,
    });

    setLoading(false);

    if (res.data?.ok) {
      setResult(res.data);
      // Log proof to AppStoreReadinessProof entity
      base44.entities.AppStoreReadinessProof.create({
        area: 'reviewer_proof_full',
        status: res.data.passed ? 'pass' : 'fail',
        version: res.data.version,
        evidence_json: res.data.checks,
        tenant_id: tenantId,
        shop_domain: shopDomain,
        timestamp: res.data.timestamp,
      }).catch(() => {});
    } else {
      setError(res.data?.error || 'Verification failed — check logs.');
    }
  };

  // Auto-run on mount if store is available
  useEffect(() => {
    if (shopDomain) run();
  }, [shopDomain]);

  const passed = result?.passed;
  const failingChecks = result
    ? Object.entries(result.checks).filter(([, v]) => !v.ok).map(([k]) => CHECK_META[k]?.label || k)
    : [];

  return (
    <div className="max-w-3xl mx-auto px-2 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-100">Reviewer Proof</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(129,140,248,0.35)', color: '#a5b4fc' }}>
              ADMIN
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Shopify App Store readiness verification for{' '}
            <span className="font-mono text-slate-300">{shopDomain || '—'}</span>
          </p>
        </div>
      </div>

      {/* Verdict Banner */}
      {result && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${passed
          ? 'bg-emerald-500/10 border border-emerald-500/25'
          : 'bg-red-500/10 border border-red-500/25'}`}>
          {passed
            ? <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
            : <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
          }
          <div>
            <p className={`font-bold text-lg ${passed ? 'text-emerald-300' : 'text-red-300'}`}>
              {passed ? '✅ PASS — Ready for App Store Review' : '❌ FAIL — Action Required'}
            </p>
            {!passed && failingChecks.length > 0 && (
              <p className="text-sm text-red-400 mt-0.5">
                Failing: {failingChecks.join(', ')}
              </p>
            )}
          </div>
          <Badge className={`ml-auto text-sm px-3 py-1 ${passed ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' : 'bg-red-500/20 text-red-200 border-red-500/30'}`}>
            {passed ? 'PASS' : 'FAIL'}
          </Badge>
        </div>
      )}

      {/* Run Button */}
      <Card className="glass-card border-white/5 mb-6">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={run}
              disabled={loading}
              className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running checks…</>
                : <><RefreshCw className="w-4 h-4 mr-2" />Run App Store Readiness Check</>
              }
            </Button>
            {result && (
              <span className="text-xs text-slate-500 font-mono">{result.timestamp}</span>
            )}
          </div>

          {error && (
            <div className="mt-3 p-3 rounded-lg text-sm text-red-300"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          {!shopDomain && !loading && (
            <div className="mt-3 p-3 rounded-lg text-sm text-amber-300"
              style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              No store connected. Connect a Shopify store to run verification.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check Results */}
      {result && (
        <Card className="glass-card border-white/5">
          <CardHeader>
            <CardTitle className="text-slate-200 text-base">Check Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(result.checks).map(([key, val]) => (
                <CheckRow key={key} name={key} result={val} />
              ))}
            </div>
            <p className="text-xs text-slate-600 font-mono mt-4">{result.version}</p>
          </CardContent>
        </Card>
      )}

      {loading && !result && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Running all checks…
        </div>
      )}
    </div>
  );
}

export default function ReviewerProof() {
  const resolver = usePlatformResolver();
  let shopDomain = null;
  let tenantId = null;
  try {
    const r = requireResolved(resolver || {});
    shopDomain = r.storeKey || null;
    tenantId = r.tenantId || null;
  } catch {}

  return (
    <RouteGuard pageName="ReviewerProof">
      <ReviewerProofContent shopDomain={shopDomain} tenantId={tenantId} />
    </RouteGuard>
  );
}