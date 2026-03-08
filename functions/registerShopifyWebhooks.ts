import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { withEndpointGuard, safeFilter } from './helpers/endpointSafety.ts';

const APP_URL = (Deno.env.get('APP_URL') || 'https://profit-shield-ai.base44.app').replace(/\/$/, '');
const WEBHOOK_URL = `${APP_URL}/api/functions/shopifyWebhook`;
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');
const API_VERSION = '2024-10';

// All known old endpoints to clean up (including wrong domain)
const STALE_ENDPOINTS = [
  WEBHOOK_URL,
  'https://profit-shield-ai.com/api/functions/shopifyWebhook',
];

const TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/paid',
  'orders/cancelled',
  'refunds/create',
  'products/update',
  'app/uninstalled',
  'customers/data_request',
  'customers/redact',
  'shop/redact',
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

Deno.serve(withEndpointGuard('registerShopifyWebhooks', async (req) => {
  try {
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

    // Delete ALL stale webhooks (including wrong-domain ones)
    try {
      const listRes = await shopifyFetchWithRetry(shopDomain, accessToken, '/webhooks.json?limit=250');
      if (listRes.ok) {
        const { webhooks } = await listRes.json();
        for (const wh of (webhooks || [])) {
          if (STALE_ENDPOINTS.some(ep => wh.address.includes('shopifyWebhook'))) {
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

    for (const topic of TOPICS) {
      try {
        const res = await shopifyFetchWithRetry(shopDomain, accessToken, '/webhooks.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhook: { topic, address: WEBHOOK_URL, format: 'json' } })
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
            address: WEBHOOK_URL,
            webhook_id: webhookId,
            status: 'active',
            last_checked_at: new Date().toISOString()
          });
        } else {
          errors.push({ topic, error: JSON.stringify(data.errors || data) });
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
