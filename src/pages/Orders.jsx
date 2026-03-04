import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { subDays } from 'date-fns';
import { toast } from 'sonner';
import { invariant } from '@/components/utils/invariant';
import { 
  Download,
  SlidersHorizontal,
  X,
  Loader2,
  Sparkles,
  ShieldAlert,
  Store,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';

import OrdersTable from '../components/orders/OrdersTable';
import OrderDetailPanel from '../components/orders/OrderDetailPanel';
import OrderSearchBox from '../components/orders/OrderSearchBox';
import OrderSyncStatus from '../components/orders/OrderSyncStatus';
import DebugBanner from '../components/DebugBanner';

export default function Orders() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTestOrders, setShowTestOrders] = useState(false);
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

  // =====================================================
  // SINGLE SOURCE OF TRUTH: Platform Resolver
  // =====================================================
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  // Derived booleans - computed BEFORE hooks, used for enabled flags
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const hasInvariantViolation = resolverCheck.ok && !resolverCheck.tenantId;
  
  // Display-only values (never use for queries)
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const user = resolver?.user || null;
  const resolverLoading = status === RESOLVER_STATUS.RESOLVING;

  // Deterministic query keys including platform + store identity (prevents cross-store cache bleed)
  const ordersQueryKey = buildQueryKey('orders', resolverCheck);
  const settingsQueryKey = buildQueryKey('tenantSettings', resolverCheck);
  
  // Enterprise invariant check
  invariant(!hasInvariantViolation, 'resolved_missing_tenantId', {
    status: resolverCheck.status,
    platform: resolverCheck.platform,
    storeKey: resolverCheck.storeKey,
    integrationId: resolverCheck.integrationId,
    route: 'Orders'
  });

  // =====================================================
  // DATA QUERIES - Hooks MUST be called unconditionally (React rules)
  // enabled flag gates actual execution
  // =====================================================
  
  // Load tenant settings - only enabled when canQuery
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

  // Fetch orders with deterministic cache key - only enabled when canQuery
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ordersQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      const allOrders = await base44.entities.Order.filter(queryFilter, '-order_date', 1000);
      return allOrders;
    },
    enabled: canQuery,
    ...queryDefaults.heavyList
  });

  // Cache isolation: invalidate queries when store identity changes
  React.useEffect(() => {
    if (resolverCheck.platform && resolverCheck.storeKey) {
      // Store identity available - no action needed on mount
    }
    return () => {
      // On unmount or store change, could invalidate here if needed
    };
  }, [resolverCheck.platform, resolverCheck.storeKey, resolverCheck.integrationId]);

  const isLoading = resolverLoading || ordersLoading;

  // Apply filters - MUST be before any early returns (React hooks rules)
  // Detect if store has any test orders (for banner)
  const hasTestOrders = useMemo(() => orders.some(o => {
    const gateway = (o.platform_data?.gateway || '').toLowerCase();
    const tags = Array.isArray(o.tags) ? o.tags.join(',').toLowerCase() : (o.platform_data?.tags || '').toLowerCase();
    return gateway === 'bogus' || tags.includes('test') || o.is_demo === true;
  }), [orders]);

  const filteredOrders = useMemo(() => {
    if (!canQuery) return [];
    
    let result = [...orders];

    // Test order detection: Shopify test orders have gateway="bogus" or tags containing "test"
    const isTestOrder = (o) => {
      const gateway = (o.platform_data?.gateway || '').toLowerCase();
      const tags = Array.isArray(o.tags) ? o.tags.join(',').toLowerCase() : (o.platform_data?.tags || '').toLowerCase();
      return gateway === 'bogus' || gateway === 'manual' || tags.includes('test') || o.is_demo === true;
    };

    if (!showTestOrders) {
      result = result.filter(o => !isTestOrder(o) || o.is_demo !== true);
    }

    // Date range filter — use a large window to ensure real orders show
    const days = parseInt(filters.dateRange) || 90;
    const startDate = subDays(new Date(), days);
    result = result.filter(o => {
      if (!o.order_date) return true; // include orders without date
      return new Date(o.order_date) >= startDate;
    });

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

  // Memoized handlers
  const analyzeUnscoredOrders = useCallback(async () => {
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
          tenant_id: resolverCheck.tenantId
        });
        analyzed++;
      } catch (e) {
        failed++;
      }
    }

    setAnalyzingRisk(false);
    queryClient.invalidateQueries({ queryKey: ordersQueryKey });
    toast.success(`Analyzed ${analyzed} orders${failed > 0 ? `, ${failed} failed` : ''}`);
  }, [filteredOrders, resolverCheck.tenantId, queryClient, ordersQueryKey]);

  const activeFiltersCount = useMemo(() => 
    Object.values(filters).filter(v => v !== 'all' && v !== '30' && v !== '').length,
    [filters]
  );

  const clearFilters = useCallback(() => {
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
  }, []);

  // =====================================================
  // EARLY RETURNS - AFTER all hooks
  // =====================================================
  
  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // No valid context - show Connect Store banner
  if (!canQuery || hasInvariantViolation || status === RESOLVER_STATUS.ERROR) {
    return (
      <div className="space-y-6">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 bg-amber-500/15 rounded-full mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-100 mb-2">No Store Connected</h2>
              <p className="text-slate-400 mb-4 max-w-md">
                {hasInvariantViolation 
                  ? 'Store resolved but tenant data is missing. Please reconnect your store.'
                  : 'Connect your store to view and analyze orders.'}
              </p>
              <Link to={createPageUrl('Integrations', location.search)}>
                <Button className="gap-2">
                  <Store className="w-4 h-4" />
                  Connect Store
                </Button>
              </Link>
              {hasInvariantViolation && (
                <p className="text-xs text-red-600 mt-4 font-mono">
                  Error: resolved_missing_tenantId
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Debug Banner */}
      <DebugBanner 
        shopDomain={resolverCheck.storeKey} 
        tenantId={resolverCheck.tenantId} 
        ordersCount={orders.length}
        debug={{ platform: resolverCheck.platform, reason: resolverCheck.reason, resolved: resolverCheck.ok }}
        queryFilter={queryFilter}
        dateRange={filters.dateRange}
        userEmail={user?.email}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Orders</h1>
          <p className="text-slate-400">
            View and analyze order profitability
            {tenantSettings?.demo_mode === false && (
              <Badge variant="outline" className="ml-2 text-xs">Real orders only</Badge>
            )}
          </p>
        </div>
        <OrderSyncStatus
          tenantId={resolverCheck.tenantId}
          integrationId={resolverCheck.integrationId}
          onSynced={() => queryClient.invalidateQueries({ queryKey: ordersQueryKey })}
        />
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="glass-card rounded-lg p-4">
          <p className="text-sm text-slate-400">Orders</p>
          <p className="text-2xl font-bold text-slate-100">{stats.totalOrders}</p>
        </div>
        <div className="glass-card rounded-lg p-4">
          <p className="text-sm text-slate-400">Revenue</p>
          <p className="text-2xl font-bold text-slate-100">${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="glass-card rounded-lg p-4">
          <p className="text-sm text-slate-400">Net Profit</p>
          <p className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ${stats.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="glass-card rounded-lg p-4">
          <p className="text-sm text-slate-400">High Risk</p>
          <p className={`text-2xl font-bold ${stats.highRisk > 0 ? 'text-red-400' : 'text-slate-100'}`}>{stats.highRisk}</p>
        </div>
        <div className="glass-card rounded-lg p-4">
          <p className="text-sm text-slate-400">Avg Risk Score</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${stats.avgRiskScore >= 70 ? 'text-red-400' : stats.avgRiskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {stats.avgRiskScore}
            </p>
            <span className="text-xs text-slate-500">/100</span>
          </div>
        </div>
      </div>

      {/* Risk Analysis Banner */}
      {stats.unscored > 0 && (
        <div className="rounded-lg p-4 flex items-center justify-between" style={{background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.25)'}}>
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <div>
              <p className="font-medium text-amber-300">{stats.unscored} orders without risk scores</p>
              <p className="text-sm text-amber-400/80">Run AI analysis to detect fraud patterns and assign risk scores</p>
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
        <OrderSearchBox
          value={searchTerm}
          onChange={setSearchTerm}
          orders={orders}
        />

        <Select 
          value={filters.dateRange} 
          onValueChange={(v) => setFilters({ ...filters, dateRange: v })}
        >
          <SelectTrigger className="w-40 bg-white/5 border-white/10 text-slate-200">
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

        <Button 
          variant="outline" 
          className="gap-2"
          onClick={() => {
            const headers = ['Order #','Date','Customer','Email','Revenue','Net Profit','Margin %','Risk Level','Risk Score','Status'];
            const rows = filteredOrders.map(o => [
              o.order_number || '',
              o.order_date ? new Date(o.order_date).toLocaleDateString() : '',
              o.customer_name || '',
              o.customer_email || '',
              o.total_revenue?.toFixed(2) || '0.00',
              o.net_profit?.toFixed(2) || '0.00',
              o.margin_pct?.toFixed(1) || '0.0',
              o.risk_level || '',
              o.fraud_score ?? '',
              o.status || ''
            ]);
            const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="w-4 h-4" />
          Export CSV
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
              queryClient.invalidateQueries({ queryKey: ordersQueryKey });
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