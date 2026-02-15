import React from 'react';
import { Bug } from 'lucide-react';

/**
 * Temporary debug banner showing tenant resolution info
 * Remove in production
 */
export default function DebugBanner({ shopDomain, tenantId, ordersCount, debug, queryFilter, dateRange }) {
  const [visible, setVisible] = React.useState(true);
  
  if (!visible) return null;
  
  const filterStr = queryFilter ? JSON.stringify(queryFilter) : 'null';
  
  return (
    <div className="fixed top-0 right-0 m-2 p-2 bg-slate-800 text-slate-200 text-xs rounded-lg shadow-lg z-50 max-w-sm">
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
      <div className="space-y-0.5 font-mono text-[10px]">
        <div>env=<span className="text-orange-400">{debug?.env || 'prod'}</span></div>
        <div>shop=<span className="text-emerald-400">{shopDomain || 'null'}</span></div>
        <div>tenant_id=<span className="text-blue-400">{tenantId || 'null'}</span></div>
        <div>via=<span className="text-yellow-400">{debug?.resolved_via || 'unknown'}</span></div>
        <div>url_param=<span className="text-pink-400">{debug?.url_shop_param || 'null'}</span></div>
        <div className="truncate">query=<span className="text-cyan-400">{filterStr}</span></div>
        {dateRange && <div>date_range=<span className="text-lime-400">{dateRange} days (order_date)</span></div>}
        <div>orders_returned=<span className="text-purple-400 font-bold">{ordersCount ?? '?'}</span></div>
      </div>
    </div>
  );
}