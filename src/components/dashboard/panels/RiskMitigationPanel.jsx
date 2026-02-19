import React from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function RiskMitigationPanel({ loading, isDemo = false }) {
  const mitigations = isDemo ? [] : [
    { name: 'Auto-hold high risk', status: 'active' },
    { name: 'Fraud alerts', status: 'active' },
    { name: 'Chargeback prevention', status: 'active' }
  ];
  
  const activeCount = isDemo ? 0 : mitigations.filter(m => m.status === 'active').length;

  return (
    <CommandPanel
      title="Proactive Risk Mitigation"
      icon={ShieldCheck}
      iconColor="amber"
      ctaLabel="Configure Rules"
      ctaPage="Intelligence"
      lastUpdated="Active"
      loading={loading}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-amber-600">{activeCount}</span>
            <span className="text-xs text-slate-500">rules active</span>
          </div>
          <Badge className="bg-amber-100 text-amber-700 text-[10px]">Protected</Badge>
        </div>

        <div className="space-y-1.5">
          {mitigations.length > 0 ? mitigations.map((m, i) => (
            <div key={i} className="flex items-center justify-between p-1.5 bg-slate-50 rounded text-xs">
              <span className="text-slate-700">{m.name}</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            </div>
          )) : (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded text-xs">
              <AlertTriangle className="w-3 h-3 text-slate-400" />
              <p className="text-slate-500">Connect store to enable</p>
            </div>
          )}
        </div>
      </div>
    </CommandPanel>
  );
}