import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/components/platformContext';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Trophy,
  ArrowRight,
  Rocket
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

  // Show prominent CTA if user hasn't started onboarding (0% complete or no store connected)
  const needsOnboarding = completionPct === 0 || !completedSteps.includes('store_connected');

  if (compact) {
    return (
      <Card className={`border-2 ${needsOnboarding ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200' : 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'}`}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            {needsOnboarding ? (
              <>
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg shadow-indigo-500/30">
                  <Rocket className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-indigo-900">Complete Setup to Unlock Full Access</p>
                  <p className="text-xs text-indigo-600">You're currently in demo mode</p>
                </div>
                <Link to={createPageUrl('Onboarding')}>
                  <Button size="sm" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25">
                    Start Here
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden ${needsOnboarding ? 'bg-gradient-to-br from-indigo-50 via-purple-50 to-white border-2 border-indigo-200' : 'bg-gradient-to-br from-slate-50 to-white border-slate-200'}`}>
      <CardContent className="p-6">
        {needsOnboarding ? (
          /* Prominent onboarding CTA for new users */
          <div className="text-center py-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-500/30"
            >
              <Rocket className="w-8 h-8 text-white" />
            </motion.div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Welcome to ProfitShield!</h3>
            <p className="text-slate-600 mb-1">Complete the onboarding to unlock full access</p>
            <p className="text-sm text-slate-500 mb-6">Choose your plan, connect your store, and start protecting your profits</p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
              <Link to={createPageUrl('Onboarding')}>
                <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-500/25 px-8">
                  <Rocket className="w-5 h-5 mr-2" />
                  Start Onboarding
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to={createPageUrl('Pricing')}>
                <Button variant="outline" size="lg" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                  View Plans
                </Button>
              </Link>
            </div>

            <div className="flex items-center justify-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                14-day free trial
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Cancel anytime
              </span>
            </div>
          </div>
        ) : (
          /* Progress view for users who have started */
          <>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}