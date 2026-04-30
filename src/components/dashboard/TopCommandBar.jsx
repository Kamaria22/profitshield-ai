import React from 'react';
import { Activity, BarChart3, RefreshCw, Shield, Sparkles, TriangleAlert } from 'lucide-react';

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

function formatRelativeSyncAge(value) {
  if (!value) return 'Awaiting first sync';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Awaiting first sync';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) return 'Synced just now';
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Synced ${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `Synced ${diffDays}d ago`;
}

function getRiskLevel(highRiskOrders) {
  if (highRiskOrders >= 5) return 'High';
  if (highRiskOrders > 0) return 'Medium';
  return 'Low';
}

function deriveProfitTrend(orders = []) {
  const source = Array.isArray(orders) ? orders.slice(0, 8) : [];
  if (source.length < 4) {
    return { direction: 'flat', label: 'Stable vs prior period', delta: 0 };
  }

  const midpoint = Math.ceil(source.length / 2);
  const latest = source.slice(0, midpoint);
  const prior = source.slice(midpoint);

  const latestProfit = latest.reduce((sum, order) => sum + Number(order?.net_profit || order?.total_revenue || 0), 0);
  const priorProfit = prior.reduce((sum, order) => sum + Number(order?.net_profit || order?.total_revenue || 0), 0);

  if (!priorProfit) {
    return { direction: latestProfit > 0 ? 'up' : 'flat', label: 'Fresh signal', delta: 0 };
  }

  const delta = ((latestProfit - priorProfit) / Math.abs(priorProfit)) * 100;
  if (delta > 5) return { direction: 'up', label: `Up ${delta.toFixed(1)}% vs prior period`, delta };
  if (delta < -5) return { direction: 'down', label: `Down ${Math.abs(delta).toFixed(1)}% vs prior period`, delta };
  return { direction: 'flat', label: 'Flat vs prior period', delta };
}

function deriveInterpretation({ metrics, alertsCount, profitScore }) {
  const margin = Number(metrics?.avgMargin || 0);
  const highRiskOrders = Number(metrics?.highRiskOrders || 0);
  if (highRiskOrders > 0) return 'Risk pressure detected';
  if (alertsCount > 0) return 'Operational pressure detected';
  if (margin < 20) return 'Margin pressure detected';
  if (profitScore >= 70) return 'Operating posture is healthy';
  return 'Signal is still developing';
}

function deriveAiStatusMessage({ syncing, aiStatus, lastActionAt, integrationStatus, alertsCount, highRiskOrders }) {
  if (syncing) return { last: 'Refreshing store data now', next: 'Next: update profit, risk, and alerts' };
  const last = aiStatus === 'Active'
    ? `Last action: store analysis refreshed at ${formatTimestamp(lastActionAt)}`
    : 'Last action: awaiting first live store analysis';

  let next = 'Next: continue monitoring';
  if (highRiskOrders > 0) next = 'Next: prioritize flagged order review';
  else if (alertsCount > 0) next = 'Next: surface pending alert actions';
  else if (integrationStatus && integrationStatus !== 'connected') next = 'Next: restore store connection';
  else if (aiStatus === 'Active') next = 'Next: watch for profit, risk, and order changes';

  return { last, next };
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const toneMap = {
  primary: '#00E5FF',
  secondary: '#5B6CFF',
  accent: '#9B5CFF',
  success: '#34D399',
  warning: '#F59E0B',
};

const iconMap = {
  'Profit Integrity': Activity,
  'Net Profit (30d)': BarChart3,
  'Risk Level': Shield,
  'Alerts Count': TriangleAlert,
  'AI Status': Sparkles,
};

function StatCell({ label, value, meta, provenance, tone = 'primary' }) {
  const Icon = iconMap[label] || Activity;
  return (
    <div className="dashboard-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="dashboard-label">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
          <Icon className="h-4 w-4 text-slate-300" />
        </div>
      </div>
      <p className="dashboard-metric mt-3" style={{ color: toneMap[tone] || '#FFFFFF' }}>
        {value}
      </p>
      {meta ? (
        <div className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300">
          {meta}
        </div>
      ) : null}
      {provenance ? (
        <p className="mt-2 text-[11px] text-slate-500">
          {provenance}
        </p>
      ) : null}
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
  profitScoreSource = 'tenant_signal',
  metrics,
  alerts,
  orders = [],
  aiStatus,
  lastActionAt,
  integrationStatus,
  syncing = false,
  onSync,
}) {
  const riskLevel = getRiskLevel(metrics?.highRiskOrders || 0);
  const alertsCount = Array.isArray(alerts) ? alerts.length : 0;
  const storeName = tenant?.shop_name || 'Merchant Runtime';
  const riskMeta = `${pluralize(Number(metrics?.highRiskOrders || 0), 'flagged order')}`;
  const alertMeta = alertsCount ? 'Needs review' : 'All clear';
  const integrityMeta = `${Math.round(Number(profitScore || 0)) >= 70 ? 'Strong operating posture' : 'Signal still developing'}`;
  const trend = deriveProfitTrend(orders);
  const syncAge = formatRelativeSyncAge(lastActionAt);
  const integrityProvenance = profitScoreSource === 'derived_runtime'
    ? `Derived from live store data · ${syncAge}`
    : 'Tenant score';
  const aiMessage = deriveAiStatusMessage({
    syncing,
    aiStatus,
    lastActionAt,
    integrationStatus,
    alertsCount,
    highRiskOrders: Number(metrics?.highRiskOrders || 0),
  });

  return (
    <div className="space-y-3">
      <div className="dashboard-panel flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="dashboard-label">Merchant Overview</p>
          <p className="mt-2 truncate text-base font-semibold text-white">{storeName}</p>
          <p className="mt-1 text-sm text-slate-400">
            {syncing ? 'Refreshing store data' : 'Your store health at a glance'}
          </p>
        </div>
        <div className="flex shrink-0">
          <ActionButton
            icon={RefreshCw}
            label={syncing ? 'Syncing' : 'Sync Now'}
            onClick={onSync}
            disabled={!onSync || syncing}
            spinning={syncing}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCell
          label="Profit Integrity"
          value={`${Math.round(Number(profitScore || 0))}`}
          meta={`${integrityMeta} · /100`}
          provenance={integrityProvenance}
          tone="primary"
        />
        <StatCell
          label="Net Profit (30d)"
          value={formatCurrency(metrics?.totalProfit)}
          meta={`${Math.round(Number(metrics?.avgMargin || 0))}% margin · ${trend.label}`}
          provenance={`Order summary · ${syncAge}`}
          tone={Number(metrics?.totalProfit || 0) >= 0 ? 'success' : 'warning'}
        />
        <StatCell
          label="Risk Level"
          value={riskLevel}
          meta={riskMeta}
          provenance={`Flagged orders · ${syncAge}`}
          tone={riskLevel === 'High' ? 'warning' : riskLevel === 'Medium' ? 'accent' : 'success'}
        />
        <StatCell
          label="Alerts Count"
          value={String(alertsCount)}
          meta={alertMeta}
          provenance="Pending alerts"
          tone={alertsCount ? 'warning' : 'success'}
        />
        <StatCell
          label="AI Status"
          value={aiStatus}
          meta={aiMessage.last.replace('Last action: ', '')}
          provenance={`Store analysis · ${syncAge}`}
          tone={aiStatus === 'Active' ? 'secondary' : 'accent'}
        />
      </div>
    </div>
  );
}
