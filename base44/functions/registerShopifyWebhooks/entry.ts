import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function withEndpointGuard(name, handler) {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }
    try {
      const res = await handler(req);
      return res instanceof Response ? res : Response.json({ error: `${name}_invalid_response` }, { status: 500 });
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return Response.json({ error: 'internal_error', endpoint: name, message: error?.message || String(error) }, { status: 500 });
    }
  };
}

async function safeFilter(filterFn, fallback = [], _context = 'safeFilter') {
  try {
    const rows = await filterFn();
    return Array.isArray(rows) ? rows : fallback;
  } catch {
    return fallback;
  }
}

const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');
const API_VERSION = '2024-10';

function resolveAppUrl(req) {
  try {
    const origin = new URL(req.url).origin;
    const host = new URL(req.url).hostname.toLowerCase();
    if (host.endsWith('.base44.app')) return origin.replace(/\/$/, '');
  } catch {}
  return (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
}

const TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/paid',
  'orders/cancelled',
  'refunds/create',
  'products/update',
  'app/uninstalled',
  'app_subscriptions/update'
];

// Map topic → stable key for webhook_endpoints storage
function topicToKey(topic) {
  return topic.replace(/\//g, '_');
}

async function decryptToken(encryptedToken) {
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode((ENCRYPTION_KEY || '').padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    // Fallback: plain base64
    return atob(encryptedToken);
  }
}

async function shopifyFetchWithRetry(shopDomain, accessToken, path, init = {}, maxAttempts = 4) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    const res = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}${path}`, {
      ...init,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        ...(init.headers || {})
      }
    });
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers.get('Retry-After') || '0');
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * Math.pow(2, attempt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt++;
  }
  return fetch(`https://${shopDomain}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      ...(init.headers || {})
    }
  });
}

async function loadExistingWebhookMap(shopDomain, accessToken, webhookUrl) {
  const listRes = await shopifyFetchWithRetry(shopDomain, accessToken, '/webhooks.json?limit=250');
  if (!listRes.ok) return {};
  const { webhooks = [] } = await listRes.json().catch(() => ({ webhooks: [] }));
  return Object.fromEntries(
    (webhooks || [])
      .filter((webhook) => webhook?.address === webhookUrl && webhook?.topic)
      .map((webhook) => [webhook.topic, String(webhook.id)])
  );
}

