// @ts-nocheck
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  DollarSign,
  Loader2,
  Mail,
  Plus,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  Users
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
import {
  buildQueryKey,
  canQueryTenant,
  getTenantFilter,
  requireResolved,
  RESOLVER_STATUS,
  usePlatformResolver
} from '@/components/usePlatformResolver';
import { CommandCard, CommandCardContent } from '@/components/ui/command-card';

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('segments');
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteSegment, setDeleteSegment] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [kpiFilter, setKpiFilter] = useState('all');

  const queryClient = useQueryClient();
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const segmentsQueryKey = buildQueryKey('segments', resolverCheck);
  const customersQueryKey = buildQueryKey('customers', resolverCheck);

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

    return Array.from(grouped.values()).map((customer) => {
      const avg = customer.total_orders > 0 ? customer.total_spent / customer.total_orders : 0;
      const highRiskRatio = customer.total_orders > 0 ? customer.high_risk_orders / customer.total_orders : 0;
      let riskProfile = 'low';
      if (highRiskRatio >= 0.35) riskProfile = 'high';
      else if (highRiskRatio >= 0.15) riskProfile = 'medium';
      return {
        ...customer,
        avg_order_value: avg,
        risk_profile: riskProfile
      };
    });
  }, [orderRows]);

  const effectiveCustomers = useMemo(() => {
    if (Array.isArray(allCustomers) && allCustomers.length > 0) return allCustomers;
    return derivedCustomers;
  }, [allCustomers, derivedCustomers]);

  const filteredBaseCustomers = useMemo(() => {
    if (kpiFilter === 'high-risk') {
      return effectiveCustomers.filter((customer) => customer.risk_profile === 'high');
    }
    return effectiveCustomers;
  }, [effectiveCustomers, kpiFilter]);

  const createSegmentMutation = useMutation({
    mutationFn: (data) => base44.entities.CustomerSegment.create({ ...data, tenant_id: resolverCheck.tenantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey });
      setCreateDialogOpen(false);
    }
  });

  const deleteSegmentMutation = useMutation({
    mutationFn: (id) => base44.entities.CustomerSegment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey });
      setDeleteSegment(null);
    }
  });

  const getSegmentCustomers = (segment) => {
    if (!segment?.criteria || !filteredBaseCustomers.length) return filteredBaseCustomers;

    const { min_orders, max_orders, min_spent, max_spent, min_profit, max_profit, risk_profile } = segment.criteria;
    return filteredBaseCustomers.filter((customer) => {
      if (min_orders !== undefined && customer.total_orders < min_orders) return false;
      if (max_orders !== undefined && customer.total_orders > max_orders) return false;
      if (min_spent !== undefined && customer.total_spent < min_spent) return false;
      if (max_spent !== undefined && customer.total_spent > max_spent) return false;
      if (min_profit !== undefined && customer.total_profit < min_profit) return false;
      if (max_profit !== undefined && customer.total_profit > max_profit) return false;
      if (risk_profile && customer.risk_profile !== risk_profile) return false;
      return true;
    });
  };

  const displayedCustomers = useMemo(() => {
    if (!canQuery) return [];

    let customers = selectedSegment ? getSegmentCustomers(selectedSegment) : filteredBaseCustomers;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      customers = customers.filter(
        (customer) =>
          customer.name?.toLowerCase().includes(term) ||
          customer.email?.toLowerCase().includes(term)
      );
    }
    return customers;
  }, [selectedSegment, filteredBaseCustomers, searchTerm, canQuery]);

  const segmentsWithStats = useMemo(
    () =>
      segments.map((segment) => {
        const customers = getSegmentCustomers(segment);
        return {
          ...segment,
          customer_count: customers.length,
          total_revenue: customers.reduce((sum, customer) => sum + (customer.total_spent || 0), 0),
          total_profit: customers.reduce((sum, customer) => sum + (customer.total_profit || 0), 0),
          preview_customers: customers.slice(0, 2)
        };
      }),
    [segments, filteredBaseCustomers]
  );

  const summaryStats = useMemo(() => {
    const totalCustomers = effectiveCustomers.length;
    const totalRevenue = effectiveCustomers.reduce((sum, customer) => sum + (customer.total_spent || 0), 0);
    const totalProfit = effectiveCustomers.reduce((sum, customer) => sum + (customer.total_profit || 0), 0);
    const highRiskCount = effectiveCustomers.filter((customer) => customer.risk_profile === 'high').length;
    return { totalCustomers, totalRevenue, totalProfit, highRiskCount };
  }, [effectiveCustomers]);

  const actionSummary = useMemo(() => {
    const highValue = filteredBaseCustomers.filter(
      (customer) => Number(customer.total_spent || 0) >= 500 && Number(customer.total_profit || 0) > 0
    ).length;
    const atRisk = filteredBaseCustomers.filter((customer) => customer.risk_profile === 'high').length;
    return { highValue, atRisk };
  }, [filteredBaseCustomers]);

  const handleSegmentAction = (segment, action) => {
    setActionDialog({ segment, action });
  };

  const handleCustomerAction = (customer, action) => {
    setActionDialog({ customer, action });
  };

  const formatCurrency = (value) =>
    `$${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

  if (resolver?.status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!canQuery) {
    return <div className="p-6 text-center text-slate-500">No store connected. Please connect your store first.</div>;
  }

  return (
    <div className="space-y-3">
      <CommandCard className="overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            {selectedSegment && (
              <Button variant="ghost" size="icon" onClick={() => setSelectedSegment(null)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <div>
              <h1 className="text-xl font-semibold text-white">
                {selectedSegment ? selectedSegment.name : 'Customer Segments'}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {selectedSegment
                  ? `${displayedCustomers.length} customers in this segment`
                  : 'Customer intelligence and revenue activation'}
              </p>
            </div>
          </div>

          {!selectedSegment && (
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
              <CompactKpi
                icon={Users}
                label="Total Customers"
                value={`${summaryStats.totalCustomers}`}
                active={kpiFilter === 'all'}
                onClick={() => setKpiFilter('all')}
              />
              <CompactKpi
                icon={DollarSign}
                label="Revenue"
                value={formatCurrency(summaryStats.totalRevenue)}
                active={kpiFilter === 'all'}
                onClick={() => setKpiFilter('all')}
              />
              <CompactKpi
                icon={TrendingUp}
                label="Profit"
                value={formatCurrency(summaryStats.totalProfit)}
                tone={summaryStats.totalProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}
                active={kpiFilter === 'all'}
                onClick={() => setKpiFilter('all')}
              />
              <CompactKpi
                icon={AlertTriangle}
                label="High Risk"
                value={`${summaryStats.highRiskCount}`}
                tone={summaryStats.highRiskCount > 0 ? 'text-red-300' : 'text-emerald-300'}
                active={kpiFilter === 'high-risk'}
                onClick={() => setKpiFilter((current) => (current === 'high-risk' ? 'all' : 'high-risk'))}
              />
              <Button
                className="h-full min-h-[54px] bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Segment
              </Button>
            </div>
          )}
        </div>
      </CommandCard>

      {selectedSegment ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" onClick={() => handleSegmentAction(selectedSegment, 'email')}>
                <Mail className="mr-2 h-4 w-4" /> Email All
              </Button>
              <Button variant="outline" onClick={() => handleSegmentAction(selectedSegment, 'discount')}>
                <Tag className="mr-2 h-4 w-4" /> Create Discount
              </Button>
            </div>
            <CommandCard>
              <CommandCardContent className="p-0">
                <CustomerTable
                  customers={displayedCustomers}
                  loading={customersLoading}
                  onAction={handleCustomerAction}
                />
              </CommandCardContent>
            </CommandCard>
          </div>
          <div className="space-y-4">
            <AIInsightsPanel segment={selectedSegment} customers={displayedCustomers} />
            <SegmentInsightsCard segment={selectedSegment} customers={displayedCustomers} />
          </div>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          <CommandCard className="sticky top-[70px] z-20 border-white/10 bg-slate-950/90 shadow-[0_10px_30px_rgba(2,6,23,0.28)] backdrop-blur">
            <CommandCardContent className="px-3 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <TabsList className="grid h-10 w-full max-w-[320px] grid-cols-2 rounded-full border border-white/10 bg-white/[0.03] p-1">
                  <TabsTrigger value="segments" className="rounded-full">Segments</TabsTrigger>
                  <TabsTrigger value="all" className="rounded-full">All Customers</TabsTrigger>
                </TabsList>
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="h-10 border-white/10 bg-white/[0.03] pl-10 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </CommandCardContent>
          </CommandCard>

          <CommandCard className="border-cyan-400/20 bg-[linear-gradient(180deg,rgba(0,229,255,0.07),rgba(255,255,255,0.03))]">
            <CommandCardContent className="px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-3 md:grid-cols-2">
                  <ActionCell
                    icon={ArrowUpRight}
                    title={`${actionSummary.highValue} high-value customers ready for upsell`}
                    text="Use this segment for premium offers or loyalty campaigns."
                  />
                  <ActionCell
                    icon={Sparkles}
                    title={`${actionSummary.atRisk} at-risk customers need re-engagement`}
                    text="Recover revenue before churn accelerates."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-100 hover:bg-white/[0.05]"
                    onClick={() => {
                      const target = segmentsWithStats.find((segment) => segment.total_revenue > 0) || segmentsWithStats[0];
                      if (target) handleSegmentAction(target, 'email');
                    }}
                  >
                    Launch Campaign
                  </Button>
                  <Button
                    className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    onClick={() => {
                      const target = segmentsWithStats.find((segment) => segment.customer_count > 0) || segmentsWithStats[0];
                      if (target) setSelectedSegment(target);
                    }}
                  >
                    View Segment
                  </Button>
                </div>
              </div>
            </CommandCardContent>
          </CommandCard>

          <TabsContent value="segments" className="mt-0">
            {segmentsLoading ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-[220px]" />
                ))}
              </div>
            ) : segmentsWithStats.length === 0 ? (
              <CommandCard className="py-12 text-center">
                <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p className="text-slate-500">No segments created yet</p>
                <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Create Your First Segment
                </Button>
              </CommandCard>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {segmentsWithStats.map((segment) => (
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

          <TabsContent value="all" className="mt-0">
            <CommandCard>
              <CommandCardContent className="p-0">
                <CustomerTable
                  customers={displayedCustomers}
                  loading={customersLoading}
                  onAction={handleCustomerAction}
                />
              </CommandCardContent>
            </CommandCard>
          </TabsContent>
        </Tabs>
      )}

      <CreateSegmentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSave={(data) => createSegmentMutation.mutate(data)}
        saving={createSegmentMutation.isPending}
      />

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

      <AlertDialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog?.action === 'email'
                ? 'Send Email Campaign'
                : actionDialog?.action === 'analyze'
                  ? 'Analyze Segment'
                  : 'Create Discount Code'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog?.action === 'email'
                ? `This will prepare an email campaign for ${actionDialog?.segment ? 'all customers in this segment' : actionDialog?.customer?.email}.`
                : actionDialog?.action === 'analyze'
                  ? `This will open AI analysis for ${actionDialog?.segment?.name || 'this segment'} in a future update.`
                  : `This will create a discount code ${actionDialog?.segment ? 'for this segment' : `for ${actionDialog?.customer?.email}`}.`}
              <br />
              <br />
              <span className="text-sm text-slate-500">
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

function CompactKpi({ icon: Icon, label, value, tone = 'text-slate-100', active = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] border px-3 py-2 text-left transition-all ${
        active
          ? 'border-cyan-400/35 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
          : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
          <Icon className="h-3.5 w-3.5 text-cyan-300" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className={`mt-0.5 text-sm font-semibold ${tone}`}>{value}</p>
        </div>
      </div>
    </button>
  );
}

function ActionCell({ icon: Icon, title, text }) {
  return (
    <div className="rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-2">
          <Icon className="h-4 w-4 text-cyan-300" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-100">{title}</p>
          <p className="mt-1 text-xs text-slate-400">{text}</p>
        </div>
      </div>
    </div>
  );
}
