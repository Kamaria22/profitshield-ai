// @ts-nocheck
import React from 'react';
import { 
  TrendingUp, 
  ChevronDown,
  RefreshCw,
  Download,
  Zap,
  Lock,
  Radar,
  Cpu
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ExecutiveSummaryBar({ 
  tenant, 
  metrics = {}, 
  onSync, 
  onScan,
  onExport,
  onSecurity,
  syncing = false,
  isDemo = false 
}) {
  const profitScore = tenant?.profit_integrity_score || 0;
  const tier = tenant?.subscription_tier || 'trial';
  const trialDays = tenant?.trial_ends_at 
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Safe number extraction
  const totalProfit = typeof metrics?.totalProfit === 'number' ? metrics.totalProfit : 0;
  const highRiskOrders = typeof metrics?.highRiskOrders === 'number' ? metrics.highRiskOrders : 0;

  const riskLevel = highRiskOrders > 5 ? 'High' : 
                    highRiskOrders > 0 ? 'Medium' : 'Low';
  const riskColor = riskLevel === 'High' ? 'bg-red-500' : 
                    riskLevel === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500';
  const systemPulse = totalProfit >= 0 ? 'Positive velocity' : 'Negative drag';
  const systemTone = totalProfit >= 0 ? '#34d399' : '#f87171';
  const commandState = syncing ? 'Synchronizing live store state' : 'Instant command channel ready';

  return (
    <div className="px-2 pb-2 sm:px-4">
      <div className="future-panel future-scan rounded-[1.6rem] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                <Radar className="h-3.5 w-3.5" />
                Command Mesh
              </span>
              <span className="future-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
                <Cpu className="h-3.5 w-3.5" />
                {tenant?.platform || 'shopify'}
              </span>
              <span className="future-badge inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: tier === 'trial' ? '#fcd34d' : '#6ee7b7' }}>
                {tier === 'trial' ? `Trial ${trialDays}d` : tier}
              </span>
              {isDemo && (
                <span className="future-badge inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-200">
                  Demo
                </span>
              )}
            </div>
            <div className="mb-2 rounded-2xl border border-cyan-400/12 bg-cyan-400/5 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Command State</p>
              <p className="mt-1 text-sm font-medium text-cyan-100">{commandState}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Merchant Runtime</p>
                <h2 className="truncate text-xl font-semibold text-white sm:text-2xl" style={{ textShadow: '0 0 18px rgba(125,211,252,0.14)' }}>
                  {tenant?.shop_name || 'My Store'}
                </h2>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Pulse</p>
                <p className="text-sm font-medium" style={{ color: systemTone, textShadow: `0 0 10px ${systemTone}40` }}>
                  {systemPulse}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 xl:mx-6 xl:min-w-[360px]">
          <MetricChip
            label="Net Profit"
            value={`$${totalProfit >= 1000 ? `${(totalProfit / 1000).toFixed(1)}k` : totalProfit.toFixed(0)}`}
            trend={totalProfit >= 0 ? 'up' : 'down'}
            color={totalProfit >= 0 ? 'emerald' : 'red'}
          />
          <MetricChip
            label="Integrity"
            value={profitScore}
            suffix="/100"
            color={profitScore >= 70 ? 'emerald' : profitScore >= 40 ? 'amber' : 'red'}
          />
          <MetricChip
            label="Risk"
            value={riskLevel}
            dotColor={riskColor}
          />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col xl:items-end">
            <Button
              size="sm"
              onClick={onScan}
              className="h-10 gap-2 rounded-2xl border-0 bg-emerald-500/18 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/26"
            >
              <Zap className="h-4 w-4" />
              Run Profit Scan
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-10 gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-xs font-medium text-cyan-100 hover:bg-cyan-400/16">
                  Action Console
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onSync} disabled={syncing} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSecurity} className="gap-2">
                  <Lock className="w-4 h-4" />
                  Security Center
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricChip({ label, value, suffix = '', trend, color = 'slate', dotColor }) {
  const colorMap = {
    emerald: '#34d399',
    amber: '#fbbf24',
    red: '#f87171',
    slate: '#94a3b8',
  };
  const col = colorMap[color] || colorMap.slate;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {dotColor && (
        <div className="mb-2 h-2 w-2 rounded-full" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}` }} />
      )}
      <div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
        <p className="mt-1 font-semibold text-base" style={{ color: col, textShadow: `0 0 10px ${col}60` }}>
          {value}{suffix}
          {trend && (
            <TrendingUp className={`w-3 h-3 inline ml-1 ${trend === 'up' ? 'text-emerald-400' : 'text-red-400 rotate-180'}`} />
          )}
        </p>
      </div>
    </div>
  );
}
