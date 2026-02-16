import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { queryDefaults } from '@/components/utils/queryDefaults';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  History, 
  Search, 
  Filter,
  User,
  Settings,
  AlertTriangle,
  ShoppingCart,
  RefreshCw,
  Eye,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { usePlatformResolver, requireResolved, canQueryTenant, getTenantFilter, buildQueryKey } from '@/components/usePlatformResolver';

const actionTypeConfig = {
  rule_created: { label: 'Rule Created', color: 'bg-green-100 text-green-700', icon: Settings },
  rule_updated: { label: 'Rule Updated', color: 'bg-blue-100 text-blue-700', icon: Settings },
  rule_deleted: { label: 'Rule Deleted', color: 'bg-red-100 text-red-700', icon: Settings },
  rule_toggled: { label: 'Rule Toggled', color: 'bg-slate-100 text-slate-700', icon: Settings },
  alert_triggered: { label: 'Alert Triggered', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  alert_reviewed: { label: 'Alert Reviewed', color: 'bg-green-100 text-green-700', icon: AlertTriangle },
  alert_dismissed: { label: 'Alert Dismissed', color: 'bg-slate-100 text-slate-700', icon: AlertTriangle },
  order_held: { label: 'Order Held', color: 'bg-amber-100 text-amber-700', icon: ShoppingCart },
  order_released: { label: 'Order Released', color: 'bg-green-100 text-green-700', icon: ShoppingCart },
  order_cancelled: { label: 'Order Cancelled', color: 'bg-red-100 text-red-700', icon: ShoppingCart },
  risk_score_changed: { label: 'Risk Score Changed', color: 'bg-purple-100 text-purple-700', icon: AlertTriangle },
  manual_override: { label: 'Manual Override', color: 'bg-orange-100 text-orange-700', icon: User },
  shopify_action_approved: { label: 'Shopify Action Approved', color: 'bg-green-100 text-green-700', icon: ShoppingCart },
  shopify_action_rejected: { label: 'Shopify Action Rejected', color: 'bg-red-100 text-red-700', icon: ShoppingCart },
  shopify_action_executed: { label: 'Shopify Action Executed', color: 'bg-emerald-100 text-emerald-700', icon: ShoppingCart },
  sync_started: { label: 'Sync Started', color: 'bg-blue-100 text-blue-700', icon: RefreshCw },
  sync_completed: { label: 'Sync Completed', color: 'bg-green-100 text-green-700', icon: RefreshCw },
  sync_failed: { label: 'Sync Failed', color: 'bg-red-100 text-red-700', icon: RefreshCw },
  settings_updated: { label: 'Settings Updated', color: 'bg-blue-100 text-blue-700', icon: Settings },
  cost_mapping_updated: { label: 'Cost Mapping Updated', color: 'bg-blue-100 text-blue-700', icon: Settings },
  export_requested: { label: 'Export Requested', color: 'bg-purple-100 text-purple-700', icon: Download },
  data_deleted: { label: 'Data Deleted', color: 'bg-red-100 text-red-700', icon: AlertTriangle }
};

export default function AuditLogs() {
  // SINGLE SOURCE OF TRUTH: Platform Resolver
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  
  const canQuery = canQueryTenant(resolverCheck);
  const queryFilter = getTenantFilter(resolverCheck);
  const auditLogsQueryKey = buildQueryKey('auditLogs', resolverCheck);
  
  const [selectedLog, setSelectedLog] = useState(null);
  const [filters, setFilters] = useState({
    action_type: 'all',
    search: ''
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: auditLogsQueryKey,
    queryFn: () => base44.entities.AuditLog.filter({ tenant_id: queryFilter.tenant_id }, '-created_date', 200),
    enabled: canQuery,
    ...queryDefaults.standard
  });

  // Memoized filtering
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filters.action_type !== 'all' && log.action_type !== filters.action_type) return false;
      if (filters.search && !log.user_email?.toLowerCase().includes(filters.search.toLowerCase()) &&
          !log.entity_type?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [logs, filters.action_type, filters.search]);

  const uniqueActionTypes = useMemo(() => 
    [...new Set(logs.map(l => l.action_type))],
    [logs]
  );
  
  const handleLogClick = useCallback((log) => setSelectedLog(log), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-7 h-7 text-slate-600" />
            Audit Logs
          </h1>
          <p className="text-slate-500 mt-1">Complete activity history for compliance and security</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {filteredLogs.length} entries
        </Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by user or entity..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Select value={filters.action_type} onValueChange={(v) => setFilters({ ...filters, action_type: v })}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {uniqueActionTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {actionTypeConfig[type]?.label || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">Loading audit logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No audit logs found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const config = actionTypeConfig[log.action_type] || { label: log.action_type, color: 'bg-slate-100 text-slate-700' };
                  const Icon = config.icon || History;
                  
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {format(new Date(log.created_date), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${config.color} gap-1`}>
                          <Icon className="w-3 h-3" />
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.user_email || 'System'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.entity_type && (
                          <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                            {log.entity_type}
                            {log.entity_id && ` #${log.entity_id.slice(-6)}`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 max-w-xs truncate">
                        {log.reason || (log.new_state ? 'State changed' : '-')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleLogClick(log)} aria-label="View audit log details">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500">Action</p>
                  <Badge className={actionTypeConfig[selectedLog.action_type]?.color}>
                    {actionTypeConfig[selectedLog.action_type]?.label || selectedLog.action_type}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Timestamp</p>
                  <p className="font-medium">{format(new Date(selectedLog.created_date), 'PPpp')}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">User</p>
                  <p className="font-medium">{selectedLog.user_email || 'System'}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">IP Address</p>
                  <p className="font-medium">{selectedLog.ip_address || 'N/A'}</p>
                </div>
              </div>

              {selectedLog.reason && (
                <div>
                  <p className="text-sm text-slate-500">Reason</p>
                  <p className="font-medium">{selectedLog.reason}</p>
                </div>
              )}

              {selectedLog.previous_state && (
                <div>
                  <p className="text-sm text-slate-500 mb-2">Previous State</p>
                  <pre className="bg-slate-50 p-3 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.previous_state, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_state && (
                <div>
                  <p className="text-sm text-slate-500 mb-2">New State</p>
                  <pre className="bg-slate-50 p-3 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.new_state, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata && (
                <div>
                  <p className="text-sm text-slate-500 mb-2">Metadata</p>
                  <pre className="bg-slate-50 p-3 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}