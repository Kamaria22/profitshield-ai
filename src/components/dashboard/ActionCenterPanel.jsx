import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { AlertTriangle, ArrowRight, BrainCircuit, ShieldAlert, Sparkles } from 'lucide-react';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '$0/mo';
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}k/mo`;
  return `$${amount.toFixed(0)}/mo`;
}

function buildPriorities({ metrics, alerts, profitLeaks, integrationStatus, profitScore }) {
  const items = [];
  const highRiskOrders = Number(metrics?.highRiskOrders || 0);
  const avgMargin = Number(metrics?.avgMargin || 0);
  const totalLeakImpact = (profitLeaks || []).reduce((sum, leak) => {
    return sum + Number(leak?.impact_amount || leak?.estimated_impact || 0);
  }, 0);

  if (highRiskOrders > 0) {
    items.push({
      title: 'High-risk orders require review',
      reason: `${highRiskOrders} flagged ${highRiskOrders === 1 ? 'order is' : 'orders are'} waiting in the fraud queue`,
      action: 'Open risk intelligence',
      page: 'Intelligence',
      icon: ShieldAlert,
      accent: 'text-amber-300',
    });
  }

  if ((alerts || []).length > 0) {
    items.push({
      title: 'Alert queue needs attention',
      reason: `${alerts.length} active ${alerts.length === 1 ? 'alert' : 'alerts'} need operator review`,
      action: 'Review alerts',
      page: 'Alerts',
      icon: AlertTriangle,
      accent: 'text-[#00E5FF]',
    });
  }

  if ((profitLeaks || []).length > 0) {
    items.push({
      title: 'Profit leaks are eroding margin',
      reason: `${profitLeaks.length} open leak signals • ${formatCurrency(totalLeakImpact)} impact`,
      action: 'Inspect AI insights',
      page: 'AIInsights',
      icon: BrainCircuit,
      accent: 'text-[#9B5CFF]',
    });
  }

  if (integrationStatus && integrationStatus !== 'connected') {
    items.push({
      title: 'Runtime needs stabilization',
      reason: `Integration is ${integrationStatus}, which can delay sync and alert freshness`,
      action: 'Open integrations',
      page: 'Integrations',
      icon: Sparkles,
      accent: 'text-amber-300',
    });
  }

  if (avgMargin < 20) {
    items.push({
      title: 'Margin pressure detected',
      reason: `Current margin is ${avgMargin.toFixed(1)}%, below the healthy operating range`,
      action: 'Review P&L',
      page: 'PnLAnalytics',
      icon: BrainCircuit,
      accent: 'text-[#5B6CFF]',
    });
  }

  if (!items.length) {
    items.push({
      title: 'Operating posture is healthy',
      reason: `Profit integrity is ${Math.round(Number(profitScore || 0))}/100 and no urgent queues are active`,
      action: 'Review recent activity',
      page: 'Orders',
      icon: Sparkles,
      accent: 'text-emerald-300',
    });
  }

  return items.slice(0, 3);
}

export default function ActionCenterPanel({
  metrics,
  alerts = [],
  profitLeaks = [],
  integrationStatus,
  profitScore,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const priorities = useMemo(
    () => buildPriorities({ metrics, alerts, profitLeaks, integrationStatus, profitScore }),
    [metrics, alerts, profitLeaks, integrationStatus, profitScore]
  );

  return (
    <section className="dashboard-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="dashboard-label">Action Center</p>
          <p className="mt-2 dashboard-title">Top priorities only</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
          {priorities.length} active
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {priorities.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={`${item.title}-${item.page}`}
              type="button"
              onClick={() => navigate(createPageUrl(item.page, location.search))}
              className="dashboard-subpanel flex w-full items-start gap-3 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
                <Icon className={`h-4 w-4 ${item.accent}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-sm text-slate-400">{item.reason}</p>
                <p className={`mt-2 text-[11px] font-medium uppercase tracking-[0.14em] ${item.accent}`}>
                  {item.action}
                </p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 text-slate-500" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
