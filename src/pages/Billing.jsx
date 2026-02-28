import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlatformResolver, requireResolved } from '@/components/usePlatformResolver';
import HolographicCard from '@/components/quantum/HolographicCard';
import QuantumButton from '@/components/quantum/QuantumButton';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown, Rocket, Star, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

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
      'Standard support'
    ]
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
      'Churn prediction'
    ]
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
      'Dedicated support'
    ]
  }
];

export default function Billing() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const tenantId = resolverCheck.tenantId;
  const user = resolver.user;
  const queryClient = useQueryClient();
  const [billingCycle, setBillingCycle] = useState('monthly');

  // Check which price IDs are configured
  const { data: stripeHealth } = useQuery({
    queryKey: ['stripe-health'],
    queryFn: async () => {
      const res = await base44.functions.invoke('stripeCheckout', { action: 'ping' });
      return res.data || {};
    },
    staleTime: 60000,
  });

  const isPlanAvailable = (planCode) => {
    if (!stripeHealth) return true; // optimistic while loading
    const key = `${planCode}_${billingCycle}`;
    return !(stripeHealth.missing_price_ids || []).includes(key);
  };

  const { data: subscription } = useQuery({
    queryKey: ['subscription', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const subs = await base44.entities.Subscription.filter({ tenant_id: tenantId });
      return subs[0] || null;
    },
    enabled: !!tenantId
  });

  const { data: trialStatus } = useQuery({
    queryKey: ['trial-status', user?.id],
    queryFn: async () => {
      const response = await base44.functions.invoke('subscriptionManager', {
        action: 'get_trial_status',
        user_id: user.id
      });
      return response.data?.data;
    },
    enabled: !!user
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planCode) => {
      const response = await base44.functions.invoke('stripeCheckout', {
        action: 'create_checkout',
        plan_code: planCode,
        billing_cycle: billingCycle,
        tenant_id: tenantId
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
      toast.error('Checkout failed: ' + error.message);
    }
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('stripeCheckout', {
        action: 'create_portal',
        tenant_id: tenantId
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.data?.portal_url) {
        window.open(data.data.portal_url, '_blank');
      }
    }
  });

  return (
    <div className="space-y-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-3">
          Choose Your Plan
        </h1>
        <p className="text-slate-400 text-lg">
          Unlock the full power of ProfitShield AI
        </p>
      </div>

      {trialStatus?.trial_active && (
        <HolographicCard glow className="p-6 text-center">
          <p className="text-cyan-300 text-lg">
            You have <strong className="text-cyan-400">{trialStatus.days_remaining} days</strong> left in your trial
          </p>
        </HolographicCard>
      )}

      {subscription && subscription.status === 'ACTIVE' && (
        <HolographicCard glow className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Current Plan: {subscription.plan_code}</h3>
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

      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center gap-4 mb-8">
        <button
          onClick={() => setBillingCycle('monthly')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            billingCycle === 'monthly'
              ? 'bg-cyan-500 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingCycle('yearly')}
          className={`px-6 py-2 rounded-lg font-medium transition-all ${
            billingCycle === 'yearly'
              ? 'bg-cyan-500 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          Yearly <Badge className="ml-2 bg-emerald-500">Save 17%</Badge>
        </button>
      </div>

      {/* Plans Grid */}
      <div className="grid md:grid-cols-3 gap-6">
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
                  <Star className="w-3 h-3 mr-1" /> Most Popular
                </Badge>
              )}

              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6 text-white" />
              </div>

              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
              
              <div className="mb-6">
                <span className="text-4xl font-bold text-cyan-400">${price}</span>
                <span className="text-slate-400">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
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

      {/* Enterprise */}
      <HolographicCard glow scanline className="p-8 text-center">
        <h3 className="text-2xl font-bold text-white mb-2">Enterprise</h3>
        <p className="text-slate-400 mb-6">
          Custom solutions for large organizations with advanced requirements
        </p>
        <QuantumButton variant="primary">
          Contact Sales
        </QuantumButton>
      </HolographicCard>
    </div>
  );
}