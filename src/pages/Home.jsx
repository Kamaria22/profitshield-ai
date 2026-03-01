import React, { useState, useCallback, useMemo, lazy, Suspense, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/components/platformContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  Sparkles,
  ArrowRight,
  Store
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '../components/usePlatformResolver';
import SubscriptionGate from '../components/subscription/SubscriptionGate';
import OnboardingTutorial from '../components/onboarding/OnboardingTutorial';
import WelcomeChecklist from '../components/onboarding/WelcomeChecklist';
import { useShouldShowTutorial, markTutorialCompleted } from '../components/onboarding/GamifiedOnboarding';

// Critical above-the-fold components - loaded immediately
import ExecutiveSummaryBar from '../components/dashboard/ExecutiveSummaryBar';
import ProfitHealthPanel from '../components/dashboard/panels/ProfitHealthPanel';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import LazyPanel, { PanelSkeleton } from '../components/dashboard/LazyPanel';
import PredictiveOverviewBar from '../components/dashboard/PredictiveOverviewBar';
import AutonomousInsightEngine from '../components/dashboard/AutonomousInsightEngine';

// Heavy panels - lazy loaded with IntersectionObserver
const RiskCommandPanel = lazy(() => import('../components/dashboard/panels/RiskCommandPanel'));
const AlertsPanel = lazy(() => import('../components/dashboard/panels/AlertsPanel'));
const MarginLeakPanel = lazy(() => import('../components/dashboard/panels/MarginLeakPanel'));
const CashflowPanel = lazy(() => import('../components/dashboard/panels/CashflowPanel'));
const SecurityPanel = lazy(() => import('../components/dashboard/panels/SecurityPanel'));
const CEOInsightsPanel = lazy(() => import('../components/dashboard/panels/CEOInsightsPanel'));
const AIAutomationsPanel = lazy(() => import('../components/dashboard/panels/AIAutomationsPanel'));
const AdvancedAnalyticsPanel = lazy(() => import('../components/dashboard/panels/AdvancedAnalyticsPanel'));
const IntegrationsPanel = lazy(() => import('../components/dashboard/panels/IntegrationsPanel'));
const RiskMitigationPanel = lazy(() => import('../components/dashboard/panels/RiskMitigationPanel'));
const FinancialReportingPanel = lazy(() => import('../components/dashboard/panels/FinancialReportingPanel'));
const CustomizeLayoutPanel = lazy(() => import('../components/dashboard/panels/CustomizeLayoutPanel'));

// Dashboard personalization
const DashboardCustomizer = lazy(() => import('../components/dashboard/DashboardCustomizer'));
const CustomAlerts = lazy(() => import('../components/dashboard/CustomAlerts'));

export default function Home() {
  const resolver = usePlatformResolver();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // Derive resolver values safely
  const resolverCheck = requireResolved(resolver || {});
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const authTenantId = resolverCheck.tenantId;

  // Tutorial state - deferred to not block render
  const shouldShowTutorial = useShouldShowTutorial(authTenantId);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (shouldShowTutorial && authTenantId) {
      const timer = setTimeout(() => setTutorialOpen(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [shouldShowTutorial, authTenantId]);

  const handleTutorialClose = async () => {
    setTutorialOpen(false);
    if (authTenantId) {
      markTutorialCompleted(authTenantId).catch(e => console.error('Tutorial mark failed:', e));
    }
  };

  const handleUpgrade = (tier) => {
    navigate(createPageUrl('Pricing'));
  };
  
  const tenant = resolver?.tenant || null;
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const tenantLoading = status === RESOLVER_STATUS.RESOLVING;

  // PERFORMANCE: Ultra-fast summary query - minimal data for instant render
  const { data: dashboardSummary, isLoading: summaryLoading } = useQuery({
    queryKey: buildQueryKey('dashboard-summary', resolverCheck),
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return null;
      
      const startTime = performance.now();
      
      // Absolute minimum for first paint - fetch in parallel, smallest datasets
      const [orders, alerts] = await Promise.all([
        base44.entities.Order.filter({ tenant_id: queryFilter.tenant_id }, '-order_date', 20),
        base44.entities.Alert.filter({ tenant_id: queryFilter.tenant_id, status: 'pending' }, '-created_date', 5)
      ]);

      const fetchTime = performance.now() - startTime;
      console.log(`⚡ Dashboard rendered in ${fetchTime.toFixed(0)}ms`);

      // Quick calculations
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
      const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
      const highRiskOrders = orders.filter(o => (o.risk_score || 0) > 70).length;

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
        orders: orders.slice(0, 5),
        alerts
      };
    },
    enabled: canQuery,
    staleTime: 60000,
    gcTime: 120000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  // PERFORMANCE: Background data loads - never block UI
  const { data: detailedOrders = [] } = useQuery({
    queryKey: buildQueryKey('orders-detailed', resolverCheck),
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.Order.filter({ tenant_id: queryFilter.tenant_id }, '-order_date', 100);
    },
    enabled: canQuery && !!dashboardSummary,
    staleTime: 120000,
    gcTime: 300000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  const { data: profitLeaks = [] } = useQuery({
    queryKey: buildQueryKey('profitLeaks', resolverCheck),
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.ProfitLeak.filter({ 
        tenant_id: queryFilter.tenant_id,
        is_resolved: false 
      }, '-impact_amount', 5);
    },
    enabled: canQuery && !!dashboardSummary,
    staleTime: 120000,
    gcTime: 300000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  // Extract from summary for immediate display
  const isDemoMode = dashboardSummary?.isDemoMode ?? true;
  const metrics = dashboardSummary?.metrics || {
    totalRevenue: 0,
    totalProfit: 0,
    avgMargin: 0,
    highRiskOrders: 0,
    totalOrders: 0,
    pendingAlerts: 0
  };
  const profitScore = dashboardSummary?.profitScore || 0;

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!authTenantId) throw new Error('No store connected');
      const response = await base44.functions.invoke('syncShopifyOrders', { tenant_id: authTenantId });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Synced: ${data.createdCount || 0} new orders`);
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Sync failed');
    }
  });

  const handleSync = useCallback(() => syncMutation.mutate(), [syncMutation]);
  const handleScan = useCallback(() => {
    toast.info('Running profit scan...');
  }, []);

  // Minimal blocking state
  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-pulse" style={{boxShadow:'0 0 25px rgba(99,102,241,0.4)'}} />
      </div>
    );
  }

  // No tenant state - instant
  if (!tenant && !tenantLoading) {
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

  const showDashboard = !summaryLoading || dashboardSummary;

  if (!showDashboard) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-pulse" style={{boxShadow:'0 0 25px rgba(99,102,241,0.4)'}} />
      </div>
    );
  }

  return (
    <SubscriptionGate tenant={tenant}>
      {tutorialOpen && (
        <OnboardingTutorial
          open={tutorialOpen}
          onClose={handleTutorialClose}
          onUpgrade={handleUpgrade}
          currentTier={tenant?.subscription_tier || 'trial'}
        />
      )}

      <div className="h-full flex flex-col -m-4 lg:-m-6">
        {/* Executive Summary Bar - Critical above-the-fold */}
        <ExecutiveSummaryBar 
          tenant={tenant}
          metrics={metrics}
          onSync={handleSync}
          onScan={handleScan}
          syncing={syncMutation.isPending}
          isDemo={isDemoMode}
        />

        {/* Main Grid */}
        <div className="flex-1 p-4 lg:p-6 overflow-auto">
          <WelcomeChecklist />

          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>
              <p className="text-sm text-slate-500">Autonomous profit intelligence · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            </div>
            {resolver?.user?.id && (
              <Suspense fallback={null}>
                <DashboardCustomizer userId={resolver.user.id} onLayoutChange={() => queryClient.invalidateQueries(['dashboard'])} />
              </Suspense>
            )}
          </div>

          {/* Predictive Intelligence Overview */}
          <PredictiveOverviewBar tenant={tenant} metrics={metrics} />

          <div className="flex gap-6 h-full">
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Critical render - no suspense */}
                <ProfitHealthPanel metrics={metrics} loading={false} />
                <Suspense fallback={<div className="h-48 bg-slate-50 rounded-lg animate-pulse" />}>
                  <RiskCommandPanel metrics={metrics} loading={false} />
                </Suspense>
                <Suspense fallback={<div className="h-48 bg-slate-50 rounded-lg animate-pulse" />}>
                  <AlertsPanel alerts={dashboardSummary?.alerts || []} loading={false} />
                </Suspense>
                
                {/* Lazy panels */}
                <Suspense fallback={<PanelSkeleton />}>
                  <MarginLeakPanel leaks={profitLeaks} loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <CashflowPanel metrics={metrics} loading={false} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <SecurityPanel loading={false} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <AIAutomationsPanel loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdvancedAnalyticsPanel metrics={metrics} loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <IntegrationsPanel loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <RiskMitigationPanel loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <FinancialReportingPanel loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <CustomizeLayoutPanel loading={false} />
                </Suspense>
              </div>

              {/* Connect Store CTA */}
              {isDemoMode && (
                <div className="mt-4 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 backdrop-blur-sm">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-indigo-400" />
                      <div>
                        <p className="font-medium text-indigo-300">Demo Mode Active</p>
                        <p className="text-sm text-slate-500">Connect your store for live AI intelligence</p>
                      </div>
                    </div>
                    <Link to={createPageUrl('Integrations')}>
                      <Button className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30">
                        Connect Store
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Side Rail - Lazy loaded */}
            <div className="hidden xl:block w-80 flex-shrink-0 space-y-4">
              <div className="sticky top-0 space-y-4">
                {/* Autonomous Insight Engine - always visible */}
                <AutonomousInsightEngine
                  metrics={metrics}
                  alerts={dashboardSummary?.alerts || []}
                  profitLeaks={profitLeaks}
                />
                <Suspense fallback={<PanelSkeleton />}>
                  <CEOInsightsPanel tenantId={authTenantId} metrics={metrics} />
                </Suspense>
                {resolver?.user?.id && (
                  <Suspense fallback={<PanelSkeleton />}>
                    <CustomAlerts tenantId={authTenantId} userId={resolver.user.id} />
                  </Suspense>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SubscriptionGate>
  );
}