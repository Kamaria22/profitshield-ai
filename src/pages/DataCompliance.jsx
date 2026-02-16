import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Download,
  Trash2,
  FileJson,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantResolver } from '../components/useTenantResolver';

export default function DataCompliance() {
  const { tenantId } = useTenantResolver();
  const [exportType, setExportType] = useState('full_export');
  const [exportFormat, setExportFormat] = useState('json');
  const [gdprEmail, setGdprEmail] = useState('');
  const queryClient = useQueryClient();

  const { data: exportRequests = [], isLoading } = useQuery({
    queryKey: ['exportRequests', tenantId],
    queryFn: () => base44.entities.DataExportRequest.filter({ tenant_id: tenantId }, '-created_date', 20),
    enabled: !!tenantId
  });

  const requestExportMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('dataExporter', {
        action: 'request_export',
        tenant_id: tenantId,
        export_type: exportType,
        format: exportFormat
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Export requested. Processing will begin shortly.');
      queryClient.invalidateQueries({ queryKey: ['exportRequests'] });
      
      // Process immediately for demo
      base44.functions.invoke('dataExporter', {
        action: 'process_export',
        tenant_id: tenantId,
        request_id: data.request_id
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['exportRequests'] });
      });
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const gdprDeleteMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('dataExporter', {
        action: 'gdpr_delete',
        tenant_id: tenantId,
        customer_email: gdprEmail
      });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.records_deleted} records for ${gdprEmail}`);
      setGdprEmail('');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const statusConfig = {
    pending: { icon: Clock, color: 'bg-amber-100 text-amber-700' },
    processing: { icon: Loader2, color: 'bg-blue-100 text-blue-700', spin: true },
    completed: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700' },
    failed: { icon: AlertTriangle, color: 'bg-red-100 text-red-700' }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-emerald-600" />
            Data & Compliance
          </h1>
          <p className="text-slate-500 mt-1">Export data and manage GDPR compliance</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Data Export */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Data Export
            </CardTitle>
            <CardDescription>
              Export your store data in JSON or CSV format
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Export Type</Label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_export">Full Export (All Data)</SelectItem>
                  <SelectItem value="orders_only">Orders Only</SelectItem>
                  <SelectItem value="customers_only">Customers Only</SelectItem>
                  <SelectItem value="gdpr_export">GDPR Data Package</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-4 h-4" />
                      JSON
                    </div>
                  </SelectItem>
                  <SelectItem value="csv">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      CSV
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={() => requestExportMutation.mutate()}
              disabled={requestExportMutation.isPending}
              className="w-full"
            >
              {requestExportMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Request Export
            </Button>
          </CardContent>
        </Card>

        {/* GDPR Deletion */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" />
              GDPR Data Deletion
            </CardTitle>
            <CardDescription>
              Permanently delete customer data per GDPR request
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="text-sm text-red-700">
                  <strong>Warning:</strong> This action permanently anonymizes all data associated with the specified email address and cannot be undone.
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Customer Email</Label>
              <Input
                type="email"
                value={gdprEmail}
                onChange={(e) => setGdprEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="w-full"
                  disabled={!gdprEmail || gdprDeleteMutation.isPending}
                >
                  {gdprDeleteMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Delete Customer Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm GDPR Deletion</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently anonymize all data for <strong>{gdprEmail}</strong>.
                    This includes orders, customer records, and any associated data.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => gdprDeleteMutation.mutate()}
                  >
                    Delete Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
          <CardDescription>Recent data export requests</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : exportRequests.length === 0 ? (
            <div className="text-center py-8">
              <Download className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No export requests yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exportRequests.map((request) => {
                const config = statusConfig[request.status] || statusConfig.pending;
                const StatusIcon = config.icon;

                return (
                  <div key={request.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge className={config.color}>
                        <StatusIcon className={`w-3 h-3 mr-1 ${config.spin ? 'animate-spin' : ''}`} />
                        {request.status}
                      </Badge>
                      <div>
                        <p className="font-medium">{request.export_type.replace('_', ' ')}</p>
                        <p className="text-sm text-slate-500">
                          {format(new Date(request.created_date), 'MMM d, yyyy h:mm a')}
                          {request.record_count && ` • ${request.record_count} records`}
                        </p>
                      </div>
                    </div>
                    {request.status === 'completed' && request.file_url && (
                      <a href={request.file_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                      </a>
                    )}
                    {request.status === 'failed' && request.error_message && (
                      <span className="text-sm text-red-600">{request.error_message}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Security & Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Data Encryption', status: 'Active', description: 'AES-256 at rest' },
              { label: 'Token Security', status: 'Active', description: 'AES-GCM encrypted OAuth' },
              { label: 'Tenant Isolation', status: 'Active', description: 'Row-level enforcement' },
              { label: 'Audit Logging', status: 'Active', description: 'Full activity trail' },
              { label: 'GDPR Compliance', status: 'Active', description: 'Data export & deletion' },
              { label: 'Webhook Validation', status: 'Active', description: 'HMAC signature verify' }
            ].map((item, i) => (
              <div key={i} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{item.label}</span>
                  <Badge className="bg-emerald-100 text-emerald-700">{item.status}</Badge>
                </div>
                <p className="text-sm text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}