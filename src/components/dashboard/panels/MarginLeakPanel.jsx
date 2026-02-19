import React from 'react';
import { Zap, TrendingDown } from 'lucide-react';
import CommandPanel from '../CommandPanel';

export default function MarginLeakPanel({ leaks = [], loading, isDemo = false }) {
  const topLeaks = isDemo ? [] : leaks.slice(0, 3);
  const totalImpact = isDemo ? 0 : leaks.reduce((sum, l) => sum + (l.impact_amount || 0), 0);

  const leakIcons = {
    shipping: '📦',
    discount: '🏷️',
    refund: '↩️',
    fee: '💳',
    cogs: '📊'
  };

  return (
    <CommandPanel
      title="Margin Leak Detector"
      icon={Zap}
      iconColor={totalImpact > 1000 ? 'red' : totalImpact > 0 ? 'amber' : 'emerald'}
      ctaLabel="Open Profit Leaks"
      ctaPage="AIInsights"
      lastUpdated="5m ago"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Impact Summary */}
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xl font-bold ${totalImpact > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              ${totalImpact >= 1000 ? `${(totalImpact / 1000).toFixed(1)}k` : totalImpact.toFixed(0)}
            </p>
            <p className="text-[10px] text-slate-500">Monthly impact</p>
          </div>
          {totalImpact > 0 && (
            <TrendingDown className="w-5 h-5 text-red-400" />
          )}
        </div>

        {/* Top 3 Leaks */}
        <div className="space-y-1.5">
          {topLeaks.length > 0 ? topLeaks.map((leak, i) => (
            <div key={i} className="flex items-center justify-between p-1.5 bg-slate-50 rounded text-xs">
              <div className="flex items-center gap-2">
                <span>{leakIcons[leak.leak_type] || '⚠️'}</span>
                <span className="text-slate-700 line-clamp-1">{leak.title || leak.leak_type}</span>
              </div>
              <span className="font-medium text-red-600">
                -${(leak.impact_amount || 0).toFixed(0)}
              </span>
            </div>
          )) : (
            <div className="p-2 bg-emerald-50 rounded text-xs text-emerald-700 text-center">
              ✨ No margin leaks detected
            </div>
          )}
        </div>
      </div>
    </CommandPanel>
  );
}