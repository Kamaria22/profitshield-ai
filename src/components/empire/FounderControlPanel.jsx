import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Settings2, Rocket, Shield, Building, Globe, Landmark, 
  Gauge, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

const modeConfig = {
  growth_aggression: {
    icon: Rocket,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    description: 'Maximize growth velocity, accept higher burn',
    params: {
      capital_allocation_bias: { marketing: 0.4, product: 0.3, acquisition: 0.1, infrastructure: 0.1, hiring: 0.1 },
      acquisition_scoring_weight: 0.5,
      pricing_elasticity_sensitivity: 0.3,
      governance_strictness: 'relaxed',
      simulation_risk_tolerance: 0.7
    }
  },
  defensive: {
    icon: Shield,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    description: 'Protect market position, reduce risk exposure',
    params: {
      capital_allocation_bias: { marketing: 0.2, product: 0.4, acquisition: 0.05, infrastructure: 0.25, hiring: 0.1 },
      acquisition_scoring_weight: 0.3,
      pricing_elasticity_sensitivity: 0.8,
      governance_strictness: 'strict',
      simulation_risk_tolerance: 0.3
    }
  },
  acquisition: {
    icon: Building,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    description: 'Prioritize M&A opportunities, consolidate market',
    params: {
      capital_allocation_bias: { marketing: 0.1, product: 0.2, acquisition: 0.5, infrastructure: 0.1, hiring: 0.1 },
      acquisition_scoring_weight: 2.0,
      pricing_elasticity_sensitivity: 0.5,
      governance_strictness: 'standard',
      simulation_risk_tolerance: 0.6
    }
  },
  ipo_preparation: {
    icon: Landmark,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    description: 'Optimize for institutional readiness metrics',
    params: {
      capital_allocation_bias: { marketing: 0.15, product: 0.25, acquisition: 0.1, infrastructure: 0.35, hiring: 0.15 },
      acquisition_scoring_weight: 0.4,
      pricing_elasticity_sensitivity: 0.6,
      governance_strictness: 'maximum',
      simulation_risk_tolerance: 0.2
    }
  },
  global_expansion: {
    icon: Globe,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
    borderColor: 'border-teal-200',
    description: 'Geographic expansion, regional market capture',
    params: {
      capital_allocation_bias: { marketing: 0.3, product: 0.25, acquisition: 0.15, infrastructure: 0.2, hiring: 0.1 },
      acquisition_scoring_weight: 0.8,
      pricing_elasticity_sensitivity: 0.4,
      governance_strictness: 'standard',
      simulation_risk_tolerance: 0.5
    }
  },
  stability: {
    icon: Gauge,
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    description: 'Balanced operations, predictable growth',
    params: {
      capital_allocation_bias: { marketing: 0.2, product: 0.3, acquisition: 0.1, infrastructure: 0.2, hiring: 0.2 },
      acquisition_scoring_weight: 1.0,
      pricing_elasticity_sensitivity: 0.5,
      governance_strictness: 'standard',
      simulation_risk_tolerance: 0.5
    }
  }
};

export default function FounderControlPanel() {
  const queryClient = useQueryClient();

  const { data: modes, isLoading } = useQuery({
    queryKey: ['founderControlModes'],
    queryFn: async () => {
      const modes = await base44.entities.FounderControlMode.filter({});
      return modes;
    }
  });

  const activateModeMutation = useMutation({
    mutationFn: async (modeName) => {
      // Deactivate all modes first
      const currentModes = await base44.entities.FounderControlMode.filter({ is_active: true });
      for (const m of currentModes) {
        await base44.entities.FounderControlMode.update(m.id, { is_active: false });
      }

      // Check if mode exists, create or update
      const existing = await base44.entities.FounderControlMode.filter({ mode_name: modeName });
      const config = modeConfig[modeName];
      
      if (existing.length > 0) {
        await base44.entities.FounderControlMode.update(existing[0].id, {
          is_active: true,
          activated_at: new Date().toISOString(),
          ...config.params
        });
      } else {
        await base44.entities.FounderControlMode.create({
          mode_name: modeName,
          is_active: true,
          activated_at: new Date().toISOString(),
          ...config.params
        });
      }

      return modeName;
    },
    onSuccess: (modeName) => {
      queryClient.invalidateQueries({ queryKey: ['founderControlModes'] });
      toast.success(`${modeName.replace('_', ' ')} mode activated`);
    }
  });

  const activeMode = modes?.find(m => m.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-slate-600" />
            Founder Control Panel
          </h2>
          <p className="text-sm text-slate-500">Strategic operating mode configuration</p>
        </div>
        {activeMode && (
          <Badge className={`${modeConfig[activeMode.mode_name]?.bgColor} ${modeConfig[activeMode.mode_name]?.color} border ${modeConfig[activeMode.mode_name]?.borderColor}`}>
            Active: {activeMode.mode_name?.replace('_', ' ')}
          </Badge>
        )}
      </div>

      {/* Mode Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(modeConfig).map(([modeName, config]) => {
          const Icon = config.icon;
          const isActive = activeMode?.mode_name === modeName;
          
          return (
            <Card 
              key={modeName} 
              className={`cursor-pointer transition-all ${isActive ? `border-2 ${config.borderColor} ${config.bgColor}` : 'hover:border-slate-300'}`}
              onClick={() => activateModeMutation.mutate(modeName)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-6 h-6 ${config.color}`} />
                  {isActive && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                </div>
                <h3 className="font-semibold capitalize">{modeName.replace('_', ' ')}</h3>
                <p className="text-xs text-slate-500 mt-1">{config.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Active Mode Details */}
      {activeMode && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active Mode Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">Acquisition Weight</p>
                <p className="text-lg font-bold">{activeMode.acquisition_scoring_weight?.toFixed(1)}x</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Pricing Sensitivity</p>
                <p className="text-lg font-bold">{((activeMode.pricing_elasticity_sensitivity || 0) * 100).toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Governance</p>
                <Badge variant="outline" className="capitalize">{activeMode.governance_strictness}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Risk Tolerance</p>
                <p className="text-lg font-bold">{((activeMode.simulation_risk_tolerance || 0) * 100).toFixed(0)}%</p>
              </div>
            </div>

            {activeMode.capital_allocation_bias && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-slate-500 mb-2">Capital Allocation Bias</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(activeMode.capital_allocation_bias).map(([key, value]) => (
                    <Badge key={key} variant="outline">
                      {key}: {((value || 0) * 100).toFixed(0)}%
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mode Impact Warning */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Mode Impact</p>
              <p className="text-sm text-amber-700">
                Changing operating modes affects capital allocation recommendations, acquisition scoring, 
                simulation risk parameters, and governance audit strictness across all strategic systems.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}