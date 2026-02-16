import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, Sparkles, AlertTriangle, TrendingUp, TrendingDown, 
  ShieldAlert, DollarSign, Users, Package, Loader2, RefreshCw,
  CheckCircle, XCircle, Lightbulb, Target, ArrowRight
} from 'lucide-react';

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
    low: 'bg-blue-100 text-blue-700 border-blue-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    critical: 'bg-red-100 text-red-700 border-red-200'
  };

  const priorityColors = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-blue-100 text-blue-700'
  };

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50/50 to-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Brain className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                AI Order Analysis
                <Sparkles className="w-4 h-4 text-purple-500" />
              </CardTitle>
              <CardDescription>
                Pattern detection, anomaly identification, and actionable insights
              </CardDescription>
            </div>
          </div>
          <Button 
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || !orders?.length}
            className="bg-purple-600 hover:bg-purple-700"
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
      </CardHeader>

      <CardContent>
        {!analysis && !analyzeMutation.isPending && (
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-purple-200 mx-auto mb-3" />
            <p className="text-slate-500">Click "Analyze Orders" to get AI-powered insights</p>
            <p className="text-sm text-slate-400 mt-1">
              Analyzes {Math.min(orders?.length || 0, 100)} orders for patterns and anomalies
            </p>
          </div>
        )}

        {analysis && (
          <div className="space-y-6">
            {/* Summary & Health Score */}
            <div className="flex items-start gap-4 p-4 bg-white rounded-lg border">
              <div className="flex-shrink-0">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
                  analysis.health_score >= 70 ? 'bg-emerald-100 text-emerald-700' :
                  analysis.health_score >= 40 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {analysis.health_score}
                </div>
                <p className="text-xs text-center text-slate-500 mt-1">Health</p>
              </div>
              <div className="flex-1">
                <p className="text-slate-700">{analysis.summary}</p>
              </div>
            </div>

            {/* Patterns */}
            {analysis.patterns?.length > 0 && (
              <div>
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-600" />
                  Patterns Identified
                </h4>
                <div className="space-y-2">
                  {analysis.patterns.map((pattern, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg border">
                      {pattern.type === 'positive' ? (
                        <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" />
                      ) : pattern.type === 'negative' ? (
                        <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                      ) : (
                        <TrendingUp className="w-5 h-5 text-blue-500 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{pattern.title}</p>
                        <p className="text-sm text-slate-600">{pattern.description}</p>
                        {pattern.impact && (
                          <p className="text-xs text-slate-500 mt-1">Impact: {pattern.impact}</p>
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
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
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
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  Fraud Risk Indicators
                </h4>
                <div className="space-y-2">
                  {analysis.fraud_indicators.map((indicator, idx) => (
                    <div key={idx} className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-red-900">{indicator.indicator}</span>
                        <Badge className="bg-red-600">{indicator.risk_level} risk</Badge>
                      </div>
                      <p className="text-sm text-red-800">{indicator.explanation}</p>
                      {indicator.affected_orders?.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-red-700">Affected:</span>
                          {indicator.affected_orders.slice(0, 5).map((order, i) => (
                            <Badge key={i} variant="outline" className="text-xs border-red-300 text-red-700">
                              #{order}
                            </Badge>
                          ))}
                          {indicator.affected_orders.length > 5 && (
                            <span className="text-xs text-red-600">+{indicator.affected_orders.length - 5} more</span>
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
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                  Recommendations
                </h4>
                <div className="space-y-2">
                  {analysis.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg border">
                      <Badge className={priorityColors[rec.priority]}>{rec.priority}</Badge>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{rec.title}</p>
                        <p className="text-sm text-slate-600">{rec.description}</p>
                        {rec.estimated_impact && (
                          <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
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
                <h4 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  Customer Insights
                </h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {analysis.customer_insights.map((insight, idx) => (
                    <div key={idx} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-900 font-medium">{insight.insight}</p>
                      <p className="text-xs text-blue-700 mt-1">
                        <strong>Segment:</strong> {insight.segment}
                      </p>
                      <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
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
      </CardContent>
    </Card>
  );
}