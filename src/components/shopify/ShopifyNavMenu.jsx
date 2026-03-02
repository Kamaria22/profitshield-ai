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
import { NavigationMenu } from '@shopify/app-bridge/actions';

// ─── Route definitions ───────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',     path: '/'           },
  { label: 'AI Insights',   path: '/aiinsights' },
  { label: 'P&L Analytics', path: '/planalytics'},
  { label: 'Orders',        path: '/orders'     },
  { label: 'Products',      path: '/products'   },
  { label: 'Customers',     path: '/customers'  },
  { label: 'Shipping',      path: '/shipping'   },
  { label: 'Tasks',         path: '/tasks'      },
  { label: 'Alerts',        path: '/alerts'     },
  { label: 'Referrals',     path: '/referrals'  },
  { label: 'Billing & Plan',path: '/billing'    },
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
  return {
    shop: p.get('shop'),
    host: p.get('host'),
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

    const { shop, host } = getUrlParams();
    if (!shop || !host) return; // Not embedded — do nothing

    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn('[ShopifyNavMenu] Missing API key — skipping nav registration');
      return;
    }

    // Build items — admin items already excluded (none in NAV_ITEMS)
    const currentPath = detectCurrentPath();
    const items = NAV_ITEMS.map((item) => ({
      label: item.label,
      destination: buildItemUrl(item.path, shop, host),
    }));

    try {
      // Reuse or create App Bridge instance
      if (!appRef.current) {
        appRef.current = createApp({ apiKey, host, forceRedirect: false });
      }
      const app = appRef.current;

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
        } catch (e) {
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
      if (!menuRef.current || !appRef.current) return;
      const { shop, host } = getUrlParams();
      const currentPath = detectCurrentPath();
      const items = NAV_ITEMS.map((item) => ({
        label: item.label,
        destination: buildItemUrl(item.path, shop, host),
      }));
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