export type ExchangeResponse = {
  authenticated?: boolean;
  tenant_id?: string;
  integration_id?: string;
  shop_domain?: string;
  install_required?: boolean;
  error?: string;
  reason?: string;
};

export async function exchangeShopifySession(input: {
  shop: string;
  sessionToken?: string | null;
}): Promise<ExchangeResponse> {
  const response = await fetch('/api/shopify/session-exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      shop: input.shop,
      session_token: input.sessionToken || undefined,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      authenticated: false,
      error: data?.error || `session_exchange_http_${response.status}`,
      reason: data?.reason,
    };
  }

  return data || {};
}
