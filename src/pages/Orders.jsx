import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { 
  Search, 
  Filter, 
  Download,
  SlidersHorizontal,
  X
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
import { Checkbox } from '@/components/ui/checkbox';

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
    profitability: 'all',
    confidence: 'all'
  });

  // Direct tenant resolution without hook - for debugging
  const [tenantState, setTenantState] = useState({
    tenant: null,
    tenantId: null,
    shopDomain: null,
    loading: true,
    debug: { env: 'prod', resolved_via: null, url_shop_param: null }
  });
  
  const [queryInfo, setQueryInfo] = useState({ 
    filter: null, 
    count: 0, 
    dateStart: null,
    dateEnd: null,
    dateField: 'order_date'
  });

  // Resolve tenant directly on mount
  useEffect(() => {
    async function resolveTenant() {
      const urlParams = new URLSearchParams(window.location.search);
      let shopParam = urlParams.get('shop');
      
      const debug = {
        env: 'prod',
        url_shop_param: shopParam,
        resolved_via: null,
        pathname: window.location.pathname
      };
      
      console.log('[Orders] URL:', window.location.href);
      console.log('[Orders] shop param:', shopParam);
      
      let resolvedTenant = null;
      let resolvedShopDomain = null;
      
      // Method 1: URL shop param
      if (shopParam) {
        resolvedShopDomain = shopParam.includes('.myshopify.com') 
          ? shopParam.toLowerCase().trim()
          : `${shopParam.toLowerCase().trim()}.myshopify.com`;
        
        debug.resolved_via = 'url_param';
        console.log('[Orders] Looking up tenant by shop_domain:', resolvedShopDomain);
        
        const tenants = await base44.entities.Tenant.filter({ shop_domain: resolvedShopDomain });
        console.log('[Orders] Found tenants:', tenants.length, tenants.map(t => ({ id: t.id, shop: t.shop_domain })));
        
        if (tenants.length > 0) {
          resolvedTenant = tenants[0];
        }
      }
      
      // Method 2: User's tenant_id
      if (!resolvedTenant) {
        try {
          const user = await base44.auth.me();
          console.log('[Orders] User:', user?.email, 'tenant_id:', user?.tenant_id);
          
          if (user?.tenant_id) {
            debug.resolved_via = 'user_tenant';
            const tenants = await base44.entities.Tenant.filter({ id: user.tenant_id });
            if (tenants.length > 0) {
              resolvedTenant = tenants[0];
              resolvedShopDomain = resolvedTenant.shop_domain;
            }
          }
        } catch (e) {
          console.log('[Orders] No user auth');
        }
      }
      
      // Method 3: localStorage fallback
      if (!resolvedTenant) {
        const storedShopDomain = localStorage.getItem('resolved_shop_domain');
        const storedTenantId = localStorage.getItem('resolved_tenant_id');
        console.log('[Orders] Trying localStorage fallback:', storedShopDomain, storedTenantId);
        
        if (storedShopDomain) {
          debug.resolved_via = 'localStorage_shop';
          const tenants = await base44.entities.Tenant.filter({ shop_domain: storedShopDomain });
          if (tenants.length > 0) {
            resolvedTenant = tenants[0];
            resolvedShopDomain = storedShopDomain;
          }
        } else if (storedTenantId) {
          debug.resolved_via = 'localStorage_tenant';
          const tenants = await base44.entities.Tenant.filter({ id: storedTenantId });
          if (tenants.length > 0) {
            resolvedTenant = tenants[0];
            resolvedShopDomain = resolvedTenant.shop_domain;
          }
        }
      }
      
      // No fallback - require explicit tenant resolution
      if (!resolvedTenant) {
        console.warn('[Orders] No tenant resolved. shop param missing and no user tenant.');
        setTenantState({
          tenant: null,
          tenantId: null,
          shopDomain: null,
          loading: false,
          debug
        });
        return;
      }
      
      debug.tenant_id = resolvedTenant?.id;
      debug.shop_domain = resolvedShopDomain;
      
      console.log('[Orders] Final resolved tenant:', resolvedTenant?.id, 'shop:', resolvedShopDomain);
      
      setTenantState({
        tenant: resolvedTenant,
        tenantId: resolvedTenant?.id || null,
        shopDomain: resolvedShopDomain,
        loading: false,
        debug
      });
    }
    
    resolveTenant();
  }, []);

  const { tenant, tenantId, shopDomain, loading: tenantLoading, debug } = tenantState;

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', tenantId],
    queryFn: async () => {
      if (!tenantId) {
        console.log('[Orders] No tenantId, returning empty');
        setQueryInfo({ filter: null, count: 0, dateStart: null, dateEnd: null, dateField: 'order_date' });
        return [];
      }
      
      // Simple query: just tenant_id, no date filtering at DB level
      const queryFilter = { tenant_id: tenantId };
      
      console.log('[Orders] ====== QUERY START ======');
      console.log('[Orders] Environment: PRODUCTION');
      console.log('[Orders] tenant_id:', tenantId);
      console.log('[Orders] Query filter:', JSON.stringify(queryFilter));
      
      // Fetch all orders for tenant, sorted by order_date desc
      const allOrders = await base44.entities.Order.filter(queryFilter, '-order_date', 1000);
      
      console.log('[Orders] ====== QUERY RESULT ======');
      console.log('[Orders] Returned count:', allOrders.length);
      if (allOrders.length > 0) {
        console.log('[Orders] First order:', allOrders[0].order_number, allOrders[0].order_date);
        console.log('[Orders] Last order:', allOrders[allOrders.length-1].order_number, allOrders[allOrders.length-1].order_date);
      }
      
      const now = new Date();
      const dateStart = subDays(now, 30);
      
      setQueryInfo({ 
        filter: queryFilter, 
        count: allOrders.length,
        dateStart: dateStart.toISOString(),
        dateEnd: now.toISOString(),
        dateField: 'order_date'
      });
      
      return allOrders;
    },
    enabled: !!tenantId && !tenantLoading
  });

  const isLoading = tenantLoading || ordersLoading;

  // Apply filters
  const filteredOrders = React.useMemo(() => {
    let result = [...orders];

    // Date range filter on order_date
    const days = parseInt(filters.dateRange);
    const startDate = subDays(new Date(), days);
    result = result.filter(o => o.order_date && new Date(o.order_date) >= startDate);

    // Search: order_number, platform_order_id, customer_email, customer_name, notes
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
  }, [orders, filters, searchTerm]);

  // Calculate summary stats
  const stats = React.useMemo(() => ({
    totalOrders: filteredOrders.length,
    totalRevenue: filteredOrders.reduce((sum, o) => sum + (o.total_revenue || 0), 0),
    totalProfit: filteredOrders.reduce((sum, o) => sum + (o.net_profit || 0), 0),
    highRisk: filteredOrders.filter(o => o.risk_level === 'high').length,
    unprofitable: filteredOrders.filter(o => (o.net_profit || 0) < 0).length
  }), [filteredOrders]);

  const activeFiltersCount = Object.values(filters).filter(v => v !== 'all' && v !== '30').length;

  const clearFilters = () => {
    setFilters({
      dateRange: '30',
      status: 'all',
      riskLevel: 'all',
      profitability: 'all',
      confidence: 'all'
    });
    setSearchTerm('');
  };

  return (
    <div className="space-y-6">
      {/* Debug Banner */}
      <DebugBanner 
        shopDomain={shopDomain} 
        tenantId={tenantId} 
        ordersCount={orders.length}
        debug={debug}
        queryFilter={queryInfo.filter}
        dateRange={filters.dateRange}
        queryInfo={queryInfo}
      />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <p className="text-slate-500">View and analyze order profitability</p>
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
          <p className="text-sm text-slate-500">Unprofitable</p>
          <p className={`text-2xl font-bold ${stats.unprofitable > 0 ? 'text-red-600' : 'text-slate-900'}`}>{stats.unprofitable}</p>
        </div>
      </div>

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