import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { Boxes, Link2, Users } from 'lucide-react';

function SurfaceButton({ icon: Icon, title, meta, actionLabel, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dashboard-subpanel w-full text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
            <Icon className="h-4 w-4 text-[#00E5FF]" />
          </div>
          <div>
            <p className="dashboard-title">{title}</p>
            <p className="mt-1 text-sm text-slate-400">{meta}</p>
          </div>
        </div>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#00E5FF]">
          {actionLabel}
        </span>
      </div>
    </button>
  );
}

export default function CommerceScopePanel({ tenantId, integrationStatus }) {
  const navigate = useNavigate();
  const location = useLocation();

  const { data } = useQuery({
    queryKey: ['dashboard-commerce-scope', tenantId || 'unresolved'],
    enabled: !!tenantId,
    queryFn: async () => {
      const safeFilter = async (entity, query, sort, limit) => {
        try {
          const rows = await entity.filter(query, sort, limit);
          return Array.isArray(rows) ? rows : [];
        } catch {
          return [];
        }
      };

      const [customers, products, integrations] = await Promise.all([
        safeFilter(base44.entities.Customer, { tenant_id: tenantId }, '-created_date', 5),
        safeFilter(base44.entities.Product, { tenant_id: tenantId }, '-updated_date', 5),
        safeFilter(base44.entities.PlatformIntegration, { tenant_id: tenantId }, '-updated_date', 3),
      ]);

      return { customers, products, integrations };
    },
    staleTime: 60000,
    gcTime: 180000,
    refetchOnWindowFocus: false,
  });

  const customerCount = data?.customers?.length || 0;
  const productCount = data?.products?.length || 0;
  const activeIntegrationCount = (data?.integrations || []).filter((item) => item?.status === 'connected' || item?.status === 'degraded').length;

  return (
    <div className="dashboard-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="dashboard-label">Commerce Scope</p>
          <p className="mt-2 dashboard-title">Customers, products, and integrations</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <SurfaceButton
          icon={Users}
          title="Customers"
          meta={customerCount > 0 ? `${customerCount} recent customer records ready` : 'Customer intelligence will appear after sync'}
          actionLabel="Open"
          onClick={() => navigate(createPageUrl('Customers', location.search))}
        />
        <SurfaceButton
          icon={Boxes}
          title="Products"
          meta={productCount > 0 ? `${productCount} recent product records visible` : 'Product catalog data is still warming up'}
          actionLabel="Open"
          onClick={() => navigate(createPageUrl('Products', location.search))}
        />
        <SurfaceButton
          icon={Link2}
          title="Integrations"
          meta={activeIntegrationCount > 0 ? `${activeIntegrationCount} active connection${activeIntegrationCount > 1 ? 's' : ''} • ${integrationStatus || 'connected'}` : `Status: ${integrationStatus || 'pending'}`}
          actionLabel="Manage"
          onClick={() => navigate(createPageUrl('Integrations', location.search))}
        />
      </div>
    </div>
  );
}
