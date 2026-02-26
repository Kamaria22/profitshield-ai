import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * SUBSCRIPTION GUARD
 * Enforces authentication and trial initialization
 */
export function SubscriptionGuard({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['auth-user'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    },
    staleTime: 300000,
    retry: false
  });

  const { data: trialStatus, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const response = await base44.functions.invoke('subscriptionManager', {
        action: 'get_trial_status',
        user_id: user.id
      });
      return response.data?.data;
    },
    enabled: !!user,
    staleTime: 60000
  });

  // Auto-start trial for new users
  const { data: trialInit } = useQuery({
    queryKey: ['trial-init', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const response = await base44.functions.invoke('subscriptionManager', {
        action: 'start_trial',
        user_id: user.id,
        tenant_id: 'default'
      });
      return response.data?.data;
    },
    enabled: !!user && trialStatus && !trialStatus.is_trial,
    staleTime: Infinity
  });

  useEffect(() => {
    // Redirect to login if not authenticated (except login/signup pages)
    const publicRoutes = ['/login', '/signup', '/download'];
    const isPublicRoute = publicRoutes.some(route => location.pathname.includes(route));
    
    if (!userLoading && !user && !isPublicRoute) {
      navigate('/login');
    }
  }, [user, userLoading, navigate, location]);

  if (userLoading || trialLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}