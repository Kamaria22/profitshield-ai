import React from 'react';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import CommandPanel from '../CommandPanel';

export default function ProfitHealthPanel({ metrics = {}, loading = false }) {
  const margin = typeof metrics?.avgMargin === 'number' ? metrics.avgMargin : 0;
  const profit = typeof metrics?.totalProfit === 'number' ? metrics.totalProfit : 0;
  const revenue = typeof metrics?.totalRevenue === 'number' ? metrics.totalRevenue : 0;

  const formatMoney = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val.toFixed(0)}`;
  };

  return (
    <CommandPanel
      title="Profit Health"
      icon={DollarSign}
      iconColor="emerald"
      ctaLabel="Open P&L Analytics"
      ctaPage="PnLAnalytics"
      lastUpdated="Just now"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Primary Metric */}
        <div>
          <p className="text-2xl font-bold text-emerald-700">
            {formatMoney(profit)}
          </p>
          <p className="text-xs text-slate-500">Net Profit (30d)</p>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-sm font-semibold text-slate-800">{formatMoney(revenue)}</p>
            <p className="text-[10px] text-slate-500">Revenue</p>
          </div>
          <div className={`rounded-lg p-2 ${margin >= 20 ? 'bg-emerald-50' : margin >= 0 ? 'bg-amber-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-1">
              <p className={`text-sm font-semibold ${margin >= 20 ? 'text-emerald-700' : margin >= 0 ? 'text-amber-700' : 'text-red-700'}`}>
                {margin.toFixed(1)}%
              </p>
              {margin >= 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-500" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-500" />
              )}
            </div>
            <p className="text-[10px] text-slate-500">Margin</p>
          </div>
        </div>

        {/* Mini Sparkline placeholder */}
        <div className="h-6 bg-gradient-to-r from-emerald-100 to-emerald-50 rounded flex items-end px-1 gap-0.5">
          {[40, 60, 45, 70, 55, 80, 75].map((h, i) => (
            <div key={i} className="flex-1 bg-emerald-400 rounded-t" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </CommandPanel>
  );
}