import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  createPageUrl,
  normalizeShopDomain,
  parseQuery,
  getPersistedShopifyContext,
  persistShopifyContext,
  isUserAdmin
} from '@/components/shopifyContext';
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
  Link2
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
  { name: 'Dashboard', page: 'Home', icon: LayoutDashboard },
  { name: 'Orders', page: 'Orders', icon: ShoppingCart },
  { name: 'Products', page: 'Products', icon: Package },
  { name: 'Customers', page: 'Customers', icon: Users },
  { name: 'Shipping', page: 'Shipping', icon: Truck },
  { name: 'Tasks', page: 'Tasks', icon: ClipboardList },
  { name: 'Alerts', page: 'Alerts', icon: AlertTriangle },
  { name: 'Integrations', page: 'Integrations', icon: Link2 },
  { name: 'Audit Logs', page: 'AuditLogs', icon: ClipboardList, adminOnly: true },
  { name: 'System Health', page: 'SystemHealth', icon: LayoutDashboard, adminOnly: true },
  { name: 'Settings', page: 'Settings', icon: Settings },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [pendingAlerts, setPendingAlerts] = useState(0);
  const location = useLocation();

  useEffect(() => {
    loadUserAndTenant();
  }, [location.search]);

  const loadUserAndTenant = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      // Parse URL params
      const urlParams = parseQuery(location.search);
      const persisted = getPersistedShopifyContext();
      
      let resolvedTenant = null;
      let resolvedShopDomain = null;
      let resolvedHost = urlParams.host || persisted.host;
      
      // PRIORITY A: URL shop param
      if (urlParams.shop) {
        resolvedShopDomain = normalizeShopDomain(urlParams.shop);
        console.log('[Layout] Resolving tenant from shop param:', resolvedShopDomain);
        
        const tenants = await base44.entities.Tenant.filter({ shop_domain: resolvedShopDomain });
        if (tenants.length > 0) {
          resolvedTenant = tenants[0];
          console.log('[Layout] Found tenant:', resolvedTenant.id);
        }
      }

      // PRIORITY B: localStorage fallback
      if (!resolvedTenant && persisted.shopDomain) {
        console.log('[Layout] Trying localStorage fallback:', persisted.shopDomain);
        resolvedShopDomain = persisted.shopDomain;
        
        const tenants = await base44.entities.Tenant.filter({ shop_domain: resolvedShopDomain });
        if (tenants.length > 0) {
          resolvedTenant = tenants[0];
        }
      } else if (!resolvedTenant && persisted.tenantId) {
        console.log('[Layout] Trying localStorage tenant_id fallback:', persisted.tenantId);
        
        const tenants = await base44.entities.Tenant.filter({ id: persisted.tenantId });
        if (tenants.length > 0) {
          resolvedTenant = tenants[0];
          resolvedShopDomain = resolvedTenant.shop_domain;
        }
      }
      
      // PRIORITY C: user.tenant_id fallback
      if (!resolvedTenant && currentUser?.tenant_id) {
        console.log('[Layout] Using user.tenant_id fallback:', currentUser.tenant_id);
        
        const tenants = await base44.entities.Tenant.filter({ id: currentUser.tenant_id });
        if (tenants.length > 0) {
          resolvedTenant = tenants[0];
          resolvedShopDomain = resolvedTenant.shop_domain;
        }
      }

      // NO FALLBACK to first tenant - require explicit resolution
      if (!resolvedTenant) {
        console.warn('[Layout] No tenant resolved. Missing shop param and no valid fallback.');
        setTenant(null);
        setPendingAlerts(0);
        return;
      }
      
      // Persist resolved context for navigation (including embedded/debug flags)
      persistShopifyContext({
        shop: resolvedShopDomain,
        host: resolvedHost,
        tenantId: resolvedTenant.id,
        embedded: urlParams.embedded ?? persisted.embedded,
        debug: urlParams.debug ?? persisted.debug
      });
      
      setTenant(resolvedTenant);
      console.log('[Layout] Resolved tenant:', resolvedTenant.id, 'shop:', resolvedShopDomain);
      
      // Load alerts for the resolved tenant
      const alerts = await base44.entities.Alert.filter({ 
        tenant_id: resolvedTenant.id, 
        status: 'pending' 
      });
      setPendingAlerts(alerts.length);
    } catch (e) {
      console.log('User not logged in or error:', e.message);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  // Don't show layout for onboarding or auth pages
  if (['Onboarding', 'ShopifyAuth', 'ShopifyCallback'].includes(currentPageName)) {
    return <>{children}</>;
  }

  const isAdmin = isUserAdmin(user);
  const urlParams = parseQuery(location.search);
  const persisted = getPersistedShopifyContext();
  const showMissingContextBanner = !tenant && !persisted.tenantId && !urlParams.shop;

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

          {/* Store Info */}
          {tenant && (
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Store</p>
              <p className="text-sm font-medium text-slate-900 truncate">{tenant.shop_name || tenant.shop_domain}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {tenant.subscription_tier}
                </Badge>
                {tenant.profit_integrity_score && (
                  <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {tenant.profit_integrity_score}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.filter(item => {
              if (!item.adminOnly) return true;
              return isAdmin;
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
                  {item.adminOnly && (
                    <Badge variant="outline" className="ml-auto text-xs">Admin</Badge>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          {user && (
            <div className="p-4 border-t border-slate-200">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                    <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-slate-600">
                        {user.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
                      </span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {user.full_name || 'User'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
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

          <div className="flex-1 lg:flex-none" />

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
              <p className="font-medium mb-1">Embedded Context Missing</p>
              <p>No store resolved. Open the app with a shop param:</p>
              <code className="block mt-2 p-2 bg-yellow-100 rounded text-xs">
                /orders?shop=yourstore.myshopify.com&host=YOUR_HOST_VALUE&embedded=1
              </code>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}