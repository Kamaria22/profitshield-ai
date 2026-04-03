import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/components/platformContext';
import { useLocation, useNavigate } from 'react-router-dom';

function SectionPreview({ title, rows = [], emptyLabel, valueKey }) {
  return (
    <div className="dashboard-subpanel">
      <p className="dashboard-title">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="rounded-[10px] border border-white/8 bg-[#0B0F14] px-3 py-2">
            <p className="text-sm text-white">{row.title}</p>
            <p className="mt-1 text-xs text-slate-400">{row[valueKey]}</p>
          </div>
        )) : (
          <p className="text-sm text-slate-400">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

export default function ExpandablePanel({ tenantId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-expandable', tenantId || 'unresolved'],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const [orders, customers, products] = await Promise.all([
        base44.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 3).catch(() => []),
        base44.entities.Customer.filter({ tenant_id: tenantId }, '-created_date', 3).catch(() => []),
        base44.entities.Product.filter({ tenant_id: tenantId }, '-updated_date', 3).catch(() => []),
      ]);
      return { orders, customers, products };
    }
  });

  return (
    <div className="dashboard-panel">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="dashboard-label">Workspace</p>
          <p className="mt-2 dashboard-title">Orders, Customers, Products</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>

      {open ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <SectionPreview
            title="Orders"
            rows={(data?.orders || []).map((row) => ({
              id: row.id,
              title: row.order_number || row.platform_order_id || 'Order',
              status: row.status || 'Pending',
            }))}
            valueKey="status"
            emptyLabel={isLoading ? 'Loading orders…' : 'No recent orders'}
          />
          <SectionPreview
            title="Customers"
            rows={(data?.customers || []).map((row) => ({
              id: row.id,
              title: row.full_name || row.email || 'Customer',
              subtitle: row.segment || row.customer_tier || 'No segment',
            }))}
            valueKey="subtitle"
            emptyLabel={isLoading ? 'Loading customers…' : 'No recent customers'}
          />
          <SectionPreview
            title="Products"
            rows={(data?.products || []).map((row) => ({
              id: row.id,
              title: row.title || 'Product',
              subtitle: row.status || row.product_type || 'No status',
            }))}
            valueKey="subtitle"
            emptyLabel={isLoading ? 'Loading products…' : 'No recent products'}
          />
          <div className="lg:col-span-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate(createPageUrl('Orders', location.search))}
              className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
            >
              Open Orders
            </button>
            <button
              type="button"
              onClick={() => navigate(createPageUrl('Customers', location.search))}
              className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
            >
              Open Customers
            </button>
            <button
              type="button"
              onClick={() => navigate(createPageUrl('Products', location.search))}
              className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
            >
              Open Products
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
