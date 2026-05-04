// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, Crown, ExternalLink, Rocket, Star, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { base44 } from '@/api/base44Client';
import { invokeWithRetry } from '@/lib/safeApi';
import { usePlatformResolver, requireResolved } from '@/components/usePlatformResolver';
import HolographicCard from '@/components/quantum/HolographicCard';
import QuantumButton from '@/components/quantum/QuantumButton';
import { Badge } from '@/components/ui/badge';

const PLANS = [
  {
    code: 'STARTER',
    name: 'Starter',
    monthly_price: 49,
    yearly_price: 490,
    yearly_monthly_equiv: 41,
    icon: Zap,
    color: 'from-cyan-500 to-blue-500',
    features: [
      'Up to 500 orders/month',
      'Full profit analytics',
      'Advanced risk scoring',
      'Email + push alerts',
      'Two-way Shopify sync',
      '5 custom risk rules',
      'Standard support',
    ],
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    monthly_price: 99,
    yearly_price: 990,
    yearly_monthly_equiv: 83,
    icon: Rocket,
    color: 'from-purple-500 to-pink-500',
    highlight: true,
    features: [
      'Up to 2,500 orders/month',
      'AI fraud detection',
      'All notification channels',
      'Up to 3 store connections',
      '25 custom risk rules',
      'Full API access',
      'Priority support',
      'Churn prediction',
    ],
  },
  {
    code: 'PRO',
    name: 'Pro',
    monthly_price: 199,
    yearly_price: 1990,
    yearly_monthly_equiv: 166,
    icon: Crown,
    color: 'from-amber-500 to-orange-500',
    features: [
      'Up to 10,000 orders/month',
      'AI fraud ring detection',
      'SMS + WhatsApp alerts',
      'Unlimited store connections',
      'Real-time Shopify sync',
      'Unlimited risk rules',
      'Webhooks + full API',
      'Dedicated support',
    ],
  },
];

