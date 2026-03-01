import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, TrendingDown, AlertTriangle, ShieldAlert, ChevronRight, Zap, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';

function ConfidenceBar({ value }) {
  const color = value >= 80 ? '#34d399' : value >= 60 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[10px] font-medium" style={{ color }}>{value}%</span>
    </div>
  );
}

function InsightCard({ insight, onDismiss }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const iconMap = {
    revenue: TrendingDown,
    refund: AlertTriangle,
    margin: TrendingDown,
    risk: ShieldAlert,
    chargeback: ShieldAlert,
  };
  const colorMap = {
    revenue: { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', icon: '#f87171', glow: 'rgba(248,113,113,0.3)' },
    refund:  { bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)',  icon: '#fbbf24', glow: 'rgba(251,191,36,0.3)' },
    margin:  { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', icon: '#f87171', glow: 'rgba(248,113,113,0.3)' },
    risk:    { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)', icon: '#a78bfa', glow: 'rgba(167,139,250,0.3)' },
    chargeback: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', icon: '#fbbf24', glow: 'rgba(251,191,36,0.3)' },
  };

  const Icon = iconMap[insight.type] || Brain;
  const colors = colorMap[insight.type] || colorMap.risk;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0 }}
      className="rounded-xl border p-3 cursor-pointer transition-all duration-200"
      style={{ background: colors.bg, borderColor: colors.border }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: `${colors.bg}`, border: `1px solid ${colors.border}`, boxShadow: `0 0 10px ${colors.glow}` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: colors.icon }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-xs font-semibold text-slate-200 leading-tight">{insight.title}</p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {insight.impact && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(248,113,113,0.15)', color: '#fca5a5' }}>
                  {insight.impact}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDismiss(insight.id); }}
                className="text-slate-600 hover:text-slate-400 transition-colors p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 line-clamp-1">{insight.description}</p>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-slate-300">{insight.detail}</p>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Confidence</p>
                    <ConfidenceBar value={insight.confidence} />
                  </div>
                  {insight.action && (
                    <Button
                      size="sm"
                      className="w-full text-xs h-7 mt-1 border-0"
                      style={{
                        background: `linear-gradient(135deg, ${colors.border}, ${colors.bg})`,
                        color: colors.icon,
                        border: `1px solid ${colors.border}`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (insight.actionPage) navigate(createPageUrl(insight.actionPage));
                      }}
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      {insight.action}
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <ChevronRight className={`w-3 h-3 text-slate-600 flex-shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
      </div>
    </motion.div>
  );
}

export default function AutonomousInsightEngine({ metrics = {}, alerts = [], profitLeaks = [] }) {
  const [dismissed, setDismissed] = useState(new Set());

  const insights = useMemo(() => {
    const result = [];
    const { totalRevenue, avgMargin, highRiskOrders, totalOrders, pendingAlerts } = metrics;

    if (pendingAlerts > 3) {
      result.push({
        id: 'alerts-spike',
        type: 'risk',
        title: `${pendingAlerts} unresolved alerts detected`,
        description: 'Alert backlog is growing — risk accumulation accelerating.',
        detail: 'Unresolved alerts compound operational risk. Each pending alert represents a potential profit leak or fraud event that has not been actioned.',
        confidence: 94,
        impact: `-$${(pendingAlerts * 120).toLocaleString()}`,
        action: 'Review Alerts',
        actionPage: 'Alerts',
      });
    }

    if (avgMargin < 15 && avgMargin >= 0) {
      result.push({
        id: 'margin-erosion',
        type: 'margin',
        title: `Margin erosion at ${avgMargin.toFixed(1)}%`,
        description: 'Profit margin is below the 15% healthy threshold.',
        detail: `Current margin of ${avgMargin.toFixed(1)}% is below the recommended 15% floor. Review product pricing, shipping costs, and discount strategies.`,
        confidence: 88,
        impact: 'Margin risk',
        action: 'Open P&L Analytics',
        actionPage: 'PnLAnalytics',
      });
    }

    if (highRiskOrders > 2) {
      result.push({
        id: 'high-risk-cluster',
        type: 'risk',
        title: `${highRiskOrders} high-risk orders in window`,
        description: 'Fraud risk cluster forming — chargeback probability elevated.',
        detail: `${highRiskOrders} orders with risk score > 70 detected. This cluster may indicate coordinated fraud activity. Review before fulfillment.`,
        confidence: 91,
        impact: `-$${(highRiskOrders * 85).toLocaleString()}`,
        action: 'Open Risk Intelligence',
        actionPage: 'Intelligence',
      });
    }

    if (profitLeaks.length > 0) {
      const totalLeakImpact = profitLeaks.reduce((s, l) => s + (l.impact_amount || 0), 0);
      result.push({
        id: 'profit-leak',
        type: 'margin',
        title: `${profitLeaks.length} active profit leak${profitLeaks.length > 1 ? 's' : ''} detected`,
        description: `Unresolved leaks draining ${totalLeakImpact > 0 ? `$${totalLeakImpact.toFixed(0)}` : 'revenue'} from margins.`,
        detail: 'Profit leaks are systematic inefficiencies that erode margins over time. Common causes: oversized packaging, discount abuse, return fraud, and shipping overcharges.',
        confidence: 86,
        impact: totalLeakImpact > 0 ? `-$${totalLeakImpact.toFixed(0)}` : null,
        action: 'Open P&L Analytics',
        actionPage: 'PnLAnalytics',
      });
    }

    if (totalOrders < 5 && totalRevenue === 0) {
      result.push({
        id: 'no-data',
        type: 'revenue',
        title: 'Connect store for live intelligence',
        description: 'No order data detected — AI insight engine is in standby.',
        detail: 'Connect your Shopify, WooCommerce, or other store to activate real-time anomaly detection, profit forecasting, and autonomous alerts.',
        confidence: 99,
        impact: null,
        action: 'Connect Store',
        actionPage: 'Integrations',
      });
    }

    if (result.length === 0) {
      result.push({
        id: 'all-clear',
        type: 'risk',
        title: 'All systems nominal',
        description: 'No anomalies detected in current observation window.',
        detail: 'Profit health, risk levels, and margin stability are all within acceptable ranges. Continue monitoring.',
        confidence: 97,
        impact: null,
        action: null,
      });
    }

    return result;
  }, [metrics, alerts, profitLeaks]);

  const visible = insights.filter(i => !dismissed.has(i.id));
  const handleDismiss = (id) => setDismissed(d => new Set([...d, id]));

  return (
    <div className="glass-card rounded-2xl p-4 glow-violet">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center"
            style={{ boxShadow: '0 0 12px rgba(139,92,246,0.5)' }}>
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-slate-200">Autonomous Insight Engine</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] text-slate-500">Live</span>
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {visible.map(insight => (
            <InsightCard key={insight.id} insight={insight} onDismiss={handleDismiss} />
          ))}
        </AnimatePresence>
        {visible.length === 0 && (
          <div className="text-center py-6 text-slate-600 text-xs">All insights dismissed</div>
        )}
      </div>
    </div>
  );
}