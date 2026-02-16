import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl, parseQuery, getPersistedContext } from '@/components/platformContext';
import { usePlatformResolver, RESOLVER_STATUS, requireResolved } from '@/components/usePlatformResolver';
import { PermissionsProvider, usePermissions } from '@/components/usePermissions';
import StoreSwitcher from '@/components/StoreSwitcher';
import ResolverHealthIndicator from '@/components/ResolverHealthIndicator';
import MerchantAIChat from '@/components/merchant/MerchantAIChat';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  AlertTriangle,
  Settings,
  Shield,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Bell,
  TrendingUp,
  Users,
  ClipboardList,
  Link2,
  Loader2,
  Brain,
  Bug,
  Store
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { name: 'Dashboard', page: 'Home', icon: LayoutDashboard, permission: 'dashboard_view' },
  { name: 'P&L Analytics', page: 'PnLAnalytics', icon: TrendingUp, permission: 'dashboard_view' },
  { name: 'Orders', page: 'Orders', icon: ShoppingCart, permission: 'orders_view' },
  { name: 'Products', page: 'Products', icon: Package, permission: 'products_view' },
  { name: 'Customers', page: 'Customers', icon: Users, permission: 'customers_view' },
  { name: 'Shipping', page: 'Shipping', icon: Truck, permission: 'orders_view' },
  { name: 'Risk Intelligence', page: 'Intelligence', icon: Shield, permission: 'risk_rules_view' },
  { name: 'Tasks', page: 'Tasks', icon: ClipboardList, permission: 'alerts_view' },
  { name: 'Alerts', page: 'Alerts', icon: AlertTriangle, permission: 'alerts_view' },
  { name: 'Integrations', page: 'Integrations', icon: Link2, permission: 'integrations_view' },
  { name: 'Audit Logs', page: 'AuditLogs', icon: ClipboardList, permission: 'audit_logs_view' },
  { name: 'System Health', page: 'SystemHealth', icon: LayoutDashboard, permission: 'system_health_view' },
  { name: 'Founder AI', page: 'FounderDashboard', icon: Brain, permission: 'settings_manage', adminOnly: true },
  { name: 'Settings', page: 'Settings', icon: Settings, permission: 'settings_view' },
];

