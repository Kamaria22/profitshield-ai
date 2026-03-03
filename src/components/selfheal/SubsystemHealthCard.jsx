import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STATUS_CONFIG = {
  healthy: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Healthy' },
  degraded: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Degraded' },
  critical: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Critical' },
  unknown: { icon: Loader2, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', label: 'Checking...' },
};

export default function SubsystemHealthCard({ name, status = 'unknown', detail, metrics = [], onHeal, healing = false }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-xl border p-4 ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${cfg.color} ${status === 'unknown' ? 'animate-spin' : ''}`} />
          <span className="font-semibold text-sm text-slate-100">{name}</span>
        </div>
        <Badge className={`text-xs ${
          status === 'healthy' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
          status === 'degraded' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
          status === 'critical' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
          'bg-slate-500/20 text-slate-300 border-slate-500/30'
        }`}>{cfg.label}</Badge>
      </div>
      {detail && <p className="text-xs text-slate-400 mb-2">{detail}</p>}
      {metrics.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-2">
          {metrics.map((m, i) => (
            <span key={i}><span className="text-slate-400">{m.label}:</span> {m.value}</span>
          ))}
        </div>
      )}
      {onHeal && status !== 'healthy' && (
        <button
          onClick={onHeal}
          disabled={healing}
          className="mt-1 text-xs px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 transition-colors disabled:opacity-50"
        >
          {healing ? 'Healing...' : 'Auto-Heal'}
        </button>
      )}
    </div>
  );
}