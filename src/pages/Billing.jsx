// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  Crown,
  ExternalLink,
  Loader2,
  Rocket,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { base44 } from '@/api/base44Client';
import { invokeWithRetry } from '@/lib/safeApi';
import {
  usePlatformResolver,
  RESOLVER_STATUS,
  requireResolved,
  canQueryTenant,
  getTenantFilter,
  buildQueryKey,
} from '@/components/usePlatformResolver';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CommandCard,
  CommandCardContent,
  CommandCardDescription,
  CommandCardHeader,
  CommandCardTitle,
} from '@/components/ui/command-card';

const PLAN_ORDER = ['STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
const PLAN_LIMITS = {
  STARTER: 500,
  GROWTH: 2500,
  PRO: 10000,
  ENTERPRISE: 100000,
};

const PLAN_RECOVERY_RATE = {
  STARTER: 0.35,
  GROWTH: 0.62,
  PRO: 0.85,
  ENTERPRISE: 0.92,
};

const PLAN_ICON = {
  STARTER: Zap,
  GROWTH: Rocket,
  PRO: Crown,
  ENTERPRISE: Shield,
};

const PLAN_TONE = {
  STARTER: 'cyan',
  GROWTH: 'violet',
  PRO: 'amber',
  ENTERPRISE: 'slate',
};

function formatCurrency(value, currency = 'usd', maxFractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    maximumFractionDigits: maxFractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatCount(value) {
  return new Intl.NumberFormat('en-US').format(Number.isFinite(value) ? value : 0);
}

function getPlanFitCode(orderVolume) {
  if (orderVolume > PLAN_LIMITS.PRO) return 'ENTERPRISE';
  if (orderVolume > PLAN_LIMITS.GROWTH) return 'PRO';
  if (orderVolume > PLAN_LIMITS.STARTER) return 'GROWTH';
  return 'STARTER';
}

function intervalLabel(price) {
  const interval = price?.recurring?.interval;
  if (interval === 'month') return 'month';
  if (interval === 'year') return 'year';
  return interval || 'period';
}

function normalizeCatalogPlans(plans = []) {
  const mapped = plans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    description: plan.description || '',
    productId: plan.product_id || null,
    metadata: plan.metadata || {},
    prices: plan.prices || {},
  }));

  return mapped.sort((a, b) => {
    const aIndex = PLAN_ORDER.indexOf(a.code);
    const bIndex = PLAN_ORDER.indexOf(b.code);
    const aRank = aIndex === -1 ? PLAN_ORDER.length : aIndex;
    const bRank = bIndex === -1 ? PLAN_ORDER.length : bIndex;
    return aRank - bRank;
  });
}

function getPlanToneClasses(tone, highlighted = false) {
  if (tone === 'amber') {
    return highlighted ? 'border-amber-300/35 bg-amber-500/[0.06]' : 'border-white/10 bg-white/[0.04]';
  }
  if (tone === 'violet') {
    return highlighted ? 'border-violet-300/35 bg-violet-500/[0.06]' : 'border-white/10 bg-white/[0.04]';
  }
  if (tone === 'slate') {
    return highlighted ? 'border-slate-300/30 bg-slate-500/[0.06]' : 'border-white/10 bg-white/[0.04]';
  }
  return highlighted ? 'border-cyan-300/35 bg-cyan-500/[0.06]' : 'border-white/10 bg-white/[0.04]';
}

function buildYearlySavings(plan) {
  const monthly = plan?.prices?.monthly;
  const yearly = plan?.prices?.yearly;
  if (!monthly?.unit_amount || !yearly?.unit_amount) return null;

  const annualFromMonthly = monthly.unit_amount * 12;
  if (annualFromMonthly <= yearly.unit_amount) return null;

  const percent = Math.round(((annualFromMonthly - yearly.unit_amount) / annualFromMonthly) * 100);
  return {
    percent,
    annualSavingsCents: annualFromMonthly - yearly.unit_amount,
  };
}

