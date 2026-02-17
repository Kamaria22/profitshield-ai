import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Zap, 
  RefreshCw,
  ChevronRight,
  Sparkles,
  Target,
  Gift,
  ShieldAlert,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Play,
  Loader2,
  ExternalLink,
  ClipboardList,
  Bell
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const priorityColors = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

const confidenceColors = {
  high: 'text-emerald-600',
  medium: 'text-amber-600',
  low: 'text-slate-500'
};

function RecommendationCard({ title, icon: Icon, items, emptyMessage, renderItem }) {
  const [expanded, setExpanded] = useState(false);
  const displayItems = expanded ? items : items?.slice(0, 3);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="w-5 h-5 text-emerald-600" />
          {title}
          {items?.length > 0 && (
            <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayItems?.length > 0 ? (
          <>
            {displayItems.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                {renderItem(item, i)}
              </motion.div>
            ))}
            {items?.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-emerald-600"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Show less' : `Show ${items.length - 3} more`}
                <ChevronRight className={`w-4 h-4 ml-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 text-center py-4">{emptyMessage}</p>
        )}
      </CardContent>
    </Card>
  );
}

// Action Button Component
function ActionButton({ 
  onClick, 
  loading, 
  completed, 
  icon: Icon, 
  label, 
  variant = 'outline',
  size = 'sm',
  className = ''
}) {
  if (completed) {
    return (
      <Button size={size} variant="ghost" disabled className={`text-emerald-600 ${className}`}>
        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
        Done
      </Button>
    );
  }

  return (
    <Button 
      size={size} 
      variant={variant} 
      onClick={onClick} 
      disabled={loading}
      className={className}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
      ) : Icon ? (
        <Icon className="w-3.5 h-3.5 mr-1" />
      ) : null}
      {label}
    </Button>
  );
}

export default function ProfitOptimizationPanel({ tenantId }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [actionStates, setActionStates] = useState({});
  const [discountDialog, setDiscountDialog] = useState({ open: false, strategy: null });
  const [discountForm, setDiscountForm] = useState({ code: '', value: '', days: 7 });
  const queryClient = useQueryClient();

  // Mutation for applying actions
  const applyActionMutation = useMutation({
    mutationFn: async ({ action_type, action_data }) => {
      const response = await base44.functions.invoke('applyProfitAction', {
        tenant_id: tenantId,
        action_type,
        action_data
      });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data, variables) => {
      const key = `${variables.action_type}_${JSON.stringify(variables.action_data).substring(0, 50)}`;
      setActionStates(prev => ({ ...prev, [key]: 'completed' }));
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    }
  });

  const handleApplyAction = async (action_type, action_data, successMessage) => {
    const key = `${action_type}_${JSON.stringify(action_data).substring(0, 50)}`;
    setActionStates(prev => ({ ...prev, [key]: 'loading' }));
    
    try {
      await applyActionMutation.mutateAsync({ action_type, action_data });
      toast.success(successMessage || 'Action applied successfully');
    } catch (error) {
      setActionStates(prev => ({ ...prev, [key]: 'error' }));
      toast.error(error.message || 'Failed to apply action');
    }
  };

  const getActionState = (action_type, action_data) => {
    const key = `${action_type}_${JSON.stringify(action_data).substring(0, 50)}`;
    return actionStates[key];
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['profitOptimization', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('profitOptimizationAI', {
        tenant_id: tenantId,
        action: 'full_analysis'
      });
      return response.data?.recommendations;
    },
    enabled: !!tenantId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false
  });

  const handleRefresh = async () => {
    toast.promise(refetch(), {
      loading: 'Analyzing your store data...',
      success: 'AI recommendations updated!',
      error: 'Failed to generate recommendations'
    });
  };

  if (!tenantId) return null;

  return (
    <Card className="border-2 border-emerald-100 bg-gradient-to-br from-emerald-50/30 to-white overflow-hidden">
      <CardHeader className="border-b border-emerald-100 bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg">AI Profit Optimizer</CardTitle>
              <p className="text-emerald-100 text-sm">Intelligent recommendations to boost your profits</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="bg-white/20 hover:bg-white/30 text-white border-0"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Analyzing...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Brain className="w-12 h-12 text-emerald-500" />
            </motion.div>
            <p className="text-slate-500 mt-4">AI is analyzing your store data...</p>
            <p className="text-slate-400 text-sm">This may take a few seconds</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <p className="text-slate-600">Failed to load recommendations</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : data ? (
          <>
            {/* Summary Section */}
            {data.summary && (
              <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-emerald-600">{data.summary.health_score || 0}</div>
                    <div className="text-xs text-slate-500">Health Score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-slate-800">{data.summary.total_opportunity || '$0'}</div>
                    <div className="text-xs text-slate-500">Total Opportunity</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm font-medium text-slate-700 mb-1">Key Insight</div>
                    <p className="text-sm text-slate-600">{data.summary.key_insight || 'No insights available'}</p>
                  </div>
                </div>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="p-4">
              <TabsList className="grid grid-cols-4 mb-4">
                <TabsTrigger value="overview" className="text-xs sm:text-sm">
                  <Sparkles className="w-4 h-4 mr-1 hidden sm:inline" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="pricing" className="text-xs sm:text-sm">
                  <DollarSign className="w-4 h-4 mr-1 hidden sm:inline" />
                  Pricing
                </TabsTrigger>
                <TabsTrigger value="discounts" className="text-xs sm:text-sm">
                  <Gift className="w-4 h-4 mr-1 hidden sm:inline" />
                  Offers
                </TabsTrigger>
                <TabsTrigger value="predictions" className="text-xs sm:text-sm">
                  <ShieldAlert className="w-4 h-4 mr-1 hidden sm:inline" />
                  Predict
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-0">
                {/* Quick Wins */}
                <RecommendationCard
                  title="Quick Wins"
                  icon={Zap}
                  items={data.quick_wins}
                  emptyMessage="No quick wins identified"
                  renderItem={(item, i) => (
                    <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <div className="p-1.5 bg-amber-500 rounded-lg">
                        <Zap className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm">{item.action}</p>
                        <p className="text-xs text-slate-600 mt-1">{item.impact}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            {item.timeline}
                          </Badge>
                          <Badge className={`text-xs ${item.effort === 'low' ? 'bg-emerald-100 text-emerald-700' : item.effort === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {item.effort} effort
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}
                />

                {/* Top Priority */}
                {data.summary?.top_priority && (
                  <Card className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        <Target className="w-8 h-8" />
                        <div>
                          <p className="text-emerald-100 text-sm">Top Priority Action</p>
                          <p className="font-semibold">{data.summary.top_priority}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4 mt-0">
                <RecommendationCard
                  title="Pricing Recommendations"
                  icon={TrendingUp}
                  items={data.pricing_recommendations}
                  emptyMessage="No pricing adjustments suggested"
                  renderItem={(item, i) => {
                    const taskData = {
                      title: `Review pricing: ${item.product_name}`,
                      description: `${item.recommendation}\n\nExpected impact: ${item.expected_impact}`,
                      priority: item.priority,
                      category: 'pricing',
                      source_recommendation: item
                    };
                    const actionState = getActionState('create_task', taskData);
                    
                    return (
                      <div className="p-3 border rounded-lg hover:border-emerald-200 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium text-slate-800 text-sm">{item.product_name}</p>
                            <p className="text-xs text-slate-500 mt-1">{item.current_insight}</p>
                          </div>
                          <Badge className={priorityColors[item.priority]}>{item.priority}</Badge>
                        </div>
                        <div className="mt-3 p-2 bg-slate-50 rounded-lg">
                          <p className="text-sm text-slate-700">{item.recommendation}</p>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3" />
                            {item.expected_impact}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${confidenceColors[item.confidence]}`}>
                              {item.confidence}
                            </span>
                            <ActionButton
                              onClick={() => handleApplyAction('create_task', taskData, 'Task created to review pricing')}
                              loading={actionState === 'loading'}
                              completed={actionState === 'completed'}
                              icon={ClipboardList}
                              label="Create Task"
                              className="text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              </TabsContent>

              <TabsContent value="discounts" className="space-y-4 mt-0">
                <RecommendationCard
                  title="Discount & Bundle Strategies"
                  icon={Gift}
                  items={data.discount_strategies}
                  emptyMessage="No discount strategies suggested"
                  renderItem={(item, i) => {
                    const taskData = {
                      title: `Implement: ${item.strategy_name}`,
                      description: `${item.recommendation}\n\nTarget: ${item.target_segment}\nImplementation: ${item.implementation}\nExpected AOV increase: ${item.expected_aov_increase}`,
                      priority: 'medium',
                      category: 'discount_strategy',
                      source_recommendation: item
                    };
                    const taskState = getActionState('create_task', taskData);
                    
                    return (
                      <div className="p-3 border rounded-lg hover:border-purple-200 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <Gift className="w-4 h-4 text-purple-600" />
                          <p className="font-medium text-slate-800 text-sm">{item.strategy_name}</p>
                        </div>
                        <Badge variant="outline" className="mb-2 text-xs">
                          Target: {item.target_segment}
                        </Badge>
                        <p className="text-sm text-slate-600">{item.recommendation}</p>
                        <div className="mt-3 p-2 bg-purple-50 rounded-lg">
                          <p className="text-xs text-purple-700">
                            <strong>Implementation:</strong> {item.implementation}
                          </p>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            AOV: {item.expected_aov_increase}
                          </span>
                          <div className="flex items-center gap-2">
                            <ActionButton
                              onClick={() => setDiscountDialog({ open: true, strategy: item })}
                              icon={Gift}
                              label="Create Discount"
                              variant="default"
                              className="text-xs bg-purple-600 hover:bg-purple-700"
                            />
                            <ActionButton
                              onClick={() => handleApplyAction('create_task', taskData, 'Task created for discount strategy')}
                              loading={taskState === 'loading'}
                              completed={taskState === 'completed'}
                              icon={ClipboardList}
                              label="Task"
                              className="text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              </TabsContent>

              <TabsContent value="predictions" className="space-y-4 mt-0">
                <RecommendationCard
                  title="Predicted Profit Leaks"
                  icon={ShieldAlert}
                  items={data.predicted_leaks}
                  emptyMessage="No profit leaks predicted"
                  renderItem={(item, i) => {
                    const alertData = {
                      title: `Predicted: ${item.leak_type}`,
                      message: `${item.prediction}\n\nPreventative Action: ${item.preventative_action}\nEstimated savings: ${item.estimated_savings}`,
                      severity: item.risk_level,
                      category: 'predicted_leak',
                      action_label: 'Take Action'
                    };
                    const taskData = {
                      title: `Prevent: ${item.leak_type}`,
                      description: `${item.preventative_action}\n\nPrediction: ${item.prediction}\nEstimated savings: ${item.estimated_savings}`,
                      priority: item.risk_level,
                      category: 'leak_prevention',
                      source_recommendation: item
                    };
                    const alertState = getActionState('create_alert', alertData);
                    const taskState = getActionState('create_task', taskData);
                    
                    return (
                      <div className={`p-3 border-l-4 rounded-lg ${
                        item.risk_level === 'high' ? 'border-l-red-500 bg-red-50' :
                        item.risk_level === 'medium' ? 'border-l-amber-500 bg-amber-50' :
                        'border-l-blue-500 bg-blue-50'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-slate-800 text-sm">{item.leak_type}</p>
                          <Badge className={priorityColors[item.risk_level]}>{item.risk_level} risk</Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">{item.prediction}</p>
                        <div className="mt-3 p-2 bg-white/80 rounded-lg">
                          <p className="text-xs text-slate-700">
                            <strong>Preventative Action:</strong> {item.preventative_action}
                          </p>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Savings: {item.estimated_savings}
                          </span>
                          <div className="flex items-center gap-2">
                            <ActionButton
                              onClick={() => handleApplyAction('create_alert', alertData, 'Alert created')}
                              loading={alertState === 'loading'}
                              completed={alertState === 'completed'}
                              icon={Bell}
                              label="Alert"
                              className="text-xs"
                            />
                            <ActionButton
                              onClick={() => handleApplyAction('create_task', taskData, 'Prevention task created')}
                              loading={taskState === 'loading'}
                              completed={taskState === 'completed'}
                              icon={ClipboardList}
                              label="Task"
                              variant="default"
                              className="text-xs bg-slate-800 hover:bg-slate-900"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="text-center py-12">
            <Sparkles className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
            <p className="text-slate-600">Click refresh to generate AI recommendations</p>
          </div>
        )}
      </CardContent>

      {/* Discount Creation Dialog */}
      <Dialog open={discountDialog.open} onOpenChange={(open) => setDiscountDialog({ open, strategy: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-600" />
              Create Shopify Discount
            </DialogTitle>
            <DialogDescription>
              {discountDialog.strategy?.strategy_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="discount-title">Discount Name</Label>
              <Input
                id="discount-title"
                value={discountForm.code}
                onChange={(e) => setDiscountForm(f => ({ ...f, code: e.target.value }))}
                placeholder={discountDialog.strategy?.strategy_name?.toUpperCase().replace(/\s+/g, '_') || 'SUMMER_SALE'}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="discount-value">Discount Percentage (%)</Label>
              <Input
                id="discount-value"
                type="number"
                value={discountForm.value}
                onChange={(e) => setDiscountForm(f => ({ ...f, value: e.target.value }))}
                placeholder="10"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="discount-days">Valid for (days)</Label>
              <Input
                id="discount-days"
                type="number"
                value={discountForm.days}
                onChange={(e) => setDiscountForm(f => ({ ...f, days: e.target.value }))}
                placeholder="7"
                className="mt-1"
              />
            </div>
            
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-700">
                <strong>Strategy:</strong> {discountDialog.strategy?.recommendation}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountDialog({ open: false, strategy: null })}>
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              disabled={!discountForm.code || !discountForm.value || applyActionMutation.isPending}
              onClick={async () => {
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + parseInt(discountForm.days || 7));
                
                await handleApplyAction('create_discount', {
                  title: discountForm.code || discountDialog.strategy?.strategy_name,
                  discount_type: 'percentage',
                  value: discountForm.value,
                  ends_at: endDate.toISOString()
                }, 'Discount created in Shopify!');
                
                setDiscountDialog({ open: false, strategy: null });
                setDiscountForm({ code: '', value: '', days: 7 });
              }}
            >
              {applyActionMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Gift className="w-4 h-4 mr-2" />
              )}
              Create in Shopify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}