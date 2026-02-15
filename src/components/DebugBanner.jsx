import React from 'react';
import { Bug } from 'lucide-react';

/**
 * Temporary debug banner showing tenant resolution info
 * Remove in production
 */
export default function DebugBanner({ shopDomain, tenantId, ordersCount, debug, queryFilter, dateRange, queryInfo }) {
  const [visible, setVisible] = React.useState(true);
  
  if (!visible) return null;
  
  const filterStr = queryFilter ? JSON.stringify(queryFilter) : 'null';
  
  return (
    <div className="fixed top-16 right-2 p-3 bg-slate-900 text-slate-200 text-xs rounded-lg shadow-lg z-50 max-w-md border border-slate-700">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1">
          <Bug className="w-4 h-4 text-yellow-400" />
          <span className="font-bold text-yellow-400">DEBUG PANEL</span>
        </div>
        <button 
          onClick={() => setVisible(false)}
          className="text-slate-400 hover:text-white px-1"
        >
          ✕
        </button>
      </div>
      <div className="space-y-1 font-mono text-[11px]">
        <div className="border-b border-slate-700 pb-1 mb-1">
          <span className="text-slate-400">Environment:</span>
          <span className="text-orange-400 font-bold ml-1">{debug?.env || 'PROD'}</span>
        </div>
        
        <div className="text-slate-400 font-semibold">Tenant Resolution:</div>
        <div className="pl-2">
          <div>url_shop_param: <span className="text-pink-400">{debug?.url_shop_param || 'null'}</span></div>
          <div>resolved_via: <span className="text-yellow-400">{debug?.resolved_via || 'unknown'}</span></div>
          <div>shop_domain: <span className="text-emerald-400">{shopDomain || 'null'}</span></div>
          <div>tenant_id: <span className="text-blue-400 font-bold">{tenantId || 'null'}</span></div>
        </div>
        
        <div className="text-slate-400 font-semibold mt-2">Query Info:</div>
        <div className="pl-2">
          <div className="break-all">filter: <span className="text-cyan-400">{filterStr}</span></div>
          <div>date_field: <span className="text-lime-400">{queryInfo?.dateField || 'order_date'}</span></div>
          {queryInfo?.dateStart && (
            <div>date_start: <span className="text-lime-400">{queryInfo.dateStart.substring(0,10)}</span></div>
          )}
          {queryInfo?.dateEnd && (
            <div>date_end: <span className="text-lime-400">{queryInfo.dateEnd.substring(0,10)}</span></div>
          )}
          <div>ui_date_range: <span className="text-lime-400">{dateRange || '30'} days</span></div>
        </div>
        
        <div className="border-t border-slate-700 pt-1 mt-2">
          <span className="text-slate-400">Orders Returned:</span>
          <span className="text-purple-400 font-bold text-lg ml-2">{ordersCount ?? '?'}</span>
        </div>
      </div>
    </div>
  );
}