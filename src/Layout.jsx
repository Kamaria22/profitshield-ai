import React, { useState, useEffect, useCallback, useMemo, lazy } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl, parseQuery, getPersistedContext } from '@/components/platformContext';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved } from '@/components/usePlatformResolver';
import { PermissionsProvider, usePermissions } from '@/components/usePermissions';
import StoreSwitcher from '@/components/StoreSwitcher';
import ResolverHealthIndicator from '@/components/ResolverHealthIndicator';
import SecurityHardeningLayer from '@/components/security/SecurityHardeningLayer';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import OfflineIndicator from '@/components/pwa/OfflineIndicator';
import GlobalErrorBoundary from '@/components/GlobalErrorBoundary';
import MobileAppBanner from '@/components/mobile/MobileAppBanner';
import { maskEmail } from '@/components/utils/safeLog';
import { NotificationProvider, NotificationSettingsButton } from '@/components/pwa/NotificationManager';
import { SyncProvider, SyncStatusIndicator } from '@/components/pwa/SyncManager';
import { InstallAppBanner, UpdateAvailableBanner } from '@/components/pwa/ServiceWorkerRegistration';
import { healthAgent } from '@/components/health/HealthAgent';
import FrontendGuardian from '@/components/FrontendGuardian';
import { HealthErrorBoundary } from '@/components/health/HealthErrorBoundary';
import { LanguageProvider } from '@/components/i18n/LanguageContext';
import LanguageSelector from '@/components/i18n/LanguageSelector';

// PERFORMANCE: Defer non-critical components - loaded after idle
const MerchantAIChat = lazy(() => import('@/components/merchant/MerchantAIChat'));
const ResolverSelfTest = lazy(() => import('@/components/ResolverSelfTest'));
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  AlertTriangle,
  Settings,
  Shield,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Bell,
  TrendingUp,
  Users,
  ClipboardList,
  Link2,
  Brain,
  Bug,
  Store,
  Copy,
  CheckCircle,
  Gift,
  CreditCard,
  Video,
  Download,
  HelpCircle,
  Mail,
  Inbox,
  Wrench,
  GitPullRequest
} from 'lucide-react';
import DeepLinkHandler from '@/components/mobile/DeepLinkHandler';
import { APP_CONTEXT, canAccessPage } from '@/components/AppContext';
import ShopifyEmbeddedAuthGate from '@/components/shopify/ShopifyEmbeddedAuthGate';
import ShopifyNavMenu from '@/components/shopify/ShopifyNavMenu';

// Debug: log embedded entry decisions at the React layer
(function logEmbeddedEntry() {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search);
  const shop = p.get('shop');
  const embedded = p.get('embedded');
  if (shop || embedded) {
    console.log(
      `[ProfitShield Layout] ALLOWED embedded entry — shop=${shop || '-'} embedded=${embedded || '-'} path=${window.location.pathname}`
    );
  }
})();
import CookieConsent from '@/components/gdpr/CookieConsent';
import UpgradeButton from '@/components/subscription/UpgradeButton';
import CommandPalette, { CommandPaletteTrigger } from '@/components/ui/CommandPalette';
import AmbientHUD from '@/components/dashboard/AmbientHUD';
import HelpButton from '@/components/help/HelpButton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

// Debug panel visibility persistence key
const DEBUG_CLOSED_KEY = 'profitshield_debug_closed';
const DEBUG_CLOSED_TTL = 24 * 60 * 60 * 1000; // 24 hours