export default function Billing() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const tenantId = resolverCheck.tenantId;
  const user = resolver.user;
  const location = useLocation();
  const [billingCycle, setBillingCycle] = useState('monthly');

  const {
    data: subscription,
    isError: subscriptionError,
    refetch: refetchSubscription,
  } = useQuery({
    queryKey: ['subscription', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const subs = await base44.entities.Subscription.filter({ tenant_id: tenantId });
      return subs[0] || null;
    },
    enabled: !!tenantId,
  });

  const {
    data: trialStatus,
    isError: trialStatusError,
    refetch: refetchTrialStatus,
  } = useQuery({
    queryKey: ['trial-status', user?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('subscriptionManager', {
        action: 'get_trial_status',
        user_id: user.id,
      });
      return response.data?.data;
    },
    enabled: !!user,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planCode) => {
      const response = await base44.functions.invoke('stripeCheckout', {
        action: 'create_checkout',
        plan_code: planCode,
        billing_cycle: billingCycle,
        tenant_id: tenantId,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data?.checkout_url) {
        window.location.href = data.data.checkout_url;
      } else {
        toast.success('Redirecting to checkout...');
      }
    },
    onError: (error) => {
      toast.error(`Checkout failed: ${error.message}`);
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('stripeCheckout', {
        action: 'create_portal',
        tenant_id: tenantId,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data?.portal_url) {
        window.open(data.data.portal_url, '_blank', 'noopener,noreferrer');
      }
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const params = new URLSearchParams(location.search || '');
    if (params.get('checkout') !== 'success') return;

    let cancelled = false;
    const key = `ps:billing-bootstrap:${tenantId}:${params.get('session_id') || 'latest'}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {}

    (async () => {
      try {
        await invokeWithRetry('shopifyActivationBootstrap', {
          tenant_id: tenantId,
          source: 'billing_checkout_success',
          force: true,
          days: 30,
        });
      } catch {}

      if (!cancelled) {
        refetchSubscription();
        refetchTrialStatus();
        toast.success('Plan activated. Syncing store and refreshing dashboard.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, location.search, refetchSubscription, refetchTrialStatus]);

  return (
    <div className="space-y-8">
      <div className="mb-12 text-center">
        <h1 className="mb-3 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-4xl font-bold text-transparent">
          Choose Your Plan
        </h1>
        <p className="text-lg text-slate-400">
          Unlock the full power of ProfitShield AI
        </p>
      </div>

      {(subscriptionError || trialStatusError) && (
        <HolographicCard className="border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-300">Billing status could not fully refresh</p>
              <p className="mt-1 text-sm text-slate-400">
                Plan changes may still work, but subscription or trial status may be stale.
              </p>
            </div>
            <QuantumButton
              size="sm"
              variant="outline"
              onClick={() => {
                refetchSubscription();
                refetchTrialStatus();
              }}
            >
              Retry
            </QuantumButton>
          </div>
        </HolographicCard>
      )}

      {trialStatus?.trial_active && (
        <HolographicCard glow className="p-6 text-center">
          <p className="text-lg text-cyan-300">
            You have <strong className="text-cyan-400">{trialStatus.days_remaining} days</strong> left in your trial
          </p>
          {trialStatus?.trial_ends_at && (
            <p className="mt-2 text-xs text-slate-500">
              Trial ends {new Date(trialStatus.trial_ends_at).toLocaleDateString()}
            </p>
          )}
        </HolographicCard>
      )}

      {subscription && subscription.status === 'ACTIVE' && (
        <HolographicCard glow className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="mb-1 text-xl font-bold text-white">Current Plan: {subscription.plan_code}</h3>
              <p className="text-slate-400">Status: {subscription.status}</p>
            </div>
            <QuantumButton
              variant="primary"
              onClick={() => portalMutation.mutate()}
              loading={portalMutation.isPending}
              icon={ExternalLink}
            >
              Manage Subscription
            </QuantumButton>
          </div>
        </HolographicCard>
      )}

      <div className="mb-8 flex items-center justify-center gap-4">
        <button
          onClick={() => setBillingCycle('monthly')}
          className={`rounded-lg px-6 py-2 font-medium transition-all ${
            billingCycle === 'monthly'
              ? 'bg-cyan-500 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingCycle('yearly')}
          className={`rounded-lg px-6 py-2 font-medium transition-all ${
            billingCycle === 'yearly'
              ? 'bg-cyan-500 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Yearly <Badge className="ml-2 bg-emerald-500">Save 17%</Badge>
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const price = billingCycle === 'monthly' ? plan.monthly_price : plan.yearly_price;
          const isCurrentPlan = subscription?.plan_code === plan.code;

          return (
            <HolographicCard
              key={plan.code}
              glow={plan.highlight}
              className={`p-6 ${plan.highlight ? 'border-2 border-purple-500/50' : ''}`}
            >
              {plan.highlight && (
                <Badge className="mb-4 bg-purple-500 text-white">
                  <Star className="mr-1 h-3 w-3" /> Most Popular
                </Badge>
              )}

              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br ${plan.color}`}>
                <Icon className="h-6 w-6 text-white" />
              </div>

              <h3 className="mb-2 text-2xl font-bold text-white">{plan.name}</h3>

              <div className="mb-6">
                <span className="text-4xl font-bold text-cyan-400">${price}</span>
                <span className="text-slate-400">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                {billingCycle === 'yearly' && (
                  <p className="mt-1 text-xs text-emerald-400">
                    ~${plan.yearly_monthly_equiv}/mo · 2 months free
                  </p>
                )}
              </div>

              <ul className="mb-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                    {feature}
                  </li>
                ))}
              </ul>

              <QuantumButton
                variant={plan.highlight ? 'primary' : 'default'}
                className="w-full"
                onClick={() => checkoutMutation.mutate(plan.code)}
                loading={checkoutMutation.isPending}
                disabled={isCurrentPlan}
              >
                {isCurrentPlan ? 'Current Plan' : 'Upgrade'}
              </QuantumButton>
            </HolographicCard>
          );
        })}
      </div>

      <HolographicCard glow scanline className="p-8 text-center">
        <h3 className="mb-2 text-2xl font-bold text-white">Enterprise</h3>
        <p className="mb-6 text-slate-400">
          Custom solutions for large organizations with advanced requirements
        </p>
        <QuantumButton variant="primary">
          Contact Sales
        </QuantumButton>
      </HolographicCard>
    </div>
  );
}
