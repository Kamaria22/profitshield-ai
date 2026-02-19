import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/components/platformContext';
import { 
  Lock, 
  Clock, 
  CreditCard, 
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function SubscriptionGate({ tenant, children, feature = null }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAccess();
  }, [tenant?.id, feature]);

  const checkAccess = async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }

    try {
      const response = await base44.functions.invoke('subscriptionGating', {
        tenant_id: tenant.id,
        action: feature ? 'check_access' : 'get_status',
        feature
      });
      setStatus(response.data);
    } catch (e) {
      console.error('Subscription check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // If access is allowed, render children
  if (status?.allowed !== false && !status?.trial_expired && !status?.upgrade_required) {
    return <>{children}</>;
  }

  // Trial expired state
  if (status?.trial_expired || status?.reason === 'trial_expired') {
    return (
      <TrialExpiredOverlay 
        onSubscribe={() => navigate(createPageUrl('Pricing'))}
      />
    );
  }

  // Feature locked state
  if (status?.reason === 'feature_locked') {
    return (
      <FeatureLockedOverlay 
        message={status.message}
        requiredTier={status.required_tier}
        onUpgrade={() => navigate(createPageUrl('Pricing'))}
        children={children}
      />
    );
  }

  // Order limit reached
  if (status?.reason === 'order_limit_reached') {
    return (
      <OrderLimitOverlay
        current={status.current}
        limit={status.limit}
        onUpgrade={() => navigate(createPageUrl('Pricing'))}
        children={children}
      />
    );
  }

  // Default: render children with potential trial banner
  return (
    <>
      {status?.is_in_trial && status?.days_remaining <= 7 && (
        <TrialBanner 
          daysRemaining={status.days_remaining}
          onSubscribe={() => navigate(createPageUrl('Pricing'))}
        />
      )}
      {children}
    </>
  );
}

function TrialExpiredOverlay({ onSubscribe }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-slate-900/95 flex items-center justify-center p-4"
    >
      <Card className="max-w-md w-full shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <CardTitle className="text-2xl">Trial Expired</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-slate-600">
            Your 14-day free trial has ended. Subscribe now to continue protecting your profits.
          </p>
          
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm text-slate-500 mb-2">Your data is safe!</p>
            <p className="text-xs text-slate-400">
              Everything will be restored immediately when you subscribe.
            </p>
          </div>

          <Button 
            onClick={onSubscribe}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            Subscribe Now
          </Button>

          <p className="text-xs text-slate-400">
            Plans start at $29/month
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function FeatureLockedOverlay({ message, requiredTier, onUpgrade, children }) {
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-lg">
        <Card className="max-w-sm shadow-xl border-amber-200">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Feature Locked</h3>
            <p className="text-sm text-slate-600 mb-4">{message}</p>
            <Button onClick={onUpgrade} className="bg-amber-500 hover:bg-amber-600">
              Upgrade to {requiredTier?.charAt(0).toUpperCase() + requiredTier?.slice(1)}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OrderLimitOverlay({ current, limit, onUpgrade, children }) {
  const percentage = (current / limit) * 100;
  
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-lg">
        <Card className="max-w-sm shadow-xl border-red-200">
          <CardContent className="pt-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Order Limit Reached</h3>
            <p className="text-sm text-slate-600 mb-4">
              You've used {current} of {limit} orders this month.
            </p>
            <Progress value={percentage} className="mb-4 h-2" />
            <Button onClick={onUpgrade} className="bg-red-500 hover:bg-red-600">
              Upgrade for More Orders
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrialBanner({ daysRemaining, onSubscribe }) {
  const urgency = daysRemaining <= 3 ? 'high' : daysRemaining <= 7 ? 'medium' : 'low';
  
  const colors = {
    high: 'from-red-500 to-rose-600',
    medium: 'from-amber-500 to-orange-600',
    low: 'from-blue-500 to-indigo-600'
  };

  return (
    <motion.div
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`mb-4 p-4 rounded-xl bg-gradient-to-r ${colors[urgency]} text-white`}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5" />
          <div>
            <p className="font-semibold">
              {daysRemaining === 1 ? 'Last day' : `${daysRemaining} days left`} on your trial
            </p>
            <p className="text-sm opacity-90">
              Subscribe now to keep your profit protection active
            </p>
          </div>
        </div>
        <Button 
          onClick={onSubscribe}
          variant="secondary"
          className="bg-white text-slate-900 hover:bg-slate-100"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          Subscribe
        </Button>
      </div>
    </motion.div>
  );
}

// Hook for checking feature access
export function useFeatureAccess(tenantId, feature) {
  const [access, setAccess] = useState({ loading: true, allowed: true });

  useEffect(() => {
    if (!tenantId) {
      setAccess({ loading: false, allowed: true });
      return;
    }

    const check = async () => {
      try {
        const response = await base44.functions.invoke('subscriptionGating', {
          tenant_id: tenantId,
          action: 'check_access',
          feature
        });
        setAccess({ loading: false, ...response.data });
      } catch (e) {
        setAccess({ loading: false, allowed: true });
      }
    };

    check();
  }, [tenantId, feature]);

  return access;
}