import React from 'react';
import { BarChart3, BrainCircuit, Link2, Shield, ShoppingBag, Users, Zap } from 'lucide-react';
import { createPageUrl } from '@/components/platformContext';
import { useNavigate, useLocation } from 'react-router-dom';
import OrderSyncStatus from '@/components/orders/OrderSyncStatus';

function ControlRow({ icon: Icon, title, status, actionLabel, onAction }) {
  return (
    <div className="dashboard-subpanel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.03]">
            <Icon className="h-4 w-4 text-[#00E5FF]" />
          </div>
          <div>
            <p className="dashboard-title">{title}</p>
            <p className="mt-1 text-xs text-slate-400">{status}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAction}
          className="rounded-[12px] border border-white/10 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function QuickLink({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs font-medium text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
    >
      <Icon className="h-3.5 w-3.5 text-[#00E5FF]" />
      <span>{label}</span>
    </button>
  );
}

export default function ControlPanel({ tenantId, integrationId, integrationStatus, aiStatus, onSync }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="dashboard-panel space-y-3">
      <div>
        <p className="dashboard-label">Command Controls</p>
        <p className="mt-2 text-sm text-slate-400">Core controls, sync runtime, and direct operator access.</p>
      </div>
      <ControlRow
        icon={Zap}
        title="AI Automations"
        status={aiStatus === 'Active' ? 'Active and ready' : 'Idle until next model event'}
        actionLabel="Settings"
        onAction={() => navigate(createPageUrl('Settings', location.search))}
      />
      <ControlRow
        icon={Shield}
        title="Risk Rules"
        status="Fraud and risk rule controls"
        actionLabel="Open"
        onAction={() => navigate(createPageUrl('Intelligence', location.search))}
      />
      <ControlRow
        icon={Link2}
        title="Integrations"
        status={integrationStatus ? `Status: ${integrationStatus}` : 'Store integration status pending'}
        actionLabel="Manage"
        onAction={() => navigate(createPageUrl('Integrations', location.search))}
      />

      <div className="dashboard-subpanel">
        <p className="dashboard-label">Sync Runtime</p>
        <div className="mt-3">
          <OrderSyncStatus
            tenantId={tenantId}
            integrationId={integrationId}
            onSynced={onSync}
          />
        </div>
      </div>

      <div className="dashboard-subpanel">
        <p className="dashboard-label">Quick Access</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <QuickLink
            icon={ShoppingBag}
            label="Orders"
            onClick={() => navigate(createPageUrl('Orders', location.search))}
          />
          <QuickLink
            icon={Users}
            label="Customers"
            onClick={() => navigate(createPageUrl('Customers', location.search))}
          />
          <QuickLink
            icon={BrainCircuit}
            label="AI Insights"
            onClick={() => navigate(createPageUrl('AIInsights', location.search))}
          />
          <QuickLink
            icon={BarChart3}
            label="P&L"
            onClick={() => navigate(createPageUrl('PnLAnalytics', location.search))}
          />
        </div>
      </div>
    </div>
  );
}
