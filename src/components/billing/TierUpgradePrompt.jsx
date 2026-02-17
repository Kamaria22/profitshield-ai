import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, TrendingUp, Zap, X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/components/platformContext';

const TIER_LIMITS = {
  trial: { limit: 100, next: 'starter', nextName: 'Starter', nextPrice: 29 },
  starter: { limit: 500, next: 'growth', nextName: 'Growth', nextPrice: 79 },
  growth: { limit: 2000, next: 'pro', nextName: 'Pro', nextPrice: 199 },
  pro: { limit: 10000, next: 'enterprise', nextName: 'Enterprise', nextPrice: null },
  enterprise: { limit: Infinity, next: null, nextName: null, nextPrice: null }
};

export default function TierUpgradePrompt({ tenant, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);
  
  if (!tenant || dismissed) return null;
  
  const currentTier = tenant.subscription_tier || 'trial';
  const ordersThisMonth = tenant.orders_this_month || 0;
  const tierConfig = TIER_LIMITS[currentTier] || TIER_LIMITS.trial;
  const monthlyLimit = tenant.monthly_order_limit || tierConfig.limit;
  
  const usagePercent = Math.min(100, (ordersThisMonth / monthlyLimit) * 100);
  const isAtLimit = ordersThisMonth >= monthlyLimit;
  const isNearLimit = usagePercent >= 80;
  const ordersRemaining = Math.max(0, monthlyLimit - ordersThisMonth);
  
  // Don't show if under 80% usage or enterprise tier
  if (!isNearLimit || currentTier === 'enterprise') return null;
  
  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mb-4"
      >
        <Card className={`border-2 ${isAtLimit ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className={`p-2 rounded-lg ${isAtLimit ? 'bg-red-100' : 'bg-amber-100'}`}>
                  {isAtLimit ? (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  ) : (
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`font-semibold ${isAtLimit ? 'text-red-800' : 'text-amber-800'}`}>
                      {isAtLimit ? 'Order Limit Reached' : 'Approaching Order Limit'}
                    </h3>
                    <Badge variant="outline" className="text-xs capitalize">
                      {currentTier} Plan
                    </Badge>
                  </div>
                  
                  <p className={`text-sm mb-3 ${isAtLimit ? 'text-red-700' : 'text-amber-700'}`}>
                    {isAtLimit ? (
                      <>You've used all <strong>{monthlyLimit.toLocaleString()}</strong> orders this month. Upgrade to continue processing orders.</>
                    ) : (
                      <>You've used <strong>{ordersThisMonth.toLocaleString()}</strong> of <strong>{monthlyLimit.toLocaleString()}</strong> orders ({ordersRemaining.toLocaleString()} remaining).</>
                    )}
                  </p>
                  
                  {/* Progress bar */}
                  <div className="mb-3">
                    <Progress 
                      value={usagePercent} 
                      className={`h-2 ${isAtLimit ? 'bg-red-200' : 'bg-amber-200'}`}
                    />
                    <div className="flex justify-between mt-1 text-xs text-slate-500">
                      <span>{ordersThisMonth.toLocaleString()} orders</span>
                      <span>{monthlyLimit.toLocaleString()} limit</span>
                    </div>
                  </div>
                  
                  {/* Upgrade CTA */}
                  {tierConfig.next && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Link to={createPageUrl('Pricing')}>
                        <Button 
                          size="sm" 
                          className={isAtLimit ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}
                        >
                          <Zap className="w-4 h-4 mr-1" />
                          Upgrade to {tierConfig.nextName}
                          {tierConfig.nextPrice && (
                            <span className="ml-1 opacity-80">(${tierConfig.nextPrice}/mo)</span>
                          )}
                        </Button>
                      </Link>
                      <span className="text-xs text-slate-500">
                        Get up to {TIER_LIMITS[tierConfig.next]?.limit?.toLocaleString() || 'unlimited'} orders/month
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              {!isAtLimit && (
                <button 
                  onClick={handleDismiss}
                  className="p-1 hover:bg-amber-200 rounded transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4 text-amber-600" />
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

// Hook to check tier status
export function useTierStatus(tenant) {
  if (!tenant) return { needsUpgrade: false, isNearLimit: false, usagePercent: 0 };
  
  const currentTier = tenant.subscription_tier || 'trial';
  const ordersThisMonth = tenant.orders_this_month || 0;
  const tierConfig = TIER_LIMITS[currentTier] || TIER_LIMITS.trial;
  const monthlyLimit = tenant.monthly_order_limit || tierConfig.limit;
  
  const usagePercent = Math.min(100, (ordersThisMonth / monthlyLimit) * 100);
  const needsUpgrade = ordersThisMonth >= monthlyLimit && currentTier !== 'enterprise';
  const isNearLimit = usagePercent >= 80 && currentTier !== 'enterprise';
  
  return {
    needsUpgrade,
    isNearLimit,
    usagePercent,
    ordersThisMonth,
    monthlyLimit,
    currentTier,
    nextTier: tierConfig.next,
    nextTierName: tierConfig.nextName,
    ordersRemaining: Math.max(0, monthlyLimit - ordersThisMonth)
  };
}