Deno.serve(withEndpointGuard('registerShopifyWebhooks', async (req) => {
  try {
    const appUrl = resolveAppUrl(req);
    const webhookUrl = `${appUrl}/api/functions/shopifyWebhook`;
    const staleEndpoints = [
      webhookUrl,
      'https://profit-shield-ai.com/api/functions/shopifyWebhook',
      'https://profit-shield-ai.base44.app/api/functions/shopifyWebhook',
    ];

    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const role = (user?.role || user?.app_role || '').toLowerCase();
    if (user && role !== 'admin' && role !== 'owner') {
      return Response.json({ error: 'Admin/owner only' }, { status: 403 });
    }

    const { integration_id } = await req.json();
    if (!integration_id) return Response.json({ error: 'Missing integration_id' }, { status: 400 });

    // Load integration
    const integrations = await safeFilter(
      () => base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id }),
      [],
      'registerShopifyWebhooks.integration_lookup'
    );
    if (!integrations.length) return Response.json({ error: 'Integration not found' }, { status: 404 });
    const integration = integrations[0];

    if (integration.platform !== 'shopify') {
      return Response.json({ error: 'Only Shopify webhook registration is supported' }, { status: 400 });
    }

    // Get OAuth token
    let tokens = await safeFilter(
      () => base44.asServiceRole.entities.OAuthToken.filter({
        tenant_id: integration.tenant_id, platform: 'shopify', is_valid: true
      }),
      [],
      'registerShopifyWebhooks.token_lookup'
    );
    if (!tokens.length) {
      tokens = await safeFilter(
        () => base44.asServiceRole.entities.OAuthToken.filter({
          tenant_id: integration.tenant_id, platform: 'shopify'
        }),
        [],
        'registerShopifyWebhooks.token_fallback'
      );
    }
    if (!tokens.length) return Response.json({ error: 'No Shopify token found. Please re-authenticate.' }, { status: 400 });

    const accessToken = await decryptToken(tokens[0].encrypted_access_token);
    const shopDomain = integration.store_key || integration.store_url?.replace('https://', '');

    // Verify API is reachable BEFORE attempting registration
    const scopeCheck = await fetch(`https://${shopDomain}/admin/oauth/access_scopes.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    if (!scopeCheck.ok) {
      // Mark token invalid
      await base44.asServiceRole.entities.OAuthToken.update(tokens[0].id, { is_valid: false }).catch(() => {});
      await base44.asServiceRole.entities.PlatformIntegration.update(integration_id, { status: 'disconnected' }).catch(() => {});
      return Response.json({
        error: `Shopify API returned ${scopeCheck.status} — token is invalid. Please reconnect OAuth first.`,
        needs_reconnect: true
      }, { status: 400 });
    }

    // Delete stale webhooks that point to non-canonical destinations.
    try {
      const listRes = await shopifyFetchWithRetry(shopDomain, accessToken, '/webhooks.json?limit=250');
      if (listRes.ok) {
        const { webhooks } = await listRes.json();
        for (const wh of (webhooks || [])) {
          const address = String(wh?.address || '');
          const isShopifyWebhook = address.includes('shopifyWebhook');
          const isCanonical = address === webhookUrl;
          if (isShopifyWebhook && !isCanonical && staleEndpoints.includes(address)) {
            await shopifyFetchWithRetry(shopDomain, accessToken, `/webhooks/${wh.id}.json`, {
              method: 'DELETE',
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('[registerShopifyWebhooks] Cleanup failed:', e.message);
    }

    // Register webhooks
    const registered = {};
    const errors = [];
    const registryRecords = [];
    const existingWebhookMap = await loadExistingWebhookMap(shopDomain, accessToken, webhookUrl);

    for (const topic of TOPICS) {
      try {
        if (existingWebhookMap[topic]) {
          const webhookId = existingWebhookMap[topic];
          registered[topicToKey(topic)] = webhookId;
          registryRecords.push({
            shop_domain: shopDomain,
            tenant_id: integration.tenant_id,
            topic,
            address: webhookUrl,
            webhook_id: webhookId,
            status: 'active',
            last_checked_at: new Date().toISOString()
          });
          continue;
        }

        const res = await shopifyFetchWithRetry(shopDomain, accessToken, '/webhooks.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhook: { topic, address: webhookUrl, format: 'json' } })
        });
        const data = await res.json();
        if (data.webhook?.id) {
          const webhookId = data.webhook.id.toString();
          // Use full underscore key: orders_create, app_subscriptions_update, customers_data_request
          registered[topicToKey(topic)] = webhookId;
          registryRecords.push({
            shop_domain: shopDomain,
            tenant_id: integration.tenant_id,
            topic,
            address: webhookUrl,
            webhook_id: webhookId,
            status: 'active',
            last_checked_at: new Date().toISOString()
          });
        } else {
          const normalizedError = JSON.stringify(data.errors || data);
          if (normalizedError.includes('already been taken')) {
            const refreshedWebhookMap = await loadExistingWebhookMap(shopDomain, accessToken, webhookUrl);
            if (refreshedWebhookMap[topic]) {
              const webhookId = refreshedWebhookMap[topic];
              registered[topicToKey(topic)] = webhookId;
              registryRecords.push({
                shop_domain: shopDomain,
                tenant_id: integration.tenant_id,
                topic,
                address: webhookUrl,
                webhook_id: webhookId,
                status: 'active',
                last_checked_at: new Date().toISOString()
              });
              continue;
            }
          }
          errors.push({ topic, error: normalizedError });
        }
      } catch (e) {
        errors.push({ topic, error: e.message });
      }
    }

    // Persist webhook IDs on integration
    await base44.asServiceRole.entities.PlatformIntegration.update(integration_id, {
      webhook_endpoints: registered,
      last_connected_at: new Date().toISOString()
    });

    // Upsert into ShopifyWebhookRegistry for reviewer proof checks
    for (const record of registryRecords) {
      try {
        const existing = await base44.asServiceRole.entities.ShopifyWebhookRegistry.filter({
          shop_domain: shopDomain, topic: record.topic
        });
        if (existing.length > 0) {
          await base44.asServiceRole.entities.ShopifyWebhookRegistry.update(existing[0].id, record);
        } else {
          await base44.asServiceRole.entities.ShopifyWebhookRegistry.create(record);
        }
      } catch (e) {
        console.warn(`[registerShopifyWebhooks] Registry upsert failed for ${record.topic}:`, e.message);
      }
    }

    return Response.json({
      success: true,
      webhooks: registered,
      errors,
      registered_count: Object.keys(registered).length,
      error_count: errors.length
    });

  } catch (error) {
    console.error('[registerShopifyWebhooks] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
