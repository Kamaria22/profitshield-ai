import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';
import { usePermissions } from '@/components/usePermissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, 
  Calendar as CalendarIcon, Download, Filter, ChevronRight,
  BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Loader2
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';

import PnLMetricsCards from '@/components/analytics/PnLMetricsCards';
import PnLTrendsChart from '@/components/analytics/PnLTrendsChart';
import PnLBreakdownChart from '@/components/analytics/PnLBreakdownChart';
import PnLSegmentTable from '@/components/analytics/PnLSegmentTable';
import OrderDrilldownPanel from '@/components/analytics/OrderDrilldownPanel';
import AIOrderAnalysis from '@/components/analytics/AIOrderAnalysis';

const DATE_PRESETS = [
  { label: 'Today', value: 'today', getDates: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Last 7 Days', value: '7d', getDates: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: 'Last 30 Days', value: '30d', getDates: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  { label: 'This Week', value: 'week', getDates: () => ({ from: startOfWeek(new Date()), to: endOfWeek(new Date()) }) },
  { label: 'This Month', value: 'month', getDates: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'Last 90 Days', value: '90d', getDates: () => ({ from: subDays(new Date(), 89), to: new Date() }) },
];

export default function PnLAnalytics() {
  const { tenantId, status } = usePlatformResolver();
  const { hasPermission } = usePermissions();
  const tenantLoading = status === RESOLVER_STATUS.RESOLVING;
  
  const [datePreset, setDatePreset] = useState('30d');
  const [dateRange, setDateRange] = useState(DATE_PRESETS[2].getDates());
  const [granularity, setGranularity] = useState('daily');
  const [segmentBy, setSegmentBy] = useState('product');
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [drilldownOrders, setDrilldownOrders] = useState(null);

  // Fetch orders for the date range
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['pnl-orders', tenantId, dateRange],
    queryFn: async () => {
      if (!tenantId) return [];
      const allOrders = await base44.entities.Order.filter({ tenant_id: tenantId });
      return allOrders.filter(order => {
        if (!order.order_date) return false;
        const orderDate = new Date(order.order_date);
        return isWithinInterval(orderDate, { start: dateRange.from, end: dateRange.to });
      });
    },
    enabled: !!tenantId && !tenantLoading
  });

  // Fetch products for segmentation
  const { data: products = [] } = useQuery({
    queryKey: ['pnl-products', tenantId],
    queryFn: () => base44.entities.Product.filter({ tenant_id: tenantId }),
    enabled: !!tenantId && !tenantLoading
  });

  // Calculate P&L metrics
  const metrics = useMemo(() => {
    if (!orders.length) return null;

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_revenue || 0), 0);
    const totalCogs = orders.reduce((sum, o) => sum + (o.total_cogs || 0), 0);
    const totalShippingCost = orders.reduce((sum, o) => sum + (o.shipping_cost || 0), 0);
    const totalShippingCharged = orders.reduce((sum, o) => sum + (o.shipping_charged || 0), 0);
    const totalPaymentFees = orders.reduce((sum, o) => sum + (o.payment_fee || 0), 0);
    const totalPlatformFees = orders.reduce((sum, o) => sum + (o.platform_fee || 0), 0);
    const totalDiscounts = orders.reduce((sum, o) => sum + (o.discount_total || 0), 0);
    const totalRefunds = orders.reduce((sum, o) => sum + (o.refund_amount || 0), 0);
    const totalTax = orders.reduce((sum, o) => sum + (o.tax_total || 0), 0);

    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalShippingCost - totalPaymentFees - totalPlatformFees - totalRefunds;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const aov = orders.length > 0 ? totalRevenue / orders.length : 0;

    // Unique customers
    const uniqueCustomers = new Set(orders.map(o => o.customer_email).filter(Boolean)).size;
    const ltv = uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;

    // Profitable vs unprofitable orders
    const profitableOrders = orders.filter(o => (o.net_profit || 0) > 0).length;
    const unprofitableOrders = orders.filter(o => (o.net_profit || 0) <= 0).length;

    return {
      totalRevenue,
      totalCogs,
      grossProfit,
      netProfit,
      grossMargin,
      netMargin,
      aov,
      ltv,
      orderCount: orders.length,
      uniqueCustomers,
      profitableOrders,
      unprofitableOrders,
      totalShippingCost,
      totalShippingCharged,
      shippingProfit: totalShippingCharged - totalShippingCost,
      totalPaymentFees,
      totalPlatformFees,
      totalDiscounts,
      totalRefunds,
      totalTax
    };
  }, [orders]);

  // Calculate trend data for charts
  const trendData = useMemo(() => {
    if (!orders.length) return [];

    const grouped = {};
    orders.forEach(order => {
      const date = new Date(order.order_date);
      let key;
      if (granularity === 'daily') {
        key = format(date, 'yyyy-MM-dd');
      } else if (granularity === 'weekly') {
        key = format(startOfWeek(date), 'yyyy-MM-dd');
      } else {
        key = format(date, 'yyyy-MM');
      }

      if (!grouped[key]) {
        grouped[key] = { date: key, revenue: 0, cogs: 0, grossProfit: 0, netProfit: 0, orders: 0 };
      }
      grouped[key].revenue += order.total_revenue || 0;
      grouped[key].cogs += order.total_cogs || 0;
      grouped[key].grossProfit += (order.total_revenue || 0) - (order.total_cogs || 0);
      grouped[key].netProfit += order.net_profit || 0;
      grouped[key].orders += 1;
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [orders, granularity]);

  // Calculate segment data
  const segmentData = useMemo(() => {
    if (!orders.length) return [];

    const segments = {};

    if (segmentBy === 'product') {
      orders.forEach(order => {
        const items = order.platform_data?.line_items || [];
        items.forEach(item => {
          const key = item.title || 'Unknown Product';
          if (!segments[key]) {
            segments[key] = { name: key, revenue: 0, cogs: 0, profit: 0, orders: 0, units: 0 };
          }
          segments[key].revenue += item.price * (item.quantity || 1);
          segments[key].units += item.quantity || 1;
          segments[key].orders += 1;
        });
        // Distribute COGS proportionally
        if (items.length > 0 && order.total_cogs) {
          const cogsPerItem = order.total_cogs / items.length;
          items.forEach(item => {
            const key = item.title || 'Unknown Product';
            segments[key].cogs += cogsPerItem;
          });
        }
      });
    } else if (segmentBy === 'customer') {
      orders.forEach(order => {
        const key = order.customer_email || 'Guest';
        if (!segments[key]) {
          segments[key] = { name: key, revenue: 0, cogs: 0, profit: 0, orders: 0, customerName: order.customer_name };
        }
        segments[key].revenue += order.total_revenue || 0;
        segments[key].cogs += order.total_cogs || 0;
        segments[key].orders += 1;
      });
    } else if (segmentBy === 'tags') {
      orders.forEach(order => {
        const tags = order.tags || ['Untagged'];
        tags.forEach(tag => {
          if (!segments[tag]) {
            segments[tag] = { name: tag, revenue: 0, cogs: 0, profit: 0, orders: 0 };
          }
          segments[tag].revenue += (order.total_revenue || 0) / tags.length;
          segments[tag].cogs += (order.total_cogs || 0) / tags.length;
          segments[tag].orders += 1;
        });
      });
    }

    // Calculate profit for each segment
    Object.values(segments).forEach(seg => {
      seg.profit = seg.revenue - seg.cogs;
      seg.margin = seg.revenue > 0 ? (seg.profit / seg.revenue) * 100 : 0;
    });

    return Object.values(segments).sort((a, b) => b.revenue - a.revenue);
  }, [orders, segmentBy]);

  // Handle date preset change
  const handleDatePresetChange = (preset) => {
    setDatePreset(preset);
    const presetConfig = DATE_PRESETS.find(p => p.value === preset);
    if (presetConfig) {
      setDateRange(presetConfig.getDates());
    }
  };

  // Handle segment drill-down
  const handleSegmentDrilldown = (segment) => {
    setSelectedSegment(segment);
    let filteredOrders = [];

    if (segmentBy === 'product') {
      filteredOrders = orders.filter(o => 
        (o.platform_data?.line_items || []).some(item => item.title === segment.name)
      );
    } else if (segmentBy === 'customer') {
      filteredOrders = orders.filter(o => o.customer_email === segment.name);
    } else if (segmentBy === 'tags') {
      filteredOrders = orders.filter(o => (o.tags || []).includes(segment.name));
    }

    setDrilldownOrders(filteredOrders);
  };

  const isLoading = tenantLoading || ordersLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">P&L Analytics</h1>
          <p className="text-slate-400">Comprehensive profit and loss analysis</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Preset Selector */}
          <Select value={datePreset} onValueChange={handleDatePresetChange}>
            <SelectTrigger className="w-40 bg-white/5 border-white/10 text-slate-200">
              <CalendarIcon className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map(preset => (
                <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
              ))}
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {/* Granularity Selector */}
          <Select value={granularity} onValueChange={setGranularity}>
            <SelectTrigger className="w-32 bg-white/5 border-white/10 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>

          {hasPermission('reports_export') && (
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Date Range Display */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <CalendarIcon className="w-4 h-4 text-slate-500" />
        {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
        <Badge variant="outline" className="ml-2 border-white/15 text-slate-400">
          {orders.length} orders
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : !metrics ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No order data for this period</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Key Metrics Cards */}
          <PnLMetricsCards metrics={metrics} />

          {/* Trends Chart */}
          <PnLTrendsChart data={trendData} granularity={granularity} />

          {/* Cost Breakdown */}
          <PnLBreakdownChart metrics={metrics} />

          {/* Segmentation Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>P&L by Segment</CardTitle>
                  <CardDescription>Drill down into specific segments</CardDescription>
                </div>
                <Select value={segmentBy} onValueChange={setSegmentBy}>
                  <SelectTrigger className="w-40">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">By Product</SelectItem>
                    <SelectItem value="customer">By Customer</SelectItem>
                    <SelectItem value="tags">By Order Tags</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <PnLSegmentTable 
                data={segmentData} 
                segmentBy={segmentBy}
                onDrilldown={handleSegmentDrilldown}
              />
            </CardContent>
          </Card>

          {/* AI Order Analysis */}
          <AIOrderAnalysis orders={orders} metrics={metrics} />

          {/* Drilldown Panel */}
          {drilldownOrders && (
            <OrderDrilldownPanel
              orders={drilldownOrders}
              segment={selectedSegment}
              segmentBy={segmentBy}
              onClose={() => { setDrilldownOrders(null); setSelectedSegment(null); }}
            />
          )}
        </>
      )}
    </div>
  );
}