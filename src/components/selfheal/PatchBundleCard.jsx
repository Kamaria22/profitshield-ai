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
  const normalizedRisk = String(patch.risk_score || patch.severity || 'MEDIUM').toUpperCase();
  const risk = RISK_CONFIG[normalizedRisk] || RISK_CONFIG.MEDIUM;
  const ago = patch.created_date ? formatDistanceToNow(new Date(patch.created_date), { addSuffix: true }) : '—';
  const summary = patch.summary || patch.title || patch.details?.incident_summary || 'Patch proposal generated from incident signals.';
  const fileList = Array.isArray(patch.files_json) && patch.files_json.length > 0
    ? patch.files_json
    : (patch.details?.files_json || []);
  const diffList = Array.isArray(patch.diff_json) ? patch.diff_json : (patch.details?.diff_json || []);

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
            <span className="font-semibold text-sm text-slate-100">Patch Proposal</span>
            <Badge className={`text-xs ${risk.color} bg-transparent border-current`}>{normalizedRisk} RISK</Badge>
            {patch.subsystem && <Badge className="text-xs bg-slate-700 text-slate-300 border-slate-600">{patch.subsystem}</Badge>}
          </div>
          <p className="text-sm text-slate-200 mb-1">{summary}</p>
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
          {fileList.map((f, i) => (
            <div key={i} className="text-xs bg-slate-900/50 rounded p-2">
              <span className="text-indigo-400 font-mono">{f.path}</span>
              <span className="text-slate-500 ml-2">[{f.action}]</span>
              {f.description && <p className="text-slate-400 mt-1">{f.description}</p>}
            </div>
          ))}
          {diffList?.length > 0 && (
            <div className="text-xs text-slate-500 mt-2">
              {diffList.length} change(s) proposed
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
            Approve Proposal
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
          <CheckCircle className="w-3 h-3" /> Approved — manual application required in code workflow
        </div>
      )}
    </div>
  );
}
