import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Gift, Mail } from 'lucide-react';

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
    positive: 'border-emerald-200 bg-emerald-50',
    negative: 'border-red-200 bg-red-50',
    warning: 'border-amber-200 bg-amber-50',
    neutral: 'border-slate-200 bg-slate-50'
  };

  const iconColors = {
    positive: 'text-emerald-600',
    negative: 'text-red-600',
    warning: 'text-amber-600',
    neutral: 'text-slate-600'
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          Segment Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight, idx) => {
          const Icon = insight.icon;
          return (
            <div key={idx} className={`p-3 rounded-lg border ${typeColors[insight.type]}`}>
              <div className="flex items-start gap-3">
                <Icon className={`w-5 h-5 mt-0.5 ${iconColors[insight.type]}`} />
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{insight.title}</p>
                  <p className="text-sm text-slate-600 mt-0.5">{insight.description}</p>
                  <Badge variant="outline" className="mt-2 text-xs">
                    Suggested: {insight.action}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}