import React from 'react';
import { Lock, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import CommandPanel from '../CommandPanel';

export default function SecurityPanel({ loading }) {
  // In production, this would come from actual security scans
  const status = 'Healthy';
  const lastScan = 'Today, 4:32 AM';
  const anomaliesDetected = 0;

  return (
    <CommandPanel
      title="Security & Compliance"
      icon={Lock}
      iconColor={status === 'Healthy' ? 'violet' : 'red'}
      ctaLabel="Open Trust Center"
      ctaPage="SystemHealth"
      lastUpdated={lastScan}
      loading={loading}
    >
      <div className="space-y-3">
        {/* Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status === 'Healthy' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
            <div>
              <p className={`font-semibold ${status === 'Healthy' ? 'text-emerald-700' : 'text-amber-700'}`}>
                Data Fortress: {status}
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
            Active
          </Badge>
        </div>

        {/* Security Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-slate-50 rounded-lg p-2">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-slate-600">Last scan</span>
            </div>
            <p className="font-medium text-slate-800 mt-1">{lastScan}</p>
          </div>
          <div className={`rounded-lg p-2 ${anomaliesDetected > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
            <p className="text-slate-600">Anomalies</p>
            <p className={`font-semibold ${anomaliesDetected > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {anomaliesDetected} detected
            </p>
          </div>
        </div>

        {/* Compliance Badges */}
        <div className="flex gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px]">SOC2</Badge>
          <Badge variant="outline" className="text-[10px]">GDPR</Badge>
          <Badge variant="outline" className="text-[10px]">PCI-DSS</Badge>
        </div>
      </div>
    </CommandPanel>
  );
}