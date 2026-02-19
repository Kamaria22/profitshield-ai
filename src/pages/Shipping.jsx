import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { format, subDays } from 'date-fns';
import { 
  Truck, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  DollarSign,
  Package,
  Loader2
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '@/components/usePlatformResolver';

export default function Shipping() {
  const [dateRange, setDateRange] = useState('30');
  
  // SINGLE SOURCE OF TRUTH: Platform Resolver
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver || {});
  
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const shippingQueryKey = useMemo(() => 
    [...buildQueryKey('orders-shipping', resolverCheck), dateRange],
    [resolverCheck?.platform, resolverCheck?.storeKey, resolverCheck?.integrationId, resolverCheck?.tenantId, dateRange]
  );

  const { data: orders = [], isLoading } = useQuery({
    queryKey: shippingQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.Order.filter({ 
        tenant_id: queryFilter.tenant_id 
      }, '-order_date', 500);
    },
    enabled: canQuery,
    ...queryDefaults.standard
  });

  // ALL HOOKS MUST BE CALLED BEFORE EARLY RETURNS
  // Filter by date range
  const filteredOrders = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const days = parseInt(dateRange) || 30;
    const startDate = subDays(new Date(), days);
    return safeOrders.filter(o => o.order_date && new Date(o.order_date) >= startDate);
  }, [orders, dateRange]);

  // Calculate shipping metrics
  const metrics = useMemo(() => {
    const ordersWithShipping = filteredOrders.filter(o => o.shipping_charged || o.shipping_cost);
    
    const totalShippingCharged = ordersWithShipping.reduce((sum, o) => sum + (o.shipping_charged || 0), 0);
    const totalShippingCost = ordersWithShipping.reduce((sum, o) => sum + (o.shipping_cost || 0), 0);
    const shippingProfit = totalShippingCharged - totalShippingCost;
    
    const lossOrders = ordersWithShipping.filter(o => (o.shipping_cost || 0) > (o.shipping_charged || 0));
    const totalLoss = lossOrders.reduce((sum, o) => sum + ((o.shipping_cost || 0) - (o.shipping_charged || 0)), 0);
    
    const avgShippingCharged = ordersWithShipping.length > 0 
      ? totalShippingCharged / ordersWithShipping.length 
      : 0;
    const avgShippingCost = ordersWithShipping.length > 0 
      ? totalShippingCost / ordersWithShipping.length 
      : 0;

    return {
      totalShippingCharged,
      totalShippingCost,
      shippingProfit,
      lossOrders: lossOrders.length,
      totalLoss,
      avgShippingCharged,
      avgShippingCost,
      ordersWithShipping: ordersWithShipping.length
    };
  }, [filteredOrders]);

  // Generate chart data by week
  const chartData = useMemo(() => {
    const weeks = {};
    
    filteredOrders.forEach(order => {
      if (!order.order_date) return;
      const weekStart = format(new Date(order.order_date), 'MMM d');
      
      if (!weeks[weekStart]) {
        weeks[weekStart] = { date: weekStart, charged: 0, cost: 0 };
      }
      
      weeks[weekStart].charged += order.shipping_charged || 0;
      weeks[weekStart].cost += order.shipping_cost || 0;
    });
    
    return Object.values(weeks).slice(-8);
  }, [filteredOrders]);

  // Get orders with shipping loss
  const shippingLossOrders = useMemo(() => {
    return filteredOrders
      .filter(o => (o.shipping_cost || 0) > (o.shipping_charged || 0))
      .sort((a, b) => {
        const lossA = (a.shipping_cost || 0) - (a.shipping_charged || 0);
        const lossB = (b.shipping_cost || 0) - (b.shipping_charged || 0);
        return lossB - lossA;
      })
      .slice(0, 10);
  }, [filteredOrders]);
  
  // Loading state - AFTER all hooks
  if (resolver?.status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shipping Analysis</h1>
          <p className="text-slate-500">Track shipping costs vs revenue</p>
        </div>
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
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Shipping Charged</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${metrics.totalShippingCharged.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Actual Shipping Cost</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${metrics.totalShippingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <Truck className="w-8 h-8 text-slate-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Shipping Profit</p>
                <p className={`text-2xl font-bold ${metrics.shippingProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ${metrics.shippingProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              {metrics.shippingProfit >= 0 ? (
                <TrendingUp className="w-8 h-8 text-emerald-200" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-200" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Orders at Loss</p>
                <p className={`text-2xl font-bold ${metrics.lossOrders > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {metrics.lossOrders}
                </p>
              </div>
              <AlertTriangle className={`w-8 h-8 ${metrics.lossOrders > 0 ? 'text-red-200' : 'text-slate-200'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Shipping Revenue vs Cost</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  formatter={(value) => [`$${value.toFixed(2)}`, '']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Legend iconType="circle" iconSize={8} />
                <Bar dataKey="charged" name="Charged to Customer" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Actual Cost" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Shipping Loss Orders */}
      {shippingLossOrders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Orders with Shipping Loss
              </CardTitle>
              <Badge variant="destructive">
                -${metrics.totalLoss.toFixed(2)} total loss
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Actual Cost</TableHead>
                  <TableHead className="text-right">Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shippingLossOrders.map((order) => {
                  const loss = (order.shipping_cost || 0) - (order.shipping_charged || 0);
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">#{order.order_number}</TableCell>
                      <TableCell className="text-slate-500">
                        {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        ${(order.shipping_charged || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        ${(order.shipping_cost || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        -${loss.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}