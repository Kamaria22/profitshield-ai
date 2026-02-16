import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Shield
} from 'lucide-react';

export default function RiskScoreExplainer({ orderId, tenantId, initialScore }) {
  const [expanded, setExpanded] = useState(false);

  const { data: explanation, isLoading } = useQuery({
    queryKey: ['riskExplanation', orderId],
    queryFn: async () => {
      const result = await base44.functions.invoke('globalRiskBrain', {
        action: 'explain_score',
        order_id: orderId,
        tenant_id: tenantId
      });
      return result.data;
    },
    enabled: expanded && !!orderId
  });

  const score = explanation?.score ?? initialScore ?? 0;
  const riskLevel = explanation?.risk_level || (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');

  const riskColors = {
    low: { bg: 'bg-emerald-500', text: 'text-emerald-700', light: 'bg-emerald-50' },
    medium: { bg: 'bg-yellow-500', text: 'text-yellow-700', light: 'bg-yellow-50' },
    high: { bg: 'bg-red-500', text: 'text-red-700', light: 'bg-red-50' }
  };

  const colors = riskColors[riskLevel];

  return (
    <Card className="overflow-hidden">
      <CardHeader className={`${colors.light} pb-3`}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className={`w-5 h-5 ${colors.text}`} />
            AI Risk Analysis
          </CardTitle>
          <Badge className={`${colors.bg} text-white`}>
            {score}/100
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Risk Score Visual */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Risk Score</span>
            <span className={`text-sm font-medium ${colors.text} capitalize`}>{riskLevel} Risk</span>
          </div>
          <div className="relative">
            <Progress value={score} className="h-3" />
            <div className="absolute top-0 left-0 h-3 w-full flex">
              <div className="w-[40%] border-r border-white/50" />
              <div className="w-[30%] border-r border-white/50" />
              <div className="w-[30%]" />
            </div>
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-400">
            <span>Low (0-39)</span>
            <span>Medium (40-69)</span>
            <span>High (70+)</span>
          </div>
        </div>

        {/* Confidence Interval */}
        {explanation?.confidence && (
          <div className="mb-4 p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600">
                Confidence: {Math.round(explanation.confidence.confidence * 100)}%
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3 h-3 text-slate-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Score range: {explanation.confidence.lower} - {explanation.confidence.upper}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        {/* Expand Button */}
        <Button 
          variant="ghost" 
          className="w-full justify-between"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            {expanded ? 'Hide' : 'Show'} Score Breakdown
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>

        {/* Expanded Details */}
        {expanded && (
          <div className="mt-4 space-y-4">
            {isLoading ? (
              <div className="text-center py-4 text-slate-500">Loading analysis...</div>
            ) : (
              <>
                {/* Top Contributing Factors */}
                {explanation?.top_factors?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Contributing Factors</h4>
                    <div className="space-y-2">
                      {explanation.top_factors.map((factor, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                          <div className="flex items-center gap-2">
                            {factor.contribution > 0 ? (
                              <TrendingUp className="w-4 h-4 text-red-500" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-green-500" />
                            )}
                            <span className="text-sm">{factor.feature}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{factor.value}</Badge>
                            <span className={`text-sm font-medium ${factor.contribution > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {factor.contribution > 0 ? '+' : ''}{factor.contribution}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rules Triggered */}
                {explanation?.rules_triggered?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Rules Triggered</h4>
                    <div className="space-y-1">
                      {explanation.rules_triggered.map((rule, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>{rule.rule_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {rule.adjustment > 0 ? '+' : ''}{rule.adjustment}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Model Info */}
                <div className="pt-3 border-t text-xs text-slate-400 flex items-center justify-between">
                  <span>Model: v{explanation?.model_version || '1.0.0'}</span>
                  <span>Signals: {explanation?.signals_matched || 0} | Patterns: {explanation?.patterns_matched || 0}</span>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}