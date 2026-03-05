import React, { useMemo } from 'react';
import { AlertTriangle, Shield, TrendingDown, CreditCard, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';

const ICON_MAP = {
  high_risk_order: Shield,
  negative_margin: TrendingDown,
  shipping_loss: TrendingDown,
  chargeback_warning: CreditCard,
  return_spike: AlertTriangle,
  discount_abuse: AlertTriangle,
  system: Info,
};

const SEVERITY_STYLES = {
  critical: { border: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.08)', dot: '#ef4444', text: '#fca5a5' },
  high:     { border: 'rgba(251,191,36,0.3)', bg: 'rgba(251,191,36,0.08)', dot: '#f59e0b', text: '#fcd34d' },
  medium:   { border: 'rgba(99,102,241,0.25)', bg: 'rgba(99,102,241,0.06)', dot: '#6366f1', text: '#a5b4fc' },
  low:      { border: 'rgba(100,116,139,0.2)', bg: 'rgba(100,116,139,0.04)', dot: '#64748b', text: '#94a3b8' },
};

export default function AIAlerts({ alerts = [], loading = false }) {
  const visible = useMemo(() => alerts.slice(0, 5), [alerts]);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(15,20,40,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(239,68,68,0.15)',
        boxShadow: '0 0 30px rgba(239,68,68,0.05)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5"
        style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.08) 0%, transparent 100%)' }}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span className="text-sm font-semibold text-slate-200">AI Alerts</span>
          {alerts.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
              {alerts.length}
            </span>
          )}
        </div>
        <Link to={createPageUrl('Alerts')} className="text-xs text-slate-500 hover:text-indigo-400 transition-colors">
          View all →
        </Link>
      </div>

      <div className="p-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
          ))
        ) : visible.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-slate-500">No active alerts — all systems clear</span>
          </div>
        ) : (
          visible.map((alert, i) => {
            const styles = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low;
            const Icon = ICON_MAP[alert.type] || AlertTriangle;
            return (
              <div key={alert.id || i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all"
                style={{ background: styles.bg, border: `1px solid ${styles.border}` }}>
                <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: styles.dot }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: styles.text }}>{alert.title}</p>
                  {alert.message && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{alert.message}</p>
                  )}
                </div>
                <span className="ml-auto text-xs capitalize flex-shrink-0 px-1.5 py-0.5 rounded"
                  style={{ background: styles.bg, color: styles.text, border: `1px solid ${styles.border}` }}>
                  {alert.severity}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}