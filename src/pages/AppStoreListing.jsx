/**
 * APP STORE LISTING — Admin-only page
 * Protected by RouteGuard (admin + internal context required)
 */
import React, { useState } from 'react';
import { Copy, Check, Store, Star, Rocket, CheckCircle2, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RouteGuard from '@/components/RouteGuard';

function CopyBlock({ label, content }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="mb-6 glass-card rounded-xl overflow-hidden border-white/5">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-sm font-semibold text-slate-300">{label}</span>
        <button onClick={handle} className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors">
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-sm text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/50">{content}</pre>
    </div>
  );
}

const CHECKLIST = [
  { id: 'icon', label: 'App icon uploaded (1024×1024px, no alpha)', docsUrl: 'https://shopify.dev/docs/apps/launch/app-requirements' },
  { id: 'screenshots', label: 'Screenshots uploaded (min 3)', docsUrl: null },
  { id: 'pricing', label: 'Pricing plans confirmed in Partner Dashboard', docsUrl: 'https://shopify.dev/docs/apps/launch/billing' },
  { id: 'support_url', label: 'Support URL set: profitshield.base44.app/?page=HelpCenter', docsUrl: null },
  { id: 'privacy_url', label: 'Privacy Policy URL confirmed', docsUrl: null },
  { id: 'terms_url', label: 'Terms of Service URL confirmed', docsUrl: null },
  { id: 'scopes', label: 'Required OAuth scopes declared in Partner Dashboard', docsUrl: 'https://shopify.dev/docs/api/usage/access-scopes' },
  { id: 'webhooks', label: 'GDPR webhooks registered (customers/redact, shop/redact, customers/data_request)', docsUrl: 'https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks' },
  { id: 'api_key', label: 'SHOPIFY_API_KEY secret is set in Base44', docsUrl: null },
  { id: 'api_secret', label: 'SHOPIFY_API_SECRET secret is set in Base44', docsUrl: null },
];

function ReadinessChecklist() {
  const [checked, setChecked] = useState({});
  const completedCount = Object.values(checked).filter(Boolean).length;
  const allDone = completedCount === CHECKLIST.length;

  return (
    <Card className="glass-card border-white/5 mb-8">
      <CardHeader>
        <CardTitle className="text-slate-200 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-indigo-400" />
          Submission Readiness Checklist
          <Badge className={`ml-auto ${allDone ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/20'}`}>
            {completedCount}/{CHECKLIST.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {CHECKLIST.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/3 hover:bg-white/5 transition-colors">
              <button onClick={() => setChecked(p => ({ ...p, [item.id]: !p[item.id] }))}
                className="flex-shrink-0">
                {checked[item.id]
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  : <XCircle className="w-5 h-5 text-slate-600" />
                }
              </button>
              <span className={`text-sm flex-1 ${checked[item.id] ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                {item.label}
              </span>
              {item.docsUrl && (
                <a href={item.docsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 flex-shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ))}
        </div>
        {allDone && (
          <div className="mt-4 p-3 rounded-lg text-sm text-emerald-300 font-medium"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
            ✅ All checks complete — ready to submit to Shopify Partner Dashboard!
          </div>
        )}
        <div className="mt-4 p-3 rounded-lg text-xs text-amber-300"
          style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
          Credentials are stored securely in Base44 secrets and are never displayed here.
        </div>
      </CardContent>
    </Card>
  );
}

export default function AppStoreListing() {
  return (
    <RouteGuard pageName="AppStoreListing">
      <div className="max-w-5xl mx-auto px-2 py-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Store className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-100">App Store Listing</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(129,140,248,0.35)', color: '#a5b4fc' }}>
                ADMIN
              </span>
            </div>
            <p className="text-sm text-slate-400">Automated Shopify App Store submission assets</p>
          </div>
        </div>

        <ReadinessChecklist />

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {[
            { label: 'App Handle', val: 'profitshield-ai' },
            { label: 'Category', val: 'Store management' },
            { label: 'Support URL', val: 'https://profitshield.base44.app/?page=HelpCenter' },
            { label: 'Marketing URL', val: 'https://profitshield.base44.app' },
            { label: 'Privacy Policy URL', val: 'https://profitshield.base44.app/?page=PrivacyPolicy' },
            { label: 'Terms URL', val: 'https://profitshield.base44.app/?page=TermsOfService' },
          ].map(item => (
            <div key={item.label} className="glass-card rounded-xl p-4 border-white/5">
              <p className="text-xs text-slate-500 mb-1">{item.label}</p>
              <p className="font-mono text-sm text-slate-200 break-all">{item.val}</p>
            </div>
          ))}
        </div>

        <CopyBlock label="App Name (30 chars max)" content="ProfitShield AI" />
        <CopyBlock label="Tagline / Short Description" content="Fraud Protection & Profit AI" />
        <CopyBlock
          label="App Description"
          content={`ProfitShield AI is the most advanced fraud protection and profit intelligence platform for Shopify merchants.

PROTECT YOUR PROFIT
• Real-time AI fraud detection on every order
• Neural risk scoring across 50+ behavioral signals
• Automatic high-risk order flagging and holds
• Chargeback prediction and prevention
• Predictive threat forecasting with recommended actions

UNDERSTAND YOUR BUSINESS
• Live P&L analytics with margin breakdown
• Profit leak detection and forensics
• Supplier risk assessment
• Customer segmentation and lifetime value analysis
• AI-generated insights and recommendations

ENTERPRISE GRADE
• Role-based access control
• Full audit trail and compliance logs
• GDPR and CCPA compliant
• Bank-level encryption (AES-256)
• 99.9% uptime SLA

Start free. No credit card required.`}
        />
        <CopyBlock
          label="Required OAuth Scopes"
          content="read_orders, write_orders, read_products, read_customers, read_fulfillments, read_shipping, write_fulfillments"
        />
        <CopyBlock
          label="GDPR Mandatory Webhooks"
          content={`customers/redact     → {APP_URL}/api/gdprCustomerRedact
shop/redact          → {APP_URL}/api/gdprShopRedact
customers/data_request → {APP_URL}/api/gdprCustomerDataRequest`}
        />
        <CopyBlock
          label="What's New (v1.0)"
          content={`Welcome to ProfitShield AI!

• Neural Fraud Engine with 50+ risk signals
• Real-time P&L analytics and margin tracking
• Shopify integration with 2-minute setup
• AI-powered customer segmentation
• Predictive threat forecasting
• GDPR and CCPA compliant`}
        />
      </div>
    </RouteGuard>
  );
}