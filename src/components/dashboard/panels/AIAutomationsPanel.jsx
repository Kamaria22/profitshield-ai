import React, { useMemo } from 'react';
import { Bot, Zap, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function AIAutomationsPanel({ loading = false, isDemo = false }) {
  const automations = useMemo(() => isDemo ? [] : [
    { name: 'Fraud Detection', status: 'active', runs: 142 },
    { name: 'Price Optimization', status: 'active', runs: 87 },
    { name: 'Inventory Alerts', status: 'paused', runs: 23 }
  ], [isDemo]);
  
  const activeCount = automations.filter(a => a.status === 'active').length;

  return (
    <CommandPanel
      title="AI Automations"
      icon={Bot}
      iconColor="violet"
      ctaLabel="Manage Automations"
      ctaPage="AIInsights"
      lastUpdated="Live"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-violet-600">{activeCount}</span>
            <span className="text-xs text-slate-500">active</span>
          </div>
          <Badge className="bg-violet-100 text-violet-700 text-[10px]">
            AI Powered
          </Badge>
        </div>

        {/* Automation List */}
        <div className="space-y-1.5">
          {automations.length > 0 ? automations.map((auto, i) => (
            <div key={i} className="flex items-center justify-between p-1.5 bg-slate-50 rounded text-xs">
              <div className="flex items-center gap-2">
                <Zap className={`w-3 h-3 ${auto.status === 'active' ? 'text-violet-500' : 'text-slate-400'}`} />
                <span className="text-slate-700">{auto.name}</span>
              </div>
              <span className="text-slate-500">{auto.runs} runs</span>
            </div>
          )) : (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded text-xs">
              <CheckCircle2 className="w-3 h-3 text-slate-400" />
              <p className="text-slate-500">Connect store to enable AI</p>
            </div>
          )}
        </div>
      </div>
    </CommandPanel>
  );
}