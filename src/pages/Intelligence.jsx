import React, { useState } from 'react';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';
import { Loader2, Shield, Brain } from 'lucide-react';
import GlobalIntelligenceDashboard from '@/components/intelligence/GlobalIntelligenceDashboard';
import OrderRiskTable from '@/components/intelligence/OrderRiskTable';
import { CommandCard, CommandCardContent } from '@/components/ui/command-card';

const TABS = [
  { id: 'orders', label: 'Order Risk Scores', icon: Shield },
  { id: 'model', label: 'AI Model & Signals', icon: Brain },
];

export default function Intelligence() {
  const { tenantId, status } = usePlatformResolver();
  const [tab, setTab] = useState('orders');
  const modelPreview = 'Model accuracy 92% • 3 active signals';
  const orderPreview = 'Live order scoring and review queue';

  React.useEffect(() => {
    document.title = 'Risk Intelligence – ProfitShield AI | Fraud & Chargeback Detection for Shopify';
  }, []);

  if (status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk Intelligence</h1>
        <p className="mt-1 text-sm text-slate-400">Real-time fraud, chargeback, and return risk operations</p>
      </div>

      {/* Tab navigation */}
      <CommandCard className="border-white/10 bg-white/[0.03]">
        <CommandCardContent className="px-3 py-2.5">
          <div className="flex gap-1 border-b border-white/8">
        {TABS.map(t => {
          const Icon = t.icon;
          const preview = t.id === 'orders' ? orderPreview : modelPreview;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <div className="text-left">
                <div>{t.label}</div>
                <div className="text-[11px] font-normal text-slate-500">{preview}</div>
              </div>
            </button>
          );
        })}
          </div>
        </CommandCardContent>
      </CommandCard>

      {tab === 'orders' && <OrderRiskTable tenantId={tenantId} />}
      {tab === 'model' && <GlobalIntelligenceDashboard tenantId={tenantId} />}
    </div>
  );
}
