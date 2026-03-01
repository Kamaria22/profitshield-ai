import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { RefreshCw, RotateCcw, Eye, CreditCard, Search, Shield, Clock } from 'lucide-react';

export default function BillingAdminPanel() {
  const [searchDomain, setSearchDomain] = useState('');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['adminTenants'],
    queryFn: () => base44.entities.Tenant.list('-created_date', 50)
  });

  const filtered = searchDomain
    ? tenants.filter(t => (t.shop_domain || '').includes(searchDomain) || (t.shop_name || '').includes(searchDomain))
    : tenants;

  const resetTrialMutation = useMutation({
    mutationFn: (tenant_id) => base44.functions.invoke('subscriptionGating', { action: 'admin_reset_trial', tenant_id }),
    onSuccess: () => { toast.success('Trial reset — 14 days from now'); queryClient.invalidateQueries(['adminTenants']); },
    onError: (e) => toast.error(e.message)
  });

  const setReviewModeMutation = useMutation({
    mutationFn: ({ tenant_id, enabled }) => base44.functions.invoke('subscriptionGating', { action: 'admin_set_review_mode', tenant_id, enabled }),
    onSuccess: (_, vars) => { toast.success(`Review mode ${vars.enabled ? 'enabled' : 'disabled'}`); queryClient.invalidateQueries(['adminTenants']); },
    onError: (e) => toast.error(e.message)
  });

  const resyncMutation = useMutation({
    mutationFn: (tenant_id) => base44.functions.invoke('subscriptionGating', { action: 'admin_force_billing_resync', tenant_id }),
    onSuccess: () => toast.success('Billing resync triggered'),
    onError: (e) => toast.error(e.message)
  });

  const planStatusColor = {
    trial: 'bg-blue-100 text-blue-700',
    active: 'bg-emerald-100 text-emerald-700',
    past_due: 'bg-amber-100 text-amber-700',
    canceled: 'bg-red-100 text-red-700',
    expired: 'bg-red-100 text-red-700'
  };

  const getTrialDaysLeft = (tenant) => {
    if (!tenant.trial_ends_at) return null;
    const diff = new Date(tenant.trial_ends_at).getTime() - Date.now();
    if (diff < 0) return 'Expired';
    return `${Math.ceil(diff / 86400000)}d left`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-indigo-600" />
          Billing Admin Controls
        </CardTitle>
        <CardDescription>Reset trials, manage review mode, force billing resync per tenant</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Filter by domain or shop name…"
              value={searchDomain}
              onChange={(e) => setSearchDomain(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-auto">
          {isLoading && <p className="text-center text-slate-500 py-4">Loading tenants…</p>}
          {filtered.map((tenant) => {
            const trialLeft = getTrialDaysLeft(tenant);
            const isExpired = trialLeft === 'Expired';
            return (
              <div key={tenant.id} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-sm">{tenant.shop_name || tenant.shop_domain}</p>
                    <p className="text-xs text-slate-500">{tenant.shop_domain}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={planStatusColor[tenant.plan_status] || 'bg-slate-100 text-slate-700'}>
                      {tenant.plan_status || 'unknown'}
                    </Badge>
                    {trialLeft && (
                      <Badge variant="outline" className={isExpired ? 'text-red-600 border-red-300' : 'text-blue-600 border-blue-300'}>
                        <Clock className="w-3 h-3 mr-1" />
                        {trialLeft}
                      </Badge>
                    )}
                    {tenant.review_mode_enabled && (
                      <Badge className="bg-amber-100 text-amber-700">
                        <Eye className="w-3 h-3 mr-1" /> Review Mode
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={() => resetTrialMutation.mutate(tenant.id)}
                    disabled={resetTrialMutation.isPending}
                  >
                    <RotateCcw className="w-3 h-3" /> Reset Trial
                  </Button>

                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={!!tenant.review_mode_enabled}
                      onCheckedChange={(v) => setReviewModeMutation.mutate({ tenant_id: tenant.id, enabled: v })}
                      className="scale-75"
                    />
                    <Label className="text-xs">Review Mode</Label>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={() => resyncMutation.mutate(tenant.id)}
                    disabled={resyncMutation.isPending}
                  >
                    <RefreshCw className="w-3 h-3" /> Force Billing Resync
                  </Button>
                </div>
              </div>
            );
          })}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center text-slate-500 py-4">No tenants found.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}