import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { 
  Shield, 
  Save, 
  RotateCcw, 
  Loader2, 
  Sparkles, 
  History, 
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Undo2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const defaultWeights = {
  new_customer: 15,
  high_order_value_500: 10,
  high_order_value_1000: 15,
  order_value_3x_avg: 20,
  address_country_mismatch: 25,
  address_zip_mismatch: 10,
  heavy_discount: 15,
  multiple_discount_codes: 10,
  free_shipping_high_value: 10,
  suspicious_email: 15,
  free_email_high_value: 5,
  velocity_24h: 20,
  high_refund_history: 25,
  moderate_refund_history: 15,
  negative_margin: 10
};

const weightLabels = {
  new_customer: 'New Customer',
  high_order_value_500: 'High Value ($500+)',
  high_order_value_1000: 'Very High Value ($1000+)',
  order_value_3x_avg: 'Order 3x Customer Avg',
  address_country_mismatch: 'Country Mismatch',
  address_zip_mismatch: 'Zip Code Mismatch',
  heavy_discount: 'Heavy Discount (>30%)',
  multiple_discount_codes: 'Multiple Discounts',
  free_shipping_high_value: 'Free Shipping High Value',
  suspicious_email: 'Suspicious Email',
  free_email_high_value: 'Free Email High Value',
  velocity_24h: 'Multiple Orders 24h',
  high_refund_history: 'High Refund History (>30%)',
  moderate_refund_history: 'Moderate Refund History (>15%)',
  negative_margin: 'Negative Margin'
};

export default function RiskModelConfig({ tenantId }) {
  const [weights, setWeights] = useState(defaultWeights);
  const [thresholds, setThresholds] = useState({ high_risk: 70, medium_risk: 40 });
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const queryClient = useQueryClient();

  const { data: riskModel, isLoading } = useQuery({
    queryKey: ['riskModel', tenantId],
    queryFn: async () => {
      const models = await base44.entities.TenantRiskModel.filter({ tenant_id: tenantId, is_active: true });
      return models[0];
    },
    enabled: !!tenantId
  });

  const { data: modelHistory = [] } = useQuery({
    queryKey: ['riskModelHistory', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('riskModelLearning', {
        action: 'get_history',
        tenant_id: tenantId
      });
      return response.data?.models || [];
    },
    enabled: !!tenantId && showHistory
  });

  useEffect(() => {
    if (riskModel) {
      setWeights(riskModel.weights || defaultWeights);
      setThresholds(riskModel.thresholds || { high_risk: 70, medium_risk: 40 });
    }
  }, [riskModel]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (riskModel) {
        await base44.entities.TenantRiskModel.update(riskModel.id, {
          is_active: false,
          deactivated_at: new Date().toISOString()
        });
      }

      await base44.entities.TenantRiskModel.create({
        tenant_id: tenantId,
        version: (riskModel?.version || 0) + 1,
        is_active: true,
        weights,
        thresholds,
        source: 'manual',
        activated_at: new Date().toISOString(),
        change_reason: 'User configuration update',
        parent_version_id: riskModel?.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riskModel'] });
      toast.success('Risk model updated');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('riskModelLearning', {
        action: 'analyze',
        tenant_id: tenantId
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['riskModel'] });
      setShowSuggestions(true);
      toast.success('Analysis complete');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const applySuggestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('riskModelLearning', {
        action: 'apply_suggestions',
        tenant_id: tenantId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riskModel'] });
      setShowSuggestions(false);
      toast.success('AI suggestions applied');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const rollbackMutation = useMutation({
    mutationFn: async (modelId) => {
      const response = await base44.functions.invoke('riskModelLearning', {
        action: 'rollback',
        tenant_id: tenantId,
        model_id: modelId
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riskModel'] });
      queryClient.invalidateQueries({ queryKey: ['riskModelHistory'] });
      setShowHistory(false);
      toast.success('Rolled back to previous version');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleWeightChange = (key, value) => {
    setWeights({ ...weights, [key]: value[0] });
  };

  const handleReset = () => {
    setWeights(defaultWeights);
    setThresholds({ high_risk: 70, medium_risk: 40 });
  };

  if (isLoading) {
    return <Card><CardContent className="py-8 text-center text-slate-500">Loading...</CardContent></Card>;
  }

  const aiAnalysis = riskModel?.ai_analysis;
  const metrics = riskModel?.performance_metrics;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                Adaptive Risk Model
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                Customize risk scoring weights for your store
                {riskModel && (
                  <>
                    <Badge variant="outline" className="ml-2">v{riskModel.version}</Badge>
                    {riskModel.source === 'ai_suggested' && (
                      <Badge className="bg-purple-100 text-purple-700">AI Optimized</Badge>
                    )}
                  </>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
                <History className="w-4 h-4 mr-1" />
                History
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
              >
                {analyzeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-1" />
                )}
                Analyze
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Performance Metrics */}
          {metrics && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Model Performance
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{metrics.precision || 0}%</p>
                  <p className="text-xs text-slate-500">Precision</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{metrics.recall || 0}%</p>
                  <p className="text-xs text-slate-500">Recall</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{metrics.f1_score || 0}</p>
                  <p className="text-xs text-slate-500">F1 Score</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{metrics.total_orders_scored || 0}</p>
                  <p className="text-xs text-slate-500">Orders Scored</p>
                </div>
              </div>
              {metrics.false_positives > 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  {metrics.false_positives} false positives detected - consider running AI analysis
                </p>
              )}
            </div>
          )}

          {/* AI Suggestions Banner */}
          {aiAnalysis && aiAnalysis.confidence_score && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-purple-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI Suggestions Available
                  </h4>
                  <p className="text-sm text-purple-700 mt-1">{aiAnalysis.analysis_summary}</p>
                  <p className="text-xs text-purple-600 mt-2">
                    Confidence: {aiAnalysis.confidence_score}% • 
                    Analyzed: {aiAnalysis.analyzed_at ? format(new Date(aiAnalysis.analyzed_at), 'MMM d, h:mm a') : 'Unknown'}
                  </p>
                </div>
                <Button 
                  size="sm" 
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={() => setShowSuggestions(true)}
                >
                  Review
                </Button>
              </div>
            </div>
          )}

          {/* Thresholds */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>High Risk Threshold</Label>
              <div className="flex items-center gap-3 mt-2">
                <Slider
                  value={[thresholds.high_risk]}
                  onValueChange={(v) => setThresholds({ ...thresholds, high_risk: v[0] })}
                  min={50}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="w-12 text-sm font-medium">{thresholds.high_risk}</span>
              </div>
            </div>
            <div>
              <Label>Medium Risk Threshold</Label>
              <div className="flex items-center gap-3 mt-2">
                <Slider
                  value={[thresholds.medium_risk]}
                  onValueChange={(v) => setThresholds({ ...thresholds, medium_risk: v[0] })}
                  min={20}
                  max={70}
                  step={5}
                  className="flex-1"
                />
                <span className="w-12 text-sm font-medium">{thresholds.medium_risk}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Risk Weights */}
          <div>
            <h4 className="font-medium mb-4">Risk Factor Weights</h4>
            <div className="grid gap-4">
              {Object.entries(weights).map(([key, value]) => {
                const suggestion = aiAnalysis?.suggested_weights?.[key];
                const hasSuggestion = suggestion !== undefined && suggestion !== value;
                
                return (
                  <div key={key} className="flex items-center gap-4">
                    <span className="text-sm w-48 text-slate-600">{weightLabels[key] || key}</span>
                    <Slider
                      value={[value]}
                      onValueChange={(v) => handleWeightChange(key, v)}
                      min={0}
                      max={50}
                      step={5}
                      className="flex-1"
                    />
                    <Badge variant="outline" className={`w-12 justify-center ${
                      value > 20 ? 'bg-red-50 text-red-700' : 
                      value > 10 ? 'bg-amber-50 text-amber-700' : 
                      'bg-slate-50'
                    }`}>
                      +{value}
                    </Badge>
                    {hasSuggestion && (
                      <Badge className="bg-purple-100 text-purple-700 text-xs">
                        AI: {suggestion}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Version History Sheet */}
      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Model Version History</SheetTitle>
            <SheetDescription>View and rollback to previous model versions</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {modelHistory.map((model, idx) => (
              <div 
                key={model.id} 
                className={`p-4 rounded-lg border ${model.is_active ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Version {model.version}</span>
                      {model.is_active && (
                        <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                      )}
                      {model.source === 'ai_suggested' && (
                        <Badge className="bg-purple-100 text-purple-700">AI</Badge>
                      )}
                      {model.source === 'rollback' && (
                        <Badge variant="outline">Rollback</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{model.change_reason || 'No reason provided'}</p>
                    {model.activated_at && (
                      <p className="text-xs text-slate-400 mt-1">
                        {format(new Date(model.activated_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    )}
                    {model.performance_metrics && (
                      <div className="flex gap-3 mt-2 text-xs">
                        <span>Precision: {model.performance_metrics.precision || 0}%</span>
                        <span>Recall: {model.performance_metrics.recall || 0}%</span>
                      </div>
                    )}
                  </div>
                  {!model.is_active && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => rollbackMutation.mutate(model.id)}
                      disabled={rollbackMutation.isPending}
                    >
                      <Undo2 className="w-4 h-4 mr-1" />
                      Rollback
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {modelHistory.length === 0 && (
              <p className="text-center text-slate-500 py-8">No version history available</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* AI Suggestions Dialog */}
      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              AI-Suggested Optimizations
            </DialogTitle>
            <DialogDescription>
              Review and apply AI-generated improvements to your risk model
            </DialogDescription>
          </DialogHeader>
          
          {aiAnalysis && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm">{aiAnalysis.analysis_summary}</p>
                <div className="flex items-center gap-4 mt-2">
                  <Badge className="bg-purple-100 text-purple-700">
                    Confidence: {aiAnalysis.confidence_score}%
                  </Badge>
                </div>
              </div>

              {aiAnalysis.risk_factors_analysis?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-3">Suggested Changes</h4>
                  <div className="space-y-2">
                    {aiAnalysis.risk_factors_analysis.map((factor, idx) => (
                      <div key={idx} className="p-3 bg-white border rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{weightLabels[factor.factor] || factor.factor}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{factor.current_weight}</Badge>
                            <ArrowRight className="w-4 h-4 text-slate-400" />
                            <Badge className={factor.suggested_weight > factor.current_weight ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}>
                              {factor.suggested_weight}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{factor.reasoning}</p>
                        {factor.impact && (
                          <p className="text-xs text-slate-400 mt-1">Impact: {factor.impact}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuggestions(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => applySuggestionsMutation.mutate()}
              disabled={applySuggestionsMutation.isPending}
            >
              {applySuggestionsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              Apply Suggestions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}