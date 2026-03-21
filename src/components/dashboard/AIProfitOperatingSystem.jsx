// @ts-nocheck
import React, { useMemo } from 'react';
import { Shield, TrendingUp, DollarSign, Activity, RadioTower, Sparkles, ScanLine } from 'lucide-react';

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
  const pulseStatus = highRiskOrders === 0 ? 'Stable field' : `${highRiskOrders} anomaly signal${highRiskOrders > 1 ? 's' : ''}`;

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
    <div className="future-panel future-grid future-scan relative overflow-hidden mb-5 rounded-[1.9rem]"
      style={{
        background: 'radial-gradient(circle at 15% 10%, rgba(14,165,233,0.18), transparent 28%), linear-gradient(135deg, rgba(3,7,18,0.96) 0%, rgba(13,21,39,0.94) 42%, rgba(7,19,31,0.96) 100%)',
        borderColor: 'rgba(125,211,252,0.16)',
      }}
    >
      <div className="absolute inset-y-0 right-0 hidden w-64 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_62%)] lg:block" />

      <div className="relative border-b border-white/6 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                <RadioTower className="h-3.5 w-3.5" />
                Autonomous Command Core
              </span>
              <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
                <Sparkles className="h-3.5 w-3.5" />
                {loading ? 'Acquiring live telemetry' : pulseStatus}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{ background: 'linear-gradient(135deg,#38bdf8,#14b8a6)', boxShadow: '0 0 24px rgba(56,189,248,0.32)' }}>
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">ProfitShield OS</p>
                <h3 className="mt-1 text-2xl font-semibold text-white sm:text-[2rem]" style={{ textShadow: '0 0 22px rgba(56,189,248,0.16)' }}>
                  The autonomous commerce cockpit.
                </h3>
                <p className="mt-2 max-w-xl text-sm text-slate-400">
                  Live profit telemetry, risk surveillance, and margin intelligence fused into a single merchant control surface.
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-[320px]">
            <SignalCard label="Neural State" value={loading ? '...' : health.label} tone={health.color} icon={Sparkles} />
            <SignalCard label="Risk Mesh" value={loading ? '...' : highRiskOrders === 0 ? 'Calm' : 'Active'} tone={highRiskOrders === 0 ? '#34d399' : '#fbbf24'} icon={ScanLine} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
              <div key={kpi.label} className="rounded-[1.4rem] border border-white/8 bg-white/[0.03] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:bg-white/[0.05]">
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-slate-500" />
                  <p className="text-[10px] text-slate-500 uppercase tracking-[0.24em] font-medium">{kpi.label}</p>
              </div>
                <p className="text-2xl font-bold leading-none mb-1.5"
                style={{ color: kpi.color, textShadow: `0 0 20px ${kpi.color}50` }}>
                {kpi.value}
              </p>
              <p className="text-xs text-slate-600">{kpi.sub}</p>
            </div>
          );
        })}
      </div>
        <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Strategic Readout</p>
          <div className="mt-4 space-y-4">
            <ReadoutRow label="Margin confidence" value={loading ? '...' : avgMargin >= 20 ? 'High' : avgMargin >= 10 ? 'Watch' : 'Low'} tone={avgMargin >= 20 ? '#34d399' : avgMargin >= 10 ? '#fbbf24' : '#f87171'} />
            <ReadoutRow label="Protection state" value={loading ? '...' : highRiskOrders === 0 ? 'Shielded' : 'Monitoring'} tone={health.color} />
            <ReadoutRow label="Operating score" value={loading ? '...' : `${Math.min(100, Math.max(0, profitScore))}/100`} tone="#38bdf8" />
          </div>
        </div>
      </div>

      {profitScore > 0 && (
        <div className="px-5 py-4 border-t border-white/5 sm:px-6"
          style={{ background: 'rgba(0,0,0,0.15)' }}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Profit Health Score</span>
            <span className="text-xs font-bold" style={{ color: health.color }}>{profitScore}/100</span>
          </div>
          <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, profitScore)}%`,
                background: `linear-gradient(90deg, #38bdf8, #818cf8 45%, ${health.color})`,
                boxShadow: `0 0 8px ${health.color}50`,
              }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SignalCard({ label, value, tone, icon: Icon }) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.04]">
          <Icon className="h-4 w-4" style={{ color: tone }} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
          <p className="text-sm font-semibold" style={{ color: tone }}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function ReadoutRow({ label, value, tone }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium" style={{ color: tone }}>{value}</p>
    </div>
  );
}
