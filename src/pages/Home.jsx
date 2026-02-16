import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
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
  ExternalLink
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
import { useTenantResolver } from '../components/useTenantResolver';
import DebugBanner from '../components/DebugBanner';

export default function Home() {
  const { tenant, tenantId, shopDomain, loading: tenantLoading, error: tenantError, debug, user } = useTenantResolver();
  const [dateRange, setDateRange] = useState('30');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('syncShopifyOrders', { tenant_id: tenantId });
      return response.data;
    },
    onSuccess: (data) => {
      const msg = `Synced: ${data.createdCount || data.created} new, ${data.updatedCount || data.updated} updated${data.newestOrderNumber ? ` (newest #${data.newestOrderNumber})` : ''}`;
      toast.success(msg, {
        action: {
          label: 'View Orders',
          onClick: () => {
            const qs = window.location.search || '';
            navigate(`/orders${qs}`);
          }
        }
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to sync orders');
    }
  });

  const createTestOrderMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('createShopifyTestOrder', { tenant_id: tenantId });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Created Shopify order ${data.order_number} ($${data.total_price})`, {
        description: `Product: ${data.product_title}`,
        action: {
          label: 'View in Shopify',
          onClick: () => {
            window.open(`https://${shopDomain}/admin/orders/${data.order_id}`, '_blank');
          }
        }
      });
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create test order');
    }
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', tenantId, dateRange],
    queryFn: async () => {
      if (!tenantId) return [];
      console.log('[Home] Fetching orders for tenant:', tenantId);
      const allOrders = await base44.entities.Order.filter({ 
        tenant_id: tenantId 
      }, '-order_date', 500);
      console.log('[Home] Fetched', allOrders.length, 'orders');
      return allOrders;
    },
    enabled: !!tenantId && !tenantLoading
  });

  const { data: profitLeaks = [], isLoading: leaksLoading } = useQuery({
    queryKey: ['profitLeaks', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      return base44.entities.ProfitLeak.filter({ 
        tenant_id: tenantId,
        is_resolved: false 
      }, '-impact_amount', 10);
    },
    enabled: !!tenantId && !tenantLoading
  });

  const { data: pendingAlerts = [] } = useQuery({
    queryKey: ['pendingAlerts', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      return base44.entities.Alert.filter({ 
        tenant_id: tenantId,
        status: 'pending' 
      }, '-created_date', 5);
    },
    enabled: !!tenantId && !tenantLoading
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

  const topLeaks = profitLeaks.slice(0, 3);
  const totalLeakImpact = profitLeaks.reduce((sum, l) => sum + (l.impact_amount || 0), 0);

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-emerald-500 mx-auto mb-4 animate-spin" />
          <p className="text-slate-500">Loading your store...</p>
        </div>
      </div>
    );
  }

  if (!tenant && !tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Sparkles className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Welcome to ProfitShield AI</h2>
          <p className="text-slate-500 mb-4">Connect your Shopify store to get started</p>
          {tenantError && (
            <p className="text-red-500 text-sm mb-4">{tenantError}</p>
          )}
          <Link to={createPageUrl('Onboarding')}>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              Connect Store
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Debug Banner */}
      <DebugBanner 
        shopDomain={shopDomain} 
        tenantId={tenantId} 
        ordersCount={orders.length}
        debug={debug}
        userEmail={user?.email}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Your profit health at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
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
            onClick={() => createTestOrderMutation.mutate()}
            disabled={createTestOrderMutation.isPending || !tenantId}
            className="gap-2"
          >
            <Plus className={`w-4 h-4 ${createTestOrderMutation.isPending ? 'animate-spin' : ''}`} />
            {createTestOrderMutation.isPending ? 'Creating...' : 'Create Test Order'}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !tenantId}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Orders'}
          </Button>
        </div>
      </div>

      {/* Top Section: Score + Alerts */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Profit Integrity Score */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center">
              <h3 className="text-sm font-medium text-slate-500 mb-4">Profit Integrity Score</h3>
              <ProfitIntegrityScore 
                score={tenant.profit_integrity_score || 0} 
                previousScore={tenant.profit_integrity_score ? tenant.profit_integrity_score - 5 : undefined}
              />
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics Grid */}
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          <MetricCard
            title="True Net Profit"
            value={metrics.totalProfit}
            prefix="$"
            icon={DollarSign}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
            valueColor={metrics.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
            loading={ordersLoading}
          />
          <MetricCard
            title="Total Revenue"
            value={metrics.totalRevenue}
            prefix="$"
            icon={TrendingUp}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
            loading={ordersLoading}
          />
          <MetricCard
            title="Average Margin"
            value={metrics.avgMargin.toFixed(1)}
            suffix="%"
            icon={metrics.avgMargin >= 0 ? TrendingUp : TrendingDown}
            iconColor={metrics.avgMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}
            iconBg={metrics.avgMargin >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
            valueColor={metrics.avgMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}
            loading={ordersLoading}
          />
          <MetricCard
            title="Orders"
            value={metrics.orderCount}
            icon={ShoppingCart}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
            loading={ordersLoading}
          />
        </div>
      </div>

      {/* Alerts Banner */}
      {pendingAlerts.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-800">
                    {pendingAlerts.length} Alert{pendingAlerts.length !== 1 ? 's' : ''} Requiring Attention
                  </p>
                  <p className="text-sm text-amber-600">
                    {pendingAlerts.filter(a => a.severity === 'high' || a.severity === 'critical').length} high priority
                  </p>
                </div>
              </div>
              <Link to={createPageUrl('Alerts')}>
                <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100">
                  View Alerts
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Profit Chart */}
      <ProfitChart data={chartData} title={`Profit Trends (Last ${dateRange} Days)`} />

      {/* Hidden Profit Leaks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Hidden Profit Leaks</h2>
            <p className="text-sm text-slate-500">
              {topLeaks.length > 0 
                ? `${profitLeaks.length} leak${profitLeaks.length !== 1 ? 's' : ''} detected · $${totalLeakImpact.toLocaleString()} total impact`
                : 'No profit leaks detected'}
            </p>
          </div>
          {profitLeaks.length > 3 && (
            <Link to={createPageUrl('Alerts')}>
              <Button variant="ghost" className="text-emerald-600">
                View All
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>

        {topLeaks.length > 0 ? (
          <div className="grid gap-4">
            {topLeaks.map((leak, index) => (
              <ProfitLeakCard key={leak.id} leak={leak} index={index} />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-slate-600 font-medium">No profit leaks detected</p>
              <p className="text-sm text-slate-500 mt-1">Your store is running efficiently</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">High Risk Orders</p>
              <p className={`text-2xl font-bold ${metrics.highRiskOrders > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {metrics.highRiskOrders}
              </p>
            </div>
            <AlertTriangle className={`w-8 h-8 ${metrics.highRiskOrders > 0 ? 'text-red-200' : 'text-slate-200'}`} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Negative Margin</p>
              <p className={`text-2xl font-bold ${metrics.negativeMarginOrders > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                {metrics.negativeMarginOrders}
              </p>
            </div>
            <TrendingDown className={`w-8 h-8 ${metrics.negativeMarginOrders > 0 ? 'text-red-200' : 'text-slate-200'}`} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Avg Order Value</p>
              <p className="text-2xl font-bold text-slate-900">
                ${metrics.avgOrderValue.toFixed(0)}
              </p>
            </div>
            <ShoppingCart className="w-8 h-8 text-slate-200" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Refunds</p>
              <p className={`text-2xl font-bold ${metrics.totalRefunds > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                ${metrics.totalRefunds.toFixed(0)}
              </p>
            </div>
            <Package className={`w-8 h-8 ${metrics.totalRefunds > 0 ? 'text-red-200' : 'text-slate-200'}`} />
          </div>
        </Card>
      </div>
    </div>
  );
}