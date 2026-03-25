import { base44 } from '@/api/base44Client';
import { getPersistedContext } from '@/components/platformContext';

const FUNCTION_FALLBACKS = {
  syncShopifyOrders: ['shopifyActivationBootstrap', 'syncShopifyData', 'shopifyConnectionWatchdog'],
  processWebhookQueue: ['shopifyActivationBootstrap'],
  syncShopifyData: ['shopifyActivationBootstrap', 'shopifyConnectionWatchdog'],
  registerShopifyWebhooks: ['shopifyActivationBootstrap', 'shopifyConnectionWatchdog'],
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

function shouldTryFallback(error) {
  const status = extractHttpStatus(error);
  const msg = String(error?.message || '').toLowerCase();
  return (
    status === 0 ||
    status === 404 ||
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    msg.includes('deployment does not exist') ||
    msg.includes('not found') ||
    msg.includes('timeout') ||
    msg.includes('network')
  );
}

async function invokeWithTimeout(fnName, payload, timeoutMs) {
  return await Promise.race([
    base44.functions.invoke(fnName, payload),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`invoke_timeout_${fnName}_${timeoutMs}ms`)), timeoutMs);
    })
  ]);
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
  const timeoutMs = Math.max(2500, options.timeoutMs || 12000);
  const candidates = [name, ...(FUNCTION_FALLBACKS[name] || [])];
  let lastError = null;

  for (const fnName of candidates) {
    try {
      const invokePayload = (() => {
        const persisted = getPersistedContext(true) || {};

        if (fnName === 'checkProfitAlerts') {
          if (payload?.tenant_id) return payload;
          const persistedTenant = persisted?.tenantId || null;
          return persistedTenant ? { ...payload, tenant_id: persistedTenant } : payload;
        }

        if (
          fnName === 'syncShopifyOrders' ||
          fnName === 'processWebhookQueue' ||
          fnName === 'shopifyActivationBootstrap' ||
          fnName === 'syncShopifyData' ||
          fnName === 'registerShopifyWebhooks' ||
          fnName === 'shopifyReconcileWebhooks'
        ) {
          const next = { ...payload };
          if (!next.tenant_id && persisted?.tenantId) next.tenant_id = persisted.tenantId;
          if (!next.integration_id && persisted?.integrationId) next.integration_id = persisted.integrationId;
          if (!next.shop && (persisted?.shop || persisted?.storeKey)) {
            next.shop = persisted.shop || persisted.storeKey;
          }
          if (fnName === 'shopifyActivationBootstrap' && next.force == null) {
            next.force = false;
          }
          return next;
        }

        return payload;
      })();
      return await retryAsync(
        () => invokeWithTimeout(fnName, invokePayload, timeoutMs),
        { attempts, baseMs }
      );
    } catch (error) {
      lastError = error;
      if (!shouldTryFallback(error)) {
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
