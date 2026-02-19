import React from 'react';
import { Bell, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function AlertsPanel({ alerts = [], loading = false }) {
  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const pendingAlerts = safeAlerts.filter(a => a.status === 'pending');
  const criticalCount = pendingAlerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
  const topAlerts = pendingAlerts.slice(0, 3);

  return (
    <CommandPanel
      title="Alerts & Tasks"
      icon={Bell}
      iconColor={criticalCount > 0 ? 'red' : pendingAlerts.length > 0 ? 'amber' : 'slate'}
      ctaLabel="Open Alerts"
      ctaPage="Alerts"
      lastUpdated="Live"
      loading={loading}
    >
      <div className="space-y-3">
        {/* Count Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${pendingAlerts.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {pendingAlerts.length}
            </span>
            <span className="text-xs text-slate-500">pending</span>
          </div>
          {criticalCount > 0 && (
            <Badge className="bg-red-100 text-red-700 text-[10px]">
              {criticalCount} critical
            </Badge>
          )}
        </div>

        {/* Top 3 Alerts */}
        <div className="space-y-1.5">
          {topAlerts.length > 0 ? topAlerts.map((alert, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-2 p-1.5 rounded text-xs ${
                alert.severity === 'critical' || alert.severity === 'high' 
                  ? 'bg-red-50' : 'bg-slate-50'
              }`}
            >
              <AlertTriangle className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                alert.severity === 'critical' || alert.severity === 'high'
                  ? 'text-red-500' : 'text-amber-500'
              }`} />
              <p className="text-slate-700 line-clamp-1">{alert.title || alert.message}</p>
            </div>
          )) : (
            <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded text-xs">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <p className="text-emerald-700">All clear — no pending alerts</p>
            </div>
          )}
        </div>
      </div>
    </CommandPanel>
  );
}