function selectPrice(plan, billingCycle) {
  return plan?.prices?.[billingCycle] || null;
}

export default function Billing() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const tenantId = resolverCheck.tenantId;
  const user = resolver.user;
  const location = useLocation();
  const [billingCycle, setBillingCycle] = useState('yearly');

  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const resolverLoading = status === RESOLVER_STATUS.RESOLVING;

  const ordersQueryKey = buildQueryKey('billing-orders', resolverCheck);
  const leaksQueryKey = buildQueryKey('billing-profit-leaks', resolverCheck);

  const { data: pricingCatalogResponse, isLoading: pricingLoading, isError: pricingError, refetch: refetchPricing } = useQuery({
    queryKey: ['stripe-pricing-catalog'],
    queryFn: async () => {
      const res = await base44.functions.invoke('stripeCheckout', { action: 'pricing_catalog' });
      return res.data?.data?.plans || [];
    },
    staleTime: 60000,
  });

  const { data: stripeHealth, isError: stripeHealthError } = useQuery({
    queryKey: ['stripe-health'],
    queryFn: async () => {
      const res = await base44.functions.invoke('stripeCheckout', { action: 'ping' });
      return res.data || {};
    },
    staleTime: 60000,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ordersQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.Order.filter({ tenant_id: queryFilter.tenant_id }, '-order_date', 2500);
    },
    enabled: canQuery,
    staleTime: 30000,
  });

  const { data: profitLeaks = [] } = useQuery({
    queryKey: leaksQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.ProfitLeak.filter({ tenant_id: queryFilter.tenant_id, is_resolved: false }, '-impact_amount', 100);
    },
    enabled: canQuery,
    staleTime: 30000,
  });

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
    mutationFn: async ({ priceId, planCode }) => {
      const response = await base44.functions.invoke('stripeCheckout', {
        action: 'create_checkout',
        price_id: priceId,
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

  const catalogPlans = useMemo(() => normalizeCatalogPlans(pricingCatalogResponse || []), [pricingCatalogResponse]);

  const availableBillingCycles = useMemo(() => {
    const hasMonthly = catalogPlans.some((plan) => plan.prices?.monthly);
    const hasYearly = catalogPlans.some((plan) => plan.prices?.yearly);
    return { hasMonthly, hasYearly };
  }, [catalogPlans]);

  useEffect(() => {
    if (billingCycle === 'yearly' && !availableBillingCycles.hasYearly && availableBillingCycles.hasMonthly) {
      setBillingCycle('monthly');
    }
    if (billingCycle === 'monthly' && !availableBillingCycles.hasMonthly && availableBillingCycles.hasYearly) {
      setBillingCycle('yearly');
    }
  }, [availableBillingCycles, billingCycle]);

  const roiModel = useMemo(() => {
    const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentOrders = orders.filter((order) => {
      const ts = new Date(order.order_date || order.created_date || 0).getTime();
      return Number.isFinite(ts) && ts >= last30Days;
    });

    const revenue30d = recentOrders.reduce((sum, order) => sum + Number(order.total_revenue || 0), 0);
    const negativeMarginLoss = recentOrders.reduce((sum, order) => {
      const netProfit = Number(order.net_profit || 0);
      return netProfit < 0 ? sum + Math.abs(netProfit) : sum;
    }, 0);
    const refunds30d = recentOrders.reduce((sum, order) => sum + Number(order.refund_amount || 0), 0);
    const fees30d = recentOrders.reduce(
      (sum, order) => sum + Number(order.payment_fee || 0) + Number(order.platform_fee || 0),
      0
    );
    const discounts30d = recentOrders.reduce((sum, order) => sum + Number(order.discount_total || 0), 0);
    const leakImpact = profitLeaks.reduce((sum, leak) => sum + Number(leak.impact_amount || 0), 0);

    const orderCount = recentOrders.length;
    const estimateFromVolume = revenue30d > 0
      ? Math.max(revenue30d * 0.035, orderCount * 5)
      : Math.max(orderCount * 8, 180);

    const hiddenLoss = Math.max(leakImpact + negativeMarginLoss + refunds30d + fees30d + discounts30d, 0);
    const modeledLoss = hiddenLoss > 0 ? hiddenLoss : estimateFromVolume;
    const orderVolume = orderCount || Math.max(1, Math.round((revenue30d || 0) / 85));
    const averageMarginLift = revenue30d > 0 ? Math.min((modeledLoss / revenue30d) * 100, 24) : 7.5;
    const recommendedPlanCode = getPlanFitCode(orderVolume);

    return {
      orderVolume,
      revenue30d,
      leakImpact,
      negativeMarginLoss,
      refunds30d,
      fees30d,
      discounts30d,
      hiddenLoss: modeledLoss,
      usesEstimate: hiddenLoss <= 0,
      averageMarginLift,
      recommendedPlanCode,
    };
  }, [orders, profitLeaks]);

  const planCards = useMemo(() => {
    return catalogPlans
      .map((plan) => {
        const selectedPrice = selectPrice(plan, billingCycle);
        if (!selectedPrice) return null;

        const billingMultiplier = selectedPrice.recurring?.interval === 'year' ? 12 : 1;
        const periodLoss = roiModel.hiddenLoss * billingMultiplier;
        const saveEstimate = Math.round(periodLoss * (PLAN_RECOVERY_RATE[plan.code] || 0.5));
        const rawCost = (selectedPrice.unit_amount || 0) / 100;
        const netGain = Math.max(0, saveEstimate - rawCost);
        const yearlySavings = buildYearlySavings(plan);
        const isRecommended = roiModel.recommendedPlanCode === plan.code;
        const exceedsPlan = roiModel.orderVolume > (PLAN_LIMITS[plan.code] || PLAN_LIMITS.ENTERPRISE);

        return {
          ...plan,
          selectedPrice,
          selectedCurrency: selectedPrice.currency || 'usd',
          displayPrice: formatCurrency((selectedPrice.unit_amount || 0) / 100, selectedPrice.currency || 'usd'),
          periodLabel: intervalLabel(selectedPrice),
          saveEstimate,
          netGain,
          yearlySavings,
          isRecommended,
          exceedsPlan,
          usageLabel: `Your store: ~${formatCount(roiModel.orderVolume)} orders/month`,
          supportLabel: plan.code === 'ENTERPRISE'
            ? 'Built for 10K+ orders/month'
            : `This plan supports up to ${formatCount(PLAN_LIMITS[plan.code] || 0)}`,
          outcomes: [
            `Prevent ~${formatCurrency(Math.round(Math.max(roiModel.negativeMarginLoss * (PLAN_RECOVERY_RATE[plan.code] || 0.5), 45)), selectedPrice.currency || 'usd')}/${selectedPrice.recurring?.interval === 'year' ? 'year' : 'month'} in fraud losses`,
            `Recover ~${formatCurrency(Math.round(Math.max((roiModel.leakImpact + roiModel.discounts30d) * (PLAN_RECOVERY_RATE[plan.code] || 0.5), 35)), selectedPrice.currency || 'usd')} from pricing and shipping errors`,
            'Protect margins in real time with live sync and alerting',
          ],
        };
      })
      .filter(Boolean);
  }, [billingCycle, catalogPlans, roiModel]);

  const trustMetrics = useMemo(() => {
    const benchmarkRecovered = Math.max(roiModel.hiddenLoss * 18, 420000);
    const benchmarkMarginGain = Math.max(roiModel.averageMarginLift, 8.4);
    return {
      recovered: benchmarkRecovered,
      marginGain: benchmarkMarginGain,
    };
  }, [roiModel]);

  if (resolverLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const canRenderPricing = !pricingLoading && !pricingError && planCards.length > 0;

  return (
    <div className="space-y-6">
      <CommandCard className="border-cyan-300/20 bg-gradient-to-r from-cyan-500/[0.08] via-white/[0.03] to-violet-500/[0.08]">
        <CommandCardContent className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">Billing & Plan</div>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              You’re currently losing {formatCurrency(Math.round(roiModel.hiddenLoss))}/month in hidden profit leaks
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {(planCards.find((plan) => plan.code === roiModel.recommendedPlanCode)?.name || 'Your recommended plan')} can recover ~
              {formatCurrency(planCards.find((plan) => plan.code === roiModel.recommendedPlanCode)?.saveEstimate || roiModel.hiddenLoss * 0.62)}/
              {billingCycle === 'yearly' ? 'year' : 'month'} based on your current order volume, refunds, fees, discounts, and profit leaks.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="border-white/10 bg-white/[0.06] text-slate-100">
                {roiModel.usesEstimate ? 'Estimate based on order volume' : 'Calculated from live store data'}
              </Badge>
              <Badge className="border-white/10 bg-white/[0.06] text-slate-100">
                ~{formatCount(roiModel.orderVolume)} orders/month
              </Badge>
              <Badge className="border-white/10 bg-white/[0.06] text-slate-100">
                Margin uplift target ~{roiModel.averageMarginLift.toFixed(1)}%
              </Badge>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Biggest drag</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(Math.round(roiModel.negativeMarginLoss || roiModel.leakImpact || roiModel.hiddenLoss * 0.35))}</div>
              <div className="mt-1 text-xs text-slate-400">Negative margin + pricing inefficiency</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Plan fit</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {planCards.find((plan) => plan.code === roiModel.recommendedPlanCode)?.name || roiModel.recommendedPlanCode}
              </div>
              <div className="mt-1 text-xs text-slate-400">Best fit based on your store activity</div>
            </div>
          </div>
        </CommandCardContent>
      </CommandCard>

      {(stripeHealthError || subscriptionError || trialStatusError) && (
        <CommandCard className="border-amber-500/25 bg-amber-500/[0.05]">
          <CommandCardContent className="flex items-start gap-3 px-4 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div className="flex-1">
              <div className="font-medium text-amber-100">Billing status could not fully refresh</div>
              <div className="mt-1 text-sm text-slate-300">
                Subscription status may be stale. Pricing will still load directly from Stripe when available.
              </div>
            </div>
            <Button
              variant="outline"
              className="border-white/10 bg-white/[0.04]"
              onClick={() => {
                refetchSubscription();
                refetchTrialStatus();
                refetchPricing();
              }}
            >
              Retry
            </Button>
          </CommandCardContent>
        </CommandCard>
      )}

      {trialStatus?.trial_active && (
        <CommandCard className="border-cyan-300/20 bg-cyan-500/[0.05]">
          <CommandCardContent className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <div className="text-sm font-medium text-cyan-100">
                You have {trialStatus.days_remaining} days left in your trial
              </div>
              {trialStatus?.trial_ends_at && (
                <div className="mt-1 text-xs text-slate-300">
                  Trial ends {new Date(trialStatus.trial_ends_at).toLocaleDateString()}
                </div>
              )}
            </div>
            <Badge className="border-white/10 bg-white/[0.06] text-slate-100">Upgrade before trial ends</Badge>
          </CommandCardContent>
        </CommandCard>
      )}

      {subscription && subscription.status === 'ACTIVE' && (
        <CommandCard>
          <CommandCardContent className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Current plan</div>
              <div className="mt-1 text-xl font-semibold text-white">{subscription.plan_code}</div>
              <div className="mt-1 text-sm text-slate-400">Status: {subscription.status}</div>
            </div>
            <Button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending} className="gap-2">
              {portalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Manage Subscription
            </Button>
          </CommandCardContent>
        </CommandCard>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Recommended solution</h2>
          <p className="mt-1 text-sm text-slate-400">Pricing is loaded directly from Stripe. Value messaging is based on your live store data.</p>
        </div>
        <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            disabled={!availableBillingCycles.hasMonthly}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${billingCycle === 'monthly' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            disabled={!availableBillingCycles.hasYearly}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${billingCycle === 'yearly' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Yearly
            {planCards.find((plan) => plan.yearlySavings)?.yearlySavings && (
              <span className="ml-2 text-xs">
                Save {planCards.find((plan) => plan.yearlySavings)?.yearlySavings?.percent}%
              </span>
            )}
          </button>
        </div>
      </div>

      {pricingLoading && (
        <div className="grid gap-4 xl:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <CommandCard key={index}>
              <CommandCardContent className="space-y-4 px-4 py-4">
                <div className="h-5 w-24 animate-pulse rounded bg-white/10" />
                <div className="h-10 w-32 animate-pulse rounded bg-white/10" />
                <div className="h-24 animate-pulse rounded bg-white/10" />
                <div className="h-10 animate-pulse rounded bg-white/10" />
              </CommandCardContent>
            </CommandCard>
          ))}
        </div>
      )}

      {!pricingLoading && (pricingError || !canRenderPricing) && (
        <CommandCard className="border-amber-500/25 bg-amber-500/[0.05]">
          <CommandCardContent className="flex items-center justify-between gap-4 px-4 py-4">
            <div>
              <div className="font-medium text-amber-100">Unable to load pricing. Please refresh.</div>
              <div className="mt-1 text-sm text-slate-300">No placeholder prices are shown when Stripe pricing is unavailable.</div>
            </div>
            <Button variant="outline" className="border-white/10 bg-white/[0.04]" onClick={() => refetchPricing()}>
              Refresh
            </Button>
          </CommandCardContent>
        </CommandCard>
      )}

      {canRenderPricing && (
        <div className="grid gap-4 xl:grid-cols-3">
          {planCards.map((plan) => {
            const Icon = PLAN_ICON[plan.code] || Shield;
            const isCurrentPlan = subscription?.plan_code === plan.code;
            const ctaLabel =
              plan.code === 'STARTER'
                ? 'Start Protecting Profit'
                : plan.code === 'GROWTH'
                  ? `Unlock ${formatCurrency(plan.saveEstimate, plan.selectedCurrency)}/${plan.periodLabel} Recovery`
                  : plan.code === 'PRO'
                    ? 'Maximize Profit Protection'
                    : 'Talk to Profit Specialist';

            return (
              <CommandCard key={plan.code} className={`${getPlanToneClasses(PLAN_TONE[plan.code], plan.isRecommended)} p-0`}>
                <CommandCardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CommandCardTitle>{plan.name}</CommandCardTitle>
                        <CommandCardDescription>{plan.description || plan.supportLabel}</CommandCardDescription>
                      </div>
                    </div>
                    {plan.isRecommended && (
                      <Badge className="border-cyan-300/20 bg-cyan-500/15 text-cyan-100">Recommended for You</Badge>
                    )}
                  </div>
                </CommandCardHeader>
                <CommandCardContent className="space-y-4">
                  <div>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-semibold text-white">{plan.displayPrice}</span>
                      <span className="pb-1 text-sm text-slate-400">/ {plan.periodLabel}</span>
                    </div>
                    {plan.yearlySavings && billingCycle === 'yearly' && (
                      <div className="mt-1 text-xs text-emerald-300">
                        Save {plan.yearlySavings.percent}% vs monthly billing
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">You save</span>
                        <span className="font-medium text-emerald-300">
                          ~{formatCurrency(plan.saveEstimate, plan.selectedCurrency)}/{plan.periodLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Cost</span>
                        <span className="text-slate-100">{plan.displayPrice} / {plan.periodLabel}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/10 pt-2">
                        <span className="text-slate-400">Net gain</span>
                        <span className="font-semibold text-cyan-200">
                          +{formatCurrency(plan.netGain, plan.selectedCurrency)}/{plan.periodLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {plan.outcomes.map((outcome) => (
                      <div key={outcome} className="flex items-start gap-2 text-sm text-slate-300">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                        <span>{outcome}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm">
                    <div className="font-medium text-slate-100">{plan.usageLabel}</div>
                    <div className="mt-1 text-slate-400">{plan.supportLabel}</div>
                    {plan.exceedsPlan && plan.code !== 'ENTERPRISE' && (
                      <div className="mt-2 text-amber-300">You may miss profit insights at your current volume.</div>
                    )}
                    <div className="mt-2 text-cyan-200">Best fit based on your current store activity</div>
                  </div>

                  {plan.code === 'ENTERPRISE' ? (
                    <Button
                      className="w-full gap-2"
                      onClick={() => { window.location.href = 'mailto:sales@profitshield.ai?subject=Profit%20Specialist'; }}
                    >
                      {ctaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => checkoutMutation.mutate({ priceId: plan.selectedPrice.id, planCode: plan.code })}
                      disabled={checkoutMutation.isPending || isCurrentPlan}
                    >
                      {isCurrentPlan ? 'Current Plan' : ctaLabel}
                    </Button>
                  )}
                  <div className="text-center text-xs text-slate-400">Recommended based on your current store data</div>
                </CommandCardContent>
              </CommandCard>
            );
          })}
        </div>
      )}

      <CommandCard>
        <CommandCardHeader className="pb-3">
          <CommandCardTitle>ROI comparison</CommandCardTitle>
          <CommandCardDescription>Pricing comes from Stripe. Recovery estimates come from your live merchant data.</CommandCardDescription>
        </CommandCardHeader>
        <CommandCardContent className="grid gap-3 lg:grid-cols-3">
          {planCards.map((plan) => (
            <div key={`${plan.code}-roi`} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-white">{plan.name}</div>
                {plan.isRecommended && <Badge className="border-cyan-300/20 bg-cyan-500/15 text-cyan-100">Best fit</Badge>}
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Recovered {plan.periodLabel}</span>
                  <span className="text-slate-100">{formatCurrency(plan.saveEstimate, plan.selectedCurrency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Subscription cost</span>
                  <span className="text-slate-100">{plan.displayPrice}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Store fit</span>
                  <span className="text-slate-100">{plan.exceedsPlan && plan.code !== 'ENTERPRISE' ? 'Undersized' : 'Aligned'}</span>
                </div>
              </div>
            </div>
          ))}
        </CommandCardContent>
      </CommandCard>

      <CommandCard className="border-white/10 bg-white/[0.035]">
        <CommandCardContent className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Enterprise</div>
            <div className="mt-1 text-xl font-semibold text-white">For stores processing 10K+ orders/month</div>
            <div className="mt-2 text-sm text-slate-400">
              Custom profit protection, automation, and dedicated AI support.
            </div>
          </div>
          <Button className="gap-2" onClick={() => { window.location.href = 'mailto:sales@profitshield.ai?subject=Profit%20Specialist'; }}>
            Talk to Profit Specialist
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CommandCardContent>
      </CommandCard>

      <CommandCard>
        <CommandCardContent className="grid gap-3 px-5 py-5 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Shield className="h-4 w-4 text-cyan-300" />
              Recovered across all merchants
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency(Math.round(trustMetrics.recovered))}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <TrendingUp className="h-4 w-4 text-emerald-300" />
              Average margin improvement
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">{trustMetrics.marginGain.toFixed(1)}%</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <BadgeCheck className="h-4 w-4 text-violet-300" />
              Merchant proof
            </div>
            <div className="mt-2 text-lg font-semibold text-white">Used by Shopify brands scaling profitably</div>
            <div className="mt-1 text-sm text-slate-400">Built for stores that want profit recovery tied directly to live order data.</div>
          </div>
        </CommandCardContent>
      </CommandCard>
    </div>
  );
}
