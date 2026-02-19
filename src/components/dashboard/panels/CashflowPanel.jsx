import React from 'react';
import { Wallet, TrendingUp, AlertTriangle } from 'lucide-react';
import CommandPanel from '../CommandPanel';

export default function CashflowPanel({ metrics = {}, loading = false }) {
  // Safe extraction of metric values
  const totalRevenue = typeof metrics?.totalRevenue === 'number' ? metrics.totalRevenue : 0;
  const totalProfit = typeof metrics?.totalProfit === 'number' ? metrics.totalProfit : 0;
  
  // Simulated forecast based on current metrics
  const avgDaily = totalRevenue / 30;
  const projected7d = avgDaily * 7;
  const projected30d = totalRevenue;
  const projectedProfit30d = totalProfit;
  
  const isHealthy = projectedProfit30d > 0;

  return (
    <CommandPanel
      title="Cashflow Forecast"
      icon={Wallet}
      iconColor={isHealthy ? 'blue' : 'amber'}
      ctaLabel="Open P&L Analytics"
      ctaPage="PnLAnalytics"
      lastUpdated="Projected"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Projections */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-blue-50 rounded-lg p-2">
            <p className="text-lg font-bold text-blue-700">
              ${projected7d >= 1000 ? `${(projected7d / 1000).toFixed(1)}k` : projected7d.toFixed(0)}
            </p>
            <p className="text-[10px] text-slate-500">Next 7 days</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-lg font-bold text-slate-700">
              ${projected30d >= 1000 ? `${(projected30d / 1000).toFixed(1)}k` : projected30d.toFixed(0)}
            </p>
            <p className="text-[10px] text-slate-500">30-day forecast</p>
          </div>
        </div>

        {/* Health Indicator */}
        <div className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
          isHealthy ? 'bg-emerald-50' : 'bg-amber-50 border border-amber-200'
        }`}>
          {isHealthy ? (
            <>
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-700">Healthy cash position projected</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span className="text-amber-700">Review expenses — margins tight</span>
            </>
          )}
        </div>
      </div>
    </CommandPanel>
  );
}