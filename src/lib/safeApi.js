import { base44 } from '@/api/base44Client';

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
      const waitMs = baseMs * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

export async function invokeWithRetry(name, payload = {}, options = {}) {
  return retryAsync(
    () => base44.functions.invoke(name, payload),
    { attempts: options.attempts || 3, baseMs: options.baseMs || 300 }
  );
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
