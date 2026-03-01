/**
 * One-click Shopify App Store submission button (admin only)
 */
import React, { useState, useEffect } from 'react';
import { Rocket, CheckCircle, XCircle, Loader2, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';

export default function ShopifySubmitButton() {
  const [status, setStatus] = useState(null); // null | 'checking' | 'ready' | 'missing_secrets' | 'submitting' | 'success' | 'error'
  const [checkData, setCheckData] = useState(null);
  const [result, setResult] = useState(null);

  const runCheck = async () => {
    setStatus('checking');
    setResult(null);
    const res = await base44.functions.invoke('shopifyAppSubmit', { action: 'check' });
    const d = res.data;
    setCheckData(d);
    if (!d.hasPartnerToken || !d.hasOrgId) {
      setStatus('missing_secrets');
    } else {
      setStatus('ready');
    }
  };

  useEffect(() => { runCheck(); }, []);

  const handleSubmit = async () => {
    setStatus('submitting');
    setResult(null);
    const res = await base44.functions.invoke('shopifyAppSubmit', { action: 'submit' });
    const d = res.data;
    if (d.ok) {
      setStatus('success');
      setResult(d);
    } else {
      setStatus('error');
      setResult(d);
    }
  };

  const secretRows = [
    { key: 'SHOPIFY_API_KEY', ok: checkData?.hasApiKey },
    { key: 'SHOPIFY_API_SECRET', ok: checkData?.hasApiSecret },
    { key: 'SHOPIFY_PARTNER_TOKEN', ok: checkData?.hasPartnerToken, required: true },
    { key: 'SHOPIFY_PARTNER_ORG_ID', ok: checkData?.hasOrgId, required: true },
  ];

  return (
    <Card className="glass-card border-white/5">
      <CardHeader>
        <CardTitle className="text-slate-200 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-400" />
          Automated Shopify Submission
          {status === 'success' && <Badge className="ml-2 bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Submitted!</Badge>}
          {status === 'missing_secrets' && <Badge className="ml-2 bg-amber-500/15 text-amber-300 border-amber-500/20">Secrets Missing</Badge>}
        </CardTitle>
        <p className="text-sm text-slate-400">One-click push to Shopify Partner Dashboard via API.</p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Secret Status */}
        <div className="grid grid-cols-2 gap-2">
          {secretRows.map(s => (
            <div key={s.key} className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {status === 'checking'
                ? <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                : s.ok
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400" />
              }
              <span className="text-xs font-mono text-slate-300 truncate">{s.key}</span>
              {s.required && !s.ok && status !== 'checking' && (
                <Badge className="ml-auto text-[9px] bg-red-500/15 text-red-400 border-red-500/25">Required</Badge>
              )}
            </div>
          ))}
        </div>

        {/* Missing secrets instructions */}
        {status === 'missing_secrets' && (
          <div className="p-3 rounded-lg text-sm"
            style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-300 mb-1">Set these secrets in Base44 Dashboard → Settings → Environment Variables:</p>
                <ul className="text-amber-400/80 text-xs space-y-0.5">
                  {!checkData?.hasPartnerToken && <li><code>SHOPIFY_PARTNER_TOKEN</code> — from Partners Dashboard → Your Account → API Tokens</li>}
                  {!checkData?.hasOrgId && <li><code>SHOPIFY_PARTNER_ORG_ID</code> — your Shopify Partner Organization ID</li>}
                </ul>
                <a href="https://partners.shopify.com" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-2">
                  Open Shopify Partners <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="p-3 rounded-lg text-sm"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">Listing updated successfully!</span>
            </div>
            {result?.listing?.id && (
              <p className="text-xs text-emerald-400/70 mt-1">Listing ID: {result.listing.id}</p>
            )}
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="p-3 rounded-lg text-sm"
            style={{ background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)' }}>
            <div className="flex items-start gap-2 text-red-300">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Submission failed</p>
                <p className="text-xs text-red-400/70 mt-1">{result?.error || JSON.stringify(result?.userErrors || result?.errors)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={status === 'checking' || status === 'missing_secrets' || status === 'submitting'}
            className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {status === 'submitting'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
              : <><Rocket className="w-4 h-4" /> Submit to Shopify</>
            }
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={runCheck}
            disabled={status === 'checking'}
            className="border-white/10"
            title="Re-check secrets"
          >
            <RefreshCw className={`w-4 h-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <p className="text-xs text-slate-500">
          This calls the Shopify Partner GraphQL API to update your app listing metadata. Screenshots must be uploaded manually in Partner Dashboard.
        </p>
      </CardContent>
    </Card>
  );
}