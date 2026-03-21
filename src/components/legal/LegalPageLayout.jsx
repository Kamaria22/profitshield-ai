import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Printer } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function LegalPageLayout({ title, lastUpdated, children }) {
  return (
    <div className="future-grid min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-10 border-b border-cyan-400/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.92),rgba(8,15,30,0.82))] px-6 py-4 backdrop-blur-xl flex items-center justify-between">
        <Link to={createPageUrl('Home')} className="flex items-center gap-2 text-slate-400 hover:text-cyan-200 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to App</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[linear-gradient(135deg,#38bdf8,#818cf8,#34d399)] flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.22)]">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="block font-bold bg-gradient-to-r from-cyan-300 via-indigo-300 to-emerald-300 bg-clip-text text-transparent">ProfitShield</span>
            <span className="block text-[10px] uppercase tracking-[0.24em] text-slate-500">Legal Interface</span>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-200 transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">Print</span>
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="future-panel rounded-[2rem] p-8 sm:p-10">
          <div className="mb-10">
            <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Governance Record</p>
            <h1 className="mt-3 text-4xl font-bold text-white mb-3" style={{ textShadow: '0 0 24px rgba(56,189,248,0.14)' }}>{title}</h1>
            <p className="text-sm text-slate-400">Last updated: {lastUpdated}</p>
          </div>

          <div className="prose prose-invert max-w-none
            prose-headings:font-bold prose-headings:text-white
            prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2
            prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-slate-300 prose-p:leading-relaxed prose-p:mb-4
            prose-ul:text-slate-300 prose-li:mb-1
            prose-a:text-cyan-300 prose-a:no-underline hover:prose-a:underline
            prose-strong:text-white">
            {children}
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-wrap gap-4 text-sm text-slate-500">
          <Link to={createPageUrl('PrivacyPolicy')} className="hover:text-cyan-300 transition-colors">Privacy Policy</Link>
          <Link to={createPageUrl('TermsOfService')} className="hover:text-cyan-300 transition-colors">Terms of Service</Link>
          <Link to={createPageUrl('EndUserLicenseAgreement')} className="hover:text-cyan-300 transition-colors">EULA</Link>
          <Link to={createPageUrl('CookiePolicy')} className="hover:text-cyan-300 transition-colors">Cookie Policy</Link>
          <Link to={createPageUrl('ComplianceNotice')} className="hover:text-cyan-300 transition-colors">GDPR/CCPA Notice</Link>
          <Link to={createPageUrl('DataProcessingAgreement')} className="hover:text-cyan-300 transition-colors">DPA</Link>
          <Link to={createPageUrl('RefundPolicy')} className="hover:text-cyan-300 transition-colors">Return & Refund Policy</Link>
          <a href="mailto:legal@profitshield.ai" className="hover:text-cyan-300 transition-colors">legal@profitshield.ai</a>
        </div>
      </main>
    </div>
  );
}
