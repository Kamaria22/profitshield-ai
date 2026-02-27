import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEEP_LINK_ROUTES } from './appConfig';
import { createPageUrl } from '@/utils';

/**
 * DEEP LINK HANDLER
 * Handles profitshield:// scheme deep links and Universal Link paths.
 * Works in browser via URL hash/query params, in Capacitor via App plugin events.
 */
export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle deep links from URL params (web fallback)
    const params = new URLSearchParams(window.location.search);
    const deepRoute = params.get('deeplink');
    const entityId = params.get('id');

    if (deepRoute) {
      const pageName = DEEP_LINK_ROUTES[deepRoute.toLowerCase()];
      if (pageName) {
        const url = entityId
          ? createPageUrl(pageName) + `&id=${entityId}`
          : createPageUrl(pageName);
        navigate(url, { replace: true });
        return;
      }
    }

    // Handle Capacitor App plugin deep link events (when running as native)
    const handleCapacitorDeepLink = (event) => {
      try {
        const url = event?.detail?.url || event?.url || '';
        if (!url) return;

        // Parse profitshield://route/id format
        const match = url.match(/profitshield:\/\/([^/?]+)\/?([^?]*)?/);
        if (!match) return;

        const [, route, id] = match;
        const pageName = DEEP_LINK_ROUTES[route.toLowerCase()];
        if (pageName) {
          const target = id
            ? createPageUrl(pageName) + `&id=${encodeURIComponent(id)}`
            : createPageUrl(pageName);
          navigate(target);
        }
      } catch (e) {
        console.warn('[DeepLink] Failed to parse deep link:', e.message);
      }
    };

    // Listen for Capacitor bridge events
    document.addEventListener('profitshield.deeplink', handleCapacitorDeepLink);
    window.addEventListener('appDeepLink', handleCapacitorDeepLink);

    return () => {
      document.removeEventListener('profitshield.deeplink', handleCapacitorDeepLink);
      window.removeEventListener('appDeepLink', handleCapacitorDeepLink);
    };
  }, [navigate]);

  return null; // Renderless component
}