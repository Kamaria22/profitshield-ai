import React from 'react';
import { BarChart3, TrendingUp } from 'lucide-react';
import CommandPanel from '../CommandPanel';

export default function AdvancedAnalyticsPanel({ metrics = {}, loading = false, isDemo = false }) {
  const insights = isDemo ? 0 : 12;
  const trends = isDemo ? 0 : 5;

  return (
    <CommandPanel
      title="Advanced Analytics"
      icon={BarChart3}
      iconColor="blue"
      ctaLabel="Open Analytics"
      ctaPage="PnLAnalytics"
      lastUpdated="Updated"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Key Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-blue-50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-blue-700">{insights}</p>
            <p className="text-[10px] text-slate-500">Insights</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-slate-700">{trends}</p>
            <p className="text-[10px] text-slate-500">Trends</p>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="h-8 bg-gradient-to-r from-blue-100 to-blue-50 rounded flex items-end px-1 gap-0.5">
          {[30, 45, 35, 60, 50, 70, 65, 80].map((h, i) => (
            <div key={i} className="flex-1 bg-blue-400 rounded-t" style={{ height: `${isDemo ? 20 : h}%` }} />
          ))}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs">
          <TrendingUp className="w-3 h-3 text-emerald-500" />
          <span className="text-slate-600">
            {isDemo ? 'Connect store for insights' : 'Performance trending up'}
          </span>
        </div>
      </div>
    </CommandPanel>
  );
}