const navItems = [
  // Primary — highest merchant value
  { name: 'Dashboard', page: 'Home', icon: LayoutDashboard, permission: 'dashboard_view' },
  { name: 'AI Insights', page: 'AIInsights', icon: Brain, permission: 'dashboard_view' },
  { name: 'P&L Analytics', page: 'PnLAnalytics', icon: TrendingUp, permission: 'dashboard_view' },
  { name: 'Orders', page: 'Orders', icon: ShoppingCart, permission: 'orders_view' },
  { name: 'Risk Intelligence', page: 'Intelligence', icon: Shield, permission: 'risk_rules_view' },
  // Secondary
  { name: 'Customers', page: 'Customers', icon: Users, permission: 'customers_view' },
  { name: 'Products', page: 'Products', icon: Package, permission: 'products_view' },
  { name: 'Shipping', page: 'Shipping', icon: Truck, permission: 'orders_view' },
  { name: 'Tasks', page: 'Tasks', icon: ClipboardList, permission: 'alerts_view' },
  { name: 'Alerts', page: 'Alerts', icon: AlertTriangle, permission: 'alerts_view' },
  // System
  { name: 'Billing & Plan', page: 'Billing', icon: CreditCard, permission: 'dashboard_view' },
  { name: 'Integrations', page: 'Integrations', icon: Link2, permission: 'integrations_view' },
  { name: 'Help Center', page: 'HelpCenter', icon: HelpCircle, permission: 'dashboard_view' },
  { name: 'Email & Support', page: 'AdminEmailCenter', path: '/admin/email', icon: Mail, permission: 'settings_view', adminOnly: true },
  { name: 'Achievements', page: 'Achievements', icon: Gift, permission: 'dashboard_view' },
  { name: 'Referrals', page: 'Referrals', icon: Gift, permission: 'dashboard_view' },
  { name: 'Desktop App', page: 'Download', icon: Download, permission: 'dashboard_view' },
  { name: 'Audit Logs', page: 'AuditLogs', icon: ClipboardList, permission: 'audit_logs_view' },
  { name: 'System Health', page: 'SystemHealth', icon: LayoutDashboard, permission: 'system_health_view' },
  { name: 'Self-Healing Center', page: 'SelfHealingCenter', icon: Shield, permission: 'settings_manage', adminOnly: true },
  { name: 'Patch Review', page: 'PatchReview', icon: Wrench, permission: 'settings_manage', adminOnly: true },
  { name: 'Support Inbox', page: 'SupportInbox', icon: Inbox, permission: 'settings_manage', adminOnly: true },
  { name: 'Founder AI', page: 'FounderDashboard', icon: Brain, permission: 'settings_manage', adminOnly: true },
  { name: 'Video Jobs', page: 'VideoJobs', icon: Video, permission: 'dashboard_view', adminOnly: true },
  { name: 'App Listing', page: 'AppStoreListing', icon: Store, permission: 'settings_manage', adminOnly: true, adminBadge: true },
  { name: 'Reviewer Proof', page: 'ReviewerProof', icon: ShieldCheck, permission: 'settings_manage', adminOnly: true },
  { name: 'GitHub PRs', page: 'GitHubPullRequests', icon: GitPullRequest, permission: 'settings_manage', adminOnly: true },
  { name: 'Build Guide', page: 'NativeBuildGuide', icon: Download, permission: 'settings_manage', adminOnly: true },
  { name: 'Settings', page: 'Settings', icon: Settings, permission: 'settings_view' },
];

// Bypass layout for these pages (public-facing or special flow)
const bypassLayoutPages = ['Onboarding', 'ShopifyAuth', 'ShopifyCallback', 'SelectStore', 'Pricing'];

// Detect Shopify embedded from URL — used to short-circuit auth walls
function detectEmbedded() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return !!(p.get('shop') && (p.get('host') || p.get('embedded') === '1'));
}

