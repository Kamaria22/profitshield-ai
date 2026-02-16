import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Lazy-loaded route components for code-splitting
 * Improves initial load time by splitting heavy pages
 */

// Loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
  </div>
);

// Lazy load heavy pages
export const LazyFounderDashboard = lazy(() => import('../pages/FounderDashboard'));
export const LazyIntelligence = lazy(() => import('../pages/Intelligence'));
export const LazyAuditLogs = lazy(() => import('../pages/AuditLogs'));
export const LazySystemHealth = lazy(() => import('../pages/SystemHealth'));
export const LazyPnLAnalytics = lazy(() => import('../pages/PnLAnalytics'));

// Wrapper component with Suspense
export function withLazy(Component) {
  return function LazyComponent(props) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Component {...props} />
      </Suspense>
    );
  };
}

export default {
  FounderDashboard: withLazy(LazyFounderDashboard),
  Intelligence: withLazy(LazyIntelligence),
  AuditLogs: withLazy(LazyAuditLogs),
  SystemHealth: withLazy(LazySystemHealth),
  PnLAnalytics: withLazy(LazyPnLAnalytics),
};