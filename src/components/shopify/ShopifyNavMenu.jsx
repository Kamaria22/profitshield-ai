/**
 * ShopifyNavMenu
 *
 * Registers an App Bridge NavigationMenu inside the Shopify admin iframe.
 * Renders nothing visible — it's purely a side-effect component.
 *
 * - Only activates in embedded context (shop + host + embedded=1)
 * - Mirrors sidebar routes, preserving shop/host params
 * - Hides admin-only items for non-admin users
 * - Navigates via App Bridge History to avoid full reloads
 */

import { useEffect, useRef } from 'react';
import createApp from '@shopify/app-bridge';
import { NavigationMenu, AppLink } from '@shopify/app-bridge/actions';
import { hasValidAppBridgeContext } from '@/components/shopify/AppBridgeAuth';

// ─── Route definitions ───────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',     path: '/dashboard'  },
  { label: 'AI Insights',   path: '/ai-insights' },
  { label: 'P&L Analytics', path: '/pnl-analytics'},
  { label: 'Orders',        path: '/orders'     },
  { label: 'Risk Intelligence', path: '/intelligence' },
  { label: 'Products',      path: '/products'   },
  { label: 'Customers',     path: '/customers'  },
  { label: 'Shipping',      path: '/shipping'   },
  { label: 'Tasks',         path: '/tasks'      },
  { label: 'Alerts',        path: '/alerts'     },
  { label: 'Referrals',     path: '/referrals'  },
  { label: 'Billing & Plan',path: '/billing'    },
  { label: 'Integrations',  path: '/integrations' },
  { label: 'Help Center',   path: '/helpcenter' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getApiKey() {
  if (typeof window !== 'undefined' && window.__SHOPIFY_API_KEY__) return window.__SHOPIFY_API_KEY__;
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="shopify-api-key"]');
    return meta?.content || null;
  }
  return null;
}

function getUrlParams() {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const shop = p.get('shop');
  return {
    shop,
    host: p.get('host'),
    shopOrigin: shop ? `https://${shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`}` : null,
  };
}

function buildItemUrl(path, shop, host) {
  const params = new URLSearchParams();
  if (shop) params.set('shop', shop);
  if (host) params.set('host', host);
  params.set('embedded', '1');
  const qs = params.toString();
  return `${path}?${qs}`;
}

function detectCurrentPath() {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * @param {Object} props
 * @param {boolean} props.isAdmin  - whether current user is admin/owner
 */
export default function ShopifyNavMenu({ isAdmin = false }) {
  const menuRef = useRef(null);
  const appRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasValidAppBridgeContext()) return;

    const { shop, host, shopOrigin } = getUrlParams();
    if (!shop || !host) return; // Not embedded — do nothing

    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn('[ShopifyNavMenu] Missing API key — skipping nav registration');
      return;
    }

    // Build items — admin items already excluded (none in NAV_ITEMS)
    const currentPath = detectCurrentPath();
    const itemConfigs = NAV_ITEMS
      .map((item) => ({
        label: typeof item.label === 'string' ? item.label.trim() : '',
        destination: buildItemUrl(item.path, shop, host),
      }))
      .filter((item) => item.label && item.destination);

    try {
      // Reuse or create App Bridge instance
      if (!appRef.current) {
        appRef.current = createApp({ apiKey, host, shopOrigin: shopOrigin || undefined, forceRedirect: false });
      }
      const app = appRef.current;
      if (!itemConfigs.length) return;
      const items = itemConfigs.map((item) => AppLink.create(app, item)).filter(Boolean);
      if (!items.length) return;

      // Find active item
      const activeIndex = NAV_ITEMS.findIndex((item) =>
        currentPath === item.path ||
        (item.path !== '/' && currentPath.startsWith(item.path))
      );

      const menu = NavigationMenu.create(app, {
        items,
        active: activeIndex >= 0 ? items[activeIndex] : items[0],
      });

      // Subscribe to navigation events from App Bridge
      menu.subscribe(NavigationMenu.Action.APP_LINK_CLICK, (data) => {
        const url = data?.destination;
        if (!url) return;
        // Use History API for SPA navigation
        try {
          window.history.pushState({}, '', url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        } catch {
          window.location.assign(url);
        }
      });

      menuRef.current = menu;
      console.log('[ShopifyNavMenu] Navigation menu registered with', items.length, 'items');
    } catch (err) {
      console.warn('[ShopifyNavMenu] Failed to register navigation menu:', err.message);
    }

    return () => {
      // Cleanup on unmount
      try {
        menuRef.current?.unsubscribe?.();
      } catch {}
    };
  }, [isAdmin]); // re-register if admin status changes

  // Re-sync active item on route changes
  useEffect(() => {
    const handleRouteChange = () => {
      if (!hasValidAppBridgeContext()) return;
      if (!menuRef.current || !appRef.current) return;
      const { shop, host } = getUrlParams();
      if (!shop || !host) return;
      const currentPath = detectCurrentPath();
      const items = NAV_ITEMS
        .map((item) => {
          const label = typeof item.label === 'string' ? item.label.trim() : '';
          const destination = buildItemUrl(item.path, shop, host);
          if (!label || !destination) return null;
          return AppLink.create(appRef.current, { label, destination });
        })
        .filter(Boolean);
      if (!items.length) return;
      const activeIndex = NAV_ITEMS.findIndex((item) =>
        currentPath === item.path ||
        (item.path !== '/' && currentPath.startsWith(item.path))
      );
      try {
        menuRef.current.set({
          items,
          active: activeIndex >= 0 ? items[activeIndex] : items[0],
        });
      } catch {}
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  return null; // No visible DOM output
}
