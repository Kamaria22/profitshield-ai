import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, ShieldCheck, ShieldAlert, RefreshCw, AlertTriangle, CheckCircle, Lock } from 'lucide-react';

export default function WebhookSecurityPanel() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);

  const runAudit = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('auditWebhookSecrets', {});
      setAudit(res.data);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Lock className="w-5 h-5" />
          Webhook Security Audit
        </CardTitle>
        <CardDescription>
          Scan all tenants for missing HMAC webhook secrets. Fail-closed policy: missing secret = webhook rejected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={runAudit}
          disabled={loading}
          variant="outline"
          className="border-amber-400 text-amber-800 hover:bg-amber-100"
        >
          {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
          {loading ? 'Scanning...' : 'Run Audit'}
        </Button>

        {audit && (
          <div className="space-y-3">
            {/* Score */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white border">
              {audit.security_score === 100
                ? <ShieldCheck className="w-6 h-6 text-emerald-600" />
                : <ShieldAlert className="w-6 h-6 text-red-600" />}
              <div>
                <p className="font-semibold text-slate-800">
                  Security Score: <span className={audit.security_score === 100 ? 'text-emerald-600' : 'text-red-600'}>
                    {audit.security_score}%
                  </span>
                </p>
                <p className="text-xs text-slate-500">Audited at {new Date(audit.audit_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded bg-emerald-50 border border-emerald-200">
                <p className="text-lg font-bold text-emerald-700">{audit.summary.secure}</p>
                <p className="text-xs text-emerald-600">Secure</p>
              </div>
              <div className="text-center p-2 rounded bg-red-50 border border-red-200">
                <p className="text-lg font-bold text-red-700">{audit.summary.vulnerable}</p>
                <p className="text-xs text-red-600">Vulnerable</p>
              </div>
              <div className="text-center p-2 rounded bg-slate-50 border border-slate-200">
                <p className="text-lg font-bold text-slate-700">{audit.summary.inactive}</p>
                <p className="text-xs text-slate-500">Inactive</p>
              </div>
            </div>

            {/* Vulnerable list */}
            {audit.vulnerable_tenants.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Vulnerable Tenants
                </p>
                {audit.vulnerable_tenants.map(t => (
                  <div key={t.id} className="flex items-center justify-between p-2 bg-red-50 rounded border border-red-100 text-sm">
                    <span className="font-mono text-xs text-slate-700">{t.shop_domain}</span>
                    <Badge variant="outline" className="text-red-600 border-red-300 text-xs">No Secret</Badge>
                  </div>
                ))}
                <p className="text-xs text-slate-500 mt-1">{audit.recommendation}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded text-emerald-700 text-sm">
                <CheckCircle className="w-4 h-4" />
                All active tenants have webhook secrets configured.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}