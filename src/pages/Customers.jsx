import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, Plus, Search, Filter, ArrowLeft, Mail, Tag, 
  TrendingUp, DollarSign, AlertTriangle, UserCheck, Loader2 
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
    queryFn: () => base44.entities.CustomerSegment.filter({ tenant_id: queryFilter.tenant_id }),
    enabled: canQuery,
    ...queryDefaults.standard
  });

  // Fetch all customers (heavy list)
  const { data: allCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: customersQueryKey,
    queryFn: () => base44.entities.Customer.filter({ tenant_id: queryFilter.tenant_id }),
    enabled: canQuery,
    ...queryDefaults.heavyList
  });

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
    if (!segment?.criteria || !allCustomers.length) return allCustomers;
    
    const { min_orders, max_orders, min_spent, max_spent, min_profit, max_profit, risk_profile } = segment.criteria;
    
    return allCustomers.filter(c => {
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
    let customers = selectedSegment ? getSegmentCustomers(selectedSegment) : allCustomers;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      customers = customers.filter(c => 
        c.name?.toLowerCase().includes(term) || 
        c.email?.toLowerCase().includes(term)
      );
    }
    
    return customers;
  }, [selectedSegment, allCustomers, searchTerm]);

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
  }, [segments, allCustomers]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalCustomers = allCustomers.length;
    const totalRevenue = allCustomers.reduce((sum, c) => sum + (c.total_spent || 0), 0);
    const totalProfit = allCustomers.reduce((sum, c) => sum + (c.total_profit || 0), 0);
    const highRiskCount = allCustomers.filter(c => c.risk_profile === 'high').length;
    return { totalCustomers, totalRevenue, totalProfit, highRiskCount };
  }, [allCustomers]);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedSegment && (
            <Button variant="ghost" size="icon" onClick={() => setSelectedSegment(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedSegment ? selectedSegment.name : 'Customer Segments'}
            </h1>
            <p className="text-slate-500">
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

      {/* Summary Stats */}
      {!selectedSegment && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Users className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryStats.totalCustomers}</p>
                  <p className="text-sm text-slate-500">Total Customers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(summaryStats.totalRevenue)}</p>
                  <p className="text-sm text-slate-500">Total Revenue</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{formatCurrency(summaryStats.totalProfit)}</p>
                  <p className="text-sm text-slate-500">Total Profit</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryStats.highRiskCount}</p>
                  <p className="text-sm text-slate-500">High Risk</p>
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