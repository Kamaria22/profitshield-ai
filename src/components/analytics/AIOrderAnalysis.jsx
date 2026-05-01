// @ts-nocheck
import React from 'react';
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommandCard, CommandCardContent, CommandCardDescription, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';

export default function AIOrderAnalysis({ orders, metrics, onOpenDetails }) {
  const flaggedOrders = React.useMemo(
    () =>
      (orders || []).filter(
        (order) =>
          Number(order?.fraud_score || 0) >= 70 ||
          order?.risk_level === 'high' ||
          Number(order?.net_profit || 0) < 0
      ),
    [orders]
  );

  const atRiskRefunds = React.useMemo(
    () => (orders || []).filter((order) => Number(order?.refund_amount || 0) > 0),
    [orders]
  );

  const summary = buildSummary(metrics, flaggedOrders.length, atRiskRefunds.length, orders.length);
  const hasIssue = summary.issue !== 'All systems operating normally.';

  return (
    <CommandCard className="border-cyan-400/20 bg-[linear-gradient(180deg,rgba(0,229,255,0.08),rgba(255,255,255,0.03))]">
      <CommandCardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-2">
              <Brain className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <CommandCardTitle>AI Profit Summary</CommandCardTitle>
              <CommandCardDescription>
                Fast interpretation of profit health, order risk, and the next action.
              </CommandCardDescription>
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            {orders.length} orders
          </div>
        </div>
      </CommandCardHeader>

      <CommandCardContent className="space-y-4">
        <div className="rounded-[12px] border border-white/10 bg-white/[0.03] p-4">
          <p className="text-base font-medium text-slate-100">{summary.headline}</p>
          <p className="mt-2 text-sm text-slate-300">{summary.explanation}</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryCell
              icon={hasIssue ? AlertTriangle : CheckCircle2}
              title="Primary Issue"
              value={summary.issue}
              tone={hasIssue ? 'warning' : 'healthy'}
            />
            <SummaryCell
              icon={hasIssue ? ShieldAlert : ArrowRight}
              title="Recommended Action"
              value={summary.action}
              tone="neutral"
            />
          </div>

          <Button
            type="button"
            onClick={onOpenDetails}
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            {summary.cta}
          </Button>
        </div>
      </CommandCardContent>
    </CommandCard>
  );
}

function SummaryCell({ icon: Icon, title, value, tone }) {
  const toneClass =
    tone === 'warning'
      ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
      : tone === 'healthy'
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
        : 'border-white/10 bg-white/[0.03] text-slate-200';

  return (
    <div className={`rounded-[12px] border p-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">{title}</p>
          <p className="mt-1 text-sm">{value}</p>
        </div>
      </div>
    </div>
  );
}

function buildSummary(metrics, flaggedCount, refundCount, orderCount) {
  const safeMargin = Number(metrics?.netMargin || 0);
  const safeProfit = Number(metrics?.netProfit || 0);

  if (orderCount <= 1) {
    return {
      headline: 'Early data only. The financial picture is still forming.',
      explanation: 'There is not enough order volume yet for a full trend read. Use the detailed breakdown only if you need to inspect the first orders.',
      issue: 'Low data volume limits confidence.',
      action: 'Wait for more order history before making major profit changes.',
      cta: 'View Detailed Breakdown'
    };
  }

  if (flaggedCount > 0) {
    return {
      headline: `Margin is ${safeMargin >= 15 ? 'holding' : 'under pressure'}, but ${flaggedCount} order${flaggedCount === 1 ? '' : 's'} require review.`,
      explanation: 'Profit performance is being offset by flagged or unprofitable orders that can change net results quickly if ignored.',
      issue: `${flaggedCount} flagged order${flaggedCount === 1 ? '' : 's'} need attention.`,
      action: 'Open the detailed breakdown and inspect the highest-risk orders first.',
      cta: 'Review Orders'
    };
  }

  if (safeProfit < 0 || safeMargin < 10) {
    return {
      headline: 'Profit is weak even though no urgent order risk is active.',
      explanation: 'The issue is more likely cost structure, pricing, or shipping efficiency than fraud or isolated order events.',
      issue: 'Net margin is below target.',
      action: 'Open the detailed breakdown and review costs before adjusting pricing or offers.',
      cta: 'Inspect Breakdown'
    };
  }

  if (refundCount > 0) {
    return {
      headline: 'Overall profit is healthy, but refunds are starting to erode margin.',
      explanation: 'Refund activity is not critical yet, but it is the main source of drag in the current period.',
      issue: `${refundCount} refunded order${refundCount === 1 ? '' : 's'} are reducing profit.`,
      action: 'Check the detailed breakdown and validate the refund trend before it compounds.',
      cta: 'Check Refund Impact'
    };
  }

  return {
    headline: 'All systems operating normally.',
    explanation: 'Revenue, margin, and order quality are aligned. There are no urgent profit risks in the current period.',
    issue: 'All systems operating normally.',
    action: 'Use the detailed breakdown only if you want to explore segments or investigate trend shifts.',
    cta: 'View Detailed Breakdown'
  };
}
