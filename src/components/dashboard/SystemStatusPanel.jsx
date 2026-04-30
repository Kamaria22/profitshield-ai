import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { ChevronDown, ChevronUp, Link2, RefreshCw, Shield } from 'lucide-react';

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

function StatusCell({ label, value, tone = 'text-slate-100' }) {
  return (
    <div className="dashboard-subpanel">
      <p className="dashboard-label">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export default function SystemStatusPanel({
  tenantId,
  integrationId,
  integrationStatus,
  lastSyncAt,
  syncing = false,
  onSync,
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const { data: detail } = useQuery({
    queryKey: ['dashboard-system-status', tenantId || 'unresolved', integrationId || 'none'],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const [queueRows, integrationRows] = await Promise.all([
        base44.entities.WebhookQueue.filter({ tenant_id: tenantId, status: 'pending' }, '-created_date', 30).catch(() => []),
        integrationId
          ? base44.entities.PlatformIntegration.filter({ id: integrationId }).catch(() => [])
          : base44.entities.PlatformIntegration.filter({ tenant_id: tenantId }, '-updated_date', 2).catch(() => []),
      ]);
      const integration = Array.isArray(integrationRows) ? integrationRows[0] || null : null;
      return {
        queueDepth: Array.isArray(queueRows) ? queueRows.length : 0,
        webhookCount: Object.keys(integration?.webhook_endpoints || {}).length,
        lastSyncStatus: integration?.last_sync_status || null,
      };
    },
    staleTime: 30000,
    gcTime: 120000,
    refetchOnWindowFocus: false,
  });

  const connectionTone =
    integrationStatus === 'connected' ? 'text-emerald-300' :
    integrationStatus === 'degraded' ? 'text-amber-300' :
    'text-slate-100';

  return (
    <section className="dashboard-panel">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="dashboard-label">System Status</p>
          <p className="mt-2 text-sm text-slate-400">Connection and sync details for your store.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
            {open ? 'Expanded' : 'Collapsed'}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatusCell label="Store connection" value={integrationStatus || 'Standby'} tone={connectionTone} />
            <StatusCell label="Last refresh" value={formatTimestamp(lastSyncAt)} tone="text-[#00E5FF]" />
            <StatusCell
              label="Connected services"
              value={detail?.webhookCount ? `${detail.webhookCount} active` : 'Not registered'}
              tone={detail?.webhookCount ? 'text-emerald-300' : 'text-amber-300'}
            />
            <StatusCell
              label="Pending updates"
              value={detail?.queueDepth ? `${detail.queueDepth} pending` : (detail?.lastSyncStatus || 'Clear')}
              tone={detail?.queueDepth ? 'text-amber-300' : 'text-slate-100'}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={onSync}
              disabled={!onSync || syncing}
              className="dashboard-subpanel flex items-center gap-2 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 text-[#00E5FF] ${syncing ? 'animate-spin' : ''}`} />
              <span className="text-sm text-slate-200">{syncing ? 'Syncing...' : 'Run Sync'}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(createPageUrl('Integrations', location.search))}
              className="dashboard-subpanel flex items-center gap-2 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
            >
              <Link2 className="h-4 w-4 text-[#5B6CFF]" />
              <span className="text-sm text-slate-200">Integrations</span>
            </button>
            <button
              type="button"
              onClick={() => navigate(createPageUrl('SystemHealth', location.search))}
              className="dashboard-subpanel flex items-center gap-2 text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
            >
              <Shield className="h-4 w-4 text-[#9B5CFF]" />
              <span className="text-sm text-slate-200">Health</span>
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
