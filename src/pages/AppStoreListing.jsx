/**
 * APP STORE LISTING COPY — Admin reference page
 * This page is admin-only. It contains all copy for app store submissions.
 */
import React, { useState } from 'react';
import { Copy, Check, Store, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useEffect } from 'react';

function CopyBlock({ label, content }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="mb-6 border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 px-4 py-2 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <button onClick={handle} className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-600 transition-colors">
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-sm text-slate-700 whitespace-pre-wrap font-mono bg-white">{content}</pre>
    </div>
  );
}

export default function AppStoreListing() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center text-slate-500">Access restricted to admins.</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Store className="w-7 h-7 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">App Store Listing Assets</h1>
          <p className="text-sm text-slate-500">Copy-ready content for iOS App Store and Google Play submissions</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-10">
        {[
          { label: 'Bundle ID', val: 'ai.profitshield.app' },
          { label: 'Category', val: 'Business / Finance' },
          { label: 'Age Rating', val: '4+ (iOS) / Everyone (Android)' },
          { label: 'Support URL', val: 'https://profitshield.base44.app/?page=Support' },
          { label: 'Marketing URL', val: 'https://profitshield.base44.app' },
          { label: 'Privacy Policy URL', val: 'https://profitshield.base44.app/?page=PrivacyPolicy' },
        ].map(item => (
          <div key={item.label} className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <p className="font-mono text-sm text-slate-900">{item.val}</p>
          </div>
        ))}
      </div>

      <CopyBlock
        label="App Name (30 chars max)"
        content="ProfitShield AI"
      />
      <CopyBlock
        label="Subtitle / Short Description (30 chars max)"
        content="Fraud Protection & Profit AI"
      />
      <CopyBlock
        label="iOS Description (4000 chars max)"
        content={`ProfitShield AI is the most advanced fraud protection and profit intelligence platform for e-commerce merchants.

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

CONNECT YOUR STORE
• Shopify integration (2-minute setup)
• WooCommerce, BigCommerce, Magento support
• Stripe direct connector
• Real-time webhook sync
• Multi-store management

ENTERPRISE GRADE
• Role-based access control
• Full audit trail and compliance logs
• GDPR and CCPA compliant
• Bank-level encryption (AES-256)
• SOC 2 controls in progress
• 99.9% uptime SLA

WORKS EVERYWHERE
• Desktop app (Windows, Mac, Linux)
• iOS and Android native apps
• Offline support with background sync
• Push notifications for critical alerts

TRUSTED BY MERCHANTS
Join thousands of merchants who trust ProfitShield to protect their profit margins.

Start free. No credit card required.`}
      />
      <CopyBlock
        label="Keywords (iOS — 100 chars max, comma separated)"
        content="fraud,protection,ecommerce,shopify,orders,risk,profit,analytics,AI,security,chargeback,margin"
      />
      <CopyBlock
        label="What's New (Version 1.0.0)"
        content={`Welcome to ProfitShield AI!

• Neural Fraud Engine with 50+ risk signals
• Real-time P&L analytics and margin tracking
• Shopify integration with 2-minute setup
• AI-powered customer segmentation
• Predictive threat forecasting
• Desktop app with offline support
• GDPR and CCPA compliant`}
      />
      <CopyBlock
        label="Google Play Short Description (80 chars)"
        content="AI fraud protection & profit analytics for e-commerce merchants."
      />

      <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
        <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
          <Star className="w-5 h-5" /> Screenshot Requirements Checklist
        </h3>
        <ul className="text-sm text-amber-800 space-y-1">
          <li>☐ iPhone 6.7" — 1290×2796px (at least 3, max 10)</li>
          <li>☐ iPhone 5.5" — 1242×2208px</li>
          <li>☐ iPad 12.9" — 2048×2732px</li>
          <li>☐ Android Phone — 1080×1920px (at least 2)</li>
          <li>☐ Android Feature Graphic — 1024×500px</li>
          <li>☐ App Store marketing icon — 1024×1024px (no alpha channel for iOS)</li>
        </ul>
      </div>
    </div>
  );
}