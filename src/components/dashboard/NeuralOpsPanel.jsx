import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { BrainCircuit, Radar, ShieldCheck, Sparkles } from 'lucide-react';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '$0';
  if (Math.abs(amount) >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
}

function deriveSignals({ metrics, profitScore, alerts }) {
  const margin = Number(metrics?.avgMargin || 0);
  const highRiskOrders = Number(metrics?.highRiskOrders || 0);
  const totalProfit = Number(metrics?.totalProfit || 0);
  const alertCount = Array.isArray(alerts) ? alerts.length : 0;

  return [
    {
      label: 'AI posture',
      value: profitScore >= 70 ? 'Confident' : profitScore >= 45 ? 'Adaptive' : 'Learning',
      tone: profitScore >= 70 ? 'text-emerald-300' : profitScore >= 45 ? 'text-cyan-300' : 'text-amber-300',
      icon: BrainCircuit,
    },
    {
      label: 'Protection mesh',
      value: highRiskOrders > 0 ? `${highRiskOrders} hot` : 'Stable',
      tone: highRiskOrders > 0 ? 'text-amber-300' : 'text-emerald-300',
      icon: ShieldCheck,
    },
    {
      label: 'Margin field',
      value: margin > 0 ? `${margin.toFixed(1)}%` : 'No signal',
      tone: margin >= 25 ? 'text-emerald-300' : margin >= 15 ? 'text-cyan-300' : 'text-amber-300',
      icon: Radar,
    },
    {
      label: 'Alert pressure',
      value: alertCount > 0 ? `${alertCount} queued` : 'Quiet',
      tone: alertCount > 0 ? 'text-amber-300' : 'text-slate-200',
      icon: Sparkles,
    },
    {
      label: 'Net recovery lane',
      value: totalProfit >= 0 ? formatCurrency(totalProfit) : `-${formatCurrency(Math.abs(totalProfit))}`,
      tone: totalProfit >= 0 ? 'text-emerald-300' : 'text-rose-300',
      icon: BrainCircuit,
    },
  ];
}

function ActionChip({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[10px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-200 transition-colors duration-150 hover:border-white/16 hover:bg-white/[0.06]"
    >
      {label}
    </button>
  );
}

export default function NeuralOpsPanel({ metrics, profitScore, alerts = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const signals = useMemo(() => deriveSignals({ metrics, profitScore, alerts }), [metrics, profitScore, alerts]);

  return (
    <div
      className="dashboard-panel overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at top right, rgba(0,229,255,0.12), transparent 34%), linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.025))',
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="dashboard-label">Neural Command Core</p>
          <p className="mt-2 dashboard-title">Autonomous profit and risk telemetry</p>
          <p className="mt-2 text-sm text-slate-400">
            High-signal AI readout for margin quality, threat pressure, and operator readiness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionChip label="AI Insights" onClick={() => navigate(createPageUrl('AIInsights', location.search))} />
          <ActionChip label="Risk Intel" onClick={() => navigate(createPageUrl('Intelligence', location.search))} />
          <ActionChip label="Alerts" onClick={() => navigate(createPageUrl('Alerts', location.search))} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {signals.map((signal) => {
          const Icon = signal.icon;
          return (
            <div key={signal.label} className="dashboard-subpanel">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04]">
                  <Icon className={`h-4 w-4 ${signal.tone}`} />
                </div>
                <p className="dashboard-label">{signal.label}</p>
              </div>
              <p className={`mt-3 text-lg font-semibold ${signal.tone}`}>{signal.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
