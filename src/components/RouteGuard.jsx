import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { canAccessPage, APP_CONTEXT } from '@/components/AppContext';
import { Loader2, Lock } from 'lucide-react';
import { createPageUrl } from '@/components/platformContext';

/**
 * RouteGuard — wraps a page to enforce admin + context access rules.
 * Usage: <RouteGuard pageName="AppStoreListing">...</RouteGuard>
 *
 * IMPORTANT: In Shopify embedded context (shop= + host= or embedded=1),
 * RouteGuard is fully bypassed. Auth is handled by ShopifyEmbeddedAuthGate.
 */
function isShopifyEmbedded() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return !!(p.get('shop') && (p.get('host') || p.get('embedded') === '1'));
}

export default function RouteGuard({ pageName, children }) {
  const [status, setStatus] = useState('checking'); // checking | allowed | denied
  const navigate = useNavigate();

  useEffect(() => {
    // Bypass all auth gating for Shopify embedded — ShopifyEmbeddedAuthGate handles it
    if (isShopifyEmbedded()) {
      setStatus('allowed');
      return;
    }

    base44.auth.me()
      .then(user => {
        const role = user?.role || user?.app_role || 'user';
        if (canAccessPage(pageName, role, APP_CONTEXT)) {
          setStatus('allowed');
        } else {
          setStatus('denied');
          // Log attempt silently
          try {
            base44.entities.AuditLog.create({
              tenant_id: 'system',
              action: 'unauthorized_route_access',
              entity_type: 'page',
              entity_id: pageName,
              performed_by: user?.email || 'unknown',
              severity: 'high',
              category: 'security',
              description: `Unauthorized access attempt to ${pageName}`,
            }).catch(() => {});
          } catch (_) {}

          setTimeout(() => navigate(createPageUrl('Home')), 2000);
        }
      })
      .catch(() => {
        setStatus('denied');
        setTimeout(() => navigate(createPageUrl('Home')), 2000);
      });
  }, [pageName, navigate]);

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <Lock className="w-6 h-6 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-slate-200 font-semibold">Access Restricted</p>
          <p className="text-slate-500 text-sm mt-1">You don't have permission to view this page.</p>
          <p className="text-slate-600 text-xs mt-1">Redirecting you home...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}