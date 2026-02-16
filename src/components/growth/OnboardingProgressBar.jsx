import React, { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  CheckCircle2, 
  Circle, 
  Store, 
  RefreshCw, 
  Shield, 
  Bell, 
  DollarSign,
  Settings,
  Users,
  Sparkles,
  Trophy
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STEPS = [
  { key: 'store_connected', label: 'Connect Store', icon: Store },
  { key: 'first_sync', label: 'First Sync', icon: RefreshCw },
  { key: 'first_risk_detection', label: 'Risk Detected', icon: Shield },
  { key: 'first_alert', label: 'First Alert', icon: Bell },
  { key: 'first_saved_profit', label: 'Profit Saved!', icon: DollarSign, milestone: true },
  { key: 'cost_mapping_setup', label: 'Cost Mapping', icon: Settings },
  { key: 'alert_rules_configured', label: 'Alert Rules', icon: Bell },
  { key: 'team_invited', label: 'Team Invited', icon: Users },
  { key: 'first_week_active', label: 'Power User', icon: Trophy, milestone: true }
];

export default function OnboardingProgressBar({ tenantId, compact = false }) {
  const { data: progressData, isLoading } = useQuery({
    queryKey: ['onboardingProgress', tenantId],
    queryFn: async () => {
      const result = await base44.functions.invoke('growthEngine', {
        action: 'get_onboarding_progress',
        tenant_id: tenantId
      });
      return result.data?.progress;
    },
    enabled: !!tenantId,
    staleTime: 30000
  });

  if (isLoading || !progressData) return null;

  const completedSteps = progressData.steps_completed?.map(s => s.step) || [];
  const completionPct = progressData.completion_percentage || 0;
  const isActivated = progressData.is_activated;

  // Don't show if fully complete
  if (completionPct === 100) return null;

  if (compact) {
    return (
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-emerald-800">Getting Started</span>
                <span className="text-sm text-emerald-600">{completionPct}%</span>
              </div>
              <Progress value={completionPct} className="h-2" />
            </div>
            {isActivated && (
              <Badge className="bg-emerald-500 text-white">Activated!</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-slate-50 to-white border-slate-200 overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              Unlock ProfitShield's Power
            </h3>
            <p className="text-sm text-slate-500">Complete these steps to maximize your protection</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-emerald-600">{completionPct}%</span>
            <p className="text-xs text-slate-500">Complete</p>
          </div>
        </div>

        <Progress value={completionPct} className="h-3 mb-6" />

        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {STEPS.map((step, index) => {
            const isComplete = completedSteps.includes(step.key);
            const isCurrent = progressData.current_step === step.key;
            const Icon = step.icon;

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  relative flex flex-col items-center p-2 rounded-lg transition-all
                  ${isComplete ? 'bg-emerald-50' : isCurrent ? 'bg-blue-50' : 'bg-slate-50'}
                  ${step.milestone ? 'ring-2 ring-amber-200' : ''}
                `}
              >
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center mb-1
                  ${isComplete 
                    ? 'bg-emerald-500 text-white' 
                    : isCurrent 
                    ? 'bg-blue-500 text-white animate-pulse' 
                    : 'bg-slate-200 text-slate-400'
                  }
                `}>
                  {isComplete ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <span className={`
                  text-xs text-center leading-tight
                  ${isComplete ? 'text-emerald-700 font-medium' : 'text-slate-500'}
                `}>
                  {step.label}
                </span>
                {step.milestone && (
                  <Badge className="absolute -top-1 -right-1 bg-amber-400 text-amber-900 text-[10px] px-1 py-0">
                    ⭐
                  </Badge>
                )}
              </motion.div>
            );
          })}
        </div>

        {isActivated && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 p-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg text-white text-center"
          >
            <Trophy className="w-6 h-6 mx-auto mb-1" />
            <p className="font-semibold">You're Activated! 🎉</p>
            <p className="text-sm opacity-90">ProfitShield is now protecting your profits</p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}