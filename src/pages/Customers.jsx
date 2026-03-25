import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, Plus, Search, ArrowLeft, Mail, Tag, 
  TrendingUp, DollarSign, AlertTriangle, Loader2 
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import SegmentCard from '@/components/customers/SegmentCard';
import CustomerTable from '@/components/customers/CustomerTable';
import CreateSegmentDialog from '@/components/customers/CreateSegmentDialog';
import SegmentInsightsCard from '@/components/customers/SegmentInsightsCard';
import AIInsightsPanel from '@/components/customers/AIInsightsPanel';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '@/components/usePlatformResolver';

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('segments');
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteSegment, setDeleteSegment] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  
  const queryClient = useQueryClient();
  
  // SINGLE SOURCE OF TRUTH: Platform Resolver
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const segmentsQueryKey = buildQueryKey('segments', resolverCheck);
  const customersQueryKey = buildQueryKey('customers', resolverCheck);

  // Fetch segments (standard)
  const { data: segments = [], isLoading: segmentsLoading } = useQuery({
    queryKey: segmentsQueryKey,
    queryFn: async () => {
      try {
        return await base44.entities.CustomerSegment.filter({ tenant_id: queryFilter.tenant_id });
      } catch {
        return [];
      }
    },
    enabled: canQuery,
    ...queryDefaults.standard
  });

  // Fetch all customers (heavy list)
  const { data: allCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: customersQueryKey,
    queryFn: async () => {
      try {
        return await base44.entities.Customer.filter({ tenant_id: queryFilter.tenant_id });
      } catch {
        return [];
      }
    },
    enabled: canQuery,
    ...queryDefaults.heavyList
  });

  // Fallback source of truth for embedded/runtime consistency:
  // derive customers directly from synced orders when Customer entity is stale or empty.
  const { data: orderRows = [] } = useQuery({
    queryKey: buildQueryKey('customers-orders-fallback', resolverCheck),
    queryFn: async () => {
      try {
        return await base44.entities.Order.filter({ tenant_id: queryFilter.tenant_id, is_demo: false }, '-order_date', 500);
      } catch {
        return [];
      }
    },
    enabled: canQuery,
    ...queryDefaults.heavyList
  });

  const derivedCustomers = useMemo(() => {
    if (!Array.isArray(orderRows) || orderRows.length === 0) return [];
    const grouped = new Map();
    for (const order of orderRows) {
      const email = String(order?.customer_email || '').trim().toLowerCase();
      const key = email || `guest:${order?.customer_name || order?.id || Math.random()}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: `derived_${key}`,
          email: email || null,
          name: order?.customer_name || 'Guest Customer',
          total_orders: 0,
          total_spent: 0,
          total_profit: 0,
          avg_order_value: 0,
          refund_count: 0,
          high_risk_orders: 0,
          last_order_at: null
        });
      }
      const customer = grouped.get(key);
      const revenue = Number(order?.total_revenue || 0) || 0;
      const profit = Number(order?.total_profit || 0) || 0;
      const fraudScore = Number(order?.fraud_score || order?.risk_score || 0) || 0;
      customer.total_orders += 1;
      customer.total_spent += revenue;
      customer.total_profit += profit;
      if (String(order?.status || '').toLowerCase().includes('refund')) customer.refund_count += 1;
      if (fraudScore >= 70) customer.high_risk_orders += 1;
      const orderTs = order?.order_date ? new Date(order.order_date).getTime() : 0;
      const lastTs = customer.last_order_at ? new Date(customer.last_order_at).getTime() : 0;
      if (orderTs > lastTs) customer.last_order_at = order?.order_date || null;
    }
    return Array.from(grouped.values()).map((c) => {
      const avg = c.total_orders > 0 ? c.total_spent / c.total_orders : 0;
      const highRiskRatio = c.total_orders > 0 ? c.high_risk_orders / c.total_orders : 0;
      let riskProfile = 'low';
      if (highRiskRatio >= 0.35) riskProfile = 'high';
      else if (highRiskRatio >= 0.15) riskProfile = 'medium';
      return {
        ...c,
        avg_order_value: avg,
        risk_profile: riskProfile
      };
    });
  }, [orderRows]);

  const effectiveCustomers = useMemo(() => {
    if (Array.isArray(allCustomers) && allCustomers.length > 0) return allCustomers;
    return derivedCustomers;
  }, [allCustomers, derivedCustomers]);

  // Create segment mutation
  const createSegmentMutation = useMutation({
    mutationFn: (data) => base44.entities.CustomerSegment.create({ ...data, tenant_id: resolverCheck.tenantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey });
      setCreateDialogOpen(false);
    }
  });

  // Delete segment mutation
  const deleteSegmentMutation = useMutation({
    mutationFn: (id) => base44.entities.CustomerSegment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey });
      setDeleteSegment(null);
    }
  });

  // Filter customers based on segment criteria
  const getSegmentCustomers = (segment) => {
    if (!segment?.criteria || !effectiveCustomers.length) return effectiveCustomers;
    
    const { min_orders, max_orders, min_spent, max_spent, min_profit, max_profit, risk_profile } = segment.criteria;
    
    return effectiveCustomers.filter(c => {
      if (min_orders !== undefined && c.total_orders < min_orders) return false;
      if (max_orders !== undefined && c.total_orders > max_orders) return false;
      if (min_spent !== undefined && c.total_spent < min_spent) return false;
      if (max_spent !== undefined && c.total_spent > max_spent) return false;
      if (min_profit !== undefined && c.total_profit < min_profit) return false;
      if (max_profit !== undefined && c.total_profit > max_profit) return false;
      if (risk_profile && c.risk_profile !== risk_profile) return false;
      return true;
    });
  };

  // Get customers for selected segment or all
  const displayedCustomers = useMemo(() => {
    if (!canQuery) return [];
    let customers = selectedSegment ? getSegmentCustomers(selectedSegment) : effectiveCustomers;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      customers = customers.filter(c => 
        c.name?.toLowerCase().includes(term) || 
        c.email?.toLowerCase().includes(term)
      );
    }
    
    return customers;
  }, [selectedSegment, effectiveCustomers, searchTerm, canQuery]);

  // Calculate segment stats
  const segmentsWithStats = useMemo(() => {
    return segments.map(seg => {
      const customers = getSegmentCustomers(seg);
      return {
        ...seg,
        customer_count: customers.length,
        total_revenue: customers.reduce((sum, c) => sum + (c.total_spent || 0), 0),
        total_profit: customers.reduce((sum, c) => sum + (c.total_profit || 0), 0)
      };
    });
  }, [segments, effectiveCustomers]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalCustomers = effectiveCustomers.length;
    const totalRevenue = effectiveCustomers.reduce((sum, c) => sum + (c.total_spent || 0), 0);
    const totalProfit = effectiveCustomers.reduce((sum, c) => sum + (c.total_profit || 0), 0);
    const highRiskCount = effectiveCustomers.filter(c => c.risk_profile === 'high').length;
    return { totalCustomers, totalRevenue, totalProfit, highRiskCount };
  }, [effectiveCustomers]);

  const handleSegmentAction = (segment, action) => {
    setActionDialog({ segment, action });
  };

  const handleCustomerAction = (customer, action) => {
    setActionDialog({ customer, action });
  };

  const formatCurrency = (val) => `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  // Loading state
  if (resolver?.status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!canQuery) {
    return (
      <div className="p-6 text-center text-slate-500">
        No store connected. Please connect your store first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="future-panel future-grid relative overflow-hidden rounded-[1.8rem] px-5 py-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-56 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.16),transparent_60%)] lg:block" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedSegment && (
            <Button variant="ghost" size="icon" onClick={() => setSelectedSegment(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="future-badge inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-violet-100">
                Customer Intelligence Mesh
              </span>
              <span className="future-badge inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                {summaryStats.totalCustomers} tracked customers
              </span>
            </div>
            <h1 className="text-3xl font-semibold text-white">
              {selectedSegment ? selectedSegment.name : 'Customer Segments'}
            </h1>
            <p className="text-slate-400 mt-2">
              {selectedSegment 
                ? `${displayedCustomers.length} customers in this segment`
                : 'Segment and analyze your customer base'
              }
            </p>
          </div>
        </div>
        {!selectedSegment && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Segment
          </Button>
        )}
        </div>
      </div>

      {/* Summary Stats */}
      {!selectedSegment && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{background:'rgba(99,102,241,0.15)'}}>
                  <Users className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{summaryStats.totalCustomers}</p>
                  <p className="text-sm text-slate-400">Total Customers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{background:'rgba(52,211,153,0.12)'}}>
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{formatCurrency(summaryStats.totalRevenue)}</p>
                  <p className="text-sm text-slate-400">Total Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{background:'rgba(45,212,191,0.12)'}}>
                  <TrendingUp className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{formatCurrency(summaryStats.totalProfit)}</p>
                  <p className="text-sm text-slate-400">Total Profit</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card border-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{background:'rgba(248,113,113,0.12)'}}>
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-100">{summaryStats.highRiskCount}</p>
                  <p className="text-sm text-slate-400">High Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      {selectedSegment ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" onClick={() => handleSegmentAction(selectedSegment, 'email')}>
                <Mail className="w-4 h-4 mr-2" /> Email All
              </Button>
              <Button variant="outline" onClick={() => handleSegmentAction(selectedSegment, 'discount')}>
                <Tag className="w-4 h-4 mr-2" /> Create Discount
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <CustomerTable 
                  customers={displayedCustomers}
                  loading={customersLoading}
                  onAction={handleCustomerAction}
                />
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <AIInsightsPanel segment={selectedSegment} customers={displayedCustomers} />
            <SegmentInsightsCard segment={selectedSegment} customers={displayedCustomers} />
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="segments">Segments</TabsTrigger>
            <TabsTrigger value="all">All Customers</TabsTrigger>
          </TabsList>

          <TabsContent value="segments" className="mt-4">
            {segmentsLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : segmentsWithStats.length === 0 ? (
              <Card className="py-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No segments created yet</p>
                <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Create Your First Segment
                </Button>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {segmentsWithStats.map(segment => (
                  <SegmentCard 
                    key={segment.id}
                    segment={segment}
                    onView={setSelectedSegment}
                    onAction={handleSegmentAction}
                    onDelete={setDeleteSegment}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <div className="space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Card>
                <CardContent className="p-0">
                  <CustomerTable 
                    customers={displayedCustomers}
                    loading={customersLoading}
                    onAction={handleCustomerAction}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Create Segment Dialog */}
      <CreateSegmentDialog 
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSave={(data) => createSegmentMutation.mutate(data)}
        saving={createSegmentMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteSegment} onOpenChange={() => setDeleteSegment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Segment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteSegment?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteSegmentMutation.mutate(deleteSegment.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Action Dialog */}
      <AlertDialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog?.action === 'email' ? 'Send Email Campaign' : 'Create Discount Code'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog?.action === 'email' 
                ? `This will prepare an email campaign for ${actionDialog?.segment ? 'all customers in this segment' : actionDialog?.customer?.email}.`
                : `This will create a discount code ${actionDialog?.segment ? 'for this segment' : `for ${actionDialog?.customer?.email}`}.`
              }
              <br /><br />
              <span className="text-slate-500 text-sm">
                Note: This feature will be available in a future update. For now, use Shopify's built-in tools.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
