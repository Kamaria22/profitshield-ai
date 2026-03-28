import React from 'react';
import { Link2, Shield, Zap } from 'lucide-react';
import { createPageUrl } from '@/components/platformContext';
import { useNavigate, useLocation } from 'react-router-dom';

function ControlRow({ icon: Icon, title, status, actionLabel, onAction }) {
  return (
    <div className="dashboard-panel">
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

export default function ControlPanel({ integrationStatus, aiStatus }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="space-y-3">
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
    </div>
  );
}
