// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy } from 'react';
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
import { SyncProvider, SyncStatusIndicator, useSyncManager } from '@/components/pwa/SyncManager';
import { InstallAppBanner, UpdateAvailableBanner } from '@/components/pwa/ServiceWorkerRegistration';
import { healthAgent } from '@/components/health/HealthAgent';
import FrontendGuardian from '@/components/FrontendGuardian';
import { HealthErrorBoundary } from '@/components/health/HealthErrorBoundary';
import { LanguageProvider } from '@/components/i18n/LanguageContext';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import SeoMeta from '@/components/seo/SeoMeta';

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
import MobileDeepWrapper from '@/components/mobile/MobileDeepWrapper';
import { useDeviceProfile } from '@/components/mobile/DeviceDetector';
import { APP_CONTEXT, canAccessPage } from '@/components/AppContext';
import ShopifyEmbeddedAuthGate from '@/components/shopify/ShopifyEmbeddedAuthGate';
import ShopifyNavMenu from '@/components/shopify/ShopifyNavMenu';
import { invokeSupportGuardianSafe } from '@/lib/safeApi';

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

const MOBILE_NAV_LABELS = {
  Home: 'Home',
  Orders: 'Orders',
  Alerts: 'Alerts',
  Integrations: 'Apps',
  PnLAnalytics: 'P&L',
  AIInsights: 'AI'
};

function getMobileNavLabel(item) {
  if (!item?.page) return item?.name || '';
  return MOBILE_NAV_LABELS[item.page] || item.name?.split(' ')[0] || item.name || '';
}

// Shopify App Store-facing sidebar should stay focused on merchant runtime actions.
const SHOPIFY_PUBLIC_NAV_ALLOWLIST = new Set([
  'Home',
  'AIInsights',
  'PnLAnalytics',
  'Orders',
  'Intelligence',
  'Customers',
  'Products',
  'Shipping',
  'Tasks',
  'Alerts',
  'Billing',
  'Integrations',
  'HelpCenter',
  'Settings',
  // Owner/admin-only entry (still role-gated below)
  'AdminEmailCenter',
]);

// Bypass layout for these pages (public-facing or special flow)
const bypassLayoutPages = ['Onboarding', 'ShopifyAuth', 'ShopifyCallback', 'SelectStore', 'Pricing'];

