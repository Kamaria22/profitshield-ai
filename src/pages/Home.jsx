import React, { useState, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/components/platformContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  ShoppingCart, 
  AlertTriangle,
  Package,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Plus,
  Zap,
  Shield,
  Activity,
  BarChart3
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import ProfitIntegrityScore from '../components/dashboard/ProfitIntegrityScore';
import MetricCard from '../components/dashboard/MetricCard';
import ProfitLeakCard from '../components/dashboard/ProfitLeakCard';
import ProfitChart from '../components/dashboard/ProfitChart';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '../components/usePlatformResolver';
import DebugBanner from '../components/DebugBanner';
import PendingShopifyActionsPanel from '../components/alerts/PendingShopifyActionsPanel';
import BenchmarkComparison from '../components/dashboard/BenchmarkComparison';
import SyncHealthCard from '../components/dashboard/SyncHealthCard';
import OnboardingProgressBar from '../components/growth/OnboardingProgressBar';
import ReviewRequestModal from '../components/growth/ReviewRequestModal';
import { useReviewPrompt } from '../components/growth/useReviewPrompt';

// Micro-animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.08 } }
};

const pulseGlow = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(16, 185, 129, 0)',
      '0 0 0 8px rgba(16, 185, 129, 0.1)',
      '0 0 0 0 rgba(16, 185, 129, 0)'
    ],
    transition: { duration: 2, repeat: Infinity }
  }
};

