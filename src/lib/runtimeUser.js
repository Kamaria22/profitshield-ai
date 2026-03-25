import { base44 } from '@/api/base44Client';
import { getPersistedContext } from '@/components/platformContext';

export function isEmbeddedRuntime() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('shop') && (params.get('host') || params.get('embedded') === '1')) {
      return true;
    }
    const persisted = getPersistedContext(true);
    if (persisted?.platform === 'shopify' && !!persisted?.tenantId) {
      return true;
    }
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export async function loadCurrentUserSafe(resolverUser = null) {
  if (resolverUser) return resolverUser;
  if (isEmbeddedRuntime()) return null;
  try {
    return await base44.auth.me();
  } catch {
    return null;
  }
}
