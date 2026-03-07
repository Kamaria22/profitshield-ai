import React from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SupportInbox from '@/pages/SupportInbox';
import { usePermissions } from '@/components/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function isAdminOwner(user, role) {
  const r = (role || user?.role || user?.app_role || '').toLowerCase();
  return r === 'admin' || r === 'owner';
}

export default function AdminSupportInbox() {
  const { role, user } = usePermissions();

  const { data: diagnostics = null } = useQuery({
    queryKey: ['admin-support-diagnostics'],
    queryFn: async () => {
      const res = await base44.functions.invoke('supportGuardian', { action: 'run_watchdog' });
      return res?.data || null;
    },
    refetchInterval: 60000
  });

  if (!isAdminOwner(user, role)) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Support Inbox Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">Inbox Health: {diagnostics?.inbox_health || 'unknown'}</Badge>
          <Badge variant="outline">Unread: {diagnostics?.unread_count ?? 0}</Badge>
          <Badge variant="outline">AI Resolution Rate: {diagnostics?.ai_resolution_rate ?? 0}%</Badge>
          <Badge variant="outline">Email Delivery: {diagnostics?.email_delivery_health || 'unknown'}</Badge>
        </CardContent>
      </Card>
      <SupportInbox />
    </div>
  );
}

