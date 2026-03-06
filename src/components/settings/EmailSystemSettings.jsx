import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { usePlatformResolver } from '@/components/usePlatformResolver';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, Phone, Bot, Megaphone } from 'lucide-react';

const DEFAULT_SUPPORT_EMAIL = 'support@profitshield-ai.com';
const DEFAULT_OWNER_PHONE = '9146894367';

function isAdminOwner(user) {
  const role = (user?.role || user?.app_role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

export default function EmailSystemSettings() {
  const resolver = usePlatformResolver();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = resolver?.tenantId || user?.tenant_id || null;
  const canAccess = isAdminOwner(user || resolver?.user);

  const queryKey = ['email-system-settings', tenantId];

  const { data: settingsRow } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!tenantId) return null;
      const rows = await base44.entities.TenantSettings.filter({ tenant_id: tenantId });
      return rows[0] || null;
    },
    enabled: !!tenantId && canAccess
  });

  const saveSettings = useMutation({
    mutationFn: async (payload) => {
      if (!tenantId) throw new Error('tenant_id missing');
      if (settingsRow?.id) return base44.entities.TenantSettings.update(settingsRow.id, payload);
      return base44.entities.TenantSettings.create({ tenant_id: tenantId, ...payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Email system settings saved');
    },
    onError: (e) => toast.error(e?.message || 'Failed to save email settings')
  });

  const runMarketingAgent = useMutation({
    mutationFn: () => base44.functions.invoke('autonomousMarketingEmail', { action: 'run_scheduled', manual: true }),
    onSuccess: () => toast.success('Marketing email automation executed'),
    onError: (e) => toast.error(e?.message || 'Marketing email automation failed')
  });

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-400" />
            Email System Settings
          </CardTitle>
          <CardDescription>Admin/owner access required.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-indigo-400" />
          Email System Settings
        </CardTitle>
        <CardDescription>
          Configure support email routing and outbound email automation defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />
                Support Email Address
              </Label>
              <Input
                defaultValue={settingsRow?.support_email || DEFAULT_SUPPORT_EMAIL}
                onBlur={(e) => saveSettings.mutate({ support_email: e.target.value || DEFAULT_SUPPORT_EMAIL })}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-amber-400" />
                Owner Notification Phone
              </Label>
              <Input
                defaultValue={settingsRow?.owner_notification_phone || DEFAULT_OWNER_PHONE}
                onBlur={(e) => saveSettings.mutate({ owner_notification_phone: e.target.value || DEFAULT_OWNER_PHONE })}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm text-slate-200 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-300" />
                  Enable AI Auto-Reply
                </p>
                <p className="text-xs text-slate-500">Auto-resolve low-risk support requests</p>
              </div>
              <Switch
                checked={settingsRow?.ai_auto_reply_enabled !== false}
                onCheckedChange={(checked) => saveSettings.mutate({ ai_auto_reply_enabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm text-slate-200 flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-violet-300" />
                  Marketing Email Automation
                </p>
                <p className="text-xs text-slate-500">Enable event-driven outbound campaigns</p>
              </div>
              <Switch
                checked={settingsRow?.marketing_email_enabled !== false}
                onCheckedChange={(checked) => saveSettings.mutate({ marketing_email_enabled: checked })}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-white/10"
              onClick={() => queryClient.invalidateQueries({ queryKey })}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => runMarketingAgent.mutate()}
              disabled={runMarketingAgent.isPending}
            >
              Run Marketing Email Agent
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
