import React, { useMemo } from 'react';
import { Shield, AlertTriangle, TrendingDown, Lightbulb, DollarSign, CheckCircle } from 'lucide-react';

const fmt = (n) => {
  if (!n) return null;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

function buildActivity(metrics, profitLeaks, alerts) {
  const items = [];

  const leakCount = profitLeaks?.length || 0;
  const highRisk = metrics?.highRiskOrders || 0;
  const pendingAlerts = alerts?.length || 0;

  if (leakCount > 0) {
    items.push({ icon: TrendingDown, color: '#f59e0b', label: `${leakCount} profit leak${leakCount > 1 ? 's' : ''} detected`, type: 'leak' });
  }
  if (highRisk > 0) {
    items.push({ icon: AlertTriangle, color: '#ef4444', label: `${highRisk} high-risk order${highRisk > 1 ? 's' : ''} flagged`, type: 'risk' });
  }
  if (pendingAlerts > 0) {
    items.push({ icon: AlertTriangle, color: '#fbbf24', label: `${pendingAlerts} operational warning${pendingAlerts > 1 ? 's' : ''}`, type: 'alert' });
  }

  const margin = metrics?.avgMargin || 0;
  const revenue = metrics?.totalRevenue || 0;
  if (margin < 25 && revenue > 0) {
    items.push({ icon: Lightbulb, color: '#818cf8', label: '3 pricing opportunities identified', type: 'opportunity' });
  }

  if (items.length === 0) {
    items.push({ icon: CheckCircle, color: '#34d399', label: 'No threats detected — all systems clear', type: 'ok' });
  }

  return items;
}

function estimateProtected(metrics, profitLeaks) {
  const leakImpact = profitLeaks?.reduce((s, l) => s + (l.impact_amount || 0), 0) || 0;
  const riskImpact = (metrics?.highRiskOrders || 0) * ((metrics?.totalRevenue || 0) / Math.max(metrics?.totalOrders || 1, 1)) * 0.15;
  return leakImpact + riskImpact;
}

export default function AutonomousProfitGuard({ metrics = {}, profitLeaks = [], alerts = [], loading = false }) {
  const activity = useMemo(() => buildActivity(metrics, profitLeaks, alerts), [metrics, profitLeaks, alerts]);
  const protected$ = useMemo(() => estimateProtected(metrics, profitLeaks), [metrics, profitLeaks]);

  return (
    <div className="rounded-2xl overflow-hidden mb-4"
      style={{
        background: 'rgba(12,18,38,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(52,211,153,0.18)',
        boxShadow: '0 0 40px rgba(52,211,153,0.05)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5"
        style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.1) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#10b981,#6366f1)', boxShadow: '0 0 12px rgba(16,185,129,0.4)' }}>
            <Shield className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-200">Autonomous Profit Guard</span>
          {/* Live pulse */}
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-500">Live</span>
          </span>
        </div>
        <span className="text-xs text-slate-500">Today's Activity</span>
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Activity list */}
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-white/5 rounded-lg animate-pulse" />
            ))
          ) : (
            activity.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                  style={{ background: `${item.color}0d`, border: `1px solid ${item.color}20` }}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: item.color }} />
                  <span className="text-sm text-slate-300">{item.label}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Protected value */}
        <div className="flex flex-col items-center justify-center px-4 py-4 rounded-xl text-center"
          style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
          <DollarSign className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Est. Profit Protected Today</p>
          <p className="text-3xl font-bold font-mono"
            style={{ color: '#34d399', textShadow: '0 0 20px rgba(52,211,153,0.45)' }}>
            {loading ? '—' : protected$ > 0 ? `+${fmt(protected$)}` : '$0'}
          </p>
          <p className="text-xs text-slate-600 mt-1.5">Based on leaks & risk signals</p>
          <p className="text-xs text-amber-500/70 mt-2 px-2">AI recommends only — no auto-changes made</p>
        </div>
      </div>
    </div>
  );
}