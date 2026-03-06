import createApp from '@shopify/app-bridge';
import { getSessionToken } from '@shopify/app-bridge-utils';

const TOKEN_TIMEOUT_MS = 5000;

function getApiKey(): string | null {
  return import.meta.env.VITE_SHOPIFY_API_KEY || null;
}

function getConfiguredAppOrigin(): string | null {
  const origin = import.meta.env.VITE_SHOPIFY_APP_ORIGIN;
  if (!origin) return null;
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function isIframeContext(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  const shop = params.get('shop');
  const host = params.get('host');
  return { shop, host, embedded: params.get('embedded') === '1' };
}

export function hasValidAppBridgeContext(): boolean {
  const { shop, host } = getParams();
  const apiKey = getApiKey();
  if (!shop || !host || !apiKey) return false;
  if (!isIframeContext()) return false;

  const configuredOrigin = getConfiguredAppOrigin();
  if (configuredOrigin && window.location.origin !== configuredOrigin) {
    return false;
  }

  return true;
}

export function getShopDomainFromUrl(): string | null {
  const { shop } = getParams();
  if (!shop) return null;
  const normalized = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  return normalized.toLowerCase();
}

export async function getSessionTokenOrNull(): Promise<string | null> {
  if (!hasValidAppBridgeContext()) return null;

  const apiKey = getApiKey()!;
  const { host, shop } = getParams();
  const normalizedShop = shop?.includes('.myshopify.com') ? shop : shop ? `${shop}.myshopify.com` : null;

  try {
    const app = createApp({
      apiKey,
      host: host!,
      shopOrigin: normalizedShop ? `https://${normalizedShop}` : undefined,
      forceRedirect: true,
    });

    const token = await Promise.race([
      getSessionToken(app),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('app_bridge_token_timeout')), TOKEN_TIMEOUT_MS)),
    ]);

    return token || null;
  } catch {
    return null;
  }
}
