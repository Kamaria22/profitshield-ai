import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';

const fmt = (n) => {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

function buildForecasts(metrics) {
  const daily = metrics?.totalProfit > 0 ? metrics.totalProfit / 30 : 0;
  const dailyRev = metrics?.totalRevenue > 0 ? metrics.totalRevenue / 30 : 0;
  // Apply modest decay/growth assumptions for longer horizons
  return [
    { label: '30-Day', days: 30, profit: daily * 30, revenue: dailyRev * 30, confidence: 'High' },
    { label: '60-Day', days: 60, profit: daily * 60 * 0.95, revenue: dailyRev * 60 * 0.97, confidence: 'Medium' },
    { label: '90-Day', days: 90, profit: daily * 90 * 0.88, revenue: dailyRev * 90 * 0.92, confidence: 'Low' },
  ];
}

export default function ProfitForecast({ metrics = {}, loading = false }) {
  const forecasts = useMemo(() => buildForecasts(metrics), [metrics]);

  const confidenceStyle = {
    High:   { color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.25)' },
    Medium: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' },
    Low:    { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' },
  };

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(15,20,40,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(52,211,153,0.15)',
        boxShadow: '0 0 30px rgba(52,211,153,0.05)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5"
        style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.08) 0%, transparent 100%)' }}>
        <Calendar className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-slate-200">Profit Forecast</span>
        <span className="ml-auto text-xs text-slate-500">AI projection</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/5">
        {forecasts.map((f) => {
          const cs = confidenceStyle[f.confidence];
          const isPositive = f.profit >= 0;
          return (
            <div key={f.label} className="px-4 py-4 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{f.label}</p>
              <div className="flex items-center justify-center gap-1 mb-1">
                {isPositive
                  ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                  : <TrendingDown className="w-3 h-3 text-red-400" />}
              </div>
              <p className="text-xl font-bold font-mono mb-0.5"
                style={{ color: isPositive ? '#34d399' : '#f87171', textShadow: `0 0 14px ${isPositive ? '#34d39940' : '#f8717140'}` }}>
                {loading ? '—' : fmt(f.profit)}
              </p>
              <p className="text-xs text-slate-500 mb-2">
                {loading ? '—' : fmt(f.revenue)} rev
              </p>
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: cs.bg, color: cs.color, border: `1px solid ${cs.border}` }}>
                {f.confidence}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}