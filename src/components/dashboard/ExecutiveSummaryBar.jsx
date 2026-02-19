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
    <div className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-20">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Left: Store Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 truncate max-w-[150px]">
              {tenant?.shop_name || 'My Store'}
            </span>
            <Badge variant="outline" className="text-xs capitalize">
              {tenant?.platform || 'shopify'}
            </Badge>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <Badge className={`text-xs ${tier === 'trial' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {tier === 'trial' ? `Trial • ${trialDays}d left` : tier}
          </Badge>
          {isDemo && (
            <Badge className="bg-blue-100 text-blue-700 text-xs">Demo</Badge>
          )}
        </div>

        {/* Center: Key Metrics */}
        <div className="flex items-center gap-6">
          <MetricChip 
            label="Net Profit" 
            value={`$${(metrics?.totalProfit || 0) >= 1000 ? `${((metrics?.totalProfit || 0) / 1000).toFixed(1)}k` : (metrics?.totalProfit || 0).toFixed(0)}`}
            trend={metrics?.totalProfit >= 0 ? 'up' : 'down'}
            color={metrics?.totalProfit >= 0 ? 'emerald' : 'red'}
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
            <Button variant="outline" size="sm" className="gap-2">
              Actions
              <ChevronDown className="w-4 h-4" />
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
  const colors = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-600',
    slate: 'text-slate-700'
  };

  return (
    <div className="flex items-center gap-2">
      {dotColor && <div className={`w-2 h-2 rounded-full ${dotColor}`} />}
      <div className="text-center">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`font-semibold text-sm ${colors[color]}`}>
          {value}{suffix}
          {trend && (
            <TrendingUp className={`w-3 h-3 inline ml-1 ${trend === 'up' ? 'text-emerald-500' : 'text-red-500 rotate-180'}`} />
          )}
        </p>
      </div>
    </div>
  );
}