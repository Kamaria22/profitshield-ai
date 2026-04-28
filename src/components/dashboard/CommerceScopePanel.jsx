import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { Boxes, CreditCard, Link2, Users } from 'lucide-react';

function SurfaceButton({ icon: Icon, title, value, meta, actionLabel, onClick, tone = 'text-[#00E5FF]' }) {
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
            <p className={`mt-1 text-sm font-semibold ${tone}`}>{value}</p>
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

function formatPlanLabel(tier) {
  const normalized = String(tier || 'trial').replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export default function CommerceScopePanel({ tenantId, integrationStatus, subscriptionTier = 'trial' }) {
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
        safeFilter(base44.entities.Customer, { tenant_id: tenantId }, '-created_date', 8),
        safeFilter(base44.entities.Product, { tenant_id: tenantId }, '-updated_date', 8),
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
  const activeIntegrations = (data?.integrations || []).filter((item) => item?.status === 'connected' || item?.status === 'degraded');
  const activeIntegrationCount = activeIntegrations.length;
  const recentValueCustomers = (data?.customers || []).filter((item) => Number(item?.total_spent || 0) > 0).length;
  const activeProducts = (data?.products || []).filter((item) => String(item?.status || '').toLowerCase() === 'active').length;
  const webhookCount = activeIntegrations.reduce((sum, item) => sum + Object.keys(item?.webhook_endpoints || {}).length, 0);
  const billingTone =
    subscriptionTier === 'trial' ? 'text-amber-300' :
    subscriptionTier === 'enterprise' ? 'text-emerald-300' :
    'text-cyan-300';

  return (
    <div className="dashboard-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="dashboard-label">Commerce Scope</p>
          <p className="mt-2 dashboard-title">Customers, products, and integrations</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SurfaceButton
          icon={Users}
          title="Customer Signal"
          value={customerCount > 0 ? `${recentValueCustomers}/${customerCount} monetized` : 'No signal'}
          meta={customerCount > 0 ? 'Recent customer flow is live' : 'Customer intelligence appears after sync'}
          actionLabel="Open"
          onClick={() => navigate(createPageUrl('Customers', location.search))}
        />
        <SurfaceButton
          icon={Boxes}
          title="Product Signal"
          value={productCount > 0 ? `${activeProducts || productCount} active` : 'No signal'}
          meta={productCount > 0 ? 'Catalog telemetry is online' : 'Catalog data is still warming up'}
          actionLabel="Open"
          onClick={() => navigate(createPageUrl('Products', location.search))}
        />
        <SurfaceButton
          icon={Link2}
          title="Integration Pulse"
          value={activeIntegrationCount > 0 ? `${webhookCount} webhooks live` : 'Standby'}
          meta={activeIntegrationCount > 0 ? `${activeIntegrationCount} active connection${activeIntegrationCount > 1 ? 's' : ''} • ${integrationStatus || 'connected'}` : `Status: ${integrationStatus || 'pending'}`}
          actionLabel="Manage"
          onClick={() => navigate(createPageUrl('Integrations', location.search))}
        />
        <SurfaceButton
          icon={CreditCard}
          title="Billing Posture"
          value={formatPlanLabel(subscriptionTier)}
          meta={subscriptionTier === 'trial' ? 'Upgrade unlocks full operating system' : 'Plan is active and available'}
          actionLabel="Review"
          tone={billingTone}
          onClick={() => navigate(createPageUrl('Billing', location.search))}
        />
      </div>
    </div>
  );
}
