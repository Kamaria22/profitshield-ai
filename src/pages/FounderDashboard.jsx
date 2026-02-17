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
  Lightbulb,
  Bell,
  Link as LinkIcon,
  Zap,
  BarChart3,
  Activity,
  CheckCircle2,
  XCircle,
  Percent,
  Star,
  Gift,
  Rocket,
  FlaskConical,
  Settings
} from 'lucide-react';

import AutopilotStatusPanel from '@/components/autopilot/AutopilotStatusPanel';
import DecisionQueue from '@/components/autopilot/DecisionQueue';
import DataFlywheelViz from '@/components/autopilot/DataFlywheelViz';
import ExperimentsPanel from '@/components/autopilot/ExperimentsPanel';
import BoardReportPanel from '@/components/governance/BoardReportPanel';
import StrategicBriefPanel from '@/components/governance/StrategicBriefPanel';
import RegionalExpansionPanel from '@/components/governance/RegionalExpansionPanel';
import CapitalAllocationPanel from '@/components/empire/CapitalAllocationPanel';
import PricingIntelligencePanel from '@/components/empire/PricingIntelligencePanel';
import NetworkStatusPanel from '@/components/empire/NetworkStatusPanel';
import EmpireRoadmapPanel from '@/components/empire/EmpireRoadmapPanel';
import MABriefPanel from '@/components/dominance/MABriefPanel';
import LockInDashboard from '@/components/dominance/LockInDashboard';
import ShadowBoardPanel from '@/components/dominance/ShadowBoardPanel';
import SatelliteRadarPanel from '@/components/dominance/SatelliteRadarPanel';
import WarRoomConsole from '@/components/empire/WarRoomConsole';
import SimulationLab from '@/components/empire/SimulationLab';
import IPOReadinessPanel from '@/components/empire/IPOReadinessPanel';
import FounderControlPanel from '@/components/empire/FounderControlPanel';
import AbsorptionRadarPanel from '@/components/supremacy/AbsorptionRadarPanel';
import AIEvolutionPanel from '@/components/supremacy/AIEvolutionPanel';
import DataFortressPanel from '@/components/supremacy/DataFortressPanel';
import CapitalReadinessPanel from '@/components/supremacy/CapitalReadinessPanel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

