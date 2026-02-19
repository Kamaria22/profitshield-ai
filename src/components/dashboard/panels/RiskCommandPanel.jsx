import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function RiskCommandPanel({ metrics, loading }) {
  const highRisk = metrics?.highRiskOrders || 0;
  const negMargin = metrics?.negativeMarginOrders || 0;
  
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
            <p className={`text-lg font-bold ${fraudScore > 50 ? 'text-red-600' : 'text-emerald-600'}`}>
              {fraudScore}
            </p>
            <p className="text-[10px] text-slate-500">Fraud</p>
          </div>
          <div className="text-center">
            <Badge className={`text-[10px] ${
              chargebackRisk === 'High' ? 'bg-red-100 text-red-700' :
              chargebackRisk === 'Medium' ? 'bg-amber-100 text-amber-700' :
              'bg-emerald-100 text-emerald-700'
            }`}>
              {chargebackRisk}
            </Badge>
            <p className="text-[10px] text-slate-500 mt-1">Chargeback</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${negMargin > 5 ? 'text-amber-600' : 'text-slate-600'}`}>
              {negMargin}
            </p>
            <p className="text-[10px] text-slate-500">At Risk</p>
          </div>
        </div>

        {/* Top Risk Alert */}
        <div className={`p-2 rounded-lg text-xs ${highRisk > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
          <div className="flex items-start gap-2">
            {highRisk > 0 && <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />}
            <p className={highRisk > 0 ? 'text-amber-700' : 'text-slate-500'}>
              {topRisk}
            </p>
          </div>
        </div>
      </div>
    </CommandPanel>
  );
}