import React from 'react';
import { Bug } from 'lucide-react';

/**
 * Temporary debug banner showing tenant resolution info
 * Remove in production
 */
export default function DebugBanner({ shopDomain, tenantId, ordersCount, debug }) {
  const [visible, setVisible] = React.useState(true);
  
  if (!visible) return null;
  
  return (
    <div className="fixed top-0 right-0 m-2 p-2 bg-slate-800 text-slate-200 text-xs rounded-lg shadow-lg z-50 max-w-xs">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1">
          <Bug className="w-3 h-3" />
          <span className="font-semibold">Debug</span>
        </div>
        <button 
          onClick={() => setVisible(false)}
          className="text-slate-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="space-y-0.5 font-mono">
        <div>shop=<span className="text-emerald-400">{shopDomain || 'null'}</span></div>
        <div>tenant=<span className="text-blue-400">{tenantId || 'null'}</span></div>
        <div>via=<span className="text-yellow-400">{debug?.resolved_via || 'unknown'}</span></div>
        <div>orders=<span className="text-purple-400">{ordersCount ?? '?'}</span></div>
      </div>
    </div>
  );
}