import React from 'react';
import { usePlatformResolver, requireResolved } from '../components/usePlatformResolver';
import GamifiedOnboarding from '../components/onboarding/GamifiedOnboarding';
import { Trophy } from 'lucide-react';

export default function Achievements() {
  const resolver = usePlatformResolver();
  const resolverCheck = requireResolved(resolver);
  const tenant = resolver?.tenant;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
          <Trophy className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Achievements</h1>
          <p className="text-slate-500">Track your progress and unlock rewards</p>
        </div>
      </div>

      {tenant && (
        <GamifiedOnboarding 
          tenantId={resolverCheck.tenantId} 
          currentTier={tenant.subscription_tier} 
        />
      )}
    </div>
  );
}