import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  AlertTriangle,
  Shield,
  Sparkles,
  Send,
  RefreshCw,
  Target,
  Loader2,
  ChevronRight,
  Lightbulb
} from 'lucide-react';
import { toast } from 'sonner';

export default function FounderDashboard() {
  const [question, setQuestion] = useState('');
  const queryClient = useQueryClient();

  const { data: insights = [], isLoading: insightsLoading, refetch: refetchInsights } = useQuery({
    queryKey: ['founderInsights'],
    queryFn: () => base44.entities.FounderInsight.filter({}, '-created_date', 20)
  });

  const { data: moatMetrics = [] } = useQuery({
    queryKey: ['moatMetrics'],
    queryFn: () => base44.entities.MoatMetric.filter({}, '-created_date', 1)
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ['milestones'],
    queryFn: () => base44.entities.StrategicMilestone.filter({})
  });

  const generateBriefMutation = useMutation({
    mutationFn: () => base44.functions.invoke('founderAI', { action: 'generate_weekly_brief' }),
    onSuccess: (result) => {
      toast.success('Weekly brief generated');
      queryClient.invalidateQueries({ queryKey: ['founderInsights'] });
    },
    onError: () => toast.error('Failed to generate brief')
  });

  const askMutation = useMutation({
    mutationFn: (q) => base44.functions.invoke('founderAI', { action: 'ask', question: q }),
    onSuccess: (result) => {
      toast.success('Analysis complete');
      setQuestion('');
    }
  });

  const moatData = moatMetrics[0];

  const severityColors = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
    info: 'bg-slate-100 text-slate-700'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-600" />
            Founder AI Dashboard
          </h1>
          <p className="text-slate-500">Strategic intelligence for ProfitShield</p>
        </div>
        <Button 
          onClick={() => generateBriefMutation.mutate()}
          disabled={generateBriefMutation.isPending}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {generateBriefMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          Generate Weekly Brief
        </Button>
      </div>

      {/* Ask FounderAI */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Input
              placeholder="Ask FounderAI anything... (e.g., 'Where are we leaking revenue?')"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && question && askMutation.mutate(question)}
              className="flex-1"
            />
            <Button 
              onClick={() => question && askMutation.mutate(question)}
              disabled={!question || askMutation.isPending}
            >
              {askMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          {askMutation.data?.data && (
            <div className="mt-4 p-4 bg-purple-50 rounded-lg">
              <p className="text-slate-700">{askMutation.data.data.answer}</p>
              {askMutation.data.data.suggested_actions?.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-slate-600 mb-2">Suggested Actions:</p>
                  <ul className="space-y-1">
                    {askMutation.data.data.suggested_actions.map((action, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                        <ChevronRight className="w-3 h-3" />
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="insights">
        <TabsList>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="moat">Moat Strength</TabsTrigger>
          <TabsTrigger value="roadmap">Strategic Roadmap</TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="space-y-4 mt-4">
          {insightsLoading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : insights.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Lightbulb className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No insights yet. Generate a weekly brief to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {insights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge className={severityColors[insight.severity]}>{insight.severity}</Badge>
                        <CardTitle className="text-base mt-2">{insight.title}</CardTitle>
                      </div>
                      <Badge variant="outline" className="capitalize">{insight.insight_type.replace(/_/g, ' ')}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-600 mb-3">{insight.summary}</p>
                    
                    {insight.metrics && (
                      <div className="flex gap-4 mb-3 text-sm">
                        {insight.metrics.current_value && (
                          <div>
                            <span className="text-slate-500">Current:</span>
                            <span className="ml-1 font-medium">{typeof insight.metrics.current_value === 'number' ? insight.metrics.current_value.toLocaleString() : insight.metrics.current_value}</span>
                          </div>
                        )}
                        {insight.metrics.change_pct !== undefined && (
                          <div className="flex items-center gap-1">
                            {insight.metrics.change_pct >= 0 ? (
                              <TrendingUp className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-500" />
                            )}
                            <span className={insight.metrics.change_pct >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {insight.metrics.change_pct > 0 ? '+' : ''}{insight.metrics.change_pct.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {insight.recommendations?.length > 0 && (
                      <div className="space-y-2">
                        {insight.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                            <span className="text-sm">{rec.action}</span>
                            <div className="flex gap-2">
                              {rec.estimated_impact && (
                                <Badge variant="outline" className="text-xs text-emerald-600">{rec.estimated_impact}</Badge>
                              )}
                              {rec.effort && (
                                <Badge variant="outline" className="text-xs">{rec.effort} effort</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="moat" className="mt-4">
          {moatData ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" />
                    Data Moat
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={moatData.data_moat?.data_uniqueness_score || 0} className="h-2 mb-2" />
                  <p className="text-2xl font-bold">{moatData.data_moat?.total_orders_processed?.toLocaleString() || 0}</p>
                  <p className="text-sm text-slate-500">Orders Processed</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    Network Moat
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={moatData.network_moat?.network_effect_score || 0} className="h-2 mb-2" />
                  <p className="text-2xl font-bold">{moatData.network_moat?.merchants_contributing || 0}</p>
                  <p className="text-sm text-slate-500">Contributing Merchants</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="w-5 h-5 text-emerald-600" />
                    AI Moat
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={(moatData.ai_moat?.prediction_accuracy || 0) * 100} className="h-2 mb-2" />
                  <p className="text-2xl font-bold">{moatData.ai_moat?.model_versions_deployed || 0}</p>
                  <p className="text-sm text-slate-500">Model Versions</p>
                </CardContent>
              </Card>

              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader>
                  <CardTitle className="text-base">Overall Competitive Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Progress value={moatData.overall_moat_score || 0} className="h-4" />
                    </div>
                    <Badge className={
                      moatData.competitive_position === 'dominant' ? 'bg-emerald-100 text-emerald-700' :
                      moatData.competitive_position === 'strong' ? 'bg-blue-100 text-blue-700' :
                      moatData.competitive_position === 'competitive' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }>
                      {moatData.competitive_position || 'emerging'}
                    </Badge>
                    <span className="text-2xl font-bold">{Math.round(moatData.overall_moat_score || 0)}/100</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-slate-500">Generate a brief to calculate moat strength.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="roadmap" className="mt-4">
          <div className="space-y-6">
            {['year_1_2', 'year_3_5', 'year_5_7', 'year_7_10'].map((phase) => {
              const phaseMilestones = milestones.filter(m => m.phase === phase);
              const phaseLabels = {
                year_1_2: 'Year 1-2: Foundation',
                year_3_5: 'Year 3-5: Scale',
                year_5_7: 'Year 5-7: Dominance',
                year_7_10: 'Year 7-10: Infrastructure'
              };
              
              return (
                <div key={phase}>
                  <h3 className="text-lg font-semibold text-slate-700 mb-3">{phaseLabels[phase]}</h3>
                  {phaseMilestones.length > 0 ? (
                    <div className="grid gap-3">
                      {phaseMilestones.map((milestone) => (
                        <Card key={milestone.id}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Target className="w-5 h-5 text-purple-600" />
                                <div>
                                  <p className="font-medium">{milestone.name}</p>
                                  {milestone.description && (
                                    <p className="text-sm text-slate-500">{milestone.description}</p>
                                  )}
                                </div>
                              </div>
                              <Badge variant="outline" className="capitalize">{milestone.status}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm">No milestones defined for this phase.</p>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}