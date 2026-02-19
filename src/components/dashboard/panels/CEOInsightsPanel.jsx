import React, { useState, useEffect } from 'react';
import { Sparkles, ChevronRight, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function CEOInsightsPanel({ tenantId, metrics = {} }) {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInsight, setSelectedInsight] = useState(null);

  // Extract primitive values from metrics to use as stable dependencies
  const totalProfit = typeof metrics?.totalProfit === 'number' ? metrics.totalProfit : 0;
  const avgMargin = typeof metrics?.avgMargin === 'number' ? metrics.avgMargin : 0;
  const highRiskOrders = typeof metrics?.highRiskOrders === 'number' ? metrics.highRiskOrders : 0;
  const negativeMarginOrders = typeof metrics?.negativeMarginOrders === 'number' ? metrics.negativeMarginOrders : 0;

  useEffect(() => {
    setLoading(true);
    
    // Generate quick executive insights
    const quickInsights = [];
    
    if (totalProfit > 0) {
      quickInsights.push({
        type: 'driver',
        label: 'Profit driver this week',
        summary: `Strong margins at ${avgMargin.toFixed(1)}%`,
        detail: `Your average margin of ${avgMargin.toFixed(1)}% is driving healthy profits. Top performing products are contributing most to this success.`
      });
    } else {
      quickInsights.push({
        type: 'concern',
        label: 'Profit concern',
        summary: 'Margins need attention',
        detail: 'Current margins are below target. Review pricing strategy and cost structure.'
      });
    }

    if (highRiskOrders > 0) {
      quickInsights.push({
        type: 'risk',
        label: 'Largest risk exposure',
        summary: `${highRiskOrders} high-risk orders flagged`,
        detail: `We've detected ${highRiskOrders} orders with elevated risk scores. These may need manual review before fulfillment.`
      });
    } else {
      quickInsights.push({
        type: 'positive',
        label: 'Risk status',
        summary: 'All orders within acceptable risk',
        detail: 'No high-risk orders detected. Your fraud prevention rules are working effectively.'
      });
    }

    quickInsights.push({
      type: 'action',
      label: 'Recommended action',
      summary: negativeMarginOrders > 0 
        ? `Review ${negativeMarginOrders} negative-margin orders`
        : 'Continue monitoring — operations healthy',
      detail: negativeMarginOrders > 0
        ? `There are ${negativeMarginOrders} orders with negative margins. Review pricing and shipping costs for these products.`
        : 'Your store is operating efficiently. Consider expanding marketing spend while margins are healthy.'
    });

    setInsights(quickInsights);
    setLoading(false);
  }, [tenantId, totalProfit, avgMargin, highRiskOrders, negativeMarginOrders]);

  const insightIcons = {
    driver: '📈',
    concern: '⚠️',
    risk: '🛡️',
    positive: '✅',
    action: '💡'
  };

  return (
    <>
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-0 text-white shadow-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-sm">CEO Insights</h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {insights.map((insight, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedInsight(insight)}
                  className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{insightIcons[insight.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                        {insight.label}
                      </p>
                      <p className="text-xs text-white/90 line-clamp-1">
                        {insight.summary}
                      </p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedInsight} onOpenChange={() => setSelectedInsight(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedInsight && insightIcons[selectedInsight.type]}
              {selectedInsight?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900 mb-2">{selectedInsight?.summary}</p>
            <p>{selectedInsight?.detail}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}