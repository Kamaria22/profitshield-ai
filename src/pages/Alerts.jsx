import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Filter,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
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
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';

import AlertCard from '../components/alerts/AlertCard';

export default function Alerts() {
  const [activeTab, setActiveTab] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('all');
  const queryClient = useQueryClient();
  
  const { tenantId, user, status } = usePlatformResolver();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['alerts', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      return base44.entities.Alert.filter({ 
        tenant_id: tenantId 
      }, '-created_date', 500);
    },
    enabled: !!tenantId && status === RESOLVER_STATUS.RESOLVED
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
      queryClient.invalidateQueries(['alerts', tenantId]);
    }
  });

  const handleStatusChange = (id, status) => {
    updateAlertMutation.mutate({ id, status });
  };

  // Filter alerts by status and type
  const filteredAlerts = React.useMemo(() => {
    let result = alerts.filter(a => {
      if (activeTab === 'pending') return a.status === 'pending';
      if (activeTab === 'resolved') return a.status === 'action_taken' || a.status === 'dismissed';
      return true;
    });

    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter);
    }

    return result;
  }, [alerts, activeTab, typeFilter]);

  // Count by status
  const counts = React.useMemo(() => ({
    pending: alerts.filter(a => a.status === 'pending').length,
    resolved: alerts.filter(a => a.status === 'action_taken' || a.status === 'dismissed').length,
    all: alerts.length,
    highPriority: alerts.filter(a => a.status === 'pending' && (a.severity === 'high' || a.severity === 'critical')).length
  }), [alerts]);

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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-2xl font-bold text-slate-900">{counts.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Resolved</p>
                <p className="text-2xl font-bold text-slate-900">{counts.resolved}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">High Priority</p>
                <p className={`text-2xl font-bold ${counts.highPriority > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {counts.highPriority}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 rounded-lg">
                <Bell className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Alerts</p>
                <p className="text-2xl font-bold text-slate-900">{counts.all}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs and Filters */}
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

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="high_risk_order">High Risk Orders</SelectItem>
            <SelectItem value="negative_margin">Negative Margin</SelectItem>
            <SelectItem value="shipping_loss">Shipping Loss</SelectItem>
            <SelectItem value="chargeback_warning">Chargeback Warning</SelectItem>
            <SelectItem value="return_spike">Return Spike</SelectItem>
            <SelectItem value="discount_abuse">Discount Abuse</SelectItem>
          </SelectContent>
        </Select>
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