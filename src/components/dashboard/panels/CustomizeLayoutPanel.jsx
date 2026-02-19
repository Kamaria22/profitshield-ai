import React from 'react';
import { LayoutGrid, Settings, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function CustomizeLayoutPanel({ loading }) {
  return (
    <CommandPanel
      title="Customize Dashboard"
      icon={LayoutGrid}
      iconColor="emerald"
      ctaLabel="Customize Layout"
      ctaPage="Settings"
      lastUpdated=""
      loading={loading}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-500" />
          <span className="text-sm font-medium text-slate-700">Make it yours</span>
        </div>

        <div className="space-y-1.5 text-xs text-slate-600">
          <div className="flex items-center gap-2 p-1.5 bg-emerald-50 rounded">
            <Settings className="w-3 h-3 text-emerald-600" />
            <span>Reorder panels</span>
          </div>
          <div className="flex items-center gap-2 p-1.5 bg-slate-50 rounded">
            <Settings className="w-3 h-3 text-slate-400" />
            <span>Toggle visibility</span>
          </div>
          <div className="flex items-center gap-2 p-1.5 bg-slate-50 rounded">
            <Settings className="w-3 h-3 text-slate-400" />
            <span>Save preferences</span>
          </div>
        </div>
      </div>
    </CommandPanel>
  );
}