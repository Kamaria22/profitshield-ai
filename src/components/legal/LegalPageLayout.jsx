import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';

export default function LegalPageLayout({ title, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <Link to={createPageUrl('Home')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to App</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-md flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">ProfitShield</span>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">Print</span>
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-slate-900 mb-3">{title}</h1>
          <p className="text-sm text-slate-500">Last updated: {lastUpdated}</p>
        </div>

        <div className="prose prose-slate max-w-none
          prose-headings:font-bold prose-headings:text-slate-900
          prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2
          prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3
          prose-p:text-slate-600 prose-p:leading-relaxed prose-p:mb-4
          prose-ul:text-slate-600 prose-li:mb-1
          prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline
          prose-strong:text-slate-800">
          {children}
        </div>

        {/* Footer Links */}
        <div className="mt-16 pt-8 border-t border-slate-200 flex flex-wrap gap-4 text-sm text-slate-500">
          <Link to={createPageUrl('PrivacyPolicy')} className="hover:text-emerald-600 transition-colors">Privacy Policy</Link>
          <Link to={createPageUrl('TermsOfService')} className="hover:text-emerald-600 transition-colors">Terms of Service</Link>
          <Link to={createPageUrl('CookiePolicy')} className="hover:text-emerald-600 transition-colors">Cookie Policy</Link>
          <Link to={createPageUrl('DataProcessingAgreement')} className="hover:text-emerald-600 transition-colors">DPA</Link>
          <a href="mailto:legal@profitshield.ai" className="hover:text-emerald-600 transition-colors">legal@profitshield.ai</a>
        </div>
      </main>
    </div>
  );
}