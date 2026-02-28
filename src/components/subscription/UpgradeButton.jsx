/**
 * GLOBAL UPGRADE BUTTON
 * Renders a CTA button that redirects to the Pricing page.
 * Used in the top header.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function UpgradeButton({ userId }) {
  const { data: trialStatus } = useQuery({
    queryKey: ['trial-status-header', userId],
    queryFn: async () => {
      const res = await base44.functions.invoke('subscriptionManager', {
        action: 'get_trial_status',
        user_id: userId
      });
      return res.data?.data;
    },
    enabled: !!userId,
    refetchInterval: 600000,
    staleTime: 300000,
  });

  // Only show during trial or if no active paid subscription
  if (!trialStatus || trialStatus.plan_code === 'PRO' || trialStatus.plan_code === 'ENTERPRISE') {
    return null;
  }

  const isTrialing = trialStatus.trial_active;
  const daysLeft = trialStatus.days_remaining;

  return (
    <Link to={createPageUrl('Pricing')}>
      <Button
        size="sm"
        className="bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white gap-1.5 shadow-sm"
      >
        <Zap className="w-3.5 h-3.5" />
        {isTrialing && daysLeft <= 7
          ? `Upgrade · ${daysLeft}d left`
          : 'Upgrade Plan'
        }
      </Button>
    </Link>
  );
}