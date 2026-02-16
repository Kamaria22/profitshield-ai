import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  ShoppingCart, 
  AlertTriangle, 
  CreditCard, 
  Brain, 
  TrendingUp,
  ArrowRight,
  Zap
} from 'lucide-react';

const FlywheelStep = ({ icon: Icon, label, value, color, isLast }) => (
  <div className="flex items-center">
    <div className={`flex flex-col items-center ${color}`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color.replace('text-', 'bg-').replace('700', '100').replace('600', '100').replace('500', '100')}`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-xs mt-1 font-medium">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
    {!isLast && (
      <ArrowRight className="w-6 h-6 text-slate-300 mx-2" />
    )}
  </div>
);

export default function DataFlywheelViz() {
  const { data: moatMetrics } = useQuery({
    queryKey: ['moatMetricsLatest'],
    queryFn: async () => {
      const metrics = await base44.entities.MoatMetric.filter({}, '-created_date', 1);
      return metrics[0] || {};
    }
  });

  const { data: growthMetrics } = useQuery({
    queryKey: ['growthMetricsLatest'],
    queryFn: async () => {
      const metrics = await base44.entities.GrowthMetric.filter({}, '-created_date', 1);
      return metrics[0] || {};
    }
  });

  const { data: roiMetrics } = useQuery({
    queryKey: ['roiMetricsAggregate'],
    queryFn: async () => {
      const metrics = await base44.entities.RiskROIMetric.filter({}, '-created_date', 50);
      // Aggregate
      return {
        chargebacks_prevented: metrics.reduce((s, m) => s + (m.chargebacks_prevented || 0), 0),
        total_analyzed: metrics.reduce((s, m) => s + (m.orders_analyzed || 0), 0)
      };
    }
  });

  const merchants = growthMetrics?.installs?.total || 0;
  const orders = moatMetrics?.data_moat?.total_orders_processed || 0;
  const signals = moatMetrics?.data_moat?.cross_merchant_signals || 0;
  const chargebacksPrevented = roiMetrics?.chargebacks_prevented || 0;
  const accuracy = moatMetrics?.ai_moat?.prediction_accuracy || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          Data Flywheel
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Circular Flow */}
        <div className="flex flex-wrap items-center justify-center gap-2 py-4">
          <FlywheelStep 
            icon={Users} 
            label="Merchants" 
            value={merchants}
            color="text-purple-600"
          />
          <FlywheelStep 
            icon={ShoppingCart} 
            label="Orders" 
            value={orders.toLocaleString()}
            color="text-blue-600"
          />
          <FlywheelStep 
            icon={AlertTriangle} 
            label="Signals" 
            value={signals}
            color="text-amber-600"
          />
          <FlywheelStep 
            icon={CreditCard} 
            label="Prevented" 
            value={chargebacksPrevented}
            color="text-red-600"
          />
          <FlywheelStep 
            icon={Brain} 
            label="Model" 
            value={`${accuracy}%`}
            color="text-emerald-600"
          />
          <FlywheelStep 
            icon={TrendingUp} 
            label="Growth" 
            value="↑"
            color="text-purple-600"
            isLast
          />
        </div>

        {/* Explanation */}
        <div className="mt-4 p-3 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-lg">
          <p className="text-xs text-slate-600 text-center">
            <strong>More merchants</strong> → <strong>More orders</strong> → <strong>Better signals</strong> → 
            <strong>Fewer chargebacks</strong> → <strong>Smarter AI</strong> → <strong>More merchants</strong>
          </p>
        </div>

        {/* Moat Strength Indicator */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 rounded p-2">
            <p className="text-xs text-slate-500">Data Uniqueness</p>
            <p className="font-bold text-slate-700">
              {Math.min(orders / 1000, 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <p className="text-xs text-slate-500">Network Effect</p>
            <p className="font-bold text-slate-700">
              {Math.min(signals * 5, 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <p className="text-xs text-slate-500">AI Advantage</p>
            <p className="font-bold text-slate-700">
              {accuracy}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}