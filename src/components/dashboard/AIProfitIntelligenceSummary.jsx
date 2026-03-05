import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Shield, Lightbulb, DollarSign, Percent, Zap } from 'lucide-react';

const fmt = (n, decimals = 0) => {
  if (!n && n !== 0) return '—';
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Number(n).toFixed(decimals)}`;
};

const pct = (n) => {
  if (!n && n !== 0) return '—';
  return `${Number(n).toFixed(1)}%`;
};

// Static opportunity suggestions based on data shape
function deriveOpportunities(metrics, profitLeaks) {
  const ops = [];
  if ((metrics?.avgMargin || 0) < 30) ops.push('Increase prices on low-margin products');
  if ((metrics?.highRiskOrders || 0) > 0) ops.push(`Review ${metrics.highRiskOrders} high-risk order${metrics.highRiskOrders > 1 ? 's' : ''}`);
  if (profitLeaks?.length > 0) ops.push(`Plug ${profitLeaks.length} active profit leak${profitLeaks.length > 1 ? 's' : ''}`);
  if (!ops.length) ops.push('No immediate action needed — profits are healthy');
  return ops.slice(0, 3);
}

function deriveLeaks(profitLeaks) {
  if (!profitLeaks?.length) return [];
  return profitLeaks.slice(0, 3).map(l => l.description || l.leak_type || 'Profit leak detected');
}

export default function AIProfitIntelligenceSummary({ metrics = {}, profitLeaks = [], loading = false }) {
  const {
    totalRevenue = 0,
    totalProfit = 0,
    avgMargin = 0,
    highRiskOrders = 0,
    pendingAlerts = 0,
  } = metrics;

  const opportunities = useMemo(() => deriveOpportunities(metrics, profitLeaks), [metrics, profitLeaks]);
  const leaks = useMemo(() => deriveLeaks(profitLeaks), [profitLeaks]);

  const marginColor = avgMargin >= 40 ? '#34d399' : avgMargin >= 20 ? '#fbbf24' : '#f87171';
  const profitColor = totalProfit >= 0 ? '#34d399' : '#f87171';
  const riskColor = highRiskOrders === 0 ? '#34d399' : highRiskOrders <= 3 ? '#fbbf24' : '#f87171';

  return (
    <div className="rounded-2xl overflow-hidden mb-4"
      style={{
        background: 'linear-gradient(135deg, rgba(15,20,40,0.92) 0%, rgba(20,15,50,0.92) 50%, rgba(10,25,40,0.92) 100%)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(99,102,241,0.2)',
        boxShadow: '0 0 40px rgba(99,102,241,0.08), 0 0 80px rgba(52,211,153,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 py-3 border-b border-white/5"
        style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.12) 0%, rgba(52,211,153,0.06) 100%)' }}>
        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#6366f1,#10b981)', boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}>
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-slate-200 tracking-wide">AI Profit Intelligence</span>
        <span className="ml-auto text-xs text-slate-500">Last 30 days</span>
      </div>

      {/* Metric Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-white/5">
        {/* Net Profit */}
        <div className="px-5 py-4">
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Net Profit</p>
          <p className="text-2xl font-bold font-mono" style={{ color: profitColor, textShadow: `0 0 16px ${profitColor}60` }}>
            {loading ? '—' : fmt(totalProfit)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {totalProfit >= 0
              ? <TrendingUp className="w-3 h-3 text-emerald-400" />
              : <TrendingDown className="w-3 h-3 text-red-400" />}
            <span className="text-xs text-slate-500">30-day period</span>
          </div>
        </div>

        {/* Revenue */}
        <div className="px-5 py-4">
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Revenue</p>
          <p className="text-2xl font-bold font-mono text-slate-100" style={{ textShadow: '0 0 12px rgba(255,255,255,0.08)' }}>
            {loading ? '—' : fmt(totalRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Gross sales</p>
        </div>

        {/* Margin */}
        <div className="px-5 py-4">
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Margin</p>
          <p className="text-2xl font-bold font-mono" style={{ color: marginColor, textShadow: `0 0 16px ${marginColor}60` }}>
            {loading ? '—' : pct(avgMargin)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <Percent className="w-3 h-3 text-slate-500" />
            <span className="text-xs text-slate-500">Avg profit margin</span>
          </div>
        </div>

        {/* Risk Level */}
        <div className="px-5 py-4">
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Risk</p>
          <p className="text-2xl font-bold font-mono" style={{ color: riskColor, textShadow: `0 0 16px ${riskColor}60` }}>
            {loading ? '—' : highRiskOrders === 0 ? 'Clear' : `${highRiskOrders} Alert${highRiskOrders > 1 ? 's' : ''}`}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <Shield className="w-3 h-3" style={{ color: riskColor }} />
            <span className="text-xs text-slate-500">Fraud detection</span>
          </div>
        </div>

        {/* Profit Leaks */}
        <div className="px-5 py-4 col-span-2 sm:col-span-1 lg:col-span-1">
          <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Leaks</p>
          {leaks.length === 0 ? (
            <p className="text-lg font-bold text-emerald-400" style={{ textShadow: '0 0 12px rgba(52,211,153,0.5)' }}>None</p>
          ) : (
            <p className="text-2xl font-bold text-amber-400 font-mono" style={{ textShadow: '0 0 16px rgba(251,191,36,0.5)' }}>
              {leaks.length}
            </p>
          )}
          <p className="text-xs text-slate-500 mt-1">Active profit leaks</p>
        </div>
      </div>

      {/* Insights Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-white/5 border-t border-white/5">
        {/* Profit Leaks Detail */}
        <div className="px-5 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Profit Leaks</span>
          </div>
          {leaks.length === 0 ? (
            <p className="text-xs text-slate-500">No active profit leaks detected</p>
          ) : (
            <ul className="space-y-1">
              {leaks.map((l, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0" />
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AI Opportunities */}
        <div className="px-5 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">AI Opportunities</span>
          </div>
          <ul className="space-y-1">
            {opportunities.map((op, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="w-1 h-1 rounded-full bg-indigo-400 flex-shrink-0" />
                {op}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}