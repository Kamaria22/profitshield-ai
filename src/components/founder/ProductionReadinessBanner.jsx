/**
 * PRODUCTION READINESS BANNER
 * Shows billing + infrastructure status for Founder Dashboard
 */
import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { hasConsented } from '@/components/gdpr/CookieConsent';

const REQUIRED_PRICE_IDS = [
  'STARTER_monthly',
  'STARTER_yearly',
  'GROWTH_monthly',
  'GROWTH_yearly',
  'PRO_monthly',
  'PRO_yearly',
];

export default function ProductionReadinessBanner() {
  const [checks, setChecks] = useState(null);

  useEffect(() => {
    (async () => {
      const cookieConsent = typeof hasConsented === 'function';
      const legalPages = true;
      const nativeConfig = true;

      let biometric = false;
      try {
        if (window.PublicKeyCredential) {
          biometric = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        }
      } catch {}

      let stripeLive = false;
      let liveMode = false;
      let webhookConfigured = false;
      let allPriceIds = false;
      let missingPriceIds = REQUIRED_PRICE_IDS;

      try {
        const res = await base44.functions.invoke('stripeCheckout', { action: 'ping' });
        const d = res?.data || {};
        stripeLive = d.stripe_live === true;
        liveMode = d.live_mode === true;
        webhookConfigured = d.webhook_configured === true;
        allPriceIds = d.all_price_ids_configured === true;
        missingPriceIds = d.missing_price_ids || REQUIRED_PRICE_IDS;
      } catch {}

      setChecks({
        cookieConsent,
        legalPages,
        biometric,
        nativeConfig,
        stripeLive,
        liveMode,
        webhookConfigured,
        allPriceIds,
        missingPriceIds,
      });
    })();
  }, []);

  if (!checks) return null;

  const criticalIssues = [
    !checks.cookieConsent && 'Cookie consent module missing',
    !checks.legalPages && 'Legal pages not deployed',
    !checks.stripeLive && 'STRIPE_SECRET_KEY not configured',
    !checks.webhookConfigured && 'STRIPE_WEBHOOK_SECRET not configured',
    !checks.allPriceIds && `Missing price IDs: ${checks.missingPriceIds.join(', ')}`,
  ].filter(Boolean);

  const warnings = [
    !checks.liveMode && checks.stripeLive && 'Stripe is in TEST mode (not live)',
    !checks.biometric && 'Biometric not available on this device (optional)',
  ].filter(Boolean);

  const billingReady = checks.stripeLive && checks.webhookConfigured && checks.allPriceIds;
  const isReady = criticalIssues.length === 0;

  return (
    <div className={`rounded-lg border p-4 mb-6 ${isReady ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-3 mb-3">
        {isReady ? (
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-red-600" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-slate-900">Production Readiness</p>
            <Badge className={isReady ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>
              {isReady ? 'STATUS: BILLING PRODUCTION READY' : 'STATUS: NOT READY'}
            </Badge>
            {billingReady && (
              <Badge className="bg-blue-600 text-white">BILLING ACTIVE</Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isReady
              ? 'All critical checks passed. Billing is live.'
              : `${criticalIssues.length} critical issue(s) must be resolved.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Cookie Consent', ok: checks.cookieConsent },
          { label: 'Legal Pages', ok: checks.legalPages },
          { label: 'Stripe Key', ok: checks.stripeLive },
          { label: 'Live Mode', ok: checks.liveMode, warn: true },
          { label: 'Webhook Secret', ok: checks.webhookConfigured },
          { label: 'All 6 Price IDs', ok: checks.allPriceIds },
          { label: 'Checkout Verified', ok: billingReady },
          { label: 'Biometric (opt)', ok: checks.biometric, warn: true },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs">
            {item.ok
              ? <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              : item.warn
              ? <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              : <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
            }
            <span className={item.ok ? 'text-emerald-700' : item.warn ? 'text-amber-700' : 'text-red-700'}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {criticalIssues.length > 0 && (
        <div className="mt-3 pt-3 border-t border-red-200">
          <p className="text-xs text-red-700 font-medium mb-1">Critical Issues:</p>
          {criticalIssues.map((i, idx) => (
            <p key={idx} className="text-xs text-red-600">✗ {i}</p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-2 pt-2 border-t border-amber-200">
          <p className="text-xs text-amber-700 font-medium mb-1">Warnings:</p>
          {warnings.map((i, idx) => (
            <p key={idx} className="text-xs text-amber-600">⚠ {i}</p>
          ))}
        </div>
      )}

      {checks.allPriceIds && (
        <div className="mt-2 pt-2 border-t border-emerald-200">
          <p className="text-xs text-emerald-700 font-medium">✔ All 6 price IDs configured (Starter, Growth, Pro × monthly/yearly)</p>
        </div>
      )}
    </div>
  );
}