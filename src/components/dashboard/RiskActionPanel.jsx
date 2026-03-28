import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'Impact unavailable';
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toFixed(0)}/month`;
}

function AlertItem({ title, impact, action, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="dashboard-subpanel block w-full text-left transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.05]"
    >
      <p className="dashboard-title">{title}</p>
      <p className="dashboard-label mt-2">Impact</p>
      <p className="mt-1 text-sm text-slate-300">{impact}</p>
      <p className="dashboard-label mt-2">Action</p>
      <p className="mt-1 text-sm text-[#00E5FF]">{action}</p>
    </button>
  );
}

function buildTasks({ alerts = [], profitLeaks = [], integrationStatus, highRiskOrders = 0 }) {
  const tasks = [];
  if (highRiskOrders > 0) {
    tasks.push({
      title: 'Review high-risk orders',
      impact: `${highRiskOrders} orders need attention`,
      action: 'Open Risk Intelligence',
    });
  }
  if (alerts.length > 0) {
    tasks.push({
      title: 'Clear pending alerts',
      impact: `${alerts.length} alerts waiting`,
      action: 'Review top alerts',
    });
  }
  if (profitLeaks.length > 0) {
    tasks.push({
      title: 'Close profit leaks',
      impact: `${profitLeaks.length} active leak signals`,
      action: 'Inspect mitigation actions',
    });
  }
  if (integrationStatus && integrationStatus !== 'connected') {
    tasks.push({
      title: 'Stabilize integrations',
      impact: `Status: ${integrationStatus}`,
      action: 'Open integrations',
    });
  }
  if (tasks.length === 0) {
    tasks.push({
      title: 'All clear',
      impact: 'No urgent work detected',
      action: 'Continue monitoring',
    });
  }
  return tasks.slice(0, 3);
}

export default function RiskActionPanel({ alerts = [], profitLeaks = [], metrics, integrationStatus }) {
  const navigate = useNavigate();
  const location = useLocation();
  const visibleAlerts = alerts.slice(0, 3).map((alert) => ({
    title: alert?.title || 'Alert',
    impact: alert?.impact_amount ? formatCurrency(alert.impact_amount) : alert?.message || 'Review recommended',
    action: alert?.recommended_action || alert?.action_label || 'Open alert',
    href: createPageUrl('Alerts', location.search),
  }));

  const visibleRisks = profitLeaks.slice(0, 3).map((risk) => ({
    title: risk?.title || risk?.type || 'Risk signal',
    impact: formatCurrency(risk?.impact_amount || risk?.estimated_impact || 0),
    action: risk?.recommended_action || 'Review mitigation',
    href: createPageUrl('AIInsights', location.search),
  }));

  const tasks = buildTasks({
    alerts,
    profitLeaks,
    integrationStatus,
    highRiskOrders: Number(metrics?.highRiskOrders || 0),
  }).map((task) => ({
    ...task,
    href:
      task.title === 'Review high-risk orders'
        ? createPageUrl('Intelligence', location.search)
        : task.title === 'Clear pending alerts'
          ? createPageUrl('Alerts', location.search)
          : task.title === 'Close profit leaks'
            ? createPageUrl('AIInsights', location.search)
            : task.title === 'Stabilize integrations'
              ? createPageUrl('Integrations', location.search)
              : createPageUrl('Home', location.search)
  }));

  return (
    <div className="space-y-3">
      <section className="dashboard-panel">
        <p className="dashboard-label">Active Risks</p>
        <div className="mt-3 space-y-3">
          {visibleRisks.length ? visibleRisks.map((risk) => (
            <AlertItem key={`${risk.title}-${risk.action}`} {...risk} onOpen={() => navigate(risk.href)} />
          )) : (
            <div className="dashboard-subpanel text-sm text-slate-400">All clear</div>
          )}
        </div>
      </section>

      <section className="dashboard-panel">
        <p className="dashboard-label">Alerts</p>
        <div className="mt-3 space-y-3">
          {visibleAlerts.length ? visibleAlerts.map((alert) => (
            <AlertItem key={`${alert.title}-${alert.action}`} {...alert} onOpen={() => navigate(alert.href)} />
          )) : (
            <div className="dashboard-subpanel text-sm text-slate-400">No active alerts</div>
          )}
        </div>
      </section>

      <section className="dashboard-panel">
        <p className="dashboard-label">Tasks</p>
        <div className="mt-3 space-y-3">
          {tasks.map((task) => (
            <AlertItem key={`${task.title}-${task.action}`} {...task} onOpen={() => navigate(task.href)} />
          ))}
        </div>
      </section>
    </div>
  );
}
