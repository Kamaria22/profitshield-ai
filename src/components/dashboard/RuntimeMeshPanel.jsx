import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { Activity, Link2, RefreshCw, Shield } from 'lucide-react';

function formatTimestamp(value) {
  if (!value) return 'Awaiting first sync';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Awaiting first sync';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Metric({ label, value, tone = 'text-slate-100' }) {
  return (
    <div className="dashboard-subpanel">
      <p className="dashboard-label">{label}</p>
      <p className={`mt-3 text-base font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default function RuntimeMeshPanel({
  tenantId,
  integrationId,
  integrationStatus,
  lastSyncAt,
  alertsCount = 0,
  highRiskOrders = 0,
  syncing = false,
  onSync,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: runtimeDetail } = useQuery({
    queryKey: ['dashboard-runtime-mesh', tenantId || 'unresolved', integrationId || 'none'],
    enabled: !!tenantId,
    queryFn: async () => {
      const [pendingQueue, integrationRows] = await Promise.all([
        base44.entities.WebhookQueue.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 30).catch(() => []),
        integrationId
          ? base44.entities.PlatformIntegration.filter({ id: integrationId }).catch(() => [])
          : base44.entities.PlatformIntegration.filter({ tenant_id: tenantId }, '-updated_date', 2).catch(() => []),
      ]);
      const integration = Array.isArray(integrationRows) ? integrationRows[0] || null : null;
      return {
        queueDepth: Array.isArray(pendingQueue) ? pendingQueue.length : 0,
        webhookCount: Object.keys(integration?.webhook_endpoints || {}).length,
        lastSyncStatus: integration?.last_sync_status || null,
      };
    },
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  const runtimeStatus = syncing
    ? 'Synchronizing'
    : integrationStatus === 'connected'
      ? 'Connected'
      : integrationStatus === 'degraded'
        ? 'Degraded'
        : 'Standby';

  return (
    <div
      className="dashboard-panel"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(91,108,255,0.14), transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.025))',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="dashboard-label">Runtime Mesh</p>
          <p className="mt-2 dashboard-title">Sync, security, and connection state</p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={!onSync || syncing}
          className="rounded-[10px] border border-white/10 bg-white/[0.03] p-2 text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.06] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <Metric
          label="Connection"
          value={runtimeStatus}
          tone={runtimeStatus === 'Connected' ? 'text-emerald-300' : runtimeStatus === 'Degraded' ? 'text-amber-300' : 'text-slate-100'}
        />
        <Metric label="Last sync" value={formatTimestamp(lastSyncAt)} tone="text-cyan-300" />
        <Metric
          label="Protection load"
          value={`${highRiskOrders} flagged • ${alertsCount} alerts`}
          tone={highRiskOrders > 0 || alertsCount > 0 ? 'text-amber-300' : 'text-slate-100'}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric
            label="Webhook mesh"
            value={runtimeDetail?.webhookCount ? `${runtimeDetail.webhookCount} active` : 'Not registered'}
            tone={runtimeDetail?.webhookCount ? 'text-emerald-300' : 'text-amber-300'}
          />
          <Metric
            label="Queue lane"
            value={runtimeDetail?.queueDepth ? `${runtimeDetail.queueDepth} pending` : (runtimeDetail?.lastSyncStatus || 'Clear')}
            tone={runtimeDetail?.queueDepth ? 'text-amber-300' : 'text-slate-100'}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => navigate(createPageUrl('Integrations', location.search))}
          className="dashboard-subpanel flex items-center gap-2 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
        >
          <Link2 className="h-4 w-4 text-[#00E5FF]" />
          <span className="text-sm text-slate-200">Integrations</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(createPageUrl('SystemHealth', location.search))}
          className="dashboard-subpanel flex items-center gap-2 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
        >
          <Shield className="h-4 w-4 text-[#5B6CFF]" />
          <span className="text-sm text-slate-200">Health</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(createPageUrl('Orders', location.search))}
          className="dashboard-subpanel flex items-center gap-2 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
        >
          <Activity className="h-4 w-4 text-[#9B5CFF]" />
          <span className="text-sm text-slate-200">Orders</span>
        </button>
      </div>
    </div>
  );
}
