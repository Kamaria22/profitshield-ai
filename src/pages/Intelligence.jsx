import React from 'react';
import { usePlatformResolver, RESOLVER_STATUS } from '@/components/usePlatformResolver';
import { Loader2 } from 'lucide-react';
import GlobalIntelligenceDashboard from '@/components/intelligence/GlobalIntelligenceDashboard';

export default function Intelligence() {
  const { tenantId, status } = usePlatformResolver();

  if (status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GlobalIntelligenceDashboard tenantId={tenantId} />
    </div>
  );
}