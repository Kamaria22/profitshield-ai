import React from 'react';
import { Link2, CheckCircle2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function IntegrationsPanel({ loading, isDemo = false }) {
  const integrations = isDemo ? [] : [
    { name: 'Shopify', status: 'connected', icon: '🛒' },
    { name: 'Stripe', status: 'available', icon: '💳' },
    { name: 'QuickBooks', status: 'available', icon: '📊' }
  ];
  
  const connectedCount = integrations.filter(i => i.status === 'connected').length;

  return (
    <CommandPanel
      title="Integrations"
      icon={Link2}
      iconColor="emerald"
      ctaLabel="Browse Marketplace"
      ctaPage="Integrations"
      lastUpdated="Synced"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-emerald-600">{connectedCount}</span>
            <span className="text-xs text-slate-500">connected</span>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
            {integrations.length} available
          </Badge>
        </div>

        {/* Integration List */}
        <div className="space-y-1.5">
          {integrations.length > 0 ? integrations.map((int, i) => (
            <div key={i} className="flex items-center justify-between p-1.5 bg-slate-50 rounded text-xs">
              <div className="flex items-center gap-2">
                <span>{int.icon}</span>
                <span className="text-slate-700">{int.name}</span>
              </div>
              {int.status === 'connected' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              ) : (
                <Plus className="w-3 h-3 text-slate-400" />
              )}
            </div>
          )) : (
            <div className="flex items-center gap-2 p-2 bg-slate-50 rounded text-xs">
              <Plus className="w-3 h-3 text-slate-400" />
              <p className="text-slate-500">Connect your first integration</p>
            </div>
          )}
        </div>
      </div>
    </CommandPanel>
  );
}