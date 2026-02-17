import React, { useState, useCallback, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Filter,
  Bell,
  Loader2,
  Store,
  ArrowUpDown,
  Calendar,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '@/components/usePlatformResolver';
import { createPageUrl } from '@/components/platformContext';
import { format, subDays, isWithinInterval, parseISO } from 'date-fns';

import AlertCard from '../components/alerts/AlertCard';
import AlertTrendsChart from '../components/alerts/AlertTrendsChart';
import AlertSummaryCards from '../components/alerts/AlertSummaryCards';

export default function Alerts() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });
  const [showFilters, setShowFilters] = useState(false);
  const queryClient = useQueryClient();
  
  // SINGLE SOURCE OF TRUTH: Platform Resolver
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  // Derived booleans
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const alertsQueryKey = buildQueryKey('alerts', resolverCheck);
  
  const status = resolver?.status || RESOLVER_STATUS.RESOLVING;
  const user = resolver?.user || null;
  const resolverLoading = status === RESOLVER_STATUS.RESOLVING;

  // Fetch alerts - only when canQuery
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: alertsQueryKey,
    queryFn: async () => {
      if (!queryFilter?.tenant_id) return [];
      return base44.entities.Alert.filter({ 
        tenant_id: queryFilter.tenant_id 
      }, '-created_date', 500);
    },
    enabled: canQuery
  });

  const updateAlertMutation = useMutation({
    mutationFn: async ({ id, status: newStatus }) => {
      await base44.entities.Alert.update(id, { 
        status: newStatus,
        reviewed_by: user?.email,
        reviewed_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertsQueryKey });
    }
  });

  // Filter and sort alerts
  const filteredAlerts = useMemo(() => {
    let result = [...alerts];

    // Status filter
    if (activeTab === 'pending') {
      result = result.filter(a => a.status === 'pending');
    } else if (activeTab === 'resolved') {
      result = result.filter(a => a.status === 'action_taken' || a.status === 'dismissed');
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter || a.alert_type === typeFilter);
    }

    // Severity filter
    if (severityFilter !== 'all') {
      result = result.filter(a => a.severity === severityFilter);
    }

    // Date range filter
    if (dateRange.from && dateRange.to) {
      result = result.filter(a => {
        if (!a.created_date) return true;
        const alertDate = parseISO(a.created_date);
        return isWithinInterval(alertDate, { start: dateRange.from, end: dateRange.to });
      });
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_date || 0) - new Date(a.created_date || 0);
        case 'oldest':
          return new Date(a.created_date || 0) - new Date(b.created_date || 0);
        case 'severity_high':
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
        case 'severity_low':
          const severityOrderLow = { critical: 3, high: 2, medium: 1, low: 0 };
          return (severityOrderLow[a.severity] || 0) - (severityOrderLow[b.severity] || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [alerts, activeTab, typeFilter, severityFilter, sortBy, dateRange]);

  // Count by status
  const counts = useMemo(() => ({
    pending: alerts.filter(a => a.status === 'pending').length,
    resolved: alerts.filter(a => a.status === 'action_taken' || a.status === 'dismissed').length,
    all: alerts.length,
    highPriority: alerts.filter(a => a.status === 'pending' && (a.severity === 'high' || a.severity === 'critical')).length
  }), [alerts]);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (severityFilter !== 'all') count++;
    if (sortBy !== 'newest') count++;
    return count;
  }, [typeFilter, severityFilter, sortBy]);

  const clearFilters = () => {
    setTypeFilter('all');
    setSeverityFilter('all');
    setSortBy('newest');
    setDateRange({ from: subDays(new Date(), 30), to: new Date() });
  };

  // EARLY RETURN: Loading
  if (resolverLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // EARLY RETURN: No valid context
  if (!canQuery || status === RESOLVER_STATUS.ERROR) {
    return (
      <div className="space-y-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <div className="p-3 bg-amber-100 rounded-full mb-4">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No Store Connected</h2>
              <p className="text-slate-600 mb-4 max-w-md">
                Connect your store to view alerts.
              </p>
              <Link to={createPageUrl('Integrations', location.search)}>
                <Button className="gap-2">
                  <Store className="w-4 h-4" />
                  Connect Store
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleStatusChange = (id, newStatus) => {
    updateAlertMutation.mutate({ id, status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alerts</h1>
          <p className="text-slate-500">Monitor and respond to profit protection alerts</p>
        </div>
        {counts.highPriority > 0 && (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100 px-3 py-1.5 w-fit">
            <AlertTriangle className="w-4 h-4 mr-1" />
            {counts.highPriority} High Priority
          </Badge>
        )}
      </div>

      {/* Visual Summary Cards */}
      <AlertSummaryCards alerts={alerts} />

      {/* Alert Trends Chart */}
      <AlertTrendsChart alerts={alerts} />

      {/* Tabs and Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                Pending
                {counts.pending > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                    {counts.pending}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant={showFilters ? "secondary" : "outline"} 
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 ml-1">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-slate-500">
                <X className="w-4 h-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Type Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Alert Type</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="high_risk_order">High Risk Orders</SelectItem>
                      <SelectItem value="fraud_detected">Fraud Detected</SelectItem>
                      <SelectItem value="negative_margin">Negative Margin</SelectItem>
                      <SelectItem value="shipping_loss">Shipping Loss</SelectItem>
                      <SelectItem value="chargeback_warning">Chargeback Warning</SelectItem>
                      <SelectItem value="chargeback">Chargeback</SelectItem>
                      <SelectItem value="return_spike">Return Spike</SelectItem>
                      <SelectItem value="discount_abuse">Discount Abuse</SelectItem>
                      <SelectItem value="suspicious_activity">Suspicious Activity</SelectItem>
                      <SelectItem value="revenue_anomaly">Revenue Anomaly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Severity Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Severity</label>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Severities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Critical
                        </span>
                      </SelectItem>
                      <SelectItem value="high">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          High
                        </span>
                      </SelectItem>
                      <SelectItem value="medium">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Medium
                        </span>
                      </SelectItem>
                      <SelectItem value="low">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          Low
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort By */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Sort By</label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="severity_high">Severity (High → Low)</SelectItem>
                      <SelectItem value="severity_low">Severity (Low → High)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500">Date Range</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <Calendar className="mr-2 h-4 w-4" />
                        {dateRange.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                            </>
                          ) : (
                            format(dateRange.from, "MMM d, yyyy")
                          )
                        ) : (
                          <span>Pick a date range</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange.from}
                        selected={dateRange}
                        onSelect={(range) => setDateRange(range || { from: subDays(new Date(), 30), to: new Date() })}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Showing {filteredAlerts.length} of {alerts.length} alerts</span>
      </div>

      {/* Alerts List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse flex gap-4">
                  <div className="w-10 h-10 bg-slate-200 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-48 mb-2" />
                    <div className="h-3 bg-slate-200 rounded w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-slate-600 font-medium">
              {activeTab === 'pending' ? 'No pending alerts' : 'No alerts found'}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              {activeTab === 'pending' ? 'All caught up!' : 'Try adjusting your filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}