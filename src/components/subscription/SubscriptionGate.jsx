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
    let mounted = true;
    
    const checkAccess = async () => {
      if (!tenant?.id) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const response = await base44.functions.invoke('subscriptionGating', {
          tenant_id: tenant.id,
          action: feature ? 'check_access' : 'get_status',
          feature
        });
        if (mounted) setStatus(response.data);
      } catch (e) {
        console.error('Subscription check failed:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkAccess();
    
    return () => { mounted = false; };
  }, [tenant?.id, feature]);

  // Always render children if no tenant (allow demo mode)
  if (!tenant?.id) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // GRACE WINDOW or billing still initializing — show banner but allow access
  if (status?.grace_window || status?.reason === 'grace_window' || status?.reason === 'trial_initializing') {
    return (
      <>
        <GraceWindowBanner />
        {children}
      </>
    );
  }

  // REVIEW MODE — allow access with informational banner
  if (status?.reason === 'review_mode' || (status?.allowed && status?.review_mode)) {
    return (
      <>
        <ReviewModeBanner />
        {children}
      </>
    );
  }

  // If access is allowed, render children (with optional trial banner)
  if (status?.allowed !== false) {
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

  // TRIAL EXPIRED — hard paywall
  if (status?.reason === 'trial_expired' || status?.reason === 'subscription_ended') {
    return (
      <TrialExpiredOverlay 
        reason={status.reason}
        onSubscribe={() => {
          // Open Stripe checkout in top window so it works from Shopify embedded iframe
          const pricingUrl = createPageUrl('Pricing');
          if (window.top && window.top !== window) {
            window.top.location.href = pricingUrl;
          } else {
            navigate(pricingUrl);
          }
        }}
        onRestore={async () => {
          setLoading(true);
          try {
            const res = await base44.functions.invoke('subscriptionGating', {
              tenant_id: tenant.id,
              action: 'restore_access'
            });
            setStatus(res.data);
          } finally {
            setLoading(false);
          }
        }}
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

  // Default fallback — allow access
  return <>{children}</>;
}

function TrialExpiredOverlay({ onSubscribe, onRestore, reason }) {
  const [restoring, setRestoring] = React.useState(false);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="max-w-md w-full rounded-2xl border border-white/10 p-8 text-center"
        style={{ background: 'rgba(15,20,40,0.9)', boxShadow: '0 0 60px rgba(99,102,241,0.15), 0 25px 50px rgba(0,0,0,0.6)' }}>
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{ boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}>
          <Lock className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          {reason === 'subscription_ended' ? 'Subscription Ended' : 'Trial Expired'}
        </h2>
        <p className="text-slate-400 mb-6">
          {reason === 'subscription_ended'
            ? 'Your subscription has ended. Renew to continue protecting your profits.'
            : 'Your 14-day free trial has ended. Subscribe to continue protecting your profits.'}
        </p>
        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/5">
          <p className="text-sm text-slate-300 mb-1">Your data is safe</p>
          <p className="text-xs text-slate-500">Everything restores instantly on subscription.</p>
        </div>
        <Button
          onClick={onSubscribe}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-0 mb-3"
          size="lg"
        >
          <CreditCard className="w-5 h-5 mr-2" />
          Subscribe Now
        </Button>
        <Button
          onClick={async () => { setRestoring(true); await onRestore?.(); setRestoring(false); }}
          variant="ghost"
          className="w-full text-slate-400 hover:text-white"
          disabled={restoring}
        >
          {restoring ? 'Checking…' : 'Restore Access (already subscribed?)'}
        </Button>
        <p className="text-xs text-slate-600 mt-4">Plans from $49/month</p>
      </div>
    </motion.div>
  );
}

function GraceWindowBanner() {
  return (
    <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm">
      <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full flex-shrink-0" />
      <span>Verifying subscription… You'll have full access in a moment.</span>
    </div>
  );
}

function ReviewModeBanner() {
  return (
    <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
      <Shield className="w-4 h-4 flex-shrink-0" />
      <span>Review mode — subscription required to enable protection actions.</span>
    </div>
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