// Strategic Memory Summary Component
function StrategicMemorySummary() {
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ['strategicMemories'],
    queryFn: () => base44.entities.StrategicMemory.filter({ is_active: true }, '-times_referenced', 10)
  });

  if (isLoading) {
    return <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>;
  }

  if (memories.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-4">No strategic memories yet</p>;
  }

  const typeColors = {
    experiment_result: 'bg-purple-100 text-purple-700',
    pricing_insight: 'bg-emerald-100 text-emerald-700',
    fraud_pattern: 'bg-red-100 text-red-700',
    conversion_lever: 'bg-blue-100 text-blue-700',
    churn_driver: 'bg-amber-100 text-amber-700'
  };

  return (
    <div className="space-y-2">
      {memories.slice(0, 5).map((memory) => (
        <div key={memory.id} className="p-2 bg-slate-50 rounded">
          <div className="flex items-center justify-between mb-1">
            <Badge className={typeColors[memory.memory_type] || 'bg-slate-100 text-slate-700'} variant="outline">
              {memory.memory_type?.replace(/_/g, ' ')}
            </Badge>
            <span className="text-xs text-slate-400">
              {Math.round((memory.confidence || 0) * 100)}% conf
            </span>
          </div>
          <p className="text-xs text-slate-600 line-clamp-2">{memory.insight}</p>
        </div>
      ))}
    </div>
  );
}

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

  // Risk ROI metrics across all tenants (aggregated)
  const { data: riskROI = [] } = useQuery({
    queryKey: ['riskROIMetrics'],
    queryFn: () => base44.entities.RiskROIMetric.filter({}, '-created_date', 50)
  });

  // Cross-merchant signals
  const { data: crossSignals = [] } = useQuery({
    queryKey: ['crossMerchantSignals'],
    queryFn: () => base44.entities.CrossMerchantSignal.filter({ is_active: true })
  });

  // Global risk feature weights
  const { data: globalWeights = [] } = useQuery({
    queryKey: ['globalRiskWeights'],
    queryFn: () => base44.entities.RiskFeatureWeight.filter({ scope: 'global' })
  });

  // Growth metrics
  const { data: growthMetrics = [] } = useQuery({
    queryKey: ['growthMetrics'],
    queryFn: () => base44.entities.GrowthMetric.filter({}, '-created_date', 12)
  });

  // Revenue experiments
  const { data: experiments = [] } = useQuery({
    queryKey: ['revenueExperiments'],
    queryFn: () => base44.entities.RevenueExperiment.filter({})
  });

  const generateBriefMutation = useMutation({
    mutationFn: () => base44.functions.invoke('founderAI', { action: 'generate_weekly_brief' }),
    onSuccess: (result) => {
      const created = result.data?.milestones_created || 0;
      toast.success(`Weekly brief generated${created > 0 ? ` + ${created} milestone(s) created` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['founderInsights'] });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
    onError: () => toast.error('Failed to generate brief')
  });

  const sendNotificationsMutation = useMutation({
    mutationFn: (email) => base44.functions.invoke('founderAI', { action: 'send_critical_notifications', founder_email: email }),
    onSuccess: (result) => {
      const count = result.data?.notifications_sent || 0;
      if (count > 0) {
        toast.success(`${count} notification(s) sent`);
        queryClient.invalidateQueries({ queryKey: ['founderInsights'] });
      } else {
        toast.info('No critical insights to notify');
      }
    },
    onError: () => toast.error('Failed to send notifications')
  });

  const linkToMilestoneMutation = useMutation({
    mutationFn: ({ insight_id, milestone_id }) => base44.functions.invoke('founderAI', { 
      action: 'link_insight_to_milestone', 
      insight_id, 
      milestone_id 
    }),
    onSuccess: () => {
      toast.success('Insight linked to milestone');
      queryClient.invalidateQueries({ queryKey: ['founderInsights'] });
    }
  });

  const askMutation = useMutation({
    mutationFn: (q) => base44.functions.invoke('founderAI', { action: 'ask', question: q }),
    onSuccess: (result) => {
      toast.success('Analysis complete');
      setQuestion('');
    }
  });

  const moatData = moatMetrics[0];

  // Aggregate ROI metrics
  const aggregatedROI = React.useMemo(() => {
    if (riskROI.length === 0) return null;
    
    return {
      totalChargebacksPrevented: riskROI.reduce((s, r) => s + (r.chargebacks_prevented || 0), 0),
      totalFraudBlocked: riskROI.reduce((s, r) => s + (r.fraud_orders_blocked || 0), 0),
      totalMarginRecovered: riskROI.reduce((s, r) => s + (r.margin_recovered || 0), 0),
      avgAccuracy: riskROI.reduce((s, r) => s + (r.ai_accuracy_percent || 0), 0) / riskROI.length,
      avgFalsePositiveRate: riskROI.reduce((s, r) => s + (r.false_positive_rate || 0), 0) / riskROI.length,
      totalOrdersAnalyzed: riskROI.reduce((s, r) => s + (r.orders_analyzed || 0), 0),
      tenantCount: new Set(riskROI.map(r => r.tenant_id)).size
    };
  }, [riskROI]);

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
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => {
              const email = prompt('Enter email for notifications:');
              if (email) sendNotificationsMutation.mutate(email);
            }}
            disabled={sendNotificationsMutation.isPending}
          >
            {sendNotificationsMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Bell className="w-4 h-4 mr-2" />
            )}
            Send Alerts
          </Button>
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

      {/* Risk ROI Summary Cards */}
      {aggregatedROI && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-emerald-700">Chargebacks Prevented</span>
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-emerald-700">{aggregatedROI.totalChargebacksPrevented}</p>
              <p className="text-xs text-emerald-600 mt-1">Across {aggregatedROI.tenantCount} merchants</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-700">Margin Recovered</span>
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-700">${aggregatedROI.totalMarginRecovered.toLocaleString()}</p>
              <p className="text-xs text-blue-600 mt-1">Total loss avoided</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-purple-700">AI Accuracy</span>
                <Brain className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-700">{aggregatedROI.avgAccuracy.toFixed(1)}%</p>
              <p className="text-xs text-purple-600 mt-1">{aggregatedROI.totalOrdersAnalyzed.toLocaleString()} orders analyzed</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-amber-700">False Positive Rate</span>
                <Percent className="w-5 h-5 text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-700">{(aggregatedROI.avgFalsePositiveRate * 100).toFixed(1)}%</p>
              <p className="text-xs text-amber-600 mt-1">Lower is better</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="autopilot">
        <TabsList className="flex-wrap">
          <TabsTrigger value="autopilot">Autopilot</TabsTrigger>
          <TabsTrigger value="ceo-brief">CEO Brief</TabsTrigger>
          <TabsTrigger value="board">Board View</TabsTrigger>
          <TabsTrigger value="expansion">Global Expansion</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="growth">Growth</TabsTrigger>
          <TabsTrigger value="risk-roi">Risk ROI</TabsTrigger>
          <TabsTrigger value="global-intel">Global Intelligence</TabsTrigger>
          <TabsTrigger value="moat">Moat Strength</TabsTrigger>
          <TabsTrigger value="roadmap">Strategic Roadmap</TabsTrigger>
          <TabsTrigger value="capital">Capital</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="network">CDNP</TabsTrigger>
          <TabsTrigger value="empire">Empire</TabsTrigger>
          <TabsTrigger value="ma">M&A</TabsTrigger>
          <TabsTrigger value="lockin">Lock-In</TabsTrigger>
          <TabsTrigger value="satellite">Satellite</TabsTrigger>
          <TabsTrigger value="shadowboard">Shadow Board</TabsTrigger>
          <TabsTrigger value="warroom">War Room</TabsTrigger>
          <TabsTrigger value="simulation">Simulation</TabsTrigger>
          <TabsTrigger value="ipo">IPO Ready</TabsTrigger>
          <TabsTrigger value="control">Control</TabsTrigger>
          <TabsTrigger value="absorption">Absorption</TabsTrigger>
          <TabsTrigger value="ai-evolution">AI Evolution</TabsTrigger>
          <TabsTrigger value="fortress">Data Fortress</TabsTrigger>
          <TabsTrigger value="capital">Capital</TabsTrigger>
        </TabsList>

        {/* Autopilot Tab */}
        <TabsContent value="autopilot" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column - Status & Controls */}
            <div className="lg:col-span-1 space-y-4">
              <AutopilotStatusPanel />
            </div>

            {/* Middle Column - Decisions & Experiments */}
            <div className="lg:col-span-1 space-y-4">
              <DecisionQueue limit={10} />
              <ExperimentsPanel />
            </div>

            {/* Right Column - Flywheel & Memory */}
            <div className="lg:col-span-1 space-y-4">
              <DataFlywheelViz />
              
              {/* Strategic Memory Summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-600" />
                    Strategic Memory
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StrategicMemorySummary />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* CEO Brief Tab */}
        <TabsContent value="ceo-brief" className="mt-4">
          <StrategicBriefPanel />
        </TabsContent>

        {/* Board View Tab */}
        <TabsContent value="board" className="mt-4">
          <BoardReportPanel />
        </TabsContent>

        {/* Global Expansion Tab */}
        <TabsContent value="expansion" className="mt-4">
          <RegionalExpansionPanel />
        </TabsContent>

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

                    {/* Link to Milestone */}
                    <div className="mt-3 pt-3 border-t flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {insight.linked_milestone_id ? (
                          <>
                            <LinkIcon className="w-3 h-3" />
                            <span>Linked to milestone</span>
                          </>
                        ) : insight.auto_created_milestone_id ? (
                          <>
                            <Target className="w-3 h-3 text-purple-500" />
                            <span className="text-purple-600">Auto-created milestone</span>
                          </>
                        ) : null}
                        {insight.notification_sent && (
                          <Badge variant="outline" className="text-xs ml-2">
                            <Bell className="w-3 h-3 mr-1" /> Notified
                          </Badge>
                        )}
                      </div>
                      {!insight.linked_milestone_id && !insight.auto_created_milestone_id && milestones.length > 0 && (
                        <Select
                          onValueChange={(milestoneId) => linkToMilestoneMutation.mutate({ 
                            insight_id: insight.id, 
                            milestone_id: milestoneId 
                          })}
                        >
                          <SelectTrigger className="w-[160px] h-7 text-xs">
                            <SelectValue placeholder="Link to milestone" />
                          </SelectTrigger>
                          <SelectContent>
                            {milestones.map(m => (
                              <SelectItem key={m.id} value={m.id} className="text-xs">
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Growth Tab */}
        <TabsContent value="growth" className="mt-4 space-y-4">
          {growthMetrics.length > 0 ? (
            <>
              {/* Growth Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-purple-700">Install Velocity</span>
                      <Rocket className="w-5 h-5 text-purple-600" />
                    </div>
                    <p className="text-2xl font-bold text-purple-700">
                      {growthMetrics[0]?.installs?.total || 0}
                    </p>
                    <p className="text-xs text-purple-600 mt-1">This period</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-amber-700">Review Velocity</span>
                      <Star className="w-5 h-5 text-amber-600" />
                    </div>
                    <p className="text-2xl font-bold text-amber-700">
                      {growthMetrics[0]?.reviews?.reviews_submitted || 0}
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Avg: {(growthMetrics[0]?.reviews?.avg_rating || 0).toFixed(1)}⭐
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-pink-50 to-white border-pink-100">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-pink-700">Referral Rate</span>
                      <Gift className="w-5 h-5 text-pink-600" />
                    </div>
                    <p className="text-2xl font-bold text-pink-700">
                      {((growthMetrics[0]?.referrals?.referral_rate || 0) * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-pink-600 mt-1">
                      {growthMetrics[0]?.referrals?.installs || 0} referred installs
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-emerald-700">Activation Rate</span>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-700">
                      {((growthMetrics[0]?.activations?.activation_rate || 0) * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">
                      {growthMetrics[0]?.activations?.total || 0} activated
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Conversion Funnel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    Conversion Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-slate-50 rounded-lg">
                      <p className="text-2xl font-bold text-slate-700">
                        {growthMetrics[0]?.conversions?.trial_starts || 0}
                      </p>
                      <p className="text-xs text-slate-500">Trial Starts</p>
                    </div>
                    <div className="text-center p-3 bg-emerald-50 rounded-lg">
                      <p className="text-2xl font-bold text-emerald-700">
                        {growthMetrics[0]?.conversions?.trial_to_paid || 0}
                      </p>
                      <p className="text-xs text-emerald-600">Converted to Paid</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-700">
                        {((growthMetrics[0]?.conversions?.trial_to_paid_rate || 0) * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-blue-600">Conversion Rate</p>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <p className="text-2xl font-bold text-red-700">
                        {growthMetrics[0]?.conversions?.churns || 0}
                      </p>
                      <p className="text-xs text-red-600">Churned</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Review Boost Score */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    Review Boost Score
                  </CardTitle>
                  <CardDescription>Potential for generating positive reviews</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Progress value={growthMetrics[0]?.review_boost_score || 0} className="flex-1 h-4" />
                    <span className="text-2xl font-bold text-amber-600">
                      {Math.round(growthMetrics[0]?.review_boost_score || 0)}/100
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-slate-700">
                        {growthMetrics[0]?.reviews?.requests_sent || 0}
                      </p>
                      <p className="text-xs text-slate-500">Requests Sent</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-600">
                        {growthMetrics[0]?.reviews?.five_star_count || 0}
                      </p>
                      <p className="text-xs text-slate-500">5-Star Reviews</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-600">
                        {(growthMetrics[0]?.reviews?.avg_rating || 0).toFixed(1)}
                      </p>
                      <p className="text-xs text-slate-500">Avg Rating</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Rocket className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No growth metrics yet. Run the growth metrics calculator.</p>
              </CardContent>
            </Card>
          )}

          {/* Experiments */}
          {experiments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-purple-600" />
                  Active Experiments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {experiments.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{exp.experiment_name}</p>
                        <p className="text-xs text-slate-500">{exp.hypothesis}</p>
                      </div>
                      <Badge className={
                        exp.status === 'running' ? 'bg-green-100 text-green-700' :
                        exp.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }>
                        {exp.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Risk ROI Tab */}
        <TabsContent value="risk-roi" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                Risk Intelligence ROI by Tenant
              </CardTitle>
              <CardDescription>Performance metrics showing value delivered to each merchant</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-auto">
                {riskROI.slice(0, 20).map((roi) => (
                  <div key={roi.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{roi.period} ({roi.period_type})</p>
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">Tenant: {roi.tenant_id?.slice(0, 8)}...</p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-emerald-600">{roi.chargebacks_prevented || 0}</p>
                        <p className="text-xs text-slate-500">Prevented</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-blue-600">${(roi.margin_recovered || 0).toLocaleString()}</p>
                        <p className="text-xs text-slate-500">Saved</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-purple-600">{roi.ai_accuracy_percent || 0}%</p>
                        <p className="text-xs text-slate-500">Accuracy</p>
                      </div>
                      <Badge className={roi.roi_multiple >= 5 ? 'bg-emerald-100 text-emerald-700' : roi.roi_multiple >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}>
                        {roi.roi_multiple || 0}x ROI
                      </Badge>
                    </div>
                  </div>
                ))}
                {riskROI.length === 0 && (
                  <p className="text-center text-slate-500 py-4">No ROI data yet. Run weekly recalibration to generate metrics.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Global Intelligence Tab */}
        <TabsContent value="global-intel" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-600" />
                  Cross-Merchant Signals
                </CardTitle>
                <CardDescription>Anonymized risk patterns detected across multiple merchants</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {crossSignals.map((signal) => (
                    <div key={signal.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div>
                        <p className="text-sm font-medium">{signal.signal_key.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">{signal.merchant_count} merchants contributing</p>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-red-100 text-red-700">+{signal.risk_score_contribution} pts</Badge>
                        <p className="text-xs text-slate-500 mt-1">{(signal.bad_outcome_rate * 100).toFixed(0)}% bad outcome rate</p>
                      </div>
                    </div>
                  ))}
                  {crossSignals.length === 0 && (
                    <p className="text-center text-slate-500 py-4">No cross-merchant signals yet. Need 3+ merchants with outcomes.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-5 h-5 text-purple-600" />
                  Global Risk Feature Weights
                </CardTitle>
                <CardDescription>AI-learned feature importance from all merchant data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {globalWeights.sort((a, b) => b.weight - a.weight).map((weight) => (
                    <div key={weight.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <div>
                        <p className="text-sm font-medium">{weight.feature_name.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">Sample: {weight.sample_size || 0} | Confidence: {((weight.confidence || 0) * 100).toFixed(0)}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={weight.weight} className="w-20 h-2" />
                        <span className="text-sm font-bold w-8">{weight.weight}</span>
                        {weight.effectiveness_trend === 'improving' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                        {weight.effectiveness_trend === 'declining' && <TrendingDown className="w-4 h-4 text-red-500" />}
                      </div>
                    </div>
                  ))}
                  {globalWeights.length === 0 && (
                    <p className="text-center text-slate-500 py-4">No global weights yet. Run weekly recalibration.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Defensibility Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-emerald-700">{crossSignals.length}</p>
                  <p className="text-xs text-emerald-600">Global Signals</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <Activity className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-blue-700">{globalWeights.length}</p>
                  <p className="text-xs text-blue-600">Feature Weights</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <Users className="w-6 h-6 text-purple-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-purple-700">{aggregatedROI?.tenantCount || 0}</p>
                  <p className="text-xs text-purple-600">Active Merchants</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <Shield className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                  <p className="text-xl font-bold text-amber-700">{aggregatedROI?.totalOrdersAnalyzed?.toLocaleString() || 0}</p>
                  <p className="text-xs text-amber-600">Orders Processed</p>
                </div>
              </div>
            </CardContent>
          </Card>
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

        {/* Capital Allocation Tab */}
        <TabsContent value="capital" className="mt-4">
          <CapitalAllocationPanel />
        </TabsContent>

        {/* Pricing Intelligence Tab */}
        <TabsContent value="pricing" className="mt-4">
          <PricingIntelligencePanel />
        </TabsContent>

        {/* Commerce Data Network Tab */}
        <TabsContent value="network" className="mt-4">
          <NetworkStatusPanel />
        </TabsContent>

        {/* Empire Blueprint Tab */}
        <TabsContent value="empire" className="mt-4">
          <EmpireRoadmapPanel />
        </TabsContent>

        {/* M&A Engine Tab */}
        <TabsContent value="ma" className="mt-4">
          <MABriefPanel />
        </TabsContent>

        {/* Lock-In Dashboard Tab */}
        <TabsContent value="lockin" className="mt-4">
          <LockInDashboard />
        </TabsContent>

        {/* Satellite Intelligence Tab */}
        <TabsContent value="satellite" className="mt-4">
          <SatelliteRadarPanel />
        </TabsContent>

        {/* Shadow Board Tab */}
        <TabsContent value="shadowboard" className="mt-4">
          <ShadowBoardPanel />
        </TabsContent>

        {/* War Room Tab */}
        <TabsContent value="warroom" className="mt-4">
          <WarRoomConsole />
        </TabsContent>

        {/* Simulation Lab Tab */}
        <TabsContent value="simulation" className="mt-4">
          <SimulationLab />
        </TabsContent>

        {/* IPO Readiness Tab */}
        <TabsContent value="ipo" className="mt-4">
          <IPOReadinessPanel />
        </TabsContent>

        {/* Founder Control Panel Tab */}
        <TabsContent value="control" className="mt-4">
          <FounderControlPanel />
        </TabsContent>

        {/* Competitive Absorption Tab */}
        <TabsContent value="absorption" className="mt-4">
          <AbsorptionRadarPanel />
        </TabsContent>

        {/* AI Model Evolution Tab */}
        <TabsContent value="ai-evolution" className="mt-4">
          <AIEvolutionPanel />
        </TabsContent>

        {/* Data Fortress Tab */}
        <TabsContent value="fortress" className="mt-4">
          <DataFortressPanel />
        </TabsContent>

        {/* Capital Readiness Tab */}
        <TabsContent value="capital" className="mt-4">
          <CapitalReadinessPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}