import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function RiskCommandPanel({ metrics = {}, loading = false }) {
  const highRisk = typeof metrics?.highRiskOrders === 'number' ? metrics.highRiskOrders : 0;
  const negMargin = typeof metrics?.negativeMarginOrders === 'number' ? metrics.negativeMarginOrders : 0;
  
  const fraudScore = highRisk > 10 ? 85 : highRisk > 5 ? 60 : highRisk > 0 ? 35 : 10;
  const chargebackRisk = highRisk > 5 ? 'High' : highRisk > 2 ? 'Medium' : 'Low';
  const topRisk = highRisk > 0 ? 'High-value orders from new customers' : 'No significant risks detected';

  return (
    <CommandPanel
      title="Risk Command"
      icon={Shield}
      iconColor={highRisk > 5 ? 'red' : highRisk > 0 ? 'amber' : 'emerald'}
      ctaLabel="Open Risk Intelligence"
      ctaPage="Intelligence"
      lastUpdated="2m ago"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Risk Scores */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: fraudScore > 50 ? '#f87171' : '#34d399', textShadow: `0 0 10px ${fraudScore > 50 ? 'rgba(248,113,113,0.4)' : 'rgba(52,211,153,0.4)'}` }}>
              {fraudScore}
            </p>
            <p className="text-[10px] text-slate-500">Fraud</p>
          </div>
          <div className="text-center">
            <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={chargebackRisk === 'High'
                ? { background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5' }
                : chargebackRisk === 'Medium'
                ? { background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fcd34d' }
                : { background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.28)', color: '#6ee7b7' }}>
              {chargebackRisk}
            </span>
            <p className="text-[10px] text-slate-500 mt-1">Chargeback</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: negMargin > 5 ? '#fbbf24' : '#64748b' }}>
              {negMargin}
            </p>
            <p className="text-[10px] text-slate-500">At Risk</p>
          </div>
        </div>

        {/* Top Risk Alert */}
        <div className="p-2 rounded-lg text-xs" style={highRisk > 0
          ? { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }
          : { background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-start gap-2">
            {highRisk > 0 && <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />}
            <p className={highRisk > 0 ? 'text-amber-300' : 'text-slate-500'}>
              {topRisk}
            </p>
          </div>
        </div>
      </div>
    </CommandPanel>
  );
}