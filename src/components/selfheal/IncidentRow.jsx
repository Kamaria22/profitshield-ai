import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

const SEVERITY_CONFIG = {
  critical: { color: 'text-red-400', bg: 'border-red-500/20' },
  high: { color: 'text-orange-400', bg: 'border-orange-500/20' },
  medium: { color: 'text-amber-400', bg: 'border-amber-500/20' },
  low: { color: 'text-blue-400', bg: 'border-blue-500/20' },
  info: { color: 'text-slate-400', bg: 'border-slate-500/20' },
};

const FIX_ICONS = {
  auto: <Wrench className="w-3 h-3 text-emerald-400" />,
  manual: <CheckCircle className="w-3 h-3 text-blue-400" />,
  none: <XCircle className="w-3 h-3 text-slate-500" />,
  pending: <Clock className="w-3 h-3 text-amber-400" />,
  patch_required: <AlertTriangle className="w-3 h-3 text-violet-400" />,
};

export default function IncidentRow({ event, onAcknowledge }) {
  const cfg = SEVERITY_CONFIG[event.severity] || SEVERITY_CONFIG.info;
  const ago = event.detected_at ? formatDistanceToNow(new Date(event.detected_at), { addSuffix: true }) : '—';
  const fixedAgo = event.fixed_at ? formatDistanceToNow(new Date(event.fixed_at), { addSuffix: true }) : null;

  return (
    <div className={`rounded-lg border bg-slate-900/40 p-3 ${cfg.bg} ${event.acknowledged ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-bold uppercase ${cfg.color}`}>{event.severity}</span>
            <Badge className="text-xs bg-slate-700 text-slate-300 border-slate-600">{event.subsystem}</Badge>
            <span className="text-xs text-slate-500 font-mono">{event.issue_code}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {FIX_ICONS[event.fix_type] || FIX_ICONS.none}
            <span>{event.fix_type === 'auto' ? 'Auto-healed' : event.fix_type === 'patch_required' ? 'Patch required' : 'No auto-fix'}</span>
            {fixedAgo && <span className="text-emerald-500">· Fixed {fixedAgo}</span>}
            <span>· {ago}</span>
          </div>
          {event.details_json?.shop_domain && (
            <p className="text-xs text-slate-500 mt-1">Shop: {event.details_json.shop_domain}</p>
          )}
        </div>
        {!event.acknowledged && onAcknowledge && (
          <button
            onClick={() => onAcknowledge(event.id)}
            className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 border border-slate-600 whitespace-nowrap shrink-0"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}