// Safe admin check
function isUserAdmin(user) {
  if (!user) return false;
  const role = (user.app_role || user.role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

// Debug Panel with full trace visibility - 100% null-safe
function DebugPanel({ resolver, userEmail, search }) {
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
  
  const showDebug = urlParams.debug === '1' || userEmail === 'rohan.a.roberts@gmail.com';
  if (!showDebug) return null;
  
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
    </div>
  );
}

function LayoutContent({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingAlerts, setPendingAlerts] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Safe permissions
  const permissionsData = usePermissions() || {};
  const { hasPermission = () => true, role = null, user: permUser = null } = permissionsData;
  
  // Platform resolver - single source of truth
  const resolver = usePlatformResolver() || {};
  const resolverCheck = requireResolved(resolver);
  
  // ONLY use resolverCheck for gated data - these are the authoritative values
  const isResolved = resolverCheck.ok;
  const authTenantId = resolverCheck.tenantId;
  const authIntegrationId = resolverCheck.integrationId;
  
  // Raw resolver values ONLY for display when resolved
  const status = resolver.status || RESOLVER_STATUS.RESOLVING;
  const user = resolver.user || null;
  const stores = Array.isArray(resolver.availableStores) ? resolver.availableStores : [];

  // Load alerts ONLY when resolved and tenantId is valid
  useEffect(() => {
    if (isResolved && authTenantId) {
      loadAlerts(authTenantId);
    } else {
      setPendingAlerts(0);
    }
  }, [isResolved, authTenantId]);

  const loadAlerts = async (tid) => {
    if (!tid) return;
    try {
      const alerts = await base44.entities.Alert.filter({ 
        tenant_id: tid, 
        status: 'pending' 
      });
      setPendingAlerts(Array.isArray(alerts) ? alerts.length : 0);
    } catch (e) {
      console.warn('Error loading alerts:', e.message);
      setPendingAlerts(0);
    }
  };

  // Safe redirect to SelectStore
  useEffect(() => {
    if (status === RESOLVER_STATUS.NEEDS_SELECTION && currentPageName !== 'SelectStore') {
      const returnPath = encodeURIComponent(currentPageName || 'Home');
      const base = createPageUrl('SelectStore', location.search);
      const joiner = base.includes('?') ? '&' : '?';
      navigate(`${base}${joiner}return=${returnPath}`);
    }
  }, [status, currentPageName, navigate, location.search]);

  const handleLogout = () => {
    try {
      base44.auth.logout();
    } catch (e) {
      console.error('Logout error:', e);
      window.location.href = '/';
    }
  };

  // Bypass layout for certain pages
  const bypassLayoutPages = ['Onboarding', 'ShopifyAuth', 'ShopifyCallback', 'SelectStore'];
  if (bypassLayoutPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  // Loading state
  if (status === RESOLVER_STATUS.RESOLVING) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  const showMissingContextBanner = status === RESOLVER_STATUS.ERROR;
  const activeUser = user || permUser;
  const isAdmin = isUserAdmin(activeUser);
  
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
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-slate-200
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-slate-200">
            <Link to={createPageUrl('Home', location.search)} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-slate-900">ProfitShield</span>
            </Link>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Store Info - only when resolved */}
          {isResolved && storeDisplayName ? (
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Store</p>
              <p className="text-sm font-medium text-slate-900 truncate">
                {storeDisplayName}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {platformDisplay && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {platformDisplay}
                  </Badge>
                )}
                {subscriptionTier && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {subscriptionTier}
                  </Badge>
                )}
                {profitScore && (
                  <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {profitScore}
                  </Badge>
                )}
              </div>
            </div>
          ) : !isResolved && (
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Store</p>
              <p className="text-sm text-slate-500">No store selected</p>
              <Link 
                to={createPageUrl('Integrations', location.search)}
                className="text-xs text-emerald-600 hover:underline mt-1 inline-flex items-center gap-1"
              >
                <Store className="w-3 h-3" />
                Connect Store
              </Link>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.filter(item => {
              if (item.permission && typeof hasPermission === 'function' && !hasPermission(item.permission)) return false;
              if (item.adminOnly && !isAdmin) return false;
              return true;
            }).map((item) => {
              const isActive = currentPageName === item.page;
              const Icon = item.icon;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page, location.search)}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-colors duration-150
                    ${isActive 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                  {item.name}
                  {item.page === 'Alerts' && pendingAlerts > 0 && (
                    <Badge className="ml-auto bg-red-500 text-white text-xs px-1.5 py-0.5">
                      {pendingAlerts}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          {activeUser && (
            <div className="p-4 border-t border-slate-200">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-slate-600">
                        {(activeUser.full_name || activeUser.email || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {activeUser.full_name || 'User'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{activeUser.email || ''}</p>
                      {role && <p className="text-xs text-emerald-600 capitalize">{role}</p>}
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl('Settings', location.search)}>
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
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
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center gap-4 lg:ml-4">
            <ResolverHealthIndicator />
            {/* StoreSwitcher only when RESOLVED and multiple stores */}
            {isResolved && stores.length > 1 && <StoreSwitcher />}
          </div>

          <div className="flex items-center gap-3">
            <Link to={createPageUrl('Alerts', location.search)}>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {pendingAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingAlerts > 9 ? '9+' : pendingAlerts}
                  </span>
                )}
              </Button>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {showMissingContextBanner && (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
              <p className="font-medium mb-1">No Store Connected</p>
              <p>Please connect a store to continue.</p>
              <Button 
                size="sm" 
                className="mt-2"
                onClick={() => navigate(createPageUrl('Integrations', location.search))}
              >
                Connect Store
              </Button>
            </div>
          )}
          {children}
        </main>

        {/* MerchantAI Chat - only when resolved */}
        {isResolved && authTenantId && activeUser && (
          <ErrorBoundary fallback={null}>
            <MerchantAIChat 
              tenantId={authTenantId} 
              currentPage={currentPageName || 'Home'}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Debug Panel */}
      <DebugPanel 
        resolver={resolver} 
        userEmail={activeUser?.email} 
        search={location.search}
      />
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

export default function Layout({ children, currentPageName }) {
  return (
    <PermissionsProvider>
      <LayoutContent currentPageName={currentPageName}>
        {children}
      </LayoutContent>
    </PermissionsProvider>
  );
}