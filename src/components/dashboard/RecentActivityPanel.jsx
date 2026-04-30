import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { ArrowRight, ShoppingBag } from 'lucide-react';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

export default function RecentActivityPanel({ orders = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const visibleOrders = Array.isArray(orders) ? orders.slice(0, 5) : [];

  return (
    <section className="dashboard-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="dashboard-label">Recent Activity</p>
          <p className="mt-2 dashboard-title">Latest orders</p>
          <p className="mt-1 text-sm text-slate-400">A quick view of recent order movement.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(createPageUrl('Orders', location.search))}
          className="inline-flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
        >
          <span>View Orders</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visibleOrders.length ? visibleOrders.map((order) => (
          <div
            key={order?.id || order?.platform_order_id || order?.order_number}
            className="dashboard-subpanel flex items-start gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
              <ShoppingBag className="h-4 w-4 text-[#00E5FF]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {order?.order_number || order?.platform_order_id || 'Order'}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {formatCurrency(order?.total_revenue || order?.total_price || 0)} • {order?.status || 'Pending'}
              </p>
            </div>
          </div>
        )) : (
          <div className="dashboard-subpanel text-sm text-slate-400">
            No recent orders yet.
          </div>
        )}
      </div>
    </section>
  );
}
