import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * FEATURE GATE
 * Blocks premium features for trial users with upgrade prompt
 */
export function FeatureGate({ feature, tenantId, children, fallback }) {
  const { data: entitlements } = useQuery({
    queryKey: ['entitlements', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('subscriptionManager', {
        action: 'get_entitlements',
        tenant_id: tenantId
      });
      return response.data?.data;
    },
    enabled: !!tenantId,
    staleTime: 60000
  });

  const hasFeature = entitlements?.features?.[feature] === true;

  if (!entitlements || hasFeature) {
    return <>{children}</>;
  }

  return fallback || (
    <Alert className="bg-purple-500/10 border-purple-500/30">
      <Lock className="w-4 h-4 text-purple-400" />
      <AlertDescription className="text-purple-300">
        <div className="flex items-center justify-between">
          <span>Upgrade to unlock this feature</span>
          <Link to={createPageUrl('Billing')}>
            <Button size="sm" variant="outline" className="border-purple-400 text-purple-400">
              Upgrade
            </Button>
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function useHasFeature(feature, tenantId) {
  const { data: entitlements } = useQuery({
    queryKey: ['entitlements', tenantId],
    queryFn: async () => {
      const response = await base44.functions.invoke('subscriptionManager', {
        action: 'get_entitlements',
        tenant_id: tenantId
      });
      return response.data?.data;
    },
    enabled: !!tenantId,
    staleTime: 60000
  });

  return entitlements?.features?.[feature] === true;
}