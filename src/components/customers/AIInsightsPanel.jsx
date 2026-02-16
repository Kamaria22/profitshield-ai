import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, Mail, Tag, AlertTriangle, TrendingUp, 
  Loader2, RefreshCw, Target, Shield, Copy, Check
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

const churnColors = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700'
};

export default function AIInsightsPanel({ segment, customers }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const generateAnalysis = async () => {
    if (!customers?.length) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const now = new Date();
      const avgDaysSinceOrder = customers.reduce((sum, c) => {
        if (!c.last_order_date) return sum;
        const days = Math.floor((now - new Date(c.last_order_date)) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0) / customers.length;

      const summary = {
        segment_name: segment?.name || 'All Customers',
        total_customers: customers.length,
        avg_order_value: customers.reduce((s, c) => s + (c.avg_order_value || 0), 0) / customers.length,
        avg_total_spent: customers.reduce((s, c) => s + (c.total_spent || 0), 0) / customers.length,
        avg_profit: customers.reduce((s, c) => s + (c.total_profit || 0), 0) / customers.length,
        high_risk_count: customers.filter(c => c.risk_profile === 'high').length,
        high_risk_pct: (customers.filter(c => c.risk_profile === 'high').length / customers.length) * 100,
        avg_orders: customers.reduce((s, c) => s + (c.total_orders || 0), 0) / customers.length,
        refund_rate: customers.reduce((s, c) => s + (c.refund_count || 0), 0) / 
          Math.max(customers.reduce((s, c) => s + (c.total_orders || 0), 0), 1),
        avg_days_since_order: Math.round(avgDaysSinceOrder) || null
      };

      const result = await base44.functions.invoke('analyzeSegment', {
        segment_id: segment?.id || 'all',
        customers_summary: summary
      });

      if (result.data?.success) {
        setAnalysis(result.data.analysis);
      } else {
        setError(result.data?.error || 'Analysis failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!customers?.length) {
    return null;
  }

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-purple-50/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            AI-Powered Insights
          </CardTitle>
          <Button 
            size="sm" 
            onClick={generateAnalysis} 
            disabled={loading}
            variant={analysis ? "outline" : "default"}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : analysis ? (
              <RefreshCw className="w-4 h-4 mr-2" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {loading ? 'Analyzing...' : analysis ? 'Refresh' : 'Generate Insights'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {!analysis && !loading && !error && (
          <p className="text-sm text-slate-500 text-center py-4">
            Click "Generate Insights" to get AI-powered marketing recommendations, 
            churn predictions, and upsell opportunities for this segment.
          </p>
        )}

        {analysis && (
          <Tabs defaultValue="campaigns" className="mt-2">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="campaigns" className="text-xs">
                <Mail className="w-3 h-3 mr-1" /> Campaigns
              </TabsTrigger>
              <TabsTrigger value="churn" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" /> Churn
              </TabsTrigger>
              <TabsTrigger value="retention" className="text-xs">
                <Shield className="w-3 h-3 mr-1" /> Retain
              </TabsTrigger>
              <TabsTrigger value="upsell" className="text-xs">
                <TrendingUp className="w-3 h-3 mr-1" /> Upsell
              </TabsTrigger>
            </TabsList>

            {/* Email Campaigns Tab */}
            <TabsContent value="campaigns" className="space-y-3 mt-3">
              <div className="p-3 bg-white rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-indigo-500" />
                  <span className="font-medium text-sm">Recommended Offer</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {analysis.discount_strategy?.offer_type}: {analysis.discount_strategy?.discount_amount}
                </p>
                <p className="text-xs text-slate-500 mt-1">{analysis.discount_strategy?.conditions}</p>
                <p className="text-xs text-slate-600 mt-2 italic">{analysis.discount_strategy?.reasoning}</p>
              </div>

              {analysis.email_campaigns?.map((campaign, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">"{campaign.subject_line}"</p>
                      <p className="text-xs text-slate-600 mt-1">{campaign.description}</p>
                      <div className="flex gap-3 mt-2">
                        <span className="text-xs text-slate-500">
                          Best time: {campaign.best_send_time}
                        </span>
                        <span className="text-xs text-emerald-600">
                          Expected: {campaign.expected_open_rate}
                        </span>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(campaign.subject_line, idx)}
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* Churn Analysis Tab */}
            <TabsContent value="churn" className="mt-3">
              <div className="p-4 bg-white rounded-lg border">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium">Churn Risk Level</span>
                  <Badge className={churnColors[analysis.churn_analysis?.risk_level?.toLowerCase()] || churnColors.medium}>
                    {analysis.churn_analysis?.risk_level}
                  </Badge>
                </div>
                
                <div className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-500">Risk Score</span>
                    <span className="font-medium">{analysis.churn_analysis?.risk_score}/10</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        analysis.churn_analysis?.risk_score <= 3 ? 'bg-emerald-500' :
                        analysis.churn_analysis?.risk_score <= 6 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${(analysis.churn_analysis?.risk_score || 0) * 10}%` }}
                    />
                  </div>
                </div>

                <p className="text-sm text-slate-600 mb-3">{analysis.churn_analysis?.reasoning}</p>

                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Key Indicators:</p>
                  <div className="flex flex-wrap gap-1">
                    {analysis.churn_analysis?.key_indicators?.map((indicator, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {indicator}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Retention Strategies Tab */}
            <TabsContent value="retention" className="space-y-3 mt-3">
              {analysis.retention_strategies?.map((strategy, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border">
                  <p className="text-sm font-medium text-slate-900">{strategy.strategy}</p>
                  <p className="text-xs text-slate-600 mt-1">{strategy.implementation}</p>
                  <Badge variant="outline" className="mt-2 text-xs text-emerald-600">
                    Impact: {strategy.expected_impact}
                  </Badge>
                </div>
              ))}
            </TabsContent>

            {/* Upsell Opportunities Tab */}
            <TabsContent value="upsell" className="space-y-3 mt-3">
              {analysis.upsell_opportunities?.map((opp, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border">
                  <div className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-indigo-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{opp.opportunity}</p>
                      <p className="text-xs text-slate-600 mt-1">{opp.approach}</p>
                      <p className="text-xs text-emerald-600 mt-1 font-medium">
                        Potential: {opp.potential_revenue_increase}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}

        {analysis && (
          <div className="mt-4 pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Segment Health:</span>
              <div className="flex items-center gap-1">
                {[...Array(10)].map((_, i) => (
                  <div 
                    key={i}
                    className={`w-2 h-4 rounded-sm ${
                      i < (analysis.segment_health_score || 0) 
                        ? analysis.segment_health_score >= 7 ? 'bg-emerald-500' 
                          : analysis.segment_health_score >= 4 ? 'bg-amber-500' : 'bg-red-500'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
                <span className="ml-1 text-sm font-bold">{analysis.segment_health_score}/10</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}