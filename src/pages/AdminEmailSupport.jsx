import React from 'react';
import { Navigate } from 'react-router-dom';
import AdminEmailSupportPanel from '@/components/support/AdminEmailSupportPanel';
import { usePlatformResolver } from '@/components/usePlatformResolver';
import { usePermissions } from '@/components/usePermissions';

function isAdminOwner(user, role) {
  const r = (role || user?.role || user?.app_role || '').toLowerCase();
  return r === 'admin' || r === 'owner';
}

export default function AdminEmailSupport() {
  const resolver = usePlatformResolver() || {};
  const { role, user } = usePermissions();
  const tenantId = resolver?.tenantId || resolver?.tenant?.id || null;

  if (!isAdminOwner(user, role)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-100">Admin Email & Support</h1>
        <p className="text-slate-400 mt-1">Support inbox, AI escalation health, and watchdog controls.</p>
      </div>
      <AdminEmailSupportPanel tenantId={tenantId} />
    </div>
  );
}

