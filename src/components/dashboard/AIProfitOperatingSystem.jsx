import React, { useMemo } from 'react';
import { Shield, TrendingUp, TrendingDown, DollarSign, AlertTriangle, Activity } from 'lucide-react';

const fmt = (n) => {
  if (n == null || n === 0) return '$0';
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

const pct = (n) => (n == null ? '0%' : `${Number(n).toFixed(1)}%`);

function getHealthStatus(metrics, profitScore) {
  const score = profitScore || 0;
  const margin = metrics?.avgMargin || 0;
  const risk = metrics?.highRiskOrders || 0;
  if (score >= 75 && margin >= 25 && risk === 0) return { label: 'Healthy', color: '#34d399', glow: 'rgba(52,211,153,0.3)' };
  if (score >= 50 || margin >= 15) return { label: 'Moderate', color: '#fbbf24', glow: 'rgba(251,191,36,0.3)' };
  return { label: 'Needs Attention', color: '#f87171', glow: 'rgba(248,113,113,0.3)' };
}

export default function AIProfitOperatingSystem({ metrics = {}, profitScore = 0, loading = false }) {
  const { totalRevenue = 0, totalProfit = 0, avgMargin = 0, highRiskOrders = 0 } = metrics;
  const health = useMemo(() => getHealthStatus(metrics, profitScore), [metrics, profitScore]);

  const kpis = [
    {
      label: 'Net Profit (30d)',
      value: loading ? '—' : fmt(totalProfit),
      color: totalProfit >= 0 ? '#34d399' : '#f87171',
      icon: DollarSign,
      sub: totalProfit >= 0 ? 'Profitable' : 'Negative margin',
    },
    {
      label: 'Revenue (30d)',
      value: loading ? '—' : fmt(totalRevenue),
      color: '#818cf8',
      icon: TrendingUp,
      sub: 'Gross sales',
    },
    {
      label: 'Margin',
      value: loading ? '—' : pct(avgMargin),
      color: avgMargin >= 30 ? '#34d399' : avgMargin >= 15 ? '#fbbf24' : '#f87171',
      icon: Activity,
      sub: 'Avg profit margin',
    },
    {
      label: 'Risk Level',
      value: loading ? '—' : highRiskOrders === 0 ? 'Clear' : `${highRiskOrders} alert${highRiskOrders > 1 ? 's' : ''}`,
      color: highRiskOrders === 0 ? '#34d399' : highRiskOrders <= 3 ? '#fbbf24' : '#f87171',
      icon: Shield,
      sub: 'Fraud detection',
    },
  ];

  return (
    <div className="rounded-2xl overflow-hidden mb-5"
      style={{
        background: 'linear-gradient(135deg, rgba(10,15,35,0.97) 0%, rgba(18,12,45,0.97) 50%, rgba(8,22,35,0.97) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(99,102,241,0.22)',
        boxShadow: '0 0 60px rgba(99,102,241,0.08), 0 0 120px rgba(52,211,153,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3"
        style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.14) 0%, rgba(52,211,153,0.06) 60%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6366f1,#10b981)', boxShadow: '0 0 16px rgba(99,102,241,0.45)' }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-wide">ProfitShield AI Operating System</p>
            <p className="text-xs text-slate-500">Autonomous profit intelligence · Real-time</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Business Status:</span>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold"
            style={{ background: `${health.glow}25`, color: health.color, border: `1px solid ${health.glow}`, boxShadow: `0 0 10px ${health.glow}` }}>
            {loading ? '...' : health.label}
          </span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="px-6 py-5 group hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-slate-500" />
                <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">{kpi.label}</p>
              </div>
              <p className="text-2xl font-bold font-mono leading-none mb-1.5"
                style={{ color: kpi.color, textShadow: `0 0 20px ${kpi.color}50` }}>
                {kpi.value}
              </p>
              <p className="text-xs text-slate-600">{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Score bar */}
      {profitScore > 0 && (
        <div className="px-6 py-3 flex items-center gap-3 border-t border-white/5"
          style={{ background: 'rgba(0,0,0,0.15)' }}>
          <span className="text-xs text-slate-500">Profit Health Score</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, profitScore)}%`,
                background: `linear-gradient(90deg, #6366f1, ${health.color})`,
                boxShadow: `0 0 8px ${health.color}50`,
              }} />
          </div>
          <span className="text-xs font-bold font-mono" style={{ color: health.color }}>{profitScore}/100</span>
        </div>
      )}
    </div>
  );
}