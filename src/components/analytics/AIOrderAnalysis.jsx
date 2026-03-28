import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, Sparkles, AlertTriangle, TrendingUp, TrendingDown, 
  ShieldAlert, Users, Loader2,
  CheckCircle, XCircle, Lightbulb, Target, ArrowRight
} from 'lucide-react';
import { CommandCard, CommandCardContent, CommandCardHeader, CommandCardTitle } from '@/components/ui/command-card';

export default function AIOrderAnalysis({ orders, metrics, onHighlightOrders }) {
  const [analysis, setAnalysis] = useState(null);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      // Prepare order summary for AI analysis
      const orderSummary = orders.slice(0, 100).map(o => ({
        id: o.id,
        order_number: o.order_number,
        revenue: o.total_revenue,
        cogs: o.total_cogs,
        profit: o.net_profit,
        margin: o.total_revenue > 0 ? ((o.net_profit || 0) / o.total_revenue * 100).toFixed(1) : 0,
        customer: o.customer_email,
        is_first_order: o.is_first_order,
        discount_total: o.discount_total,
        shipping_charged: o.shipping_charged,
        shipping_cost: o.shipping_cost,
        risk_score: o.fraud_score,
        risk_level: o.risk_level,
        status: o.status,
        tags: o.tags,
        order_date: o.order_date
      }));

      const prompt = `Analyze this e-commerce order data and provide insights in JSON format.

ORDER DATA (${orders.length} total orders, showing sample):
${JSON.stringify(orderSummary.slice(0, 50), null, 2)}

AGGREGATE METRICS:
- Total Revenue: $${metrics?.totalRevenue?.toFixed(2) || 0}
- Gross Profit: $${metrics?.grossProfit?.toFixed(2) || 0}
- Net Profit: $${metrics?.netProfit?.toFixed(2) || 0}
- Average Order Value: $${metrics?.aov?.toFixed(2) || 0}
- Total Orders: ${orders.length}
- Profitable Orders: ${orders.filter(o => (o.net_profit || 0) > 0).length}
- Unprofitable Orders: ${orders.filter(o => (o.net_profit || 0) <= 0).length}

Provide analysis with:
1. Key patterns identified (positive and negative)
2. Anomalies or suspicious orders that need attention
3. Fraud risk indicators found
4. Actionable recommendations to improve profitability
5. Customer behavior insights

Be specific with order numbers when flagging issues.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Brief executive summary" },
            health_score: { type: "number", description: "Overall health score 0-100" },
            patterns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["positive", "negative", "neutral"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  impact: { type: "string" }
                }
              }
            },
            anomalies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  order_number: { type: "string" },
                  issue: { type: "string" },
                  severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                  recommendation: { type: "string" }
                }
              }
            },
            fraud_indicators: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  indicator: { type: "string" },
                  affected_orders: { type: "array", items: { type: "string" } },
                  risk_level: { type: "string" },
                  explanation: { type: "string" }
                }
              }
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  estimated_impact: { type: "string" }
                }
              }
            },
            customer_insights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  insight: { type: "string" },
                  segment: { type: "string" },
                  action: { type: "string" }
                }
              }
            }
          }
        }
      });

      return result;
    },
    onSuccess: (data) => setAnalysis(data)
  });

  const severityColors = {
    low: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    medium: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    high: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
    critical: 'bg-red-500/10 text-red-300 border-red-500/20'
  };

  const priorityColors = {
    high: 'bg-red-500/10 text-red-300',
    medium: 'bg-amber-500/10 text-amber-300',
    low: 'bg-blue-500/10 text-blue-300'
  };

  return (
    <CommandCard>
      <CommandCardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
              <Brain className="w-5 h-5 text-[#00E5FF]" />
            </div>
            <div>
              <CommandCardTitle className="flex items-center gap-2">
                AI Order Analysis
                <Sparkles className="w-4 h-4 text-[#00E5FF]" />
              </CommandCardTitle>
              <CommandCardDescription>
                Pattern detection, anomaly identification, and actionable insights
              </CommandCardDescription>
            </div>
          </div>
          <Button 
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || !orders?.length}
            className="border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                {analysis ? 'Re-analyze' : 'Analyze Orders'}
              </>
            )}
          </Button>
        </div>
      </CommandCardHeader>

      <CommandCardContent>
        {!analysis && !analyzeMutation.isPending && (
          <div className="text-center py-8">
            <Brain className="mx-auto mb-3 h-12 w-12 text-slate-500" />
            <p className="text-slate-300">Click "Analyze Orders" to get AI-powered insights</p>
            <p className="mt-1 text-sm text-slate-400">
              Analyzes {Math.min(orders?.length || 0, 100)} orders for patterns and anomalies
            </p>
          </div>
        )}

        {analysis && (
          <div className="space-y-4">
            {/* Summary & Health Score */}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
                  analysis.health_score >= 70 ? 'bg-emerald-500/10 text-emerald-300' :
                  analysis.health_score >= 40 ? 'bg-amber-500/10 text-amber-300' :
                  'bg-red-500/10 text-red-300'
                }`}>
                  {analysis.health_score}
                </div>
                <p className="mt-1 text-center text-xs text-slate-500">Health</p>
              </div>
              <div className="flex-1">
                <p className="text-slate-300">{analysis.summary}</p>
              </div>
              </div>
            </div>

            {/* Patterns */}
            {analysis.patterns?.length > 0 && (
              <div>
                <h4 className="mb-3 flex items-center gap-2 font-medium text-slate-100">
                  <Target className="w-4 h-4 text-[#00E5FF]" />
                  Patterns Identified
                </h4>
                <div className="space-y-2">
                  {analysis.patterns.map((pattern, idx) => (
                    <div key={idx} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      {pattern.type === 'positive' ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                      ) : pattern.type === 'negative' ? (
                        <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                      ) : (
                        <TrendingUp className="w-5 h-5 text-blue-500 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-slate-100">{pattern.title}</p>
                        <p className="text-sm text-slate-300">{pattern.description}</p>
                        {pattern.impact && (
                          <p className="mt-1 text-xs text-slate-500">Impact: {pattern.impact}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Anomalies */}
            {analysis.anomalies?.length > 0 && (
              <div>
                <h4 className="mb-3 flex items-center gap-2 font-medium text-slate-100">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Anomalies Detected ({analysis.anomalies.length})
                </h4>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {analysis.anomalies.map((anomaly, idx) => (
                      <div key={idx} className={`p-3 rounded-lg border ${severityColors[anomaly.severity]}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">Order #{anomaly.order_number}</span>
                          <Badge variant="outline" className={severityColors[anomaly.severity]}>
                            {anomaly.severity}
                          </Badge>
                        </div>
                        <p className="text-sm">{anomaly.issue}</p>
                        <p className="text-xs mt-1 opacity-80">
                          <strong>Action:</strong> {anomaly.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Fraud Indicators */}
            {analysis.fraud_indicators?.length > 0 && (
              <div>
                <h4 className="mb-3 flex items-center gap-2 font-medium text-slate-100">
                  <ShieldAlert className="w-4 h-4 text-red-300" />
                  Fraud Risk Indicators
                </h4>
                <div className="space-y-2">
                  {analysis.fraud_indicators.map((indicator, idx) => (
                    <div key={idx} className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-red-200">{indicator.indicator}</span>
                        <Badge className="bg-red-500/80">{indicator.risk_level} risk</Badge>
                      </div>
                      <p className="text-sm text-red-200">{indicator.explanation}</p>
                      {indicator.affected_orders?.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-red-300">Affected:</span>
                          {indicator.affected_orders.slice(0, 5).map((order, i) => (
                            <Badge key={i} variant="outline" className="border-red-500/20 text-xs text-red-200">
                              #{order}
                            </Badge>
                          ))}
                          {indicator.affected_orders.length > 5 && (
                            <span className="text-xs text-red-300">+{indicator.affected_orders.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {analysis.recommendations?.length > 0 && (
              <div>
                <h4 className="mb-3 flex items-center gap-2 font-medium text-slate-100">
                  <Lightbulb className="w-4 h-4 text-amber-300" />
                  Recommendations
                </h4>
                <div className="space-y-2">
                  {analysis.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <Badge className={priorityColors[rec.priority]}>{rec.priority}</Badge>
                      <div className="flex-1">
                        <p className="font-medium text-slate-100">{rec.title}</p>
                        <p className="text-sm text-slate-300">{rec.description}</p>
                        {rec.estimated_impact && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-emerald-300">
                            <TrendingUp className="w-3 h-3" />
                            {rec.estimated_impact}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Customer Insights */}
            {analysis.customer_insights?.length > 0 && (
              <div>
                <h4 className="mb-3 flex items-center gap-2 font-medium text-slate-100">
                  <Users className="w-4 h-4 text-blue-300" />
                  Customer Insights
                </h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {analysis.customer_insights.map((insight, idx) => (
                    <div key={idx} className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                      <p className="text-sm font-medium text-blue-100">{insight.insight}</p>
                      <p className="mt-1 text-xs text-blue-200">
                        <strong>Segment:</strong> {insight.segment}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-blue-300">
                        <ArrowRight className="w-3 h-3" />
                        {insight.action}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CommandCardContent>
    </CommandCard>
  );
}
