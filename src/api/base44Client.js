import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const rawClient = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

async function retryAsync(fn, { attempts = 3, baseMs = 250 } = {}) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) break;
      const waitMs = Math.min(2500, baseMs * 2 ** i);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

function readFallback(method) {
  if (method === 'filter' || method === 'list') return [];
  if (method === 'get') return null;
  return undefined;
}

const entityProxyCache = new Map();
const safeEntities = new Proxy(rawClient.entities, {
  get(target, entityName) {
    const entity = target?.[entityName];
    if (!entity || typeof entity !== 'object') return entity;
    if (entityProxyCache.has(entityName)) return entityProxyCache.get(entityName);

    const wrapped = new Proxy(entity, {
      get(entityTarget, methodName) {
        const method = entityTarget?.[methodName];
        if (typeof method !== 'function') return method;
        return async (...args) => {
          const name = `${String(entityName)}.${String(methodName)}`;
          const isRead = methodName === 'filter' || methodName === 'list' || methodName === 'get';
          try {
            return await retryAsync(() => method.apply(entityTarget, args), {
              attempts: isRead ? 2 : 3,
              baseMs: isRead ? 200 : 300
            });
          } catch (error) {
            console.warn(`[base44-safe] ${name} failed:`, error?.message || String(error));
            if (isRead) return readFallback(methodName);
            throw error;
          }
        };
      }
    });

    entityProxyCache.set(entityName, wrapped);
    return wrapped;
  }
});

const safeFunctions = new Proxy(rawClient.functions, {
  get(target, methodName) {
    const method = target?.[methodName];
    if (typeof method !== 'function') return method;
    if (methodName !== 'invoke') return method.bind(target);
    return async (...args) => retryAsync(() => method.apply(target, args), { attempts: 3, baseMs: 300 });
  }
});

// Create a guarded client that applies safe retries/fallbacks globally.
export const base44 = new Proxy(rawClient, {
  get(target, key) {
    if (key === 'entities') return safeEntities;
    if (key === 'functions') return safeFunctions;
    const value = target?.[key];
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
