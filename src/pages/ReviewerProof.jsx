import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, ShieldCheck,
  Webhook, CreditCard, Lock, Unplug, ShoppingCart, Wifi, AlertTriangle
} from 'lucide-react';

const CHECK_META = {
  webhooks:  { label: 'Webhook Registration',     icon: Webhook,      desc: 'All required Shopify topics registered' },
  billing:   { label: 'Billing / Subscription',    icon: CreditCard,   desc: 'Active subscription state confirmed' },
  gdpr:      { label: 'GDPR Endpoint Health',      icon: Lock,         desc: 'Customer/shop redact queue health' },
  uninstall: { label: 'Uninstall Cleanup',         icon: Unplug,       desc: 'PlatformIntegration record present' },
  sync:      { label: 'Order Sync',                icon: ShoppingCart, desc: 'Orders exist or confirmed 0' },
  rateLimit: { label: 'API Rate Limit Resilience', icon: Wifi,         desc: 'Not currently throttled' },
};

function CheckRow({ name, result }) {
  const meta = CHECK_META[name] || { label: name, icon: ShieldCheck, desc: '' };
  const Icon = meta.icon;
  const ok = result?.ok;

  let detail = '';
  if (name === 'webhooks' && !ok && result?.missing?.length) {
    detail = `Missing: ${result.missing.join(', ')}`;
  } else if (name === 'webhooks' && ok) {
    detail = `${result.registered?.length || 0} topics registered`;
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
    <div className={`flex items-start gap-4 p-4 rounded-xl ${ok ? 'bg-emerald-500/5 border border-emerald-500/10' : 'bg-red-500/5 border border-red-500/15'}`}>
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

export default function ReviewerProof() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shopDomain, setShopDomain] = useState('');
  const [inputDomain, setInputDomain] = useState('');
  const [tenants, setTenants] = useState([]);

  // Load available tenants on mount
  useEffect(() => {
    base44.entities.Tenant.list('-created_date', 20)
      .then(list => {
        setTenants(list || []);
        if (list?.length > 0 && !shopDomain) {
          setShopDomain(list[0].shop_domain);
          setInputDomain(list[0].shop_domain);
        }
      })
      .catch(() => {});
  }, []);

  const run = async (domain) => {
    const target = domain || shopDomain || inputDomain;
    if (!target) {
      setError('Enter a shop domain to run checks.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Find tenant_id for this shop
      let tenantId = null;
      const match = tenants.find(t => t.shop_domain === target);
      if (match) tenantId = match.id;

      const res = await base44.functions.invoke('reviewerProof', {
        shop_domain: target,
        tenant_id: tenantId,
      });

      if (res.data?.ok) {
        setResult(res.data);
        // Log to AppStoreReadinessProof
        base44.entities.AppStoreReadinessProof.create({
          area: 'reviewer_proof_full',
          status: res.data.passed ? 'pass' : 'fail',
          version: res.data.version,
          evidence_json: res.data.checks,
          tenant_id: tenantId,
          shop_domain: target,
          timestamp: res.data.timestamp,
        }).catch(() => {});
      } else {
        setError(res.data?.error || 'Verification failed.');
      }
    } catch (e) {
      setError(e.message || 'Unexpected error.');
    } finally {
      setLoading(false);
    }
  };

  const passed = result?.passed;
  const failingChecks = result
    ? Object.entries(result.checks || {}).filter(([, v]) => !v?.ok).map(([k]) => CHECK_META[k]?.label || k)
    : [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-100">Reviewer Proof</h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(129,140,248,0.35)', color: '#a5b4fc' }}>
              ADMIN
            </span>
          </div>
          <p className="text-sm text-slate-400">Shopify App Store readiness verification</p>
        </div>
      </div>

      {/* Verdict Banner */}
      {result && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${passed
          ? 'bg-emerald-500/10 border border-emerald-500/25'
          : 'bg-red-500/10 border border-red-500/25'}`}>
          {passed
            ? <CheckCircle2 className="w-7 h-7 text-emerald-400 flex-shrink-0" />
            : <AlertTriangle className="w-7 h-7 text-red-400 flex-shrink-0" />
          }
          <div className="flex-1">
            <p className={`font-bold text-xl ${passed ? 'text-emerald-300' : 'text-red-300'}`}>
              {passed ? '✅ PASS — Ready for App Store Review' : '❌ FAIL — Action Required'}
            </p>
            {!passed && failingChecks.length > 0 && (
              <p className="text-sm text-red-400 mt-0.5">Failing: {failingChecks.join(', ')}</p>
            )}
          </div>
          <Badge className={`text-sm px-3 py-1 font-bold ${passed
            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
            : 'bg-red-500/20 text-red-200 border-red-500/30'}`}>
            {passed ? 'PASS' : 'FAIL'}
          </Badge>
        </div>
      )}

      {/* Controls */}
      <Card className="bg-slate-900/50 border-white/5">
        <CardContent className="pt-5 pb-4 space-y-4">
          {/* Shop Domain Selector */}
          <div className="flex gap-2 flex-wrap">
            {tenants.length > 0 ? (
              <select
                value={shopDomain}
                onChange={e => setShopDomain(e.target.value)}
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {tenants.map(t => (
                  <option key={t.id} value={t.shop_domain}>{t.shop_domain}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={inputDomain}
                onChange={e => setInputDomain(e.target.value)}
                placeholder="mystore.myshopify.com"
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm placeholder:text-slate-500"
              />
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => run()}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running checks…</>
                : <><RefreshCw className="w-4 h-4 mr-2" />Run App Store Readiness Check</>
              }
            </Button>
            {result?.timestamp && (
              <span className="text-xs text-slate-500 font-mono">{result.timestamp}</span>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm text-red-300"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />{error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && !result && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Running all checks…
        </div>
      )}

      {/* Check Results */}
      {result && (
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader>
            <CardTitle className="text-slate-200 text-base">Check Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(result.checks || {}).map(([key, val]) => (
              <CheckRow key={key} name={key} result={val} />
            ))}
            <p className="text-xs text-slate-600 font-mono pt-2">{result.version}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}