import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Mail, Inbox, Bot, Clock, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { DEFAULT_SUPPORT_EMAIL, EmailService } from '@/components/support/emailSupportService';
import { useAuth } from '@/lib/AuthContext';

function isAdminOwner(user) {
  const role = (user?.role || user?.app_role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

function StatCard({ title, value, icon: Icon, tone = 'text-slate-200' }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">{title}</p>
            <p className={`text-2xl font-bold ${tone}`}>{value}</p>
          </div>
          <Icon className={`w-5 h-5 ${tone}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminEmailSupportPanel({ tenantId }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canAccess = isAdminOwner(user);

  const { data: conversations = [] } = useQuery({
    queryKey: ['admin-email-support-conversations', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      return base44.entities.SupportConversation.filter({ tenant_id: tenantId }, '-created_date', 200);
    },
    enabled: !!tenantId && canAccess
  });

  const { data: supportEmail = DEFAULT_SUPPORT_EMAIL } = useQuery({
    queryKey: ['admin-support-email', tenantId],
    queryFn: async () => EmailService.ensureDefaultSystemEmail(tenantId),
    enabled: !!tenantId && canAccess
  });

  const guardianMutation = useMutation({
    mutationFn: async () => {
      const guardian = await base44.functions.invoke('supportGuardian', { action: 'run_watchdog', tenant_id: tenantId });
      const heal = await base44.functions.invoke('selfHeal', { action: 'run_watchdog' }).catch(() => ({ data: { ok: false } }));
      return { guardian: guardian?.data, heal: heal?.data };
    },
    onSuccess: () => {
      toast.success('Watchdog + Self-Heal executed');
      queryClient.invalidateQueries({ queryKey: ['admin-email-support-conversations', tenantId] });
    },
    onError: () => toast.error('Failed to run watchdog checks')
  });

  const unread = conversations.filter(c => c.status !== 'closed' && c.status !== 'ai_resolved').length;
  const aiResolvedToday = conversations.filter(c => {
    if (c.status !== 'ai_resolved') return false;
    const d = c.updated_date || c.created_date;
    return d ? new Date(d).toDateString() === new Date().toDateString() : false;
  }).length;
  const pendingAdmin = conversations.filter(c => c.needs_owner_attention).length;

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Restricted</CardTitle>
          <CardDescription>Only owner/admin users can access Email &amp; Support controls.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-400" />
            Email & Support Control
          </CardTitle>
          <CardDescription>
            System support address: <span className="font-mono">{supportEmail}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
            Watchdog Active
          </Badge>
          <Badge variant="outline" className="border-indigo-500/30 text-indigo-300">
            Guardian Active
          </Badge>
          <Badge variant="outline" className="border-amber-500/30 text-amber-300">
            Self-Heal Connected
          </Badge>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Support Inbox" value={conversations.length} icon={Inbox} />
        <StatCard title="Unread Tickets" value={unread} icon={Clock} tone="text-amber-300" />
        <StatCard title="AI Resolved Today" value={aiResolvedToday} icon={Bot} tone="text-emerald-300" />
        <StatCard title="Pending Admin Response" value={pendingAdmin} icon={ShieldCheck} tone="text-red-300" />
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3">
          <Button onClick={() => navigate('/admin/support-inbox')} className="gap-2">
            <Inbox className="w-4 h-4" />
            Open Inbox
          </Button>
          <Button variant="outline" onClick={() => navigate('/SelfHealingCenter')} className="gap-2">
            <Wrench className="w-4 h-4" />
            View AI Logs
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => guardianMutation.mutate()}
            disabled={guardianMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 ${guardianMutation.isPending ? 'animate-spin' : ''}`} />
            Run Watchdog
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
