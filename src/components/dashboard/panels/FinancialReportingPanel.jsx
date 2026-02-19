import React from 'react';
import { FileText, Download, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function FinancialReportingPanel({ loading = false, isDemo = false }) {
  const reports = isDemo ? 0 : 3;
  const lastGenerated = isDemo ? 'N/A' : 'Today';

  return (
    <CommandPanel
      title="Financial Reporting"
      icon={FileText}
      iconColor="slate"
      ctaLabel="View Reports"
      ctaPage="PnLAnalytics"
      lastUpdated={lastGenerated}
      loading={loading}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-slate-700">{reports}</span>
            <span className="text-xs text-slate-500">reports ready</span>
          </div>
          <Badge className="bg-slate-100 text-slate-700 text-[10px]">Auto</Badge>
        </div>

        <div className="space-y-1.5">
          {!isDemo ? (
            <>
              <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded text-xs">
                <span className="text-slate-700">P&L Summary</span>
                <Download className="w-3 h-3 text-slate-400" />
              </div>
              <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded text-xs">
                <span className="text-slate-700">Risk Report</span>
                <Download className="w-3 h-3 text-slate-400" />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded text-xs">
              <Clock className="w-3 h-3 text-slate-400" />
              <p className="text-slate-500">Connect store for reports</p>
            </div>
          )}
        </div>
      </div>
    </CommandPanel>
  );
}