import React from 'react';
import { BarChart3, RefreshCw, Shield, Sparkles } from 'lucide-react';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function formatTimestamp(value) {
  if (!value) return 'Awaiting action';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Awaiting action';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getRiskLevel(highRiskOrders) {
  if (highRiskOrders >= 5) return 'High';
  if (highRiskOrders > 0) return 'Medium';
  return 'Low';
}

const toneMap = {
  primary: '#00E5FF',
  secondary: '#5B6CFF',
  accent: '#9B5CFF',
  success: '#34D399',
  warning: '#F59E0B',
};

function StatCell({ label, value, meta, tone = 'primary' }) {
  return (
    <div className="dashboard-panel">
      <p className="dashboard-label">{label}</p>
      <p className="dashboard-metric mt-2" style={{ color: toneMap[tone] || '#FFFFFF' }}>
        {value}
      </p>
      {meta ? <p className="mt-2 text-xs text-slate-400">{meta}</p> : null}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, disabled = false, spinning = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`} />
      <span>{label}</span>
    </button>
  );
}

export default function TopCommandBar({
  tenant,
  profitScore,
  metrics,
  alerts,
  aiStatus,
  lastActionAt,
  syncing = false,
  onSync,
  onOpenReport,
  onOpenSecurity,
  onOpenInsights,
}) {
  const riskLevel = getRiskLevel(metrics?.highRiskOrders || 0);
  const alertsCount = Array.isArray(alerts) ? alerts.length : 0;
  const storeName = tenant?.shop_name || 'Merchant Runtime';

  return (
    <div className="space-y-3">
      <div className="dashboard-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="dashboard-label">Command Surface</p>
          <p className="mt-2 truncate text-base font-semibold text-white">{storeName}</p>
          <p className="mt-1 text-sm text-slate-400">
            {syncing ? 'Synchronizing merchant telemetry' : 'Operational dashboard online'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            icon={RefreshCw}
            label={syncing ? 'Syncing' : 'Sync Now'}
            onClick={onSync}
            disabled={!onSync || syncing}
            spinning={syncing}
          />
          <ActionButton
            icon={Sparkles}
            label="AI Insights"
            onClick={onOpenInsights}
            disabled={!onOpenInsights}
          />
          <ActionButton
            icon={BarChart3}
            label="P&L"
            onClick={onOpenReport}
            disabled={!onOpenReport}
          />
          <ActionButton
            icon={Shield}
            label="Security"
            onClick={onOpenSecurity}
            disabled={!onOpenSecurity}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCell
          label="Profit Integrity"
          value={`${Math.round(Number(profitScore || 0))}`}
          meta="/100"
          tone="primary"
        />
        <StatCell
          label="Net Profit (30d)"
          value={formatCurrency(metrics?.totalProfit)}
          meta={`${Math.round(Number(metrics?.avgMargin || 0))}% margin`}
          tone={Number(metrics?.totalProfit || 0) >= 0 ? 'success' : 'warning'}
        />
        <StatCell
          label="Risk Level"
          value={riskLevel}
          meta={`${Number(metrics?.highRiskOrders || 0)} flagged orders`}
          tone={riskLevel === 'High' ? 'warning' : riskLevel === 'Medium' ? 'accent' : 'success'}
        />
        <StatCell
          label="Alerts Count"
          value={String(alertsCount)}
          meta={alertsCount ? 'Needs review' : 'All clear'}
          tone={alertsCount ? 'warning' : 'success'}
        />
        <StatCell
          label="AI Status"
          value={aiStatus}
          meta={formatTimestamp(lastActionAt)}
          tone={aiStatus === 'Active' ? 'secondary' : 'accent'}
        />
      </div>
    </div>
  );
}
