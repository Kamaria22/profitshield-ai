import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

const LABELS = {
  webhooks: 'Webhook Registration',
  billing: 'Billing / Subscription',
  gdpr: 'GDPR Endpoints',
  uninstall: 'Uninstall Cleanup',
  sync: 'Order Sync',
  rateLimit: 'API Rate Limit Resilience',
};

function CheckRow({ name, result }) {
  const label = LABELS[name] || name;
  const ok = result?.ok;
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white/3">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
        : <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${ok ? 'text-slate-200' : 'text-red-300'}`}>{label}</p>
        <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">
          {JSON.stringify(result)}
        </p>
      </div>
    </div>
  );
}

export default function ReviewerProofPanel({ shopDomain, tenantId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!shopDomain) { setError('No shop domain — select a store first.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await base44.functions.invoke('reviewerProof', {
      shop_domain: shopDomain,
      tenant_id: tenantId,
    });
    setLoading(false);
    if (res.data?.ok) {
      setResult(res.data);
    } else {
      setError(res.data?.error || 'Unknown error');
    }
  };

  return (
    <Card className="glass-card border-white/5 mb-8">
      <CardHeader>
        <CardTitle className="text-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          Reviewer Verification Panel
          {result && (
            <Badge className={`ml-auto ${result.passed ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/15 text-red-300 border-red-500/20'}`}>
              {result.passed ? 'PASS' : 'FAIL'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-500 mb-4">
          Runs all App Store readiness checks for <span className="text-slate-300 font-mono">{shopDomain || '—'}</span> and shows live results.
        </p>

        <Button
          onClick={run}
          disabled={loading}
          className="mb-5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {loading ? 'Running checks…' : 'Run Verification'}
        </Button>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="space-y-2">
              {Object.entries(result.checks).map(([key, val]) => (
                <CheckRow key={key} name={key} result={val} />
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-4 font-mono">{result.version} · {result.timestamp}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}