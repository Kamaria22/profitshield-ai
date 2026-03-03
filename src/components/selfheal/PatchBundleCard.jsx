import React, { useState } from 'react';
import { CheckCircle, AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

const RISK_CONFIG = {
  LOW: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  HIGH: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
};

export default function PatchBundleCard({ patch, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const risk = RISK_CONFIG[patch.risk_score] || RISK_CONFIG.MEDIUM;
  const ago = patch.created_date ? formatDistanceToNow(new Date(patch.created_date), { addSuffix: true }) : '—';

  const handleApprove = async () => {
    setLoading(true);
    await onApprove(patch.id);
    setLoading(false);
  };
  const handleReject = async () => {
    setLoading(true);
    await onReject(patch.id);
    setLoading(false);
  };

  return (
    <div className={`rounded-xl border p-4 ${risk.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <AlertTriangle className={`w-4 h-4 ${risk.color}`} />
            <span className="font-semibold text-sm text-slate-100">Proposed Fix</span>
            <Badge className={`text-xs ${risk.color} bg-transparent border-current`}>{patch.risk_score} RISK</Badge>
            {patch.subsystem && <Badge className="text-xs bg-slate-700 text-slate-300 border-slate-600">{patch.subsystem}</Badge>}
          </div>
          <p className="text-sm text-slate-200 mb-1">{patch.summary}</p>
          <p className="text-xs text-slate-500">{ago}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm" variant="ghost"
            className="text-slate-400 p-1"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          {(patch.files_json || []).map((f, i) => (
            <div key={i} className="text-xs bg-slate-900/50 rounded p-2">
              <span className="text-indigo-400 font-mono">{f.path}</span>
              <span className="text-slate-500 ml-2">[{f.action}]</span>
              {f.description && <p className="text-slate-400 mt-1">{f.description}</p>}
            </div>
          ))}
          {patch.diff_json?.length > 0 && (
            <div className="text-xs text-slate-500 mt-2">
              {patch.diff_json.length} change(s) proposed
            </div>
          )}
        </div>
      )}

      {patch.status === 'proposed' && (
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            disabled={loading}
            onClick={handleApprove}
            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Approve Fix
          </Button>
          <Button
            size="sm" variant="outline"
            disabled={loading}
            onClick={handleReject}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Reject
          </Button>
        </div>
      )}
      {patch.status === 'approved' && (
        <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle className="w-3 h-3" /> Approved — apply code changes in the code editor
        </div>
      )}
    </div>
  );
}