export default function Home() {
  // Platform resolver with requireResolved gating
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  // SINGLE SOURCE OF TRUTH - using shared helpers
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const authTenantId = resolverCheck.tenantId;
  
  // Query keys with platform/store identity
  const ordersQueryKey = buildQueryKey('orders-home', resolverCheck);
  const settingsQueryKey = buildQueryKey('tenantSettings', resolverCheck);
  const tokenQueryKey = buildQueryKey('oauthToken', resolverCheck);
  const leaksQueryKey = buildQueryKey('profitLeaks', resolverCheck);
  const alertsQueryKey = buildQueryKey('pendingAlerts', resolverCheck);
  const syncJobsQueryKey = buildQueryKey('syncJobs', resolverCheck);
  
  // Raw values for display
  const tenant = resolver?.tenant || null;
  const storeKey = resolver?.storeKey || null;
  const platform = resolver?.platform || null;
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const reason = resolver?.reason || null;
  const user = resolver?.user || null;
  
  const tenantLoading = status === RESOLVER_STATUS.RESOLVING;
  const tenantError = status === RESOLVER_STATUS.ERROR ? 'No store connected' : null;
  const shopDomain = platform === 'shopify' ? storeKey : null;
  const [dateRange, setDateRange] = useState('30');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Review prompt hook
  const { 
    showReviewModal, 
    reviewRequest, 
    closeReviewModal 
  } = useReviewPrompt(authTenantId, platform);

  // Check OAuth token status and tenant settings - ONLY when canQuery
  // Using config defaults for rarely-changing data
  const { data: tenantSettings } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return null;
      const settings = await base44.entities.TenantSettings.filter({ tenant_id: queryFilter.tenant_id });
      return settings[0] || null;
    },
    enabled: canQuery,
    ...queryDefaults.config
  });

  const { data: tokenStatus } = useQuery({
    queryKey: tokenQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return { hasToken: false };
      const tokens = await base44.entities.OAuthToken.filter({ 
        tenant_id: queryFilter.tenant_id, 
        platform: 'shopify',
        is_valid: true 
      });
      return { hasToken: tokens.length > 0 };
    },
    enabled: canQuery,
    ...queryDefaults.config,
    select: (data) => data // Identity selector to minimize rerenders
  });

  // In demo mode, we don't require Shopify connection
  const isDemoMode = tenantSettings?.demo_mode !== false;
  const canOperate = tokenStatus?.hasToken || isDemoMode;

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!authTenantId) throw new Error('No store connected');
      const response = await base44.functions.invoke('syncShopifyOrders', { tenant_id: authTenantId });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      const created = data.createdCount ?? data.created ?? 0;
      const updated = data.updatedCount ?? data.updated ?? 0;
      const msg = `Synced: ${created} new, ${updated} updated${data.newestOrderNumber ? ` (newest #${data.newestOrderNumber})` : ''}`;
      toast.success(msg, {
        action: {
          label: 'View Orders',
          onClick: () => navigate(`/orders${window.location.search}`)
        }
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      const msg = error.message || error.response?.data?.error || 'Failed to sync orders';
      if (msg.includes('token') || msg.includes('reconnect')) {
        toast.error('Shopify connection expired', {
          description: 'Please reconnect your store in Settings',
          action: {
            label: 'Go to Settings',
            onClick: () => navigate(`/settings${window.location.search}`)
          }
        });
      } else {
        toast.error(msg);
      }
    }
  });

  const createTestOrderMutation = useMutation({
    mutationFn: async () => {
      if (!authTenantId) throw new Error('No store connected');
      
      // If in demo mode without token, create local demo order
      if (isDemoMode && !tokenStatus?.hasToken) {
        const orderNum = Math.floor(1000 + Math.random() * 9000);
        const price = (Math.random() * 150 + 25).toFixed(2);
        const products = ['Blue T-Shirt', 'Running Shoes', 'Wireless Earbuds', 'Coffee Mug', 'Backpack'];
        const product = products[Math.floor(Math.random() * products.length)];
        
        const demoOrder = {
          tenant_id: authTenantId,
          platform_order_id: `demo_${Date.now()}`,
          order_number: `#${orderNum}`,
          customer_email: `demo${orderNum}@example.com`,
          customer_name: 'Demo Customer',
          order_date: new Date().toISOString(),
          status: 'paid',
          total_revenue: parseFloat(price),
          total_cogs: parseFloat(price) * 0.4,
          net_profit: parseFloat(price) * 0.3,
          margin_pct: 30,
          is_demo: true,
          confidence: 'medium',
          risk_level: 'low'
        };
        
        await base44.entities.Order.create(demoOrder);
        return { order_number: demoOrder.order_number, total_price: price, product_title: product, is_demo: true };
      }
      
      // Otherwise use Shopify API
      const response = await base44.functions.invoke('createShopifyTestOrder', { tenant_id: authTenantId });
      if (response.data?.error) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.is_demo) {
        toast.success(`Created demo order ${data.order_number} ($${data.total_price})`, {
          description: `Product: ${data.product_title}`
        });
      } else {
        toast.success(`Created Shopify order ${data.order_number} ($${data.total_price})`, {
          description: `Product: ${data.product_title}`,
          action: {
            label: 'View in Shopify',
            onClick: () => {
              window.open(`https://${shopDomain}/admin/orders/${data.order_id}`, '_blank');
            }
          }
        });
      }
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      const msg = error.message || error.response?.data?.error || 'Failed to create test order';
      if (msg.includes('token') || msg.includes('reconnect')) {
        toast.error('Shopify connection expired', {
          description: 'Please reconnect your store in Settings',
          action: {
            label: 'Go to Settings',
            onClick: () => navigate(`/settings${window.location.search}`)
          }
        });
      } else {
        toast.error(msg);
      }
    }
  });

  // Heavy list query with keepPreviousData for no flicker
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: [...ordersQueryKey, dateRange],
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      const allOrders = await base44.entities.Order.filter({ 
        tenant_id: queryFilter.tenant_id 
      }, '-order_date', 500);
      return allOrders;
    },
    enabled: canQuery,
    ...queryDefaults.heavyList
  });

  const { data: profitLeaks = [] } = useQuery({
    queryKey: leaksQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.ProfitLeak.filter({ 
        tenant_id: queryFilter.tenant_id,
        is_resolved: false 
      }, '-impact_amount', 10);
    },
    enabled: canQuery,
    ...queryDefaults.standard
  });

  const { data: pendingAlerts = [] } = useQuery({
    queryKey: alertsQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.Alert.filter({ 
        tenant_id: queryFilter.tenant_id,
        status: 'pending' 
      }, '-created_date', 5);
    },
    enabled: canQuery,
    ...queryDefaults.realtime // Alerts should refresh more often
  });

  // Sync jobs for health card
  const { data: syncJobs = [] } = useQuery({
    queryKey: syncJobsQueryKey,
    queryFn: async () => {
      if (!resolver?.integrationId) return [];
      try {
        const result = await base44.functions.invoke('syncEngine', {
          action: 'list_sync_jobs',
          integration_id: resolver.integrationId,
          limit: 20
        });
        return result.data?.jobs || [];
      } catch (e) {
        return [];
      }
    },
    enabled: canQuery && !!resolver?.integrationId,
    ...queryDefaults.activity
  });

  // Calculate metrics
  const metrics = React.useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || 0), 0);
    const totalProfit = orders.reduce((sum, o) => sum + (o.net_profit || 0), 0);
    const totalCOGS = orders.reduce((sum, o) => sum + (o.total_cogs || 0), 0);
    const totalFees = orders.reduce((sum, o) => sum + (o.payment_fee || 0) + (o.platform_fee || 0), 0);
    const totalRefunds = orders.reduce((sum, o) => sum + (o.refund_amount || 0), 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const orderCount = orders.length;
    const highRiskOrders = orders.filter(o => o.risk_level === 'high').length;
    const negativeMarginOrders = orders.filter(o => (o.net_profit || 0) < 0).length;

    return {
      totalRevenue,
      totalProfit,
      totalCOGS,
      totalFees,
      totalRefunds,
      avgMargin,
      orderCount,
      highRiskOrders,
      negativeMarginOrders,
      avgOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      avgProfit: orderCount > 0 ? totalProfit / orderCount : 0
    };
  }, [orders]);

  // Generate chart data
  const chartData = React.useMemo(() => {
    const days = parseInt(dateRange);
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayOrders = orders.filter(o => 
        o.order_date && format(new Date(o.order_date), 'yyyy-MM-dd') === dateStr
      );
      
      data.push({
        date: format(date, 'MMM d'),
        revenue: dayOrders.reduce((sum, o) => sum + (o.total_revenue || 0), 0),
        profit: dayOrders.reduce((sum, o) => sum + (o.net_profit || 0), 0),
        orders: dayOrders.length
      });
    }
    
    return data;
  }, [orders, dateRange]);

  // Memoized derived values
  const topLeaks = useMemo(() => profitLeaks.slice(0, 3), [profitLeaks]);
  const totalLeakImpact = useMemo(() => 
    profitLeaks.reduce((sum, l) => sum + (l.impact_amount || 0), 0), 
    [profitLeaks]
  );
  
  // Memoized mutation handlers
  const handleSync = useCallback(() => syncMutation.mutate(), [syncMutation]);
  const handleCreateTestOrder = useCallback(() => createTestOrderMutation.mutate(), [createTestOrderMutation]);

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="inline-block"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </motion.div>
          <p className="text-slate-500 mt-6 font-medium">Loading your store...</p>
        </motion.div>
      </div>
    );
  }

  if (!tenant && !tenantLoading) {
    return (
      <motion.div 
        className="flex items-center justify-center min-h-[60vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="text-center max-w-md">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/30"
          >
            <Sparkles className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3">Welcome to ProfitShield AI</h2>
          <p className="text-slate-500 mb-6">Connect your Shopify store to unlock intelligent profit protection</p>
          {tenantError && (
            <p className="text-red-500 text-sm mb-4">{tenantError}</p>
          )}
          <Link to={createPageUrl('Onboarding')}>
            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/25 px-8 py-6 text-lg rounded-xl">
              Connect Store
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="space-y-8"
      initial="initial"
      animate="animate"
      variants={staggerContainer}
    >
      {/* Review Request Modal */}
      <ReviewRequestModal
        isOpen={showReviewModal}
        onClose={closeReviewModal}
        tenantId={authTenantId}
        platform={platform}
        condition={reviewRequest?.condition}
        requestId={reviewRequest?.id}
      />

      {/* Debug Banner */}
      <DebugBanner 
        shopDomain={storeKey} 
        tenantId={authTenantId} 
        ordersCount={orders.length}
        debug={{ platform, reason, resolved: canQuery }}
        userEmail={user?.email}
      />

      {/* Onboarding Progress */}
      {tenant && (
        <motion.div variants={fadeInUp}>
          <OnboardingProgressBar tenantId={authTenantId} compact />
        </motion.div>
      )}

      {/* Header with glassmorphism */}
      <motion.div 
        variants={fadeInUp}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-50/80 to-white/80 backdrop-blur-sm border border-slate-200/50 shadow-sm"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              Dashboard
            </h1>
          </div>
          <p className="text-slate-500 ml-12">Your profit health at a glance</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40 bg-white/80 backdrop-blur-sm border-slate-200 shadow-sm hover:shadow transition-shadow">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={handleCreateTestOrder}
            disabled={createTestOrderMutation.isPending || !authTenantId}
            className="gap-2 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            aria-label={isDemoMode && !tokenStatus?.hasToken ? 'Create demo order' : 'Create test order'}
          >
            <Plus className={`w-4 h-4 ${createTestOrderMutation.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
            {createTestOrderMutation.isPending ? 'Creating...' : isDemoMode && !tokenStatus?.hasToken ? 'Demo Order' : 'Test Order'}
          </Button>
          <Button 
            onClick={handleSync}
            disabled={syncMutation.isPending || !authTenantId || !tokenStatus?.hasToken}
            title={!tokenStatus?.hasToken ? 'Connect Shopify to sync real orders' : ''}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-emerald-600"
            aria-label="Sync orders from Shopify"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
            {syncMutation.isPending ? 'Syncing...' : 'Sync'}
          </Button>
        </div>
      </motion.div>

      {/* Top Section: Score + Metrics */}
      <motion.div variants={fadeInUp} className="grid lg:grid-cols-3 gap-6">
        {/* Profit Integrity Score - Premium Card */}
        <motion.div 
          className="lg:col-span-1"
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Card className="h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-0 shadow-2xl shadow-slate-900/20 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/5" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl" />
            <CardContent className="pt-6 relative z-10">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Profit Integrity</h3>
                </div>
                <ProfitIntegrityScore 
                  score={tenant?.profit_integrity_score || 0} 
                  previousScore={tenant?.profit_integrity_score ? tenant.profit_integrity_score - 5 : undefined}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Key Metrics Grid - Enhanced */}
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          <motion.div whileHover={{ y: -2, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300 }}>
            <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100 shadow-lg shadow-emerald-500/5 hover:shadow-emerald-500/10 transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-emerald-700/70">True Net Profit</span>
                  <div className="p-2 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className={`text-3xl font-bold ${metrics.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  ${metrics.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                {metrics.totalProfit >= 0 && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Healthy profit margin
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div whileHover={{ y: -2, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300 }}>
            <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100 shadow-lg shadow-blue-500/5 hover:shadow-blue-500/10 transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-blue-700/70">Total Revenue</span>
                  <div className="p-2 rounded-xl bg-blue-500 shadow-lg shadow-blue-500/30">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-800">
                  ${metrics.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-blue-600 mt-1">Last {dateRange} days</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div whileHover={{ y: -2, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300 }}>
            <Card className={`bg-gradient-to-br ${metrics.avgMargin >= 20 ? 'from-teal-50 to-white border-teal-100' : metrics.avgMargin >= 0 ? 'from-amber-50 to-white border-amber-100' : 'from-red-50 to-white border-red-100'} shadow-lg transition-shadow`}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-600">Average Margin</span>
                  <div className={`p-2 rounded-xl shadow-lg ${metrics.avgMargin >= 20 ? 'bg-teal-500 shadow-teal-500/30' : metrics.avgMargin >= 0 ? 'bg-amber-500 shadow-amber-500/30' : 'bg-red-500 shadow-red-500/30'}`}>
                    {metrics.avgMargin >= 0 ? <TrendingUp className="w-4 h-4 text-white" /> : <TrendingDown className="w-4 h-4 text-white" />}
                  </div>
                </div>
                <p className={`text-3xl font-bold ${metrics.avgMargin >= 20 ? 'text-teal-700' : metrics.avgMargin >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                  {metrics.avgMargin.toFixed(1)}%
                </p>
                <p className={`text-xs mt-1 ${metrics.avgMargin >= 20 ? 'text-teal-600' : metrics.avgMargin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                  {metrics.avgMargin >= 20 ? 'Excellent' : metrics.avgMargin >= 10 ? 'Good' : metrics.avgMargin >= 0 ? 'Needs attention' : 'Critical'}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div whileHover={{ y: -2, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300 }}>
            <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-100 shadow-lg shadow-violet-500/5 hover:shadow-violet-500/10 transition-shadow">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-violet-700/70">Orders</span>
                  <div className="p-2 rounded-xl bg-violet-500 shadow-lg shadow-violet-500/30">
                    <ShoppingCart className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-slate-800">{metrics.orderCount}</p>
                <p className="text-xs text-violet-600 mt-1">
                  ${metrics.avgOrderValue.toFixed(0)} avg order value
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>

      {/* Shopify Connection Info - Modern Alert */}
      <AnimatePresence>
        {authTenantId && tokenStatus?.hasToken === false && !isDemoMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-gradient-to-r from-red-50 to-rose-50 border-red-200/50 shadow-lg shadow-red-500/5">
              <CardContent className="py-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-500 rounded-2xl shadow-lg shadow-red-500/30">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-red-800">Shopify Connection Required</p>
                      <p className="text-sm text-red-600/80">
                        Connect your Shopify store to sync real orders
                      </p>
                    </div>
                  </div>
                  <Link to={`/settings${window.location.search}`}>
                    <Button className="bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-all">
                      Connect Store
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Demo Mode Info - Modern Alert */}
      <AnimatePresence>
        {authTenantId && isDemoMode && !tokenStatus?.hasToken && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200/50 shadow-lg shadow-blue-500/5">
              <CardContent className="py-5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <motion.div 
                      className="p-3 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl shadow-lg shadow-blue-500/30"
                      animate={{ rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Sparkles className="w-5 h-5 text-white" />
                    </motion.div>
                    <div>
                      <p className="font-semibold text-blue-800">Demo Mode Active</p>
                      <p className="text-sm text-blue-600/80">
                        Create demo orders to explore. Connect Shopify for real data.
                      </p>
                    </div>
                  </div>
                  <Link to={`/settings${window.location.search}`}>
                    <Button variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100 shadow-sm hover:shadow transition-all">
                      Connect Store
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Shopify Actions */}
      <motion.div variants={fadeInUp}>
        <PendingShopifyActionsPanel tenantId={authTenantId} />
      </motion.div>

      {/* Alerts Banner - Modern */}
      <AnimatePresence>
        {pendingAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/50 shadow-lg shadow-amber-500/5 overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/20 rounded-full blur-3xl" />
              <CardContent className="py-5 relative">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <motion.div 
                      className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl shadow-lg shadow-amber-500/30"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </motion.div>
                    <div>
                      <p className="font-semibold text-amber-800">
                        {pendingAlerts.length} Alert{pendingAlerts.length !== 1 ? 's' : ''} Requiring Attention
                      </p>
                      <p className="text-sm text-amber-600/80">
                        {pendingAlerts.filter(a => a.severity === 'high' || a.severity === 'critical').length} high priority
                      </p>
                    </div>
                  </div>
                  <Link to={createPageUrl('Alerts')}>
                    <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100 shadow-sm hover:shadow transition-all">
                      View Alerts
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sync Health + Benchmark */}
      <motion.div variants={fadeInUp} className="grid lg:grid-cols-2 gap-6">
        <SyncHealthCard 
          integration={resolver?.integration}
          syncJobs={syncJobs}
          onSync={(integrationId) => syncMutation.mutate()}
          syncing={syncMutation.isPending}
        />
        <BenchmarkComparison tenantId={authTenantId} />
      </motion.div>

      {/* Profit Chart */}
      <motion.div variants={fadeInUp}>
        <ProfitChart data={chartData} title={`Profit Trends (Last ${dateRange} Days)`} />
      </motion.div>

      {/* Hidden Profit Leaks - Modern Section */}
      <motion.div variants={fadeInUp}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Hidden Profit Leaks
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {topLeaks.length > 0 
                ? `${profitLeaks.length} leak${profitLeaks.length !== 1 ? 's' : ''} detected · $${totalLeakImpact.toLocaleString()} total impact`
                : 'No profit leaks detected'}
            </p>
          </div>
          {profitLeaks.length > 3 && (
            <Link to={createPageUrl('Alerts')}>
              <Button variant="ghost" className="text-emerald-600 hover:bg-emerald-50">
                View All
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        {topLeaks.length > 0 ? (
          <div className="grid gap-4">
            {topLeaks.map((leak, index) => (
              <motion.div
                key={leak.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <ProfitLeakCard leak={leak} index={index} />
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white">
            <CardContent className="py-12 text-center">
              <motion.div 
                className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <TrendingUp className="w-8 h-8 text-white" />
              </motion.div>
              <p className="text-slate-800 font-semibold text-lg">No profit leaks detected</p>
              <p className="text-sm text-slate-500 mt-2">Your store is running efficiently</p>
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Quick Stats Grid - Modern Glassmorphism */}
      <motion.div variants={fadeInUp} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className={`p-5 backdrop-blur-sm border-0 shadow-lg transition-all ${metrics.highRiskOrders > 0 ? 'bg-gradient-to-br from-red-50 to-rose-50 shadow-red-500/10' : 'bg-white/80'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">High Risk Orders</p>
                <p className={`text-2xl font-bold ${metrics.highRiskOrders > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {metrics.highRiskOrders}
                </p>
              </div>
              <div className={`p-2.5 rounded-xl ${metrics.highRiskOrders > 0 ? 'bg-red-500 shadow-lg shadow-red-500/30' : 'bg-slate-100'}`}>
                <AlertTriangle className={`w-5 h-5 ${metrics.highRiskOrders > 0 ? 'text-white' : 'text-slate-400'}`} />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className={`p-5 backdrop-blur-sm border-0 shadow-lg transition-all ${metrics.negativeMarginOrders > 0 ? 'bg-gradient-to-br from-amber-50 to-orange-50 shadow-amber-500/10' : 'bg-white/80'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Negative Margin</p>
                <p className={`text-2xl font-bold ${metrics.negativeMarginOrders > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                  {metrics.negativeMarginOrders}
                </p>
              </div>
              <div className={`p-2.5 rounded-xl ${metrics.negativeMarginOrders > 0 ? 'bg-amber-500 shadow-lg shadow-amber-500/30' : 'bg-slate-100'}`}>
                <TrendingDown className={`w-5 h-5 ${metrics.negativeMarginOrders > 0 ? 'text-white' : 'text-slate-400'}`} />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className="p-5 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Avg Order Value</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${metrics.avgOrderValue.toFixed(0)}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100">
                <ShoppingCart className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 300 }}>
          <Card className={`p-5 backdrop-blur-sm border-0 shadow-lg transition-all ${metrics.totalRefunds > 0 ? 'bg-gradient-to-br from-rose-50 to-pink-50 shadow-rose-500/10' : 'bg-white/80'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Refunds</p>
                <p className={`text-2xl font-bold ${metrics.totalRefunds > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  ${metrics.totalRefunds.toFixed(0)}
                </p>
              </div>
              <div className={`p-2.5 rounded-xl ${metrics.totalRefunds > 0 ? 'bg-rose-500 shadow-lg shadow-rose-500/30' : 'bg-slate-100'}`}>
                <Package className={`w-5 h-5 ${metrics.totalRefunds > 0 ? 'text-white' : 'text-slate-400'}`} />
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}