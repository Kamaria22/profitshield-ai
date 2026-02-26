import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * TRIAL BANNER
 * Shows trial countdown, dismissible per session
 */
export default function TrialBanner({ userId }) {
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem('trial_banner_dismissed') === 'true';
  });

  const { data: trialStatus } = useQuery({
    queryKey: ['trial-status', userId],
    queryFn: async () => {
      const response = await base44.functions.invoke('subscriptionManager', {
        action: 'get_trial_status',
        user_id: userId
      });
      return response.data?.data;
    },
    enabled: !!userId,
    refetchInterval: 300000
  });

  if (!trialStatus?.trial_active || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('trial_banner_dismissed', 'true');
  };

  return (
    <div className="bg-gradient-to-r from-purple-900/40 to-cyan-900/40 border-b border-purple-500/30 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-purple-400" />
          <p className="text-sm text-white">
            <strong className="text-purple-400">Trial:</strong> {trialStatus.days_remaining} {trialStatus.days_remaining === 1 ? 'day' : 'days'} left
            {' • '}
            <Link to={createPageUrl('Billing')} className="underline hover:text-cyan-400">
              Upgrade to unlock full features
            </Link>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}