// Detect Shopify embedded from URL — used to short-circuit auth walls
function detectEmbedded() {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get('shop') && (p.get('host') || p.get('embedded') === '1')) {
      return true;
    }
    const persisted = getPersistedContext(true);
    return persisted?.platform === 'shopify' && !!persisted?.tenantId;
  } catch {
    return false;
  }
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
      // Keep Shopify-public sidebar minimal and predictable.
      if (APP_CONTEXT === 'shopify_public' && !isAdmin && !SHOPIFY_PUBLIC_NAV_ALLOWLIST.has(item.page)) {
        return false;
      }
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
  const [isBottomNavHidden, setIsBottomNavHidden] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const device = useDeviceProfile();
  const mainScrollRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const alertsLoadTimerRef = useRef(null);
  const supportLoadTimerRef = useRef(null);
  const topBarHeight = device.isMobile ? '3.5rem' : '4rem';
  const syncManager = useSyncManager();
  
  // Safe permissions
  const permissionsData = usePermissions() || {};
  const { hasPermission = () => true, role: permissionRole = null, user: permUser = null } = permissionsData;
  
  // Platform resolver - single source of truth
  const resolverCheck = requireResolved(resolver || {});
  const isEmbedded = detectEmbedded();
  const persistedContext = getPersistedContext(true);
  
  // ONLY use resolverCheck for gated data - these are the authoritative values
  const isResolved = resolverCheck.ok;
  const authTenantId = resolverCheck.tenantId || persistedContext?.tenantId || null;
  const authIntegrationId = resolverCheck.integrationId;
  
  // Raw resolver values ONLY for display when resolved
  const status = resolver.status || RESOLVER_STATUS.RESOLVING;
  const user = resolver.user || null;
  const stores = Array.isArray(resolver.availableStores) ? resolver.availableStores : [];
  
  // Derived values needed for hooks
  const activeUser = user || permUser;
  const fallbackRole = String(permissionRole || '').toLowerCase();
  const isAdmin = isUserAdmin(activeUser) || fallbackRole === 'admin' || fallbackRole === 'owner';
  const roleLabel = typeof permissionRole === 'string' && permissionRole.trim()
    ? permissionRole
    : (activeUser?.app_role || activeUser?.role || '');
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // Memoized nav items
  const userRole = activeUser?.role || activeUser?.app_role || permissionRole || 'user';
  const filteredNavItems = useFilteredNavItems(hasPermission, isAdmin, userRole);
  const mobileQuickNav = useMemo(() => {
    const allowed = new Set(['Home', 'Orders', 'Alerts', 'Integrations']);
    return filteredNavItems.filter((item) => allowed.has(item.page)).slice(0, 4);
  }, [filteredNavItems]);
  const mobileMenuItems = filteredNavItems;
  const showPhoneQuickNav = device.isMobile && mobileQuickNav.length > 0;
  const menuAttentionCount = pendingAlerts + (isAdmin ? supportUnread : 0);

  
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
  const handleSidebarOpen = useCallback(() => setSidebarOpen((prev) => !prev), []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!showPhoneQuickNav) {
      setIsBottomNavHidden(false);
      lastScrollTopRef.current = 0;
    }
  }, [showPhoneQuickNav]);

  const handleMainScroll = useCallback((event) => {
    if (!showPhoneQuickNav) return;
    const target = event?.currentTarget;
    const currentTop = Number(target?.scrollTop || 0);
    const delta = currentTop - lastScrollTopRef.current;

    if (currentTop < 18) {
      setIsBottomNavHidden(false);
    } else if (delta > 8) {
      setIsBottomNavHidden(true);
    } else if (delta < -8) {
      setIsBottomNavHidden(false);
    }
    lastScrollTopRef.current = currentTop;
  }, [showPhoneQuickNav]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.deviceType = device.formFactor || device.className || 'desktop';
    document.documentElement.dataset.deviceKind = device.kind || 'desktop';
    document.documentElement.dataset.deviceInput = device.input || 'pointer';
    document.documentElement.dataset.viewportClass = device.viewportClass || 'large';
  }, [device.formFactor, device.className, device.kind, device.input, device.viewportClass]);

  // Fail-safe: keep document scrolling unlocked unless an explicit modal handles it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflowY;
    const prevBodyOverflow = body.style.overflowY;
    const prevBodyPosition = body.style.position;
    html.style.overflowY = 'auto';
    body.style.overflowY = 'auto';
    body.style.position = 'static';
    return () => {
      html.style.overflowY = prevHtmlOverflow;
      body.style.overflowY = prevBodyOverflow;
      body.style.position = prevBodyPosition;
    };
  }, []);

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

  const loadSupportUnread = useCallback(async (tid) => {
    if (!tid) {
      setSupportUnread(0);
      return;
    }
    try {
      if (isEmbedded) {
        const result = await invokeSupportGuardianSafe({
          action: 'run_watchdog',
          tenant_id: tid,
          observe_only: true,
          mode: 'observe'
        }, { attempts: 2, baseMs: 250 });
        const unread = Number(result?.data?.unread_count ?? result?.data?.open_count ?? 0);
        setSupportUnread(Number.isFinite(unread) ? unread : 0);
        return;
      }
      const rows = await base44.entities.SupportConversation.filter({ tenant_id: tid }, '-created_date', 300);
      const unread = (rows || []).filter((c) => c.status === 'open' || c.needs_owner_attention).length;
      setSupportUnread(unread);
    } catch (e) {
      console.warn('[Layout] Error loading support unread count:', e.message);
      setSupportUnread(0);
    }
  }, [isEmbedded]);

  // Load alerts ONLY when resolved and tenantId is valid
  useEffect(() => {
    if (alertsLoadTimerRef.current) {
      clearTimeout(alertsLoadTimerRef.current);
      alertsLoadTimerRef.current = null;
    }
    if (isEmbedded) {
      setPendingAlerts(0);
      return;
    }
    if (isResolved && authTenantId) {
      alertsLoadTimerRef.current = setTimeout(() => {
        loadAlerts(authTenantId);
        alertsLoadTimerRef.current = null;
      }, currentPageName === 'Home' ? 1200 : 350);
    } else {
      setPendingAlerts(0);
    }
    return () => {
      if (alertsLoadTimerRef.current) {
        clearTimeout(alertsLoadTimerRef.current);
        alertsLoadTimerRef.current = null;
      }
    };
  }, [isEmbedded, isResolved, authTenantId, loadAlerts, currentPageName]);

  useEffect(() => {
    if (supportLoadTimerRef.current) {
      clearTimeout(supportLoadTimerRef.current);
      supportLoadTimerRef.current = null;
    }
    if (isAdmin && authTenantId) {
      supportLoadTimerRef.current = setTimeout(() => {
        loadSupportUnread(authTenantId);
        supportLoadTimerRef.current = null;
      }, currentPageName === 'Home' ? 1800 : 500);
      const t = setInterval(() => loadSupportUnread(authTenantId), 30000);
      return () => {
        if (supportLoadTimerRef.current) {
          clearTimeout(supportLoadTimerRef.current);
          supportLoadTimerRef.current = null;
        }
        clearInterval(t);
      };
    }
    setSupportUnread(0);
  }, [isAdmin, authTenantId, loadSupportUnread, currentPageName]);

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

  // In embedded mode, if tenant context is already available, do not block first paint.
  // This avoids unnecessary spinner time before dashboard shell appears.
  const hasEmbeddedTenantContext = isEmbedded && !!authTenantId;
  if (status === RESOLVER_STATUS.RESOLVING && !hasEmbeddedTenantContext) {
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
    : persistedContext?.storeKey || persistedContext?.shop || null;
  const platformDisplay = isResolved ? resolver.platform : (persistedContext?.platform || (isEmbedded ? 'shopify' : null));
  const subscriptionTier = isResolved && resolver.tenant?.subscription_tier ? resolver.tenant.subscription_tier : null;
  const profitScore = isResolved && resolver.tenant?.profit_integrity_score ? resolver.tenant.profit_integrity_score : null;

  return (
    <div
      className={`future-grid min-h-screen bg-slate-950 overflow-x-hidden ${
        device.isMobile ? 'mobile-shell' : device.isTablet ? 'tablet-shell' : 'desktop-shell'
      }`}
      data-device={device.className}
      data-device-kind={device.kind}
      data-device-input={device.input}
      data-viewport-class={device.viewportClass}
      data-touch={device.isTouch ? '1' : '0'}
      data-embedded={device.isEmbedded ? '1' : '0'}
      style={{ '--ps-topbar-h': topBarHeight }}
    >
      <SeoMeta currentPageName={currentPageName} pathname={location.pathname} />
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

      {/* Desktop Sidebar */}
      <aside className={`
        command-surface hidden lg:flex fixed top-0 left-0 z-50 h-full w-64 max-w-[85vw] overflow-hidden
        bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(10,18,34,0.94))] border-r border-cyan-400/10 shadow-[0_18px_48px_rgba(2,6,23,0.42)]
        transform transition-transform duration-200 ease-in-out
        translate-x-0
      `}>
        <div className="relative flex h-full w-full flex-col">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-cyan-400/0 via-cyan-300/30 to-cyan-400/0" />
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-white/8">
            <Link to={createPageUrl('Home', location.search)} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[linear-gradient(135deg,#38bdf8,#818cf8,#34d399)] flex items-center justify-center shadow-[0_0_22px_rgba(56,189,248,0.28)]">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="block font-bold text-lg bg-gradient-to-r from-cyan-300 via-indigo-300 to-emerald-300 bg-clip-text text-transparent">ProfitShield</span>
                <span className="block text-[10px] uppercase tracking-[0.24em] text-slate-500">Command Surface</span>
              </div>
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
            <div className="px-4 py-3 border-b border-white/8">
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
            <div className="px-4 py-3 border-b border-white/8">
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
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" role="navigation" aria-label="Main navigation">
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
                      ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(129,140,248,0.14))] text-cyan-100 border border-cyan-400/20 shadow-[0_0_18px_rgba(56,189,248,0.10)]'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 border border-transparent'
                    }
                  `}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-300' : 'text-slate-500'}`} aria-hidden="true" />
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
          <div className="px-4 py-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/8">
            <Link to={createPageUrl('PrivacyPolicy', location.search)} className="text-xs text-slate-600 hover:text-cyan-300 transition-colors">Privacy</Link>
            <Link to={createPageUrl('TermsOfService', location.search)} className="text-xs text-slate-600 hover:text-cyan-300 transition-colors">Terms</Link>
            <Link to={createPageUrl('EndUserLicenseAgreement', location.search)} className="text-xs text-slate-600 hover:text-cyan-300 transition-colors">EULA</Link>
            <Link to={createPageUrl('CookiePolicy', location.search)} className="text-xs text-slate-600 hover:text-cyan-300 transition-colors">Cookies</Link>
            <Link to={createPageUrl('ComplianceNotice', location.search)} className="text-xs text-slate-600 hover:text-cyan-300 transition-colors">GDPR/CCPA</Link>
            <Link to={createPageUrl('RefundPolicy', location.search)} className="text-xs text-slate-600 hover:text-cyan-300 transition-colors">Refunds</Link>
          </div>

          {/* User Menu */}
          {activeUser && (
            <div className="p-4 border-t border-white/8">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 w-full px-3 py-2 rounded-xl border border-white/6 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
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
                      {roleLabel && (
                        <span className="inline-block text-xs font-medium px-1.5 py-0 rounded mt-0.5 capitalize"
                          style={{
                            background:'rgba(99,102,241,0.18)',
                            border:'1px solid rgba(129,140,248,0.35)',
                            color:'#a5b4fc',
                            textShadow:'0 0 8px rgba(129,140,248,0.5)'
                          }}>
                          {roleLabel}
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
      <div className="relative isolate min-h-screen flex flex-col overflow-x-hidden lg:ml-64">
        {/* Top bar */}
        <header className={`topbar-glow command-surface sticky top-0 z-30 ${device.isMobile ? 'h-14' : 'h-16'} bg-[linear-gradient(180deg,rgba(4,10,24,0.92),rgba(8,15,30,0.84))] border-b border-cyan-400/10 flex items-center justify-between px-3 sm:px-4 lg:px-5`}>
          <button 
            onClick={handleSidebarOpen}
            className={`lg:hidden relative inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              sidebarOpen
                ? 'border-indigo-400/40 bg-indigo-500/20 shadow-[0_0_18px_rgba(99,102,241,0.35)]'
                : 'border-white/15 bg-slate-900/70 hover:bg-slate-800 shadow-[0_0_10px_rgba(15,23,42,0.4)]'
            }`}
            aria-label="Open tab navigation menu"
            title="Open tab navigation"
          >
            <span className="sr-only">Open tab navigation</span>
            <span className="relative h-4 w-4">
              <span className={`absolute left-0 top-0 h-0.5 w-4 rounded bg-slate-100 transition-all duration-200 ${sidebarOpen ? 'translate-y-[6px] rotate-45' : ''}`} />
              <span className={`absolute left-0 top-[6px] h-0.5 w-4 rounded bg-slate-100 transition-all duration-200 ${sidebarOpen ? 'opacity-0' : 'opacity-100'}`} />
              <span className={`absolute left-0 top-3 h-0.5 w-4 rounded bg-slate-100 transition-all duration-200 ${sidebarOpen ? '-translate-y-[6px] -rotate-45' : ''}`} />
            </span>
            {menuAttentionCount > 0 && !sidebarOpen && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {menuAttentionCount > 9 ? '9+' : menuAttentionCount}
              </span>
            )}
          </button>

          <div className={`flex-1 min-w-0 flex items-center ${device.isMobile ? 'gap-1.5' : 'gap-2 sm:gap-4'} lg:ml-4`}>
            <ResolverHealthIndicator resolver={resolver} />
            {/* StoreSwitcher only when RESOLVED and multiple stores */}
            {isResolved && stores.length > 1 && <StoreSwitcher />}
            {/* Command Palette trigger */}
            <div className="hidden sm:block">
              <CommandPaletteTrigger />
            </div>
            {/* Ambient HUD */}
            <div className="hidden md:block">
              <AmbientHUD metrics={{}} />
            </div>
          </div>

          <div className={`flex items-center ${device.isMobile ? 'gap-1' : 'gap-1.5 sm:gap-3'}`}>
            {/* Upgrade Button */}
            {activeUser && <UpgradeButton userId={activeUser.id} />}

            {/* Desktop Download */}
            <Link to={createPageUrl('Download', location.search)} className="hidden sm:block">
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
            <div className="hidden md:block">
              <LanguageSelector />
            </div>

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

        {/* Mobile dropdown navigation panel */}
        {sidebarOpen && (
          <div className={`lg:hidden fixed ${device.isMobile ? 'top-14 left-2 right-2 max-h-[78vh]' : 'top-16 left-3 right-3 max-h-[72vh]'} z-50 rounded-2xl border border-cyan-400/12 bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(10,18,34,0.94))] backdrop-blur-2xl shadow-[0_20px_60px_rgba(2,6,23,0.7)] overflow-y-auto`}>
            <div className="sticky top-0 z-10 px-3 py-2 border-b border-white/10 bg-[linear-gradient(180deg,rgba(4,10,24,0.96),rgba(10,18,34,0.94))] backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Store</p>
              <p className="text-sm font-semibold text-slate-100 truncate">{storeDisplayName || 'No store selected'}</p>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                {platformDisplay && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                    {platformDisplay}
                  </span>
                )}
                {subscriptionTier && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border border-amber-400/30 bg-amber-500/10 text-amber-300">
                    {subscriptionTier}
                  </span>
                )}
                {roleLabel && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border border-indigo-400/30 bg-indigo-500/10 text-indigo-300 capitalize">
                    {roleLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="px-3 pt-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Core</p>
            </div>
            <nav className="p-2 space-y-1" role="navigation" aria-label="Mobile tab navigation">
              {mobileMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.page;
                return (
                  <Link
                    key={`dropdown-${item.page}`}
                    to={item.path || createPageUrl(item.page, location.search)}
                    onClick={handleSidebarClose}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive
                        ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(129,140,248,0.14))] text-cyan-100 border border-cyan-400/20'
                        : 'text-slate-300 hover:bg-white/[0.04] border border-transparent'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-300' : 'text-slate-500'}`} aria-hidden="true" />
                    {item.name}
                    {item.page === 'Alerts' && pendingAlerts > 0 && (
                      <Badge className="ml-auto bg-red-500/90 text-white text-xs px-1.5 py-0.5">
                        {pendingAlerts}
                      </Badge>
                    )}
                    {item.page === 'AdminEmailCenter' && supportUnread > 0 && (
                      <Badge className="ml-auto bg-indigo-500/90 text-white text-xs px-1.5 py-0.5">
                        {supportUnread}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Page content */}
        <main
          ref={mainScrollRef}
          onScroll={handleMainScroll}
          className={`future-grid flex-1 ${device.isMobile ? 'px-2 pt-0' : device.isTablet ? 'px-2.5 pt-0' : 'px-2.5 pt-0 lg:px-3 lg:pt-0'} ${showPhoneQuickNav ? 'pb-24' : 'pb-4'} bg-transparent overflow-x-hidden overflow-y-auto`}
          style={{ height: 'calc(100dvh - var(--ps-topbar-h, 4rem))' }}
          role="main"
          aria-label="App content"
        >
          <MobileDeepWrapper>
          <div className="page-canvas relative z-[1] -mt-5 px-2 pb-0.5 pt-0 sm:px-2.5 sm:pb-1 sm:pt-0 lg:px-3 lg:pb-1 lg:pt-0">
            <div className="orbital-ring -left-16 top-3 hidden h-24 w-24 opacity-15 lg:block" />
            <div className="orbital-ring right-6 top-4 hidden h-14 w-14 opacity-10 xl:block" />
            <div className="space-y-1.5">
              <div className="-mx-2 -mt-px sm:-mx-2.5 lg:-mx-3">
                <MerchantUtilityBanner
                  authTenantId={authTenantId}
                  currentPageName={currentPageName}
                  isEmbedded={isEmbedded}
                  locationSearch={location.search}
                  storeDisplayName={storeDisplayName}
                  platformDisplay={platformDisplay}
                  subscriptionTier={subscriptionTier}
                  syncManager={syncManager}
                />
              </div>
              {showMissingContextBanner && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 backdrop-blur-sm p-4 text-sm text-amber-300" role="alert">
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
            </div>
            <div className="mt-0.5">
              {children}
            </div>
          </div>
          </MobileDeepWrapper>
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

      {showPhoneQuickNav && (
        <nav
          className={`fixed left-1/2 z-40 w-[min(96vw,430px)] -translate-x-1/2 lg:hidden transition-transform duration-200 ${
            isBottomNavHidden ? 'translate-y-24' : 'translate-y-0'
          }`}
          style={{ bottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
          role="navigation"
          aria-label="Mobile quick navigation"
        >
          <ul className="grid grid-cols-4 rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(2,6,23,0.65)]">
            {mobileQuickNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.page;
              return (
                <li key={`mobile-${item.page}`}>
                  <Link
                    to={item.path || createPageUrl(item.page, location.search)}
                    className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] ${
                      isActive ? 'text-indigo-300' : 'text-slate-400'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-300' : 'text-slate-500'}`} aria-hidden="true" />
                    <span className="truncate max-w-[64px]">{getMobileNavLabel(item)}</span>
                    {isActive && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)]" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {/* Debug Panel */}
      <DebugPanel 
        resolver={resolver} 
        userEmail={activeUser?.email} 
        search={location.search}
      />

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

function MerchantUtilityBanner({
  authTenantId,
  isEmbedded,
  locationSearch,
  platformDisplay,
  subscriptionTier,
  syncManager,
}) {
  const hasStore = !!authTenantId;
  const syncStatus = syncManager?.syncStatus || 'idle';
  const syncing = syncStatus === 'syncing';
  const syncLabel = syncing
    ? 'Sync engine live'
    : syncStatus === 'error'
      ? 'Recovery active'
      : syncStatus === 'offline'
        ? 'Offline safe mode'
        : 'Live sync ready';
  const statusGlow = syncing
    ? 'from-cyan-400/50 via-cyan-300/20 to-transparent'
    : syncStatus === 'error'
      ? 'from-amber-400/45 via-amber-300/20 to-transparent'
      : syncStatus === 'offline'
        ? 'from-slate-400/35 via-slate-300/10 to-transparent'
        : 'from-emerald-400/50 via-emerald-300/20 to-transparent';
  const slides = useMemo(() => {
    if (!hasStore) {
      return [
        {
          id: 'connect',
          icon: Link2,
          eyebrow: 'Launch faster',
          title: 'Connect your store and unlock autonomous sync',
          blurb: 'Activate live orders, AI insights, and protection flows in one move.',
          accent: 'from-emerald-400/22 via-cyan-400/10 to-transparent',
          stats: ['1-click setup', 'Live telemetry', 'Guided onboarding'],
          ctaLabel: isEmbedded ? 'Connect store' : 'Connect platform',
          ctaPage: 'Integrations',
        }
      ];
    }

    return [
      {
        id: 'ai',
        icon: Brain,
        eyebrow: 'AI Growth',
        title: 'See the segments, leaks, and campaigns shaping your next move',
        blurb: 'Turn customer behavior into fast actions from one intelligence surface.',
        accent: 'from-violet-400/22 via-cyan-400/10 to-transparent',
        stats: ['Customer Segments', 'Profit Leak Forensics', 'Campaign ideas'],
        ctaLabel: 'Open AI Insights',
        ctaPage: 'AIInsights',
      },
      {
        id: 'pnl',
        icon: TrendingUp,
        eyebrow: 'Profit Command',
        title: 'Track margin movement before it turns into a cash problem',
        blurb: 'Spot profitability shifts, order risk, and cost pressure earlier.',
        accent: 'from-emerald-400/22 via-cyan-400/10 to-transparent',
        stats: ['Margin radar', 'P&L analytics', 'AI order analysis'],
        ctaLabel: 'Open P&L',
        ctaPage: 'PnLAnalytics',
      },
      {
        id: 'orders',
        icon: ShoppingCart,
        eyebrow: 'Order Control',
        title: 'Keep order flow clean with faster sync, queue repair, and live detail',
        blurb: 'Move from ingestion to action without hunting across multiple pages.',
        accent: 'from-cyan-400/22 via-indigo-400/10 to-transparent',
        stats: ['Live order view', syncLabel, 'Autonomous repair'],
        ctaLabel: 'Open Orders',
        ctaPage: 'Orders',
      },
      {
        id: 'integrations',
        icon: Link2,
        eyebrow: 'Automation Mesh',
        title: 'Expand beyond Shopify with integrations that keep data moving',
        blurb: 'Connect platforms, refresh webhooks, and keep the app learning continuously.',
        accent: 'from-amber-400/20 via-cyan-400/10 to-transparent',
        stats: ['Webhook health', 'Store ops', 'Always-on sync'],
        ctaLabel: 'Open Integrations',
        ctaPage: 'Integrations',
      },
    ];
  }, [hasStore, isEmbedded, syncLabel]);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4800);
    return () => window.clearInterval(interval);
  }, [slides.length]);

  useEffect(() => {
    setActiveSlide((current) => Math.min(current, slides.length - 1));
  }, [slides.length]);

  const activeCard = slides[activeSlide] || slides[0];
  const ActiveIcon = activeCard?.icon || Shield;
  const previewSlides = slides
    .filter((slide) => slide.id !== activeCard?.id)
    .slice(0, 2);

  return (
    <div className="px-0 pb-0 pt-0">
      <div className="merchant-banner-flow command-surface relative overflow-hidden rounded-[1.05rem] border-cyan-400/10 bg-[linear-gradient(90deg,rgba(4,10,24,0.97),rgba(8,18,34,0.94)_42%,rgba(6,14,27,0.97))] px-3 py-1">
        <div className={`pointer-events-none absolute inset-y-0 left-0 w-44 bg-gradient-to-r ${statusGlow}`} />
        <div className={`pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r ${activeCard?.accent || 'from-cyan-400/16 via-indigo-400/8 to-transparent'} opacity-60`} />
        <div className="merchant-banner-orb pointer-events-none absolute inset-y-0 right-0 hidden w-64 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.16),transparent_65%)] lg:block" />
        <div className="relative grid gap-1.5 lg:grid-cols-[minmax(0,1.45fr)_minmax(220px,0.55fr)] lg:items-center">
          <div className="grid min-w-0 gap-1.5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="flex min-w-0 items-center gap-3 rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2">
              <div className="merchant-banner-pulse flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(34,211,238,0.22),rgba(99,102,241,0.32))] shadow-[0_0_24px_rgba(56,189,248,0.18)]">
                <ActiveIcon className="h-4.5 w-4.5 text-cyan-100" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="future-badge inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                    {activeCard?.eyebrow || 'Merchant lane'}
                  </span>
                  {platformDisplay && (
                    <span className="future-badge inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
                      {platformDisplay}
                    </span>
                  )}
                  {subscriptionTier && (
                    <span className="future-badge inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-100">
                      {subscriptionTier}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-sm font-semibold text-slate-100">
                  {activeCard?.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
                  {activeCard?.blurb}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
              {(activeCard?.stats || []).map((stat) => (
                <span
                  key={stat}
                  className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200"
                >
                  {stat}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 lg:items-end">
            <div className="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:justify-end">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 lg:w-[240px] lg:flex-none">
                {previewSlides.map((slide, index) => {
                  const PreviewIcon = slide.icon;
                  return (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setActiveSlide(slides.findIndex((item) => item.id === slide.id))}
                      className="group rounded-[0.85rem] border border-white/8 bg-white/[0.028] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.055]"
                      aria-label={`Show ${slide.title}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-slate-100">
                          <PreviewIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            Queue {String(index + 1).padStart(2, '0')}
                          </p>
                          <p className="truncate text-[11px] font-medium text-slate-200 group-hover:text-white">
                            {slide.eyebrow}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Link to={createPageUrl(activeCard?.ctaPage || 'Home', locationSearch)}>
                <Button size="sm" className="h-9 min-w-[138px] rounded-xl bg-cyan-500/16 px-3.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/24">
                  {activeCard?.ctaLabel || 'Open'}
                </Button>
              </Link>
              {hasStore && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => syncManager?.triggerSync?.()}
                  disabled={syncing || syncStatus === 'offline'}
                  className="h-9 rounded-xl border border-white/10 px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.05]"
                >
                  {syncing ? 'Syncing…' : 'Refresh'}
                </Button>
              )}
            </div>

            {slides.length > 1 && (
              <div className="flex items-center gap-1.5 lg:justify-end">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setActiveSlide(index)}
                    className={`h-1.5 rounded-full transition-all ${index === activeSlide ? 'w-8 bg-cyan-300' : 'w-3 bg-white/20 hover:bg-white/35'}`}
                    aria-label={`Show ${slide.eyebrow}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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
function LayoutWithErrorBoundary({ children, currentPageName, resolver = {} }) {
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
        <LayoutWithErrorBoundary currentPageName={currentPageName} resolver={resolver}>
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
