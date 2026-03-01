import React from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  TrendingUp, 
  AlertTriangle, 
  ChevronDown,
  RefreshCw,
  Download,
  Zap,
  Lock
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

  return (
    <div className="bg-slate-950/80 backdrop-blur-xl border-b border-white/5 px-4 py-2.5 sticky top-0 z-20">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: Store Identity */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100 truncate max-w-[150px]" style={{ textShadow: '0 0 12px rgba(129,140,248,0.3)' }}>
              {tenant?.shop_name || 'My Store'}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
              style={{ background: 'rgba(149,196,105,0.12)', border: '1px solid rgba(149,196,105,0.3)', color: '#a8d982', textShadow: '0 0 8px rgba(149,196,105,0.4)' }}>
              {tenant?.platform || 'shopify'}
            </span>
          </div>
          <div className="h-4 w-px bg-white/8" />
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
            style={tier === 'trial'
              ? { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.28)', color: '#fcd34d', textShadow: '0 0 8px rgba(251,191,36,0.35)' }
              : { background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.28)', color: '#6ee7b7', textShadow: '0 0 8px rgba(52,211,153,0.35)' }}>
            {tier === 'trial' ? `Trial · ${trialDays}d` : tier}
          </span>
          {isDemo && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(129,140,248,0.3)', color: '#a5b4fc' }}>
              Demo
            </span>
          )}
        </div>

        {/* Center: Metrics */}
        <div className="flex items-center gap-5">
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

        {/* Right: Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-2 text-xs h-8 border-0"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(129,140,248,0.25)', color: '#a5b4fc' }}>
              Actions
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onScan} className="gap-2">
              <Zap className="w-4 h-4 text-emerald-500" />
              Run Profit Scan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSync} disabled={syncing} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Download className="w-4 h-4" />
              Export Report
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Lock className="w-4 h-4" />
              Security Center
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
    <div className="flex items-center gap-2">
      {dotColor && (
        <div className="w-2 h-2 rounded-full" style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
      )}
      <div className="text-center">
        <p className="text-[10px] text-slate-500">{label}</p>
        <p className="font-semibold text-sm" style={{ color: col, textShadow: `0 0 8px ${col}60` }}>
          {value}{suffix}
          {trend && (
            <TrendingUp className={`w-3 h-3 inline ml-1 ${trend === 'up' ? 'text-emerald-400' : 'text-red-400 rotate-180'}`} />
          )}
        </p>
      </div>
    </div>
  );
}