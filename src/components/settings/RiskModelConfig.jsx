import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, Save, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
  const queryClient = useQueryClient();

  const { data: riskModel, isLoading } = useQuery({
    queryKey: ['riskModel', tenantId],
    queryFn: async () => {
      const models = await base44.entities.TenantRiskModel.filter({ tenant_id: tenantId, is_active: true });
      return models[0];
    },
    enabled: !!tenantId
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
        // Deactivate old model
        await base44.entities.TenantRiskModel.update(riskModel.id, {
          is_active: false,
          deactivated_at: new Date().toISOString()
        });
      }

      // Create new model version
      await base44.entities.TenantRiskModel.create({
        tenant_id: tenantId,
        version: (riskModel?.version || 0) + 1,
        is_active: true,
        weights,
        thresholds,
        activated_at: new Date().toISOString(),
        change_reason: 'User configuration update'
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Adaptive Risk Model
            </CardTitle>
            <CardDescription>
              Customize risk scoring weights for your store
              {riskModel && <Badge variant="outline" className="ml-2">v{riskModel.version}</Badge>}
            </CardDescription>
          </div>
          <div className="flex gap-2">
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
            {Object.entries(weights).map(([key, value]) => (
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
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}