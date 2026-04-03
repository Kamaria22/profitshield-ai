// @ts-nocheck
import React, { useState, useCallback, lazy, Suspense, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl, getPersistedContext } from '@/components/platformContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeWithRetry } from '@/lib/safeApi';
import { stabilityAgent } from '@/agents/StabilityAgent';
import { usePermissions } from '@/components/usePermissions';
import { 
  Sparkles,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '../components/usePlatformResolver';
import SubscriptionGate from '../components/subscription/SubscriptionGate';
import OnboardingTutorial from '../components/onboarding/OnboardingTutorial';
import { useShouldShowTutorial, markTutorialCompleted } from '../components/onboarding/GamifiedOnboarding';
import WelcomeChecklist from '../components/onboarding/WelcomeChecklist';

import TopCommandBar from '../components/dashboard/TopCommandBar';
import DashboardLayout from '../components/dashboard/DashboardLayout';
import ProfitCorePanel from '../components/dashboard/ProfitCorePanel';
import RiskActionPanel from '../components/dashboard/RiskActionPanel';
import ControlPanel from '../components/dashboard/ControlPanel';
const ExpandablePanel = lazy(() => import('../components/dashboard/ExpandablePanel'));

export default function Home() {
  const resolver = usePlatformResolver();
  const { role: permissionRole } = usePermissions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Derive resolver values safely
  const resolverCheck = requireResolved(resolver || {});
  const persistedContext = getPersistedContext();
  const isEmbedded = resolver?.platform === 'shopify' || !!persistedContext?.shop;
  const authTenantId = resolverCheck.tenantId || (isEmbedded ? persistedContext?.tenantId : null);
  const canQuery = canQueryTenant(resolverCheck) || !!authTenantId;
  const queryFilter = getTenantFilter(resolverCheck) || (authTenantId ? { tenant_id: authTenantId } : null);
  const dashboardSummaryKey = useMemo(() => ([
    'dashboard-summary',
    resolverCheck?.platform || persistedContext?.platform || (isEmbedded ? 'shopify' : null),
    resolverCheck?.storeKey || persistedContext?.storeKey || persistedContext?.shop || null,
    resolverCheck?.integrationId || persistedContext?.integrationId || null,
    authTenantId || null
  ]), [
    resolverCheck?.platform,
    resolverCheck?.storeKey,
    resolverCheck?.integrationId,
    persistedContext?.platform,
    persistedContext?.storeKey,
    persistedContext?.shop,
    persistedContext?.integrationId,
    isEmbedded,
    authTenantId
  ]);
  const profitLeaksKey = useMemo(() => ([
    'profitLeaks',
    resolverCheck?.platform || persistedContext?.platform || (isEmbedded ? 'shopify' : null),
    resolverCheck?.storeKey || persistedContext?.storeKey || persistedContext?.shop || null,
    resolverCheck?.integrationId || persistedContext?.integrationId || null,
    authTenantId || null
  ]), [
    resolverCheck?.platform,
    resolverCheck?.storeKey,
    resolverCheck?.integrationId,
    persistedContext?.platform,
    persistedContext?.storeKey,
    persistedContext?.shop,
    persistedContext?.integrationId,
    isEmbedded,
    authTenantId
  ]);
  const summaryCacheKey = `ps:dashboard-summary:${authTenantId || 'none'}`;
  const summaryDurableCacheKey = `ps:dashboard-summary:durable:${authTenantId || 'none'}`;
  const lastVisibilityRefreshRef = useRef(0);

  const readCachedSummary = useCallback(() => {
    const inMemory = queryClient.getQueryData(dashboardSummaryKey);
    if (inMemory) return inMemory;
    if (typeof window === 'undefined') return null;
    try {
      const sessionRaw = sessionStorage.getItem(summaryCacheKey);
      if (sessionRaw) return JSON.parse(sessionRaw);
    } catch {}
    try {
      const localRaw = localStorage.getItem(summaryDurableCacheKey);
      if (localRaw) return JSON.parse(localRaw);
    } catch {}
    return null;
  }, [dashboardSummaryKey, queryClient, summaryCacheKey, summaryDurableCacheKey]);

  const fetchEntitySummary = useCallback(async (tenantId, options = {}) => {
    const orderLimit = Math.max(1, Math.min(50, Number(options.orderLimit || 20) || 20));
    const safeFilter = async (entity, query, sort, limit) => {
      try {
        const rows = await entity.filter(query, sort, limit);
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    };
    const [orders, alerts, leaks, integrations] = await Promise.all([
      safeFilter(base44.entities.Order, { tenant_id: tenantId }, '-order_date', orderLimit),
      safeFilter(base44.entities.Alert, { tenant_id: tenantId, status: 'pending' }, '-created_date', 5),
      safeFilter(base44.entities.ProfitLeak, { tenant_id: tenantId, is_resolved: false }, '-impact_amount', 5),
      safeFilter(base44.entities.PlatformIntegration, { tenant_id: tenantId, platform: 'shopify' }, '-updated_date', 2)
    ]);
    const integration = integrations.find((row) => row?.status === 'connected' || row?.status === 'degraded') || integrations[0] || null;

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || o.total_price || 0), 0);
    const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
    const highRiskOrders = orders.filter((o) => (o.risk_score || o.fraud_score || 0) > 70).length;

    return {
      success: true,
      fallback: true,
      fallback_source: options.fallbackSource || 'entities',
      metrics: {
        totalRevenue,
        totalProfit,
        avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        highRiskOrders,
        totalOrders: orders.length,
        pendingAlerts: alerts.length
      },
      profitScore: resolver?.tenant?.profit_integrity_score || 0,
      alertsCount: alerts.length,
      isDemoMode: false,
      integrationId: integration?.id || null,
      integrationStatus: integration?.status || null,
      lastSyncAt: integration?.last_sync_at || null,
      bootstrapRecommended: orders.length === 0 || !integration?.last_sync_at,
      orders: orders.slice(0, 5),
      alerts,
      profitLeaks: leaks
    };
  }, [resolver?.tenant?.profit_integrity_score]);

  // Tutorial state - deferred to not block render
  const effectiveRole = String(permissionRole || resolver?.user?.app_role || resolver?.user?.role || '').toLowerCase();
  const isOwnerAdmin = effectiveRole === 'owner' || effectiveRole === 'admin';
  const tutorialTenantId = isEmbedded || isOwnerAdmin ? null : authTenantId;
  const shouldShowTutorial = useShouldShowTutorial(tutorialTenantId);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (!isOwnerAdmin && shouldShowTutorial && authTenantId) {
      const timer = setTimeout(() => setTutorialOpen(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOwnerAdmin, shouldShowTutorial, authTenantId]);

  const handleTutorialClose = async () => {
    setTutorialOpen(false);
    if (authTenantId) {
      markTutorialCompleted(authTenantId).catch(e => console.error('Tutorial mark failed:', e));
    }
  };

  const handleUpgrade = (_tier) => {
    navigate(createPageUrl('Pricing', location.search));
  };
  
  const hasConnectedStore = !!authTenantId;
  const tenant = resolver?.tenant || null;
  const displayTenant = tenant || (hasConnectedStore ? {
    id: authTenantId,
    shop_name: persistedContext?.shop ? persistedContext.shop.replace('.myshopify.com', '') : null,
    platform: resolver?.platform || persistedContext?.platform || 'shopify'
  } : null);
  const tenantForGate = tenant || (hasConnectedStore ? { id: authTenantId, ...displayTenant } : null);
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  // If embedded context already has a persisted tenant, don't block initial paint
  // on resolver completion.
  const tenantLoading = status === RESOLVER_STATUS.RESOLVING && !authTenantId;

  useEffect(() => {
    if (!isEmbedded || !authTenantId || tenantLoading) return;
    if (!tenant || tenant.onboarding_completed) return;
    navigate(createPageUrl('ShopifyOnboarding', location.search));
  }, [isEmbedded, authTenantId, tenantLoading, tenant, navigate, location.search]);

  // PERFORMANCE: Ultra-fast summary query - minimal data for instant render
  const {
    data: dashboardSummary,
    isLoading: summaryLoading,
    isError: summaryError,
    error: summaryErrorValue,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: dashboardSummaryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return null;

      if (isEmbedded) {
        const entitySummary = await fetchEntitySummary(queryFilter.tenant_id, {
          orderLimit: 8,
          fallbackSource: 'embedded_entities'
        });
        if (Number(entitySummary?.metrics?.totalOrders || 0) > 0) {
          return entitySummary;
        }
        try {
          await invokeWithRetry('shopifyActivationBootstrap', {
            tenant_id: queryFilter.tenant_id,
            source: 'embedded_summary_recovery',
            force: true,
            days: 30
          }, { attempts: 1, baseMs: 200 });
          return await fetchEntitySummary(queryFilter.tenant_id, {
            orderLimit: 8,
            fallbackSource: 'embedded_bootstrap_entities'
          });
        } catch (error) {
          const msg = String(error?.message || '');
          const isRateLimited = msg.includes('429') || msg.toLowerCase().includes('rate limit');
          const isMissingDeployment = msg.includes('404') || msg.toLowerCase().includes('deployment does not exist');
          const cached = queryClient.getQueryData(dashboardSummaryKey);
          if (cached && (isRateLimited || isMissingDeployment)) {
            return { ...cached, fallback: true, fallback_source: 'cached_summary' };
          }
          return entitySummary;
        }
      }
      
      const startTime = performance.now();
      
      // Absolute minimum for first paint - fetch in parallel, smallest datasets
      const [orders, alerts] = await Promise.all([
        base44.entities.Order.filter({ tenant_id: queryFilter.tenant_id }, '-order_date', 8),
        base44.entities.Alert.filter({ tenant_id: queryFilter.tenant_id, status: 'pending' }, '-created_date', 3)
      ]);

      const fetchTime = performance.now() - startTime;
      console.log(`⚡ Dashboard rendered in ${fetchTime.toFixed(0)}ms`);

      // Quick calculations
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || o.total_price || 0), 0);
      const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
      const highRiskOrders = orders.filter((o) => (o.risk_score || o.fraud_score || 0) > 70).length;

      return {
        metrics: {
          totalRevenue,
          totalProfit,
          avgMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
          highRiskOrders,
          totalOrders: orders.length,
          pendingAlerts: alerts.length
        },
        profitScore: resolver?.tenant?.profit_integrity_score || 0,
        alertsCount: alerts.length,
        isDemoMode: false,
        integrationId: resolverCheck?.integrationId || persistedContext?.integrationId || null,
        orders: orders.slice(0, 5),
        alerts
      };
    },
    enabled: canQuery,
    initialData: readCachedSummary,
    placeholderData: (previous) => previous ?? readCachedSummary(),
    retry: false,
    staleTime: 60000,
    gcTime: 120000,
    refetchOnMount: (query) => !query.state.data,
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (!dashboardSummary || !authTenantId) return;
    try {
      sessionStorage.setItem(summaryCacheKey, JSON.stringify(dashboardSummary));
    } catch {}
    try {
      localStorage.setItem(summaryDurableCacheKey, JSON.stringify(dashboardSummary));
    } catch {}
  }, [dashboardSummary, authTenantId, summaryCacheKey, summaryDurableCacheKey]);

  const { data: profitLeaks = [] } = useQuery({
    queryKey: profitLeaksKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.ProfitLeak.filter({ 
        tenant_id: queryFilter.tenant_id,
        is_resolved: false 
      }, '-impact_amount', 5);
    },
    enabled: canQuery && !!dashboardSummary && !isEmbedded,
    staleTime: 120000,
    gcTime: 300000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  // Keep mobile/web dashboard data fresh when returning to the tab.
  useEffect(() => {
    if (!canQuery) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastVisibilityRefreshRef.current < 45000) return;
      lastVisibilityRefreshRef.current = now;
      refetchSummary();
      if (!isEmbedded) {
        queryClient.invalidateQueries({ queryKey: profitLeaksKey });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [canQuery, refetchSummary, queryClient, profitLeaksKey, isEmbedded]);

  // Real-time dashboard freshness: webhook/order updates should refresh dashboard data.
  useEffect(() => {
    if (!authTenantId) return;

    let timer = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: dashboardSummaryKey });
        queryClient.invalidateQueries({ queryKey: profitLeaksKey });
      }, 250);
    };

    const matchesTenant = (event) => {
      const tenantId = event?.data?.tenant_id;
      return !tenantId || tenantId === authTenantId;
    };

    const unsubscribers = [];

    try {
      const unsubOrder = base44.entities.Order.subscribe((event) => {
        if (matchesTenant(event)) scheduleRefresh();
      });
      if (typeof unsubOrder === 'function') unsubscribers.push(unsubOrder);
    } catch {}

    try {
      const unsubAlert = base44.entities.Alert.subscribe((event) => {
        if (matchesTenant(event)) scheduleRefresh();
      });
      if (typeof unsubAlert === 'function') unsubscribers.push(unsubAlert);
    } catch {}

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribers.forEach((fn) => {
        try { fn(); } catch {}
      });
    };
  }, [authTenantId, queryClient, dashboardSummaryKey, profitLeaksKey]);

  // Extract from summary for immediate display
  const displayProfitLeaks = isEmbedded ? (dashboardSummary?.profitLeaks || []) : profitLeaks;
  const metrics = dashboardSummary?.metrics || {
    totalRevenue: 0,
    totalProfit: 0,
    avgMargin: 0,
    highRiskOrders: 0,
    totalOrders: 0,
    pendingAlerts: 0
  };
  const profitScore = dashboardSummary?.profitScore || 0;
  const visibleAlerts = (dashboardSummary?.alerts || []).slice(0, 3);
  const aiStatus = dashboardSummary?.lastSyncAt ? 'Active' : 'Idle';
  const dashboardHasData =
    Number(metrics?.totalOrders || 0) > 0 ||
    Number(visibleAlerts.length || 0) > 0 ||
    Number(displayProfitLeaks?.length || 0) > 0;

  useEffect(() => {
    if (!authTenantId || !dashboardSummary) return;
    const visibleSignals =
      Number(metrics?.totalOrders || 0) +
      Number(dashboardSummary?.alerts?.length || 0) +
      Number(displayProfitLeaks?.length || 0);
    if (visibleSignals === 0 && !summaryLoading) {
      stabilityAgent.rememberUiAnomaly('dashboard_render_gap', {
        tenant_id: authTenantId,
        route: 'Home',
        reason: 'summary_loaded_but_sparse',
      });
    }
  }, [authTenantId, dashboardSummary, metrics?.totalOrders, displayProfitLeaks?.length, summaryLoading]);

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!authTenantId) throw new Error('No store connected');
      const response = await invokeWithRetry('shopifyActivationBootstrap', {
        tenant_id: authTenantId,
        source: isEmbedded ? 'embedded_manual_sync' : 'dashboard_manual_sync',
        force: true,
        days: 30
      }, { attempts: 3, baseMs: 300 });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      const created = Number(data?.actions?.syncShopifyOrders?.data?.createdCount || 0);
      const updated = Number(data?.actions?.syncShopifyOrders?.data?.updatedCount || 0);
      toast.success(`Synced: ${created} new, ${updated} updated`);
      queryClient.invalidateQueries({ queryKey: dashboardSummaryKey });
      queryClient.invalidateQueries({ queryKey: profitLeaksKey });
      queryClient.invalidateQueries({ queryKey: buildQueryKey('orders', resolverCheck) });
    },
    onError: (error) => {
      toast.error(error.message || 'Sync failed');
    }
  });

  // Autonomous recovery path: as soon as a store is available, run one bounded
  // bootstrap to register webhooks, drain queue, and sync orders without waiting
  // for the user to click Sync.
  useEffect(() => {
    if (!authTenantId || syncMutation.isPending) return;
    if (!tenant?.onboarding_completed) return;
    const totalOrders = Number(metrics?.totalOrders || 0);
    const bootstrapRecommended = dashboardSummary == null ? true : Boolean(dashboardSummary?.bootstrapRecommended);
    if (!bootstrapRecommended && totalOrders > 0) return;

    const key = `ps:dashboard-bootstrap:${authTenantId}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      return;
    }

    (async () => {
      try {
        await invokeWithRetry('shopifyActivationBootstrap', {
          tenant_id: authTenantId,
          source: isEmbedded ? 'embedded_dashboard_boot' : 'dashboard_boot',
          force: totalOrders === 0,
          days: 30
        }, { attempts: 2, baseMs: 250 });
        queryClient.invalidateQueries({ queryKey: dashboardSummaryKey });
        queryClient.invalidateQueries({ queryKey: profitLeaksKey });
      } catch {
        // Keep UI responsive; manual Sync remains available.
      }
    })();
  }, [authTenantId, syncMutation.isPending, tenant?.onboarding_completed, metrics?.totalOrders, dashboardSummary, isEmbedded, queryClient, dashboardSummaryKey, profitLeaksKey]);

  // Minimal blocking state
  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-pulse" style={{boxShadow:'0 0 25px rgba(99,102,241,0.4)'}} />
      </div>
    );
  }

  // No tenant state - instant
  if (!hasConnectedStore && !tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-500 flex items-center justify-center mx-auto mb-6"
            style={{boxShadow:'0 0 40px rgba(99,102,241,0.4)'}}>
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Welcome to ProfitShield AI</h2>
          <p className="text-slate-400 mb-6">Connect your store to unlock autonomous profit intelligence</p>
          <Link to={createPageUrl('Onboarding')}>
            <Button className="bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white px-8 py-6 text-lg rounded-xl border-0">
              <Store className="w-5 h-5 mr-2" />
              Connect Store
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const showDashboard = !!authTenantId || !summaryLoading || !!dashboardSummary;

  if (!showDashboard) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-pulse" style={{boxShadow:'0 0 25px rgba(99,102,241,0.4)'}} />
      </div>
    );
  }

  if (summaryError) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-lg border-red-200 bg-red-50/80">
          <CardContent className="py-8 text-center">
            <h2 className="text-lg font-semibold text-red-900">Dashboard data unavailable</h2>
            <p className="text-sm text-red-700 mt-2">
              {summaryErrorValue?.message || 'Failed to load dashboard summary.'}
            </p>
            <Button className="mt-4" variant="outline" onClick={() => refetchSummary()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SubscriptionGate tenant={tenantForGate}>
      {tutorialOpen && (
        <OnboardingTutorial
          open={tutorialOpen}
          onClose={handleTutorialClose}
          onUpgrade={handleUpgrade}
          currentTier={tenant?.subscription_tier || 'trial'}
        />
      )}

      <div className="min-h-full flex flex-col">
        <TopCommandBar
          profitScore={profitScore}
          metrics={metrics}
          alerts={visibleAlerts}
          aiStatus={aiStatus}
          lastActionAt={dashboardSummary?.lastSyncAt}
        />

        <div className="mt-3 flex-1">
          <DashboardLayout
            left={(
              <ControlPanel
                tenantId={authTenantId}
                integrationId={dashboardSummary?.integrationId || resolverCheck?.integrationId || persistedContext?.integrationId || null}
                integrationStatus={dashboardSummary?.integrationStatus}
                aiStatus={aiStatus}
                onSync={() => {
                  queryClient.invalidateQueries({ queryKey: dashboardSummaryKey });
                  queryClient.invalidateQueries({ queryKey: profitLeaksKey });
                }}
              />
            )}
            center={(
              <ProfitCorePanel
                metrics={metrics}
                orders={dashboardSummary?.orders || []}
              />
            )}
            right={(
              <RiskActionPanel
                alerts={visibleAlerts}
                profitLeaks={displayProfitLeaks}
                metrics={metrics}
                integrationStatus={dashboardSummary?.integrationStatus}
              />
            )}
            bottom={(
              <div className="space-y-3">
                <WelcomeChecklist />
                <Suspense fallback={null}>
                  <ExpandablePanel tenantId={authTenantId} />
                </Suspense>
              </div>
            )}
          />
          {!dashboardHasData && (
            <div className="dashboard-panel mt-3">
              <p className="dashboard-label">Startup State</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="dashboard-title">No live telemetry yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    ProfitShield is connected, but the dashboard is still waiting for synced merchant data.
                  </p>
                </div>
                <Button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending || !authTenantId}
                  className="border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                >
                  {syncMutation.isPending ? 'Syncing...' : 'Run Initial Sync'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SubscriptionGate>
  );
}
