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
          <p className="text-2xl font-bold" style={{ color: profit >= 0 ? '#34d399' : '#f87171', textShadow: `0 0 16px ${profit >= 0 ? 'rgba(52,211,153,0.4)' : 'rgba(248,113,113,0.4)'}` }}>
            {formatMoney(profit)}
          </p>
          <p className="text-xs text-slate-500">Net Profit (30d)</p>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm font-semibold text-slate-200">{formatMoney(revenue)}</p>
            <p className="text-[10px] text-slate-500">Revenue</p>
          </div>
          <div className="rounded-lg p-2" style={{
            background: margin >= 20 ? 'rgba(52,211,153,0.08)' : margin >= 0 ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${margin >= 20 ? 'rgba(52,211,153,0.2)' : margin >= 0 ? 'rgba(251,191,36,0.2)' : 'rgba(248,113,113,0.2)'}`
          }}>
            <div className="flex items-center gap-1">
              <p className="text-sm font-semibold" style={{ color: margin >= 20 ? '#34d399' : margin >= 0 ? '#fbbf24' : '#f87171' }}>
                {margin.toFixed(1)}%
              </p>
              {margin >= 0 ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
            </div>
            <p className="text-[10px] text-slate-500">Margin</p>
          </div>
        </div>

        {/* Mini Sparkline */}
        <div className="h-6 rounded flex items-end px-1 gap-0.5" style={{ background: 'rgba(52,211,153,0.05)' }}>
          {[40, 60, 45, 70, 55, 80, 75].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: `rgba(52,211,153,${0.3 + i * 0.07})` }} />
          ))}
        </div>
      </div>
    </CommandPanel>
  );
}