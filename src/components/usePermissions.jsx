import { useState, useEffect, createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';

// Default permissions for built-in roles
const DEFAULT_ROLE_PERMISSIONS = {
  owner: {
    dashboard_view: true,
    orders_view: true,
    orders_edit: true,
    products_view: true,
    products_edit: true,
    customers_view: true,
    customers_edit: true,
    alerts_view: true,
    alerts_manage: true,
    integrations_view: true,
    integrations_manage: true,
    settings_view: true,
    settings_manage: true,
    users_view: true,
    users_manage: true,
    audit_logs_view: true,
    system_health_view: true,
    risk_rules_view: true,
    risk_rules_manage: true,
    reports_export: true
  },
  admin: {
    dashboard_view: true,
    orders_view: true,
    orders_edit: true,
    products_view: true,
    products_edit: true,
    customers_view: true,
    customers_edit: true,
    alerts_view: true,
    alerts_manage: true,
    integrations_view: true,
    integrations_manage: true,
    settings_view: true,
    settings_manage: true,
    users_view: true,
    users_manage: true,
    audit_logs_view: true,
    system_health_view: true,
    risk_rules_view: true,
    risk_rules_manage: true,
    reports_export: true
  },
  manager: {
    dashboard_view: true,
    orders_view: true,
    orders_edit: true,
    products_view: true,
    products_edit: true,
    customers_view: true,
    customers_edit: true,
    alerts_view: true,
    alerts_manage: true,
    integrations_view: true,
    integrations_manage: false,
    settings_view: true,
    settings_manage: false,
    users_view: true,
    users_manage: false,
    audit_logs_view: true,
    system_health_view: false,
    risk_rules_view: true,
    risk_rules_manage: true,
    reports_export: true
  },
  analyst: {
    dashboard_view: true,
    orders_view: true,
    orders_edit: false,
    products_view: true,
    products_edit: false,
    customers_view: true,
    customers_edit: false,
    alerts_view: true,
    alerts_manage: false,
    integrations_view: true,
    integrations_manage: false,
    settings_view: false,
    settings_manage: false,
    users_view: false,
    users_manage: false,
    audit_logs_view: false,
    system_health_view: false,
    risk_rules_view: true,
    risk_rules_manage: false,
    reports_export: true
  },
  viewer: {
    dashboard_view: true,
    orders_view: true,
    orders_edit: false,
    products_view: true,
    products_edit: false,
    customers_view: true,
    customers_edit: false,
    alerts_view: true,
    alerts_manage: false,
    integrations_view: false,
    integrations_manage: false,
    settings_view: false,
    settings_manage: false,
    users_view: false,
    users_manage: false,
    audit_logs_view: false,
    system_health_view: false,
    risk_rules_view: false,
    risk_rules_manage: false,
    reports_export: false
  }
};

// Permission context
const PermissionsContext = createContext(null);

export function PermissionsProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    permissions: DEFAULT_ROLE_PERMISSIONS.viewer,
    role: null,
    loading: true
  });

  useEffect(() => {
    loadUserPermissions();
  }, []);

  const loadUserPermissions = async () => {
    // In Shopify embedded mode, Base44 auth.me() will 403 — skip it entirely.
    // The ShopifyEmbeddedAuthGate is the identity source; grant admin-level perms.
    const isEmbedded = (() => {
      try {
        const p = new URLSearchParams(window.location.search);
        return !!(p.get('shop') && (p.get('host') || p.get('embedded') === '1'));
      } catch { return false; }
    })();

    if (isEmbedded) {
      setState({
        user: null,
        permissions: DEFAULT_ROLE_PERMISSIONS.admin,
        role: 'admin',
        loading: false
      });
      return;
    }

    try {
      const user = await base44.auth.me();
      if (!user) {
        setState(s => ({ ...s, loading: false }));
        return;
      }

      // Determine role - check app_role first, then custom role_id
      const appRole = user.app_role?.toLowerCase();
      let permissions = DEFAULT_ROLE_PERMISSIONS.viewer;
      let roleName = 'viewer';

      // Check for built-in roles first
      if (appRole === 'owner' || appRole === 'admin') {
        permissions = DEFAULT_ROLE_PERMISSIONS[appRole] || DEFAULT_ROLE_PERMISSIONS.admin;
        roleName = appRole;
      } else if (user.custom_role_id) {
        // Load custom role from database
        try {
          const roles = await base44.entities.Role.filter({ id: user.custom_role_id });
          if (roles.length > 0) {
            permissions = roles[0].permissions || DEFAULT_ROLE_PERMISSIONS.viewer;
            roleName = roles[0].name;
          }
        } catch (e) {
          console.error('Failed to load custom role:', e);
        }
      } else if (appRole && DEFAULT_ROLE_PERMISSIONS[appRole]) {
        // Check if app_role matches a default role name
        permissions = DEFAULT_ROLE_PERMISSIONS[appRole];
        roleName = appRole;
      }

      setState({
        user,
        permissions,
        role: roleName,
        loading: false
      });
    } catch (e) {
      console.error('Failed to load permissions:', e);
      setState(s => ({ ...s, loading: false }));
    }
  };

  const hasPermission = (permission) => {
    return state.permissions[permission] === true;
  };

  const hasAnyPermission = (...perms) => {
    return perms.some(p => state.permissions[p] === true);
  };

  const hasAllPermissions = (...perms) => {
    return perms.every(p => state.permissions[p] === true);
  };

  const refreshPermissions = () => {
    setState(s => ({ ...s, loading: true }));
    loadUserPermissions();
  };

  return (
    <PermissionsContext.Provider value={{
      ...state,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refreshPermissions,
      DEFAULT_ROLE_PERMISSIONS
    }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    // Return default permissions if not in provider
    return {
      user: null,
      permissions: DEFAULT_ROLE_PERMISSIONS.viewer,
      role: 'viewer',
      loading: false,
      hasPermission: () => false,
      hasAnyPermission: () => false,
      hasAllPermissions: () => false,
      refreshPermissions: () => {},
      DEFAULT_ROLE_PERMISSIONS
    };
  }
  return context;
}

// Hook for checking a single permission
export function useHasPermission(permission) {
  const { hasPermission, loading } = usePermissions();
  return { allowed: hasPermission(permission), loading };
}

// Component for conditional rendering based on permission
export function RequirePermission({ permission, children, fallback = null }) {
  const { hasPermission, loading } = usePermissions();
  
  if (loading) return null;
  if (!hasPermission(permission)) return fallback;
  return children;
}

export { DEFAULT_ROLE_PERMISSIONS };