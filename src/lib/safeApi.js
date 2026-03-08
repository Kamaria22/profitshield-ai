import { base44 } from '@/api/base44Client';
import { getPersistedContext } from '@/components/platformContext';

const FUNCTION_FALLBACKS = {
  syncShopifyOrders: ['syncShopifyData', 'shopifyConnectionWatchdog'],
  syncShopifyData: ['shopifyConnectionWatchdog'],
  registerShopifyWebhooks: ['shopifyConnectionWatchdog'],
  profitAlertWatchdog: ['checkProfitAlerts'],
  supportGuardian: ['supportWatchdog'],
};

function extractHttpStatus(error) {
  const direct = error?.status || error?.response?.status || error?.data?.status;
  if (Number.isFinite(Number(direct))) return Number(direct);
  const msg = String(error?.message || '');
  const match = msg.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : null;
}

export async function retryAsync(fn, options = {}) {
  const attempts = Math.max(1, options.attempts || 3);
  const baseMs = Math.max(100, options.baseMs || 250);
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) break;
      const status = extractHttpStatus(error);
      const waitMs = status === 429
        ? Math.min(12000, 1500 * (i + 1))
        : baseMs * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

export async function invokeWithRetry(name, payload = {}, options = {}) {
  const attempts = options.attempts || 3;
  const baseMs = options.baseMs || 300;
  const candidates = [name, ...(FUNCTION_FALLBACKS[name] || [])];
  let lastError = null;

  for (const fnName of candidates) {
    try {
      const invokePayload = (() => {
        if (fnName !== 'checkProfitAlerts') return payload;
        if (payload?.tenant_id) return payload;
        const persistedTenant = getPersistedContext(true)?.tenantId || null;
        return persistedTenant ? { ...payload, tenant_id: persistedTenant } : payload;
      })();
      return await retryAsync(
        () => base44.functions.invoke(fnName, invokePayload),
        { attempts, baseMs }
      );
    } catch (error) {
      lastError = error;
      const status = extractHttpStatus(error);
      if (status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Function invoke failed: ${name}`);
}

export function withUiGuard(fn, onError) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error('[ui-guard]', error);
      onError?.(error);
      return null;
    }
  };
}

export async function invokeSelfHealSafe(payload = {}, options = {}) {
  try {
    const res = await invokeWithRetry('selfHeal', payload, { attempts: options.attempts || 2, baseMs: options.baseMs || 250 });
    return res || { data: { ok: false, fallback: true, reason: 'selfHeal_unavailable' } };
  } catch (error) {
    const status = extractHttpStatus(error);
    if (status === 404) {
      return { data: { ok: false, fallback: true, reason: 'selfHeal_unavailable' } };
    }
    throw error;
  }
}

export async function invokeSupportGuardianSafe(payload = {}, options = {}) {
  try {
    return await invokeWithRetry('supportGuardian', payload, { attempts: options.attempts || 2, baseMs: options.baseMs || 250 });
  } catch (error) {
    const status = extractHttpStatus(error);
    if (status === 404) {
      return invokeWithRetry('supportWatchdog', payload, { attempts: 2, baseMs: 250 });
    }
    throw error;
  }
}