// Safe admin check
function isUserAdmin(user) {
  if (!user) return false;
  const role = (user.app_role || user.role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

// Debug Panel with full trace visibility - 100% null-safe + memoized
const DebugPanel = React.memo(function DebugPanel({ resolver, userEmail, search }) {
  const [visible, setVisible] = React.useState(() => {
    // Check if user closed it recently (persist for 24h)
    try {
      const closed = localStorage.getItem(DEBUG_CLOSED_KEY);
      if (closed) {
        const closedAt = parseInt(closed, 10);
        if (Date.now() - closedAt < DEBUG_CLOSED_TTL) {
          return false;
        }
        localStorage.removeItem(DEBUG_CLOSED_KEY);
      }
    } catch (e) {}
    return true;
  });
  const [copied, setCopied] = React.useState(false);
  
  // Safe URL param parsing
  let urlParams = {};
  try {
    urlParams = parseQuery(search || '') || {};
  } catch (e) {
    urlParams = {};
  }
  
  // Safe persisted context
  let persisted = {};
  try {
    persisted = getPersistedContext() || {};
  } catch (e) {
    persisted = {};
  }
  
  // Only show debug panel for the app owner - never for marketplace users
  const showDebug = userEmail === 'rohan.a.roberts@gmail.com';
  
  const handleClose = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(DEBUG_CLOSED_KEY, String(Date.now()));
    } catch (e) {}
  }, []);
  
  const handleCopy = useCallback(async () => {
    try {
      const payload = {
        timestamp: new Date().toISOString(),
        route: window.location.pathname,
        search: window.location.search,
        resolver: {
          status: resolver?.status,
          tenantId: resolver?.tenantId ? `${resolver.tenantId.slice(0, 8)}...` : null,
          platform: resolver?.platform,
          storeKey: resolver?.storeKey,
          reason: resolver?.reason,
          trace: resolver?.trace
        },
        persisted,
        userEmail: userEmail ? maskEmail(userEmail) : null
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }, [resolver, persisted, userEmail]);
  
  if (!showDebug || !visible) return null;
  
  // Fully defensive resolver access
  const safeResolver = resolver || {};
  const trace = safeResolver.trace || { startedAt: null, finishedAt: null, chosenBy: null, steps: [] };
  const stores = Array.isArray(safeResolver.availableStores) ? safeResolver.availableStores : [];
  const steps = Array.isArray(trace.steps) ? trace.steps : [];
  
  // Safe duration calc
  let duration = '...';
  try {
    if (typeof trace.finishedAt === 'number' && typeof trace.startedAt === 'number') {
      duration = `${trace.finishedAt - trace.startedAt}ms`;
    }
  } catch (e) {
    duration = 'invalid';
  }
  
  // Safe date formatting
  let persistedAtDisplay = 'null';
  try {
    if (persisted.persistedAt) {
      persistedAtDisplay = new Date(persisted.persistedAt).toISOString();
    }
  } catch (e) {
    persistedAtDisplay = 'invalid';
  }
  
  return (
    <div className="fixed bottom-4 left-4 z-50 bg-slate-900 text-white text-xs p-3 rounded-lg shadow-lg max-w-md max-h-[60vh] overflow-auto">
      <div className="flex items-center gap-2 mb-2 border-b border-slate-700 pb-2">
        <Bug className="w-4 h-4 text-amber-400" />
        <span className="font-bold">Resolver Debug</span>
        <span className="ml-auto text-slate-500">{duration}</span>
        <button 
          onClick={handleCopy}
          className="ml-2 text-slate-400 hover:text-emerald-400 transition-colors"
          title="Copy debug info"
          aria-label="Copy debug information to clipboard"
        >
          {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
        <button 
          onClick={handleClose}
          className="text-slate-400 hover:text-white transition-colors"
          title="Close debug panel (hidden for 24h)"
          aria-label="Close debug panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="space-y-1 mb-3">
        <p>
          <span className="text-slate-400">Status:</span>{' '}
          <span className={
            safeResolver.status === RESOLVER_STATUS.RESOLVED ? 'text-green-400' :
            safeResolver.status === RESOLVER_STATUS.ERROR ? 'text-red-400' :
            safeResolver.status === RESOLVER_STATUS.NEEDS_SELECTION ? 'text-yellow-400' :
            'text-blue-400'
          }>{safeResolver.status || 'unknown'}</span>
        </p>
        <p><span className="text-slate-400">ChosenBy:</span> {trace.chosenBy || 'null'}</p>
        <p><span className="text-slate-400">Reason:</span> {safeResolver.reason || 'null'}</p>
        <p><span className="text-slate-400">Tenant:</span> {safeResolver.tenantId || 'null'}</p>
        <p><span className="text-slate-400">Platform:</span> {safeResolver.platform || 'null'}</p>
        <p><span className="text-slate-400">StoreKey:</span> <span className="truncate">{safeResolver.storeKey || 'null'}</span></p>
        <p><span className="text-slate-400">IntegrationId:</span> {safeResolver.integrationId || 'null'}</p>
        <p><span className="text-slate-400">Stores:</span> {stores.length}</p>
      </div>
      
      <div className="border-t border-slate-700 pt-2 mb-2">
        <p className="text-slate-400 mb-1">Persisted Context:</p>
        <p className="truncate"><span className="text-slate-500">platform:</span> {persisted.platform || 'null'}</p>
        <p className="truncate"><span className="text-slate-500">storeKey:</span> {persisted.storeKey || 'null'}</p>
        <p className="truncate"><span className="text-slate-500">tenantId:</span> {persisted.tenantId || 'null'}</p>
        <p className="truncate"><span className="text-slate-500">persistedAt:</span> {persistedAtDisplay}</p>
      </div>
      
      {steps.length > 0 && (
        <div className="border-t border-slate-700 pt-2">
          <p className="text-slate-400 mb-1">Trace ({steps.length} steps):</p>
          <div className="space-y-1 max-h-32 overflow-auto">
            {steps.map((step, i) => (
              <p key={i} className={step?.ok ? 'text-slate-300' : 'text-red-400'}>
                {step?.ok ? '✓' : '✗'} {step?.step || 'unknown'} {step?.note ? `- ${step.note}` : ''}
              </p>
            ))}
          </div>
        </div>
      )}
      
      {/* Self-test section - Lazy loaded */}
      <div className="border-t border-slate-700 pt-2 mt-2">
        <React.Suspense fallback={<p className="text-xs text-slate-500">Loading test...</p>}>
          <ResolverSelfTest />
        </React.Suspense>
      </div>
    </div>
  );
});

// Memoized nav items filtering
const useFilteredNavItems = (hasPermission, isAdmin, userRole) => {
  return useMemo(() => {
    return navItems.filter(item => {
      // Permission check
      if (item.permission && typeof hasPermission === 'function' && !hasPermission(item.permission)) {
        return false;
      }
      // Admin-only items require BOTH adminOnly flag AND admin role
      if (item.adminOnly && !isAdmin) {
        return false;
      }
      // APP_CONTEXT + role guard: internal-only pages hidden in shopify_public OR for non-admins
      if (!canAccessPage(item.page, userRole || 'user', APP_CONTEXT)) {
        return false;
      }
      return true;
    });
  }, [hasPermission, isAdmin, userRole]);
};

function LayoutContent({ children, currentPageName, resolver = {} }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingAlerts, setPendingAlerts] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Safe permissions
  const permissionsData = usePermissions() || {};
  const { hasPermission = () => true, role = null, user: permUser = null } = permissionsData;
  
  // Platform resolver - single source of truth
  const resolverCheck = requireResolved(resolver || {});
  
  // ONLY use resolverCheck for gated data - these are the authoritative values
  const isResolved = resolverCheck.ok;
  const authTenantId = resolverCheck.tenantId;
  const authIntegrationId = resolverCheck.integrationId;
  
  // Raw resolver values ONLY for display when resolved
  const status = resolver.status || RESOLVER_STATUS.RESOLVING;
  const user = resolver.user || null;
  const stores = Array.isArray(resolver.availableStores) ? resolver.availableStores : [];
  
  // Derived values needed for hooks
  const activeUser = user || permUser;
  const isAdmin = isUserAdmin(activeUser);

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // Memoized nav items
  const userRole = activeUser?.role || activeUser?.app_role || 'user';
  const filteredNavItems = useFilteredNavItems(hasPermission, isAdmin, userRole);
  
  // Memoized handlers
  const handleLogoutMemo = useCallback(() => {
    try {
      base44.auth.logout();
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/';
    }
  }, []);
  
  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleSidebarOpen = useCallback(() => setSidebarOpen(true), []);

  // Load alerts with useCallback to prevent recreation on every render
  const loadAlerts = useCallback(async (tid) => {
    if (!tid) return;
    try {
      const alerts = await base44.entities.Alert.filter({ 
        tenant_id: tid, 
        status: 'pending' 
      });
      setPendingAlerts(Array.isArray(alerts) ? alerts.length : 0);
    } catch (e) {
      console.warn('[Layout] Error loading alerts:', e.message);
      setPendingAlerts(0);
    }
  }, []);

  const loadSupportUnread = useCallback(async () => {
    try {
      const rows = await base44.entities.SupportConversation.filter({}, '-created_date', 300);
      const unread = (rows || []).filter((c) => c.status === 'open' || c.needs_owner_attention).length;
      setSupportUnread(unread);
    } catch (e) {
      console.warn('[Layout] Error loading support unread count:', e.message);
      setSupportUnread(0);
    }
  }, []);

  // Load alerts ONLY when resolved and tenantId is valid
  useEffect(() => {
    if (isResolved && authTenantId) {
      loadAlerts(authTenantId);
    } else {
      setPendingAlerts(0);
    }
  }, [isResolved, authTenantId, loadAlerts]);

  useEffect(() => {
    if (isAdmin) {
      loadSupportUnread();
      const t = setInterval(loadSupportUnread, 30000);
      return () => clearInterval(t);
    }
    setSupportUnread(0);
  }, [isAdmin, loadSupportUnread]);

  // Safe redirect to SelectStore — NEVER redirect Shopify install flows
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const isShopifyInstall = urlParams.get('shop') || urlParams.get('hmac') || urlParams.get('embedded');
    
    if (status === RESOLVER_STATUS.NEEDS_SELECTION && currentPageName !== 'SelectStore' && !isShopifyInstall) {
      const returnPath = encodeURIComponent(currentPageName || 'Home');
      const base = createPageUrl('SelectStore', location.search);
      const joiner = base.includes('?') ? '&' : '?';
      navigate(`${base}${joiner}return=${returnPath}`);
    }
  }, [status, currentPageName, navigate, location.search]);

  // ============= EARLY RETURNS AFTER ALL HOOKS =============
  
  // Bypass layout for certain pages (defined at top of file)
  if (bypassLayoutPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  // In embedded mode, hold the loading screen while gate is authenticating.
  // This prevents any auth redirect or login screen from flashing.
  const isEmbedded = detectEmbedded();
  if (status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 animate-pulse" style={{boxShadow:'0 0 30px rgba(99,102,241,0.4)'}}>
            <Shield className="w-6 h-6 text-white" />
          </div>
          <p className="text-slate-500 text-sm">
            {isEmbedded ? 'Connecting to Shopify...' : 'Initializing ProfitShield AI...'}
          </p>
        </div>
      </div>
    );
  }

  // In embedded mode with ERROR/NEEDS_SELECTION, still render the app shell.
  // The ShopifyEmbeddedAuthGate has already handled any auth errors with its
  // Shopify-branded UI. Don't redirect to login or SelectStore.
  if (isEmbedded && (status === RESOLVER_STATUS.ERROR || status === RESOLVER_STATUS.NEEDS_SELECTION)) {
    // Suppress the NEEDS_SELECTION redirect (handled in useEffect below via isShopifyInstall check)
    // Just fall through to render the app shell with the available context.
  }

  // Only show banner on pages that actually require store data
  const storeRequiredPages = ['Home', 'Orders', 'Products', 'Customers', 'Shipping', 'Intelligence', 'Alerts', 'Tasks', 'PnLAnalytics'];
  const showMissingContextBanner = storeRequiredPages.includes(currentPageName) && !isResolved && 
    (status === RESOLVER_STATUS.ERROR || status === RESOLVER_STATUS.NEEDS_SELECTION);
  
  // Store info - only display when resolved
  const storeDisplayName = isResolved && resolver.integration?.store_name 
    ? resolver.integration.store_name 
    : isResolved && resolver.tenant?.shop_name 
    ? resolver.tenant.shop_name 
    : isResolved && resolver.storeKey 
    ? resolver.storeKey 
    : null;
  const platformDisplay = isResolved ? resolver.platform : null;
  const subscriptionTier = isResolved && resolver.tenant?.subscription_tier ? resolver.tenant.subscription_tier : null;
  const profitScore = isResolved && resolver.tenant?.profit_integrity_score ? resolver.tenant.profit_integrity_score : null;

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Shopify App Bridge Navigation Menu */}
      {detectEmbedded() && isResolved && (
        <ShopifyNavMenu isAdmin={isAdmin} />
      )}

      {/* Command Palette */}
      <CommandPalette />

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64
        bg-slate-950/95 backdrop-blur-2xl border-r border-white/5
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-white/5">
            <Link to={createPageUrl('Home', location.search)} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-500 rounded-lg flex items-center justify-center shadow-lg" style={{boxShadow:'0 0 20px rgba(99,102,241,0.4)'}}>
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">ProfitShield</span>
            </Link>
            <button 
              onClick={handleSidebarClose}
              className="lg:hidden p-1 hover:bg-slate-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Store Info - only when resolved */}
          {isResolved && storeDisplayName ? (
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs text-slate-500 uppercase tracking-wide tracking-widest mb-1">Store</p>
              <p className="text-sm font-semibold text-slate-100 truncate" style={{textShadow:'0 0 12px rgba(129,140,248,0.3)'}}>
                {storeDisplayName}
              </p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {platformDisplay && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{
                      background: 'rgba(149,196,105,0.15)',
                      border: '1px solid rgba(149,196,105,0.35)',
                      color: '#a8d982',
                      textShadow: '0 0 8px rgba(149,196,105,0.4)'
                    }}>
                    {platformDisplay}
                  </span>
                )}
                {subscriptionTier && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{
                      background: 'rgba(251,191,36,0.12)',
                      border: '1px solid rgba(251,191,36,0.3)',
                      color: '#fcd34d',
                      textShadow: '0 0 8px rgba(251,191,36,0.35)'
                    }}>
                    {subscriptionTier}
                  </span>
                )}
                {profitScore && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{
                      background: 'rgba(52,211,153,0.12)',
                      border: '1px solid rgba(52,211,153,0.3)',
                      color: '#6ee7b7',
                      textShadow: '0 0 8px rgba(52,211,153,0.35)'
                    }}>
                    <TrendingUp className="w-3 h-3" />
                    {profitScore}
                  </span>
                )}
              </div>
            </div>
          ) : !isResolved && (
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Store</p>
              <p className="text-sm text-slate-500">No store selected</p>
              <Link 
                to={createPageUrl('Integrations', location.search)}
                className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 inline-flex items-center gap-1 transition-colors"
              >
                <Store className="w-3 h-3" />
                Connect Store
              </Link>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" role="navigation" aria-label="Main navigation">
            {filteredNavItems.map((item) => {
              const isActive = currentPageName === item.page;
              const Icon = item.icon;
              return (
                <Link
                  key={item.page}
                  to={item.path || createPageUrl(item.page, location.search)}
                  onClick={handleSidebarClose}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-150
                    ${isActive
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                    }
                  `}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} aria-hidden="true" />
                  {item.name}
                  {item.adminBadge && (
                    <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(129,140,248,0.35)', color: '#a5b4fc' }}>
                      ADMIN
                    </span>
                  )}
                  {item.page === 'Alerts' && pendingAlerts > 0 && (
                    <Badge className="ml-auto bg-red-500/90 text-white text-xs px-1.5 py-0.5" aria-label={`${pendingAlerts} pending alerts`}>
                      {pendingAlerts}
                    </Badge>
                  )}
                  {item.page === 'AdminEmailCenter' && supportUnread > 0 && (
                    <Badge className="ml-auto bg-indigo-500/90 text-white text-xs px-1.5 py-0.5" aria-label={`${supportUnread} unread support messages`}>
                      {supportUnread}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Legal Footer Links */}
          <div className="px-4 py-2 flex flex-wrap gap-x-3 border-t border-white/5">
            <Link to={createPageUrl('PrivacyPolicy', location.search)} className="text-xs text-slate-600 hover:text-indigo-400 transition-colors">Privacy</Link>
            <Link to={createPageUrl('TermsOfService', location.search)} className="text-xs text-slate-600 hover:text-indigo-400 transition-colors">Terms</Link>
            <Link to={createPageUrl('CookiePolicy', location.search)} className="text-xs text-slate-600 hover:text-indigo-400 transition-colors">Cookies</Link>
          </div>

          {/* User Menu */}
          {activeUser && (
            <div className="p-4 border-t border-white/5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow:'0 0 12px rgba(99,102,241,0.35)'}}>
                      <span className="text-sm font-semibold text-white">
                        {(activeUser.full_name || activeUser.email || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">
                        {activeUser.full_name || 'User'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{activeUser.email || ''}</p>
                      {role && (
                        <span className="inline-block text-xs font-medium px-1.5 py-0 rounded mt-0.5 capitalize"
                          style={{
                            background:'rgba(99,102,241,0.18)',
                            border:'1px solid rgba(129,140,248,0.35)',
                            color:'#a5b4fc',
                            textShadow:'0 0 8px rgba(129,140,248,0.5)'
                          }}>
                          {role}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                            <Link to={createPageUrl('Settings', location.search)}>
                              <Settings className="w-4 h-4 mr-2" />
                              Settings
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={createPageUrl('Pricing', location.search)}>
                              <CreditCard className="w-4 h-4 mr-2" />
                              Upgrade Plan
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogoutMemo} className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-slate-950/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-4 lg:px-6">
          <button 
            onClick={handleSidebarOpen}
            className="lg:hidden p-2 hover:bg-slate-100 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center gap-4 lg:ml-4">
            <ResolverHealthIndicator />
            {/* StoreSwitcher only when RESOLVED and multiple stores */}
            {isResolved && stores.length > 1 && <StoreSwitcher />}
            {/* Command Palette trigger */}
            <CommandPaletteTrigger />
            {/* Ambient HUD */}
            <AmbientHUD metrics={{}} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Upgrade Button */}
            {activeUser && <UpgradeButton userId={activeUser.id} />}

            {/* Desktop Download */}
            <Link to={createPageUrl('Download', location.search)}>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
                aria-label="Download Desktop App"
              >
                <Store className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Desktop</span>
              </Button>
            </Link>

            {/* Sync Status */}
            <SyncStatusIndicator compact />

            {/* Language Selector */}
            <LanguageSelector />

            {/* Notification Settings */}
            <NotificationSettingsButton />

            {/* Alerts */}
            <Link to={createPageUrl('Alerts', location.search)}>
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                aria-label={pendingAlerts > 0 ? `View ${pendingAlerts} pending alerts` : 'View alerts'}
              >
                <Bell className="w-5 h-5" />
                {pendingAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center" aria-hidden="true">
                    {pendingAlerts > 9 ? '9+' : pendingAlerts}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 min-h-screen bg-slate-950">
          {showMissingContextBanner && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 backdrop-blur-sm p-4 text-sm text-amber-300" role="alert">
              <p className="font-medium mb-1 text-amber-200">No Store Connected</p>
              <p className="text-amber-400/80">Connect a store to unlock intelligent profit analytics.</p>
              <Button
                size="sm"
                className="mt-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30"
                onClick={() => navigate(createPageUrl('Integrations', location.search))}
              >
                Connect Store
              </Button>
            </div>
          )}
          {children}
        </main>

        {/* MerchantAI Chat - DEFERRED: only when resolved + lazy loaded */}
        {isResolved && authTenantId && activeUser && (
          <ErrorBoundary fallback={null}>
            <React.Suspense fallback={null}>
              <MerchantAIChat 
                tenantId={authTenantId} 
                currentPage={currentPageName || 'Home'}
              />
            </React.Suspense>
          </ErrorBoundary>
        )}
      </div>

      {/* Debug Panel */}
      <DebugPanel 
        resolver={resolver} 
        userEmail={activeUser?.email} 
        search={location.search}
      />

      {/* Floating Help Button */}
      <HelpButton />

      {/* PWA Install Prompt */}
      {activeUser && <InstallPrompt userId={activeUser.id} />}
      
      {/* Mobile App Banner */}
      <MobileAppBanner />
      
      {/* Offline Indicator */}
      <OfflineIndicator />

      {/* Deep Link Handler */}
      <DeepLinkHandler />

      {/* GDPR Cookie Consent */}
      <CookieConsent />
    </div>
  );
}

// Error boundary for chat
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('Component error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Wrapper that captures resolver context for error boundary
function LayoutWithErrorBoundary({ children, currentPageName }) {
  // Get resolver to pass to error boundary
  const resolver = usePlatformResolver() || {};
  
  // Build context for error boundary
  const resolverContext = useMemo(() => ({
    status: resolver.status,
    platform: resolver.platform,
    storeKey: resolver.storeKey,
    tenantId: resolver.tenantId,
    integrationId: resolver.integrationId,
    userEmail: resolver.user?.email,
    trace: resolver.trace
  }), [resolver.status, resolver.platform, resolver.storeKey, resolver.tenantId, resolver.integrationId, resolver.user?.email, resolver.trace]);
  
return (
  <GlobalErrorBoundary resolverContext={resolverContext}>
    <LayoutContent
      currentPageName={currentPageName}
      resolver={resolver}
    >
      {children}
    </LayoutContent>
  </GlobalErrorBoundary>
);
}

export default function Layout({ children, currentPageName }) {
  return (
    <SecurityHardeningLayer>
      <LanguageProvider>
        <PermissionsProvider>
          <NotificationProvider>
            {/* Shopify embedded auth must run BEFORE any login check */}
            <ShopifyEmbeddedAuthGate>
              <LayoutWithProviders currentPageName={currentPageName}>
                {children}
              </LayoutWithProviders>
            </ShopifyEmbeddedAuthGate>
          </NotificationProvider>
        </PermissionsProvider>
      </LanguageProvider>
    </SecurityHardeningLayer>
  );
}

function LayoutWithProviders({ children, currentPageName }) {
  const resolver = usePlatformResolver() || {};

  let authTenantId = null;
  let resolverContext = null;
  try {
    const resolverCheck = requireResolved(resolver);
    authTenantId = resolverCheck?.tenantId || null;
    resolverContext = {
      status: resolver.status,
      platform: resolver.platform,
      storeKey: resolver.storeKey,
      tenantId: resolver.tenantId,
      integrationId: resolver.integrationId,
      userEmail: resolver.user?.email,
    };
  } catch (e) {
    authTenantId = null;
  }

  // Initialize HealthAgent on mount
  useEffect(() => {
    healthAgent.init().catch(() => {});
  }, []);

  // Update HealthAgent context when resolver changes
  useEffect(() => {
    healthAgent.setResolverContext(resolverContext);
    healthAgent.setUserEmail(resolver?.user?.email || null);
  }, [resolverContext, resolver?.user?.email]);

  return (
    <SyncProvider tenantId={authTenantId}>
      <HealthErrorBoundary fallback={
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-md w-full rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-base font-semibold text-amber-900">Temporary app issue</h2>
            <p className="text-sm text-amber-800 mt-2">The UI recovered into safe mode. Please refresh to continue.</p>
          </div>
        </div>
      }>
        <LayoutWithErrorBoundary currentPageName={currentPageName}>
          {children}
        </LayoutWithErrorBoundary>
      </HealthErrorBoundary>

      {/* GLOBAL FRONTEND GUARDIAN — mounts once when tenant resolves */}
      {authTenantId && <FrontendGuardian authTenantId={authTenantId} userRole={resolver?.user?.role || resolver?.user?.app_role || 'user'} />}

      {/* PWA Install & Update Banners */}
      <InstallAppBanner />
      <UpdateAvailableBanner />
    </SyncProvider>
  );
}
