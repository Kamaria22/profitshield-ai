import React, { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/components/platformContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Sparkles,
  ArrowRight,
  Store
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '../components/usePlatformResolver';
import SubscriptionGate from '../components/subscription/SubscriptionGate';

// Critical above-the-fold components - loaded immediately
import ExecutiveSummaryBar from '../components/dashboard/ExecutiveSummaryBar';
import ProfitHealthPanel from '../components/dashboard/panels/ProfitHealthPanel';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import LazyPanel, { PanelSkeleton } from '../components/dashboard/LazyPanel';

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

export default function Home() {
  const resolver = usePlatformResolver();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // Derive resolver values safely
  const resolverCheck = requireResolved(resolver || {});
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const authTenantId = resolverCheck.tenantId;
  
  const tenant = resolver?.tenant || null;
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const tenantLoading = status === RESOLVER_STATUS.RESOLVING;

  // PERFORMANCE: Lightweight summary query for immediate first paint
  const { data: dashboardSummary, isLoading: summaryLoading } = useQuery({
    queryKey: buildQueryKey('dashboard-summary', resolverCheck),
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return null;
      
      const startTime = performance.now();
      
      // Single lightweight query for KPIs only
      const [orders, alerts, tenant, settings] = await Promise.all([
        base44.entities.Order.filter({ tenant_id: queryFilter.tenant_id }, '-order_date', 50), // Just top 50 for KPIs
        base44.entities.Alert.filter({ tenant_id: queryFilter.tenant_id, status: 'pending' }, '-created_date', 10),
        Promise.resolve(resolver?.tenant || null),
        base44.entities.TenantSettings.filter({ tenant_id: queryFilter.tenant_id }).then(s => s[0] || null)
      ]);

      const fetchTime = performance.now() - startTime;
      console.log(`✅ Dashboard summary loaded in ${fetchTime.toFixed(0)}ms`);

      // Calculate basic metrics
      const totalRevenue = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
      const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
      const highRiskOrders = orders.filter(o => (o.risk_score || 0) > 70).length;
      const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

      return {
        metrics: {
          totalRevenue,
          totalProfit,
          avgMargin,
          highRiskOrders,
          totalOrders: orders.length,
          pendingAlerts: alerts.length
        },
        profitScore: tenant?.profit_integrity_score || 0,
        alertsCount: alerts.length,
        isDemoMode: settings?.demo_mode !== false,
        orders: orders.slice(0, 10), // Only top 10 for initial display
        alerts
      };
    },
    enabled: canQuery,
    staleTime: 30000, // 30s - quick refresh for dashboard
    gcTime: 60000
  });

  // PERFORMANCE: Defer heavy data loads until after idle
  const { data: detailedOrders = [] } = useQuery({
    queryKey: buildQueryKey('orders-detailed', resolverCheck),
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      // Deferred - wait for requestIdleCallback
      await new Promise(resolve => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => resolve(true));
        } else {
          setTimeout(resolve, 2000);
        }
      });
      return base44.entities.Order.filter({ tenant_id: queryFilter.tenant_id }, '-order_date', 500);
    },
    enabled: canQuery && !!dashboardSummary, // Only load after summary
    ...queryDefaults.heavyList
  });

  const { data: profitLeaks = [] } = useQuery({
    queryKey: buildQueryKey('profitLeaks', resolverCheck),
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      await new Promise(resolve => setTimeout(resolve, 1000)); // Defer
      return base44.entities.ProfitLeak.filter({ 
        tenant_id: queryFilter.tenant_id,
        is_resolved: false 
      }, '-impact_amount', 10);
    },
    enabled: canQuery && !!dashboardSummary,
    ...queryDefaults.standard
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

  // Loading state
  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <p className="text-slate-500">Loading your command center...</p>
        </motion.div>
      </div>
    );
  }

  // No tenant state
  if (!tenant && !tenantLoading) {
    return (
      <motion.div 
        className="flex items-center justify-center min-h-[60vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-xl">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Welcome to ProfitShield AI</h2>
          <p className="text-slate-500 mb-6">Connect your store to unlock intelligent profit protection</p>
          <Link to={createPageUrl('Onboarding')}>
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg px-8 py-6 text-lg rounded-xl">
              <Store className="w-5 h-5 mr-2" />
              Connect Store
            </Button>
          </Link>
        </div>
      </motion.div>
    );
  }

  // PERFORMANCE: Show skeleton while summary loading
  if (summaryLoading) {
    return (
      <div className="h-full -m-4 lg:-m-6">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <SubscriptionGate tenant={tenant}>
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
          <div className="flex gap-6 h-full">
            {/* Main Panels Grid */}
            <div className="flex-1 min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr" style={{ gridTemplateRows: 'repeat(4, minmax(200px, 220px))' }}>
                {/* Row 1 - CRITICAL: Above-the-fold hero panel + lazy panels */}
                <ProfitHealthPanel metrics={metrics} loading={false} />
                <Suspense fallback={<PanelSkeleton />}>
                  <RiskCommandPanel metrics={metrics} loading={false} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <AlertsPanel alerts={dashboardSummary?.alerts || []} loading={false} />
                </Suspense>
                
                {/* Row 2 - Lazy loaded */}
                <Suspense fallback={<PanelSkeleton />}>
                  <MarginLeakPanel leaks={profitLeaks} loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <CashflowPanel metrics={metrics} loading={false} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <SecurityPanel loading={false} />
                </Suspense>
                
                {/* Row 3 - Lazy loaded */}
                <Suspense fallback={<PanelSkeleton />}>
                  <AIAutomationsPanel loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <AdvancedAnalyticsPanel metrics={metrics} loading={false} isDemo={isDemoMode} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton />}>
                  <IntegrationsPanel loading={false} isDemo={isDemoMode} />
                </Suspense>
                
                {/* Row 4 - Lazy loaded */}
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

              {/* Connect Store CTA for Demo Mode */}
              {isDemoMode && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl"
                >
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-800">Demo Mode Active</p>
                        <p className="text-sm text-blue-600">Connect your Shopify store for real data</p>
                      </div>
                    </div>
                    <Link to={createPageUrl('Integrations')}>
                      <Button variant="outline" className="border-blue-300 text-blue-700">
                        Connect Store
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              )}
            </div>

            {/* CEO Insights Rail (Desktop Only) - Lazy loaded */}
            <div className="hidden xl:block w-64 flex-shrink-0">
              <Suspense fallback={<PanelSkeleton />}>
                <CEOInsightsPanel tenantId={authTenantId} metrics={metrics} />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </SubscriptionGate>
  );
}