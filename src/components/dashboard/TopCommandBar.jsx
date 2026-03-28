import React from 'react';

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

export default function TopCommandBar({ profitScore, metrics, alerts, aiStatus, lastActionAt }) {
  const riskLevel = getRiskLevel(metrics?.highRiskOrders || 0);
  const alertsCount = Array.isArray(alerts) ? alerts.length : 0;

  return (
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
  );
}
