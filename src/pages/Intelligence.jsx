import React, { useState } from 'react';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';
import { Loader2, Shield, Brain } from 'lucide-react';
import GlobalIntelligenceDashboard from '@/components/intelligence/GlobalIntelligenceDashboard';
import OrderRiskTable from '@/components/intelligence/OrderRiskTable';

const TABS = [
  { id: 'orders', label: 'Order Risk Scores', icon: Shield },
  { id: 'model', label: 'AI Model & Signals', icon: Brain },
];

export default function Intelligence() {
  const { tenantId, status } = usePlatformResolver();
  const [tab, setTab] = useState('orders');

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk Intelligence</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time fraud, chargeback & return risk scoring for every order</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-slate-700/50">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-indigo-500 text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'orders' && <OrderRiskTable tenantId={tenantId} />}
      {tab === 'model' && <GlobalIntelligenceDashboard tenantId={tenantId} />}
    </div>
  );
}