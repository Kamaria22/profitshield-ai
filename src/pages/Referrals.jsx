import React from 'react';
import { usePlatformResolver, requireResolved } from '@/components/usePlatformResolver';
import ReferralPanel from '@/components/growth/ReferralPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Gift } from 'lucide-react';

export default function Referrals() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);

  if (resolver.status === 'resolving') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!resolverCheck.ok) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">Please connect a store first.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Gift className="w-7 h-7 text-purple-600" />
          Referral Program
        </h1>
        <p className="text-slate-500 mt-1">
          Invite fellow merchants and earn free months
        </p>
      </div>

      <ReferralPanel tenantId={resolverCheck.tenantId} />
    </div>
  );
}