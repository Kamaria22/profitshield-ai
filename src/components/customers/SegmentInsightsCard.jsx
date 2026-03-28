import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Gift } from 'lucide-react';
import { CommandCard, CommandCardContent, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';

export default function SegmentInsightsCard({ segment, customers }) {
  if (!customers?.length) return null;

  const insights = [];
  const avgOrderValue = customers.reduce((sum, c) => sum + (c.avg_order_value || 0), 0) / customers.length;
  const avgProfit = customers.reduce((sum, c) => sum + (c.total_profit || 0), 0) / customers.length;
  const highRiskCount = customers.filter(c => c.risk_profile === 'high').length;
  const refundRate = customers.reduce((sum, c) => sum + (c.refund_count || 0), 0) / Math.max(customers.reduce((sum, c) => sum + (c.total_orders || 0), 0), 1);

  // Generate insights based on segment data
  if (avgProfit > 100) {
    insights.push({
      type: 'positive',
      icon: TrendingUp,
      title: 'High Value Segment',
      description: `Average profit of $${avgProfit.toFixed(0)} per customer. Consider loyalty rewards.`,
      action: 'Offer exclusive discounts'
    });
  }

  if (avgProfit < 0) {
    insights.push({
      type: 'negative',
      icon: TrendingDown,
      title: 'Unprofitable Segment',
      description: `This segment has negative average profit. Review pricing or shipping costs.`,
      action: 'Review cost structure'
    });
  }

  if (highRiskCount > customers.length * 0.3) {
    insights.push({
      type: 'warning',
      icon: AlertTriangle,
      title: 'High Risk Concentration',
      description: `${((highRiskCount / customers.length) * 100).toFixed(0)}% of customers are high-risk. Consider verification steps.`,
      action: 'Enable order verification'
    });
  }

  if (refundRate > 0.15) {
    insights.push({
      type: 'warning',
      icon: AlertTriangle,
      title: 'High Refund Rate',
      description: `${(refundRate * 100).toFixed(1)}% refund rate. Investigate product quality or expectations.`,
      action: 'Review return reasons'
    });
  }

  if (avgOrderValue > 200 && customers.length > 5) {
    insights.push({
      type: 'positive',
      icon: Gift,
      title: 'Premium Buyers',
      description: `Average order value of $${avgOrderValue.toFixed(0)}. Great candidates for upsells.`,
      action: 'Create VIP program'
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: 'neutral',
      icon: Lightbulb,
      title: 'Segment Performance',
      description: 'This segment shows typical behavior. Monitor for changes.',
      action: 'Set up alerts'
    });
  }

  const typeColors = {
    positive: 'border-emerald-500/20 bg-emerald-500/10',
    negative: 'border-red-500/20 bg-red-500/10',
    warning: 'border-amber-500/20 bg-amber-500/10',
    neutral: 'border-white/10 bg-white/[0.03]'
  };

  const iconColors = {
    positive: 'text-emerald-300',
    negative: 'text-red-300',
    warning: 'text-amber-300',
    neutral: 'text-slate-300'
  };

  return (
    <CommandCard>
      <CommandCardHeader className="pb-3">
        <CommandCardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-300" />
          Segment Insights
        </CommandCardTitle>
      </CommandCardHeader>
      <CommandCardContent className="space-y-3">
        {insights.map((insight, idx) => {
          const Icon = insight.icon;
          return (
            <div key={idx} className={`p-3 rounded-lg border ${typeColors[insight.type]}`}>
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 ${iconColors[insight.type]}`} />
                <div className="flex-1">
                  <p className="font-medium text-slate-100">{insight.title}</p>
                  <p className="mt-0.5 text-sm text-slate-300">{insight.description}</p>
                  <Badge variant="outline" className="mt-2 border-white/10 text-xs text-slate-300">
                    Suggested: {insight.action}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </CommandCardContent>
    </CommandCard>
  );
}
