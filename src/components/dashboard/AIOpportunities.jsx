import React, { useMemo } from 'react';
import { Lightbulb, TrendingUp, DollarSign, Users, Package } from 'lucide-react';

const fmt = (n) => {
  if (!n) return null;
  if (Math.abs(n) >= 1000) return `+$${(n / 1000).toFixed(1)}k/mo`;
  return `+$${Math.round(n)}/mo`;
};

function deriveOpportunities(metrics, profitLeaks) {
  const ops = [];

  if ((metrics?.avgMargin || 0) < 25) {
    ops.push({
      icon: TrendingUp,
      title: 'Price optimization opportunity',
      detail: 'Margin below 25% — increase prices on low-margin products',
      impact: metrics?.totalRevenue ? metrics.totalRevenue * 0.05 : null,
      color: '#6366f1',
    });
  }
  if ((metrics?.highRiskOrders || 0) > 0) {
    ops.push({
      icon: DollarSign,
      title: `${metrics.highRiskOrders} high-risk order${metrics.highRiskOrders > 1 ? 's' : ''} to review`,
      detail: 'Prevent chargeback losses by reviewing flagged orders',
      impact: null,
      color: '#f59e0b',
    });
  }
  if (profitLeaks?.length > 0) {
    ops.push({
      icon: DollarSign,
      title: `${profitLeaks.length} profit leak${profitLeaks.length > 1 ? 's' : ''} detected`,
      detail: profitLeaks[0]?.description || 'Unresolved profit drains identified',
      impact: profitLeaks.reduce((s, l) => s + (l.impact_amount || 0), 0) || null,
      color: '#ef4444',
    });
  }
  if ((metrics?.totalOrders || 0) > 10 && (metrics?.avgMargin || 0) >= 25) {
    ops.push({
      icon: Users,
      title: 'Customer retention opportunity',
      detail: 'Healthy margins — focus on repeat customer campaigns',
      impact: null,
      color: '#10b981',
    });
  }
  if (!ops.length) {
    ops.push({
      icon: Package,
      title: 'Business performing well',
      detail: 'Connect more orders to unlock AI-driven growth suggestions',
      impact: null,
      color: '#34d399',
    });
  }
  return ops.slice(0, 4);
}

export default function AIOpportunities({ metrics = {}, profitLeaks = [], loading = false }) {
  const opportunities = useMemo(() => deriveOpportunities(metrics, profitLeaks), [metrics, profitLeaks]);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(15,20,40,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(99,102,241,0.18)',
        boxShadow: '0 0 30px rgba(99,102,241,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5"
        style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.1) 0%, transparent 100%)' }}>
        <Lightbulb className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-semibold text-slate-200">AI Opportunities</span>
      </div>

      <div className="p-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />
          ))
        ) : (
          opportunities.map((op, i) => {
            const Icon = op.icon;
            return (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl group transition-all hover:bg-white/5"
                style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${op.color}18`, border: `1px solid ${op.color}30` }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: op.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-200 truncate">{op.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{op.detail}</p>
                </div>
                {op.impact > 0 && (
                  <span className="text-xs font-bold flex-shrink-0 px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
                    {fmt(op.impact)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}