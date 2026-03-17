// @ts-nocheck
import { useState, useEffect, createContext, useContext } from 'react';
import { base44 } from '@/api/base44Client';
import { getPersistedContext } from '@/components/platformContext';

const OWNER_IDENTITY = {
  email: 'rohan.a.roberts@gmail.com',
  tenantId: '6992474f670f6ec0570302f0',
  storeKey: 'profitshield-dev.myshopify.com',
  phoneDigits: '9146894367',
  role: 'owner',
};
const OWNER_PROOF_KEY = 'profitshield_owner_identity_v1';

function normalizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function readOwnerProof() {
  try {
    const raw = localStorage.getItem(OWNER_PROOF_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistOwnerProof(user) {
  try {
    localStorage.setItem(OWNER_PROOF_KEY, JSON.stringify({
      email: String(user?.email || '').trim().toLowerCase(),
      tenantId: user?.tenant_id || null,
      verifiedPhone: normalizePhoneDigits(user?.verified_phone),
      savedAt: Date.now(),
    }));
  } catch {
    // no-op
  }
}

function isStrictOwnerProfile(user) {
  if (!user) return false;
  const email = String(user?.email || '').trim().toLowerCase();
  const tenantId = String(user?.tenant_id || '').trim();
  const verifiedPhone = normalizePhoneDigits(user?.verified_phone);
  const twoFactorEnabled = Boolean(user?.two_factor_enabled);
  const twoFactorMethod = String(user?.two_factor_method || '').toLowerCase();
  return (
    email === OWNER_IDENTITY.email &&
    tenantId === OWNER_IDENTITY.tenantId &&
    verifiedPhone === OWNER_IDENTITY.phoneDigits &&
    twoFactorEnabled &&
    twoFactorMethod === 'sms'
  );
}

function isOwnerFromPersistedContext(persisted, ownerProof) {
  const tenantMatches = String(persisted?.tenantId || '') === OWNER_IDENTITY.tenantId;
  const storeKey = String(persisted?.storeKey || persisted?.shop || '').trim().toLowerCase();
  const storeMatches = storeKey === OWNER_IDENTITY.storeKey;
  const hintedEmail = String(persisted?.userHintEmail || '').trim().toLowerCase();
  const proofEmail = String(ownerProof?.email || '').trim().toLowerCase();
  const proofTenant = String(ownerProof?.tenantId || '').trim();
  const proofPhone = normalizePhoneDigits(ownerProof?.verifiedPhone);
  const hasTrustedEmbeddedOwnerStore = (() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      const shop = String(params.get('shop') || '').trim().toLowerCase();
      const host = String(params.get('host') || '').trim();
      const embedded = params.get('embedded');
      const normalizedShop = shop && (shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`);
      if (normalizedShop !== OWNER_IDENTITY.storeKey) return false;
      if (!(embedded === '1' || host)) return false;
      if (!host) return true;
      const padded = host + '='.repeat((4 - (host.length % 4)) % 4);
      const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
      return decoded.startsWith('admin.shopify.com/store/profitshield-dev');
    } catch {
      return false;
    }
  })();
  return (
    tenantMatches &&
    storeMatches &&
    (
      hintedEmail === OWNER_IDENTITY.email ||
      (proofEmail === OWNER_IDENTITY.email &&
        proofTenant === OWNER_IDENTITY.tenantId &&
        proofPhone === OWNER_IDENTITY.phoneDigits) ||
      hasTrustedEmbeddedOwnerStore
    )
  );
}

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
    const persisted = getPersistedContext(true);
    const ownerProof = readOwnerProof();

    // In Shopify embedded mode, Base44 auth.me() will 403 — skip it entirely.
    // The ShopifyEmbeddedAuthGate is the identity source; only grant owner/admin
    // if strict owner profile proof is available.
    const isEmbedded = (() => {
      try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('shop') && (p.get('host') || p.get('embedded') === '1')) {
          return true;
        }
        if (persisted?.platform === 'shopify' && !!persisted?.tenantId) {
          return true;
        }
        return window.top !== window;
      } catch { return true; }
    })();

    if (isEmbedded) {
      if (isOwnerFromPersistedContext(persisted, ownerProof)) {
        setState({
          user: {
            email: OWNER_IDENTITY.email,
            tenant_id: OWNER_IDENTITY.tenantId,
            app_role: OWNER_IDENTITY.role,
            role: OWNER_IDENTITY.role,
            verified_phone: OWNER_IDENTITY.phoneDigits,
          },
          permissions: DEFAULT_ROLE_PERMISSIONS.owner,
          role: OWNER_IDENTITY.role,
          loading: false
        });
        return;
      }
      setState({
        user: null,
        permissions: DEFAULT_ROLE_PERMISSIONS.viewer,
        role: 'viewer',
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
        if (isStrictOwnerProfile(user)) {
          persistOwnerProof(user);
          permissions = DEFAULT_ROLE_PERMISSIONS.owner;
          roleName = 'owner';
        } else {
          // Enforce owner/admin as a protected profile only.
          permissions = DEFAULT_ROLE_PERMISSIONS.manager;
          roleName = 'manager';
        }
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
