import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { 
  Search, 
  Filter, 
  Download,
  SlidersHorizontal,
  X,
  Loader2,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';

import OrdersTable from '../components/orders/OrdersTable';
import OrderDetailPanel from '../components/orders/OrderDetailPanel';
import DebugBanner from '../components/DebugBanner';

export default function Orders() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    dateRange: '30',
    status: 'all',
    riskLevel: 'all',
    riskScoreMin: '',
    riskScoreMax: '',
    profitability: 'all',
    confidence: 'all'
  });
  const [analyzingRisk, setAnalyzingRisk] = useState(false);

  // Use unified platform resolver
  const { 
    status, 
    tenantId, 
    tenant, 
    platform, 
    storeKey, 
    user, 
    reason,
    loading: resolverLoading 
  } = usePlatformResolver();

  // Load tenant settings
  const { data: tenantSettings } = useQuery({
    queryKey: ['tenantSettings', tenantId],
    queryFn: async () => {
      const settings = await base44.entities.TenantSettings.filter({ tenant_id: tenantId });
      return settings[0] || null;
    },
    enabled: !!tenantId && status === RESOLVER_STATUS.RESOLVED
  });

  // Fetch orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', tenantId],
    queryFn: async () => {
      console.log('[Orders] Fetching orders for tenant:', tenantId);
      const allOrders = await base44.entities.Order.filter({ tenant_id: tenantId }, '-order_date', 1000);
      console.log('[Orders] Returned count:', allOrders.length);
      return allOrders;
    },
    enabled: !!tenantId && status === RESOLVER_STATUS.RESOLVED
  });

  const isLoading = resolverLoading || ordersLoading || status === RESOLVER_STATUS.RESOLVING;

  // Apply filters
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Demo mode filter
    const demoMode = tenantSettings?.demo_mode !== false;
    if (!demoMode) {
      result = result.filter(o => o.platform_order_id && o.is_demo !== true);
    }

    // Date range filter
    const days = parseInt(filters.dateRange);
    const startDate = subDays(new Date(), days);
    result = result.filter(o => o.order_date && new Date(o.order_date) >= startDate);

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(o => 
        o.order_number?.toLowerCase().includes(term) ||
        o.platform_order_id?.toLowerCase().includes(term) ||
        o.customer_name?.toLowerCase().includes(term) ||
        o.customer_email?.toLowerCase().includes(term) ||
        o.notes?.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (filters.status !== 'all') {
      result = result.filter(o => o.status === filters.status);
    }

    // Risk level filter
    if (filters.riskLevel !== 'all') {
      result = result.filter(o => o.risk_level === filters.riskLevel);
    }

    // Risk score range filter
    if (filters.riskScoreMin !== '') {
      const minScore = parseInt(filters.riskScoreMin);
      result = result.filter(o => (o.fraud_score || 0) >= minScore);
    }
    if (filters.riskScoreMax !== '') {
      const maxScore = parseInt(filters.riskScoreMax);
      result = result.filter(o => (o.fraud_score || 0) <= maxScore);
    }

    // Profitability filter
    if (filters.profitability === 'profitable') {
      result = result.filter(o => (o.net_profit || 0) >= 0);
    } else if (filters.profitability === 'unprofitable') {
      result = result.filter(o => (o.net_profit || 0) < 0);
    }

    // Confidence filter
    if (filters.confidence !== 'all') {
      result = result.filter(o => o.confidence === filters.confidence);
    }

    return result;
  }, [orders, filters, searchTerm, tenantSettings]);

  // Calculate summary stats
  const stats = useMemo(() => ({
    totalOrders: filteredOrders.length,
    totalRevenue: filteredOrders.reduce((sum, o) => sum + (o.total_revenue || 0), 0),
    totalProfit: filteredOrders.reduce((sum, o) => sum + (o.net_profit || 0), 0),
    highRisk: filteredOrders.filter(o => o.risk_level === 'high').length,
    unprofitable: filteredOrders.filter(o => (o.net_profit || 0) < 0).length,
    avgRiskScore: filteredOrders.length > 0 
      ? Math.round(filteredOrders.reduce((sum, o) => sum + (o.fraud_score || 0), 0) / filteredOrders.length)
      : 0,
    unscored: filteredOrders.filter(o => o.fraud_score === undefined || o.fraud_score === null).length
  }), [filteredOrders]);

  // Bulk analyze risk for unscored orders
  const analyzeUnscoredOrders = async () => {
    const unscoredOrders = filteredOrders.filter(o => o.fraud_score === undefined || o.fraud_score === null);
    if (unscoredOrders.length === 0) {
      toast.info('All orders already have risk scores');
      return;
    }

    setAnalyzingRisk(true);
    let analyzed = 0;
    let failed = 0;

    for (const order of unscoredOrders.slice(0, 50)) { // Limit to 50 at a time
      try {
        await base44.functions.invoke('analyzeOrderRisk', {
          order_id: order.id,
          tenant_id: tenantId
        });
        analyzed++;
      } catch (e) {
        failed++;
        console.error('Risk analysis failed for order:', order.id, e);
      }
    }

    setAnalyzingRisk(false);
    queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
    toast.success(`Analyzed ${analyzed} orders${failed > 0 ? `, ${failed} failed` : ''}`);
  };

  const activeFiltersCount = Object.values(filters).filter(v => v !== 'all' && v !== '30' && v !== '').length;

  const clearFilters = () => {
    setFilters({
      dateRange: '30',
      status: 'all',
      riskLevel: 'all',
      riskScoreMin: '',
      riskScoreMax: '',
      profitability: 'all',
      confidence: 'all'
    });
    setSearchTerm('');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Debug Banner */}
      <DebugBanner 
        shopDomain={storeKey} 
        tenantId={tenantId} 
        ordersCount={orders.length}
        debug={{ platform, reason }}
        userEmail={user?.email}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <p className="text-slate-500">
            View and analyze order profitability
            {tenantSettings?.demo_mode === false && (
              <Badge variant="outline" className="ml-2 text-xs">Real orders only</Badge>
            )}
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Orders</p>
          <p className="text-2xl font-bold text-slate-900">{stats.totalOrders}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Revenue</p>
          <p className="text-2xl font-bold text-slate-900">${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Net Profit</p>
          <p className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            ${stats.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">High Risk</p>
          <p className={`text-2xl font-bold ${stats.highRisk > 0 ? 'text-red-600' : 'text-slate-900'}`}>{stats.highRisk}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-500">Avg Risk Score</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${stats.avgRiskScore >= 70 ? 'text-red-600' : stats.avgRiskScore >= 40 ? 'text-yellow-600' : 'text-emerald-600'}`}>
              {stats.avgRiskScore}
            </p>
            <span className="text-xs text-slate-400">/100</span>
          </div>
        </div>
      </div>

      {/* Risk Analysis Banner */}
      {stats.unscored > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">{stats.unscored} orders without risk scores</p>
              <p className="text-sm text-amber-700">Run AI analysis to detect fraud patterns and assign risk scores</p>
            </div>
          </div>
          <Button 
            onClick={analyzeUnscoredOrders}
            disabled={analyzingRisk}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {analyzingRisk ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Analyze Risk</>
            )}
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select 
          value={filters.dateRange} 
          onValueChange={(v) => setFilters({ ...filters, dateRange: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge className="ml-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filter Orders</SheetTitle>
            </SheetHeader>
            <div className="space-y-6 mt-6">
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <Select 
                  value={filters.status} 
                  onValueChange={(v) => setFilters({ ...filters, status: v })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Risk Level</Label>
                <Select 
                  value={filters.riskLevel} 
                  onValueChange={(v) => setFilters({ ...filters, riskLevel: v })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="high">High Risk</SelectItem>
                    <SelectItem value="medium">Medium Risk</SelectItem>
                    <SelectItem value="low">Low Risk</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Risk Score Range</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Min"
                    value={filters.riskScoreMin}
                    onChange={(e) => setFilters({ ...filters, riskScoreMin: e.target.value })}
                    className="w-20"
                  />
                  <span className="text-slate-400">-</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Max"
                    value={filters.riskScoreMax}
                    onChange={(e) => setFilters({ ...filters, riskScoreMax: e.target.value })}
                    className="w-20"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">0-39 Low, 40-69 Medium, 70+ High</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Profitability</Label>
                <Select 
                  value={filters.profitability} 
                  onValueChange={(v) => setFilters({ ...filters, profitability: v })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Orders</SelectItem>
                    <SelectItem value="profitable">Profitable Only</SelectItem>
                    <SelectItem value="unprofitable">Unprofitable Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Data Confidence</Label>
                <Select 
                  value={filters.confidence} 
                  onValueChange={(v) => setFilters({ ...filters, confidence: v })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="high">High Confidence</SelectItem>
                    <SelectItem value="medium">Medium Confidence</SelectItem>
                    <SelectItem value="low">Low Confidence</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {activeFiltersCount > 0 && (
                <Button variant="outline" className="w-full" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  Clear All Filters
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Active Filters Tags */}
      {(activeFiltersCount > 0 || searchTerm) && (
        <div className="flex flex-wrap gap-2">
          {searchTerm && (
            <Badge variant="secondary" className="gap-1">
              Search: {searchTerm}
              <X 
                className="w-3 h-3 cursor-pointer" 
                onClick={() => setSearchTerm('')}
              />
            </Badge>
          )}
          {filters.status !== 'all' && (
            <Badge variant="secondary" className="gap-1 capitalize">
              Status: {filters.status}
              <X 
                className="w-3 h-3 cursor-pointer" 
                onClick={() => setFilters({ ...filters, status: 'all' })}
              />
            </Badge>
          )}
          {filters.riskLevel !== 'all' && (
            <Badge variant="secondary" className="gap-1 capitalize">
              Risk: {filters.riskLevel}
              <X 
                className="w-3 h-3 cursor-pointer" 
                onClick={() => setFilters({ ...filters, riskLevel: 'all' })}
              />
            </Badge>
          )}
          {(filters.riskScoreMin !== '' || filters.riskScoreMax !== '') && (
            <Badge variant="secondary" className="gap-1">
              Score: {filters.riskScoreMin || '0'}-{filters.riskScoreMax || '100'}
              <X 
                className="w-3 h-3 cursor-pointer" 
                onClick={() => setFilters({ ...filters, riskScoreMin: '', riskScoreMax: '' })}
              />
            </Badge>
          )}
          {filters.profitability !== 'all' && (
            <Badge variant="secondary" className="gap-1 capitalize">
              {filters.profitability}
              <X 
                className="w-3 h-3 cursor-pointer" 
                onClick={() => setFilters({ ...filters, profitability: 'all' })}
              />
            </Badge>
          )}
        </div>
      )}

      {/* Orders Table */}
      <OrdersTable 
        orders={filteredOrders} 
        loading={isLoading}
        onOrderClick={setSelectedOrder}
      />

      {/* Order Detail Panel */}
      {selectedOrder && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setSelectedOrder(null)}
          />
          <OrderDetailPanel 
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onOrderUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
              // Refresh selected order data
              base44.entities.Order.filter({ id: selectedOrder.id }).then(orders => {
                if (orders.length > 0) setSelectedOrder(orders[0]);
              });
            }}
          />
        </>
      )}
    </div>
  );
}