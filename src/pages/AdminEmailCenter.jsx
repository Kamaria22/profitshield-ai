import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Mail, Phone, Bell } from 'lucide-react';
import AdminSupportInboxPanel from '@/components/support/AdminSupportInboxPanel';
import AISupportControlCenter from '@/components/support/AISupportControlCenter';
import EmailSystemSettings from '@/components/settings/EmailSystemSettings';
import { usePlatformResolver } from '@/components/usePlatformResolver';

const DEFAULT_OWNER_PHONE = '9146894367';
const DEFAULT_SUPPORT_EMAIL = 'support@profitshield-ai.com';

function isAdminOwner(user) {
  const role = (user?.role || user?.app_role || '').toLowerCase();
  return role === 'admin' || role === 'owner';
}

export default function AdminEmailCenter() {
  const resolver = usePlatformResolver();
  const tenantId = resolver?.tenantId || resolver?.tenant?.id || null;
  const user = resolver?.user || null;
  const queryClient = useQueryClient();
  const canAccess = isAdminOwner(user);

  const { data: conversations = [] } = useQuery({
    queryKey: ['admin-email-center-support-count'],
    queryFn: () => base44.entities.SupportConversation.filter({}, '-created_date', 300),
    refetchInterval: canAccess ? 30000 : false,
    enabled: canAccess
  });

  const { data: settingsRow } = useQuery({
    queryKey: ['admin-email-center-settings', tenantId],
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
      if (settingsRow?.id) {
        return base44.entities.TenantSettings.update(settingsRow.id, payload);
      }
      return base44.entities.TenantSettings.create({ tenant_id: tenantId, ...payload });
    },
    onSuccess: () => {
      toast.success('Owner notification settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin-email-center-settings', tenantId] });
    },
    onError: (e) => toast.error(e?.message || 'Failed to save settings')
  });

  const watchdogRun = useMutation({
    mutationFn: () => base44.functions.invoke('supportWatchdog', { manual: true }),
    onSuccess: () => toast.success('Support watchdog executed'),
    onError: (e) => toast.error(e?.message || 'Support watchdog failed')
  });

  const marketingRun = useMutation({
    mutationFn: () => base44.functions.invoke('autonomousMarketingEmail', { action: 'run_scheduled', manual: true }),
    onSuccess: () => toast.success('Marketing email automation executed'),
    onError: (e) => toast.error(e?.message || 'Marketing email automation failed')
  });

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>Only admin/owner users can access Email &amp; Support admin tools.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const unread = conversations.filter((c) => c.status === 'open' || c.needs_owner_attention).length;
  const escalated = conversations.filter((c) => c.needs_owner_attention).length;
  const critical = conversations.filter((c) => c.priority === 'critical').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
          <Mail className="w-7 h-7 text-indigo-400" />
          Owner Admin Email Center
        </h1>
        <p className="text-slate-400 mt-1">Support inbox operations, AI support control, and email system settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-amber-400" />
            Owner Notification Settings
          </CardTitle>
          <CardDescription>
            SMS notifications are triggered for unresolved AI cases, merchant bug reports, and critical support tickets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Support Email Address</Label>
              <Input
                defaultValue={settingsRow?.support_email || DEFAULT_SUPPORT_EMAIL}
                onBlur={(e) => saveSettings.mutate({ support_email: e.target.value || DEFAULT_SUPPORT_EMAIL })}
              />
            </div>
            <div className="space-y-2">
              <Label>Owner Notification Phone</Label>
              <Input
                defaultValue={settingsRow?.owner_notification_phone || DEFAULT_OWNER_PHONE}
                onBlur={(e) => saveSettings.mutate({ owner_notification_phone: e.target.value || DEFAULT_OWNER_PHONE })}
              />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm text-slate-200">Enable AI Auto-Reply</p>
                <p className="text-xs text-slate-500">Watchdog can resolve low-risk tickets</p>
              </div>
              <Switch
                checked={settingsRow?.ai_auto_reply_enabled !== false}
                onCheckedChange={(checked) => saveSettings.mutate({ ai_auto_reply_enabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm text-slate-200">SMS on Critical Tickets</p>
                <p className="text-xs text-slate-500">Escalations with priority critical</p>
              </div>
              <Switch
                checked={settingsRow?.sms_critical_enabled !== false}
                onCheckedChange={(checked) => saveSettings.mutate({ sms_critical_enabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div>
                <p className="text-sm text-slate-200">SMS on Bug Reports</p>
                <p className="text-xs text-slate-500">Merchants explicitly reporting bugs</p>
              </div>
              <Switch
                checked={settingsRow?.sms_bug_report_enabled !== false}
                onCheckedChange={(checked) => saveSettings.mutate({ sms_bug_report_enabled: checked })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">Unread: {unread}</Badge>
            <Badge className="bg-red-500/15 text-red-300 border border-red-500/30">Escalated: {escalated}</Badge>
            <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">Critical: {critical}</Badge>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-email-center-support-count'] })}
            >
              <Bell className="w-4 h-4 mr-2" />
              Refresh Queue
            </Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => watchdogRun.mutate()}
              disabled={watchdogRun.isPending}
            >
              Run Support Watchdog
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-white/10"
              onClick={() => marketingRun.mutate()}
              disabled={marketingRun.isPending}
            >
              Run Marketing Email Agent
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-200">1. Support Inbox</h2>
        <AdminSupportInboxPanel />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-200">2. AI Support Control</h2>
        <AISupportControlCenter />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-200">3. Email System Settings</h2>
        <EmailSystemSettings />
      </section>
    </div>
  );
}
