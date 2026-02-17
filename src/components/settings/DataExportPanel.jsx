import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Download, 
  FileJson, 
  FileSpreadsheet, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Clock,
  Trash2,
  AlertTriangle,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function DataExportPanel({ tenantId }) {
  const [exportType, setExportType] = useState('full_export');
  const [exportFormat, setExportFormat] = useState('json');
  const [gdprEmail, setGdprEmail] = useState('');
  const queryClient = useQueryClient();

  const { data: exportRequests = [], isLoading } = useQuery({
    queryKey: ['export-requests', tenantId],
    queryFn: () => base44.entities.DataExportRequest.filter({ tenant_id: tenantId }, '-created_date', 10),
    enabled: !!tenantId,
    refetchInterval: 5000 // Poll for updates
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
      toast.success('Export requested', { description: 'Processing will begin shortly.' });
      queryClient.invalidateQueries({ queryKey: ['export-requests', tenantId] });
      // Trigger processing
      processExport(data.request_id);
    },
    onError: (error) => {
      toast.error('Export failed', { description: error.message });
    }
  });

  const processExport = async (requestId) => {
    try {
      await base44.functions.invoke('dataExporter', {
        action: 'process_export',
        tenant_id: tenantId,
        request_id: requestId
      });
      queryClient.invalidateQueries({ queryKey: ['export-requests', tenantId] });
    } catch (error) {
      console.error('Process export error:', error);
    }
  };

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
      toast.success('Data deleted', { description: `${data.records_deleted} records anonymized.` });
      setGdprEmail('');
    },
    onError: (error) => {
      toast.error('Deletion failed', { description: error.message });
    }
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-700"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Export Data Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Data
          </CardTitle>
          <CardDescription>
            Download your store data in JSON or CSV format
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <span className="flex items-center gap-2">
                      <FileJson className="w-4 h-4" />
                      JSON
                    </span>
                  </SelectItem>
                  <SelectItem value="csv">
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" />
                      CSV
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button 
            onClick={() => requestExportMutation.mutate()}
            disabled={requestExportMutation.isPending}
            className="w-full sm:w-auto"
          >
            {requestExportMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Requesting...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" />Request Export</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
          <CardDescription>Recent data exports (last 10)</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : exportRequests.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No exports yet</p>
          ) : (
            <div className="space-y-3">
              {exportRequests.map((req) => (
                <div 
                  key={req.id} 
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {req.format === 'csv' ? (
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <FileJson className="w-5 h-5 text-blue-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {req.export_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </p>
                      <p className="text-xs text-slate-500">
                        {req.created_date ? format(new Date(req.created_date), 'MMM d, yyyy h:mm a') : '—'}
                        {req.record_count && ` • ${req.record_count} records`}
                        {req.file_size_bytes && ` • ${formatBytes(req.file_size_bytes)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(req.status)}
                    {req.status === 'completed' && req.file_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={req.file_url} download>
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GDPR Deletion */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Shield className="w-5 h-5" />
            GDPR Data Deletion
          </CardTitle>
          <CardDescription>
            Permanently delete and anonymize customer data per GDPR request
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Warning: This action cannot be undone</p>
              <p>All customer data and associated orders will be permanently anonymized.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="customer@example.com"
              value={gdprEmail}
              onChange={(e) => setGdprEmail(e.target.value)}
              className="flex-1"
            />
            <Button 
              variant="destructive"
              onClick={() => gdprDeleteMutation.mutate()}
              disabled={!gdprEmail || gdprDeleteMutation.isPending}
            >
              {gdprDeleteMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Delete Data</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}