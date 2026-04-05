import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { AlertTriangle, BarChart3, BrainCircuit, ShieldAlert, ShoppingBag } from 'lucide-react';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '$0';
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function deriveOpportunities(metrics, profitLeaks, alerts) {
  const opportunities = [];

  if ((metrics?.avgMargin || 0) < 20) {
    opportunities.push({
      title: 'Margin recovery needed',
      detail: `Current margin is ${Number(metrics?.avgMargin || 0).toFixed(1)}%`,
      action: 'Review P&L',
      page: 'PnLAnalytics',
      icon: BarChart3,
    });
  }

  if ((metrics?.highRiskOrders || 0) > 0) {
    opportunities.push({
      title: 'High-risk orders need review',
      detail: `${metrics.highRiskOrders} orders are flagged`,
      action: 'Open Risk Intelligence',
      page: 'Intelligence',
      icon: ShieldAlert,
    });
  }

  if ((profitLeaks?.length || 0) > 0) {
    const totalLeakImpact = profitLeaks.reduce((sum, leak) => sum + Number(leak?.impact_amount || leak?.estimated_impact || 0), 0);
    opportunities.push({
      title: 'Profit leaks are active',
      detail: `${profitLeaks.length} unresolved leak signals • ${formatCurrency(totalLeakImpact)}/mo`,
      action: 'Inspect AI Insights',
      page: 'AIInsights',
      icon: AlertTriangle,
    });
  }

  if ((alerts?.length || 0) > 0) {
    opportunities.push({
      title: 'Alert queue needs attention',
      detail: `${alerts.length} pending alerts`,
      action: 'Review alerts',
      page: 'Alerts',
      icon: BrainCircuit,
    });
  }

  if (!opportunities.length) {
    opportunities.push({
      title: 'No urgent AI actions',
      detail: 'The command surface is stable right now',
      action: 'Open AI Insights',
      page: 'AIInsights',
      icon: BrainCircuit,
    });
  }

  return opportunities.slice(0, 3);
}

export default function MerchantIntelligencePanel({
  metrics,
  alerts = [],
  profitLeaks = [],
  orders = [],
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const opportunities = useMemo(
    () => deriveOpportunities(metrics, profitLeaks, alerts),
    [metrics, profitLeaks, alerts]
  );

  const recentOrders = useMemo(
    () => (orders || []).slice(0, 3).map((order) => ({
      id: order?.id || order?.platform_order_id || order?.order_number,
      title: order?.order_number || order?.platform_order_id || 'Order',
      detail: `${formatCurrency(order?.total_revenue || order?.total_price || 0)} • ${order?.status || 'Pending'}`,
    })),
    [orders]
  );

  return (
    <div className="dashboard-panel">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className="dashboard-subpanel">
          <p className="dashboard-label">AI Opportunities</p>
          <div className="mt-3 space-y-2">
            {opportunities.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={`${item.title}-${item.page}`}
                  type="button"
                  onClick={() => navigate(createPageUrl(item.page, location.search))}
                  className="flex w-full items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
                >
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
                    <Icon className="h-4 w-4 text-[#00E5FF]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                  </div>
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#00E5FF]">
                    {item.action}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="dashboard-subpanel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="dashboard-label">Recent Activity</p>
              <p className="mt-2 dashboard-title">Latest orders</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(createPageUrl('Orders', location.search))}
              className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
            >
              View Orders
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {recentOrders.length ? recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-start gap-3 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3"
              >
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
                  <ShoppingBag className="h-4 w-4 text-[#00E5FF]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{order.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{order.detail}</p>
                </div>
              </div>
            )) : (
              <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-400">
                No recent orders yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
