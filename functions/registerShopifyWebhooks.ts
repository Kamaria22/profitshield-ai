import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
  'app/uninstalled'
];

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { integration_id } = await req.json();
    if (!integration_id) return Response.json({ error: 'Missing integration_id' }, { status: 400 });

    // Load integration
    const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
    if (!integrations.length) return Response.json({ error: 'Integration not found' }, { status: 404 });
    const integration = integrations[0];

    if (integration.platform !== 'shopify') {
      return Response.json({ error: 'Only Shopify webhook registration is supported' }, { status: 400 });
    }

    // Get OAuth token
    let tokens = await base44.asServiceRole.entities.OAuthToken.filter({
      tenant_id: integration.tenant_id, platform: 'shopify', is_valid: true
    });
    if (!tokens.length) {
      tokens = await base44.asServiceRole.entities.OAuthToken.filter({
        tenant_id: integration.tenant_id, platform: 'shopify'
      });
    }
    if (!tokens.length) return Response.json({ error: 'No Shopify token found. Please re-authenticate.' }, { status: 400 });

    const accessToken = await decryptToken(tokens[0].encrypted_access_token);
    const shopDomain = integration.store_key || integration.store_url.replace('https://', '');

    // Delete existing webhooks pointing to our URL
    try {
      const listRes = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
        headers: { 'X-Shopify-Access-Token': accessToken }
      });
      if (listRes.ok) {
        const { webhooks } = await listRes.json();
        for (const wh of (webhooks || [])) {
          if (wh.address === WEBHOOK_URL) {
            await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks/${wh.id}.json`, {
              method: 'DELETE',
              headers: { 'X-Shopify-Access-Token': accessToken }
            });
          }
        }
      }
    } catch (e) {
      console.warn('[registerShopifyWebhooks] Cleanup failed:', e.message);
    }

    // Register webhooks
    const registered = {};
    const errors = [];

    for (const topic of TOPICS) {
      try {
        const res = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
          body: JSON.stringify({ webhook: { topic, address: WEBHOOK_URL, format: 'json' } })
        });
        const data = await res.json();
        if (data.webhook?.id) {
          registered[topic.replace('/', '_')] = data.webhook.id.toString();
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
});