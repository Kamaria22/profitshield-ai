import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function LegalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 pt-6 border-t border-slate-200 px-6 pb-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <span>© {year} ProfitShield AI, Inc. All rights reserved.</span>
        <div className="flex flex-wrap items-center gap-4">
          <Link to={createPageUrl('PrivacyPolicy')} className="hover:text-emerald-600 transition-colors">Privacy</Link>
          <Link to={createPageUrl('TermsOfService')} className="hover:text-emerald-600 transition-colors">Terms</Link>
          <Link to={createPageUrl('CookiePolicy')} className="hover:text-emerald-600 transition-colors">Cookies</Link>
          <Link to={createPageUrl('DataProcessingAgreement')} className="hover:text-emerald-600 transition-colors">DPA</Link>
          <a href="mailto:support@profitshield.ai" className="hover:text-emerald-600 transition-colors">Support</a>
        </div>
      </div>
    </footer>
  );
}