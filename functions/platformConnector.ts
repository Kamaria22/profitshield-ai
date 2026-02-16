import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Platform-specific API configurations
const PLATFORM_CONFIGS = {
  shopify: {
    apiVersion: '2024-01',
    baseUrlTemplate: 'https://{store}/admin/api/{version}',
    authHeader: 'X-Shopify-Access-Token',
    rateLimitHeader: 'X-Shopify-Shop-Api-Call-Limit',
    webhookTopics: ['orders/create', 'orders/updated', 'orders/fulfilled', 'orders/cancelled', 'refunds/create']
  },
  woocommerce: {
    apiVersion: 'wc/v3',
    baseUrlTemplate: 'https://{store}/wp-json/{version}',
    authType: 'basic',
    webhookTopics: ['order.created', 'order.updated', 'order.deleted', 'order.restored']
  },
  bigcommerce: {
    apiVersion: 'v3',
    baseUrlTemplate: 'https://api.bigcommerce.com/stores/{store_hash}/{version}',
    authHeader: 'X-Auth-Token',
    webhookTopics: ['store/order/created', 'store/order/updated', 'store/order/statusUpdated']
  }
};

// Encryption utilities
async function encryptCredentials(credentials, encryptionKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(credentials));
  const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  
  const key = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decryptCredentials(encryptedData, encryptionKey) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const key = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// Platform API clients
class ShopifyClient {
  constructor(storeUrl, accessToken, apiVersion = '2024-01') {
    this.baseUrl = `https://${storeUrl}/admin/api/${apiVersion}`;
    this.accessToken = accessToken;
  }

  async request(endpoint, method = 'GET', body = null) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    const rateLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
    const rateLimit = rateLimitHeader ? {
      used: parseInt(rateLimitHeader.split('/')[0]),
      limit: parseInt(rateLimitHeader.split('/')[1])
    } : null;

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return { data: await response.json(), rateLimit };
  }

  async getOrders(params = {}) {
    const query = new URLSearchParams({
      status: 'any',
      limit: '250',
      ...params
    }).toString();
    return this.request(`/orders.json?${query}`);
  }

  async getOrder(orderId) {
    return this.request(`/orders/${orderId}.json`);
  }

  async updateOrder(orderId, data) {
    return this.request(`/orders/${orderId}.json`, 'PUT', { order: data });
  }

  async addOrderTags(orderId, tags) {
    const { data } = await this.getOrder(orderId);
    const existingTags = data.order.tags ? data.order.tags.split(', ') : [];
    const newTags = [...new Set([...existingTags, ...tags])].join(', ');
    return this.updateOrder(orderId, { tags: newTags });
  }

  async addOrderNote(orderId, note) {
    return this.request(`/orders/${orderId}/metafields.json`, 'POST', {
      metafield: {
        namespace: 'profitshield',
        key: 'risk_note',
        value: note,
        type: 'single_line_text_field'
      }
    });
  }

  async cancelOrder(orderId, reason) {
    return this.request(`/orders/${orderId}/cancel.json`, 'POST', { reason });
  }

  async getProducts(params = {}) {
    const query = new URLSearchParams({ limit: '250', ...params }).toString();
    return this.request(`/products.json?${query}`);
  }

  async getCustomers(params = {}) {
    const query = new URLSearchParams({ limit: '250', ...params }).toString();
    return this.request(`/customers.json?${query}`);
  }

  async registerWebhook(topic, address) {
    return this.request('/webhooks.json', 'POST', {
      webhook: { topic, address, format: 'json' }
    });
  }

  async listWebhooks() {
    return this.request('/webhooks.json');
  }

  async deleteWebhook(webhookId) {
    return this.request(`/webhooks/${webhookId}.json`, 'DELETE');
  }
}

class WooCommerceClient {
  constructor(storeUrl, consumerKey, consumerSecret) {
    this.baseUrl = `https://${storeUrl}/wp-json/wc/v3`;
    this.auth = btoa(`${consumerKey}:${consumerSecret}`);
  }

  async request(endpoint, method = 'GET', body = null) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WooCommerce API error: ${response.status} - ${error}`);
    }

    return { data: await response.json(), rateLimit: null };
  }

  async getOrders(params = {}) {
    const query = new URLSearchParams({
      per_page: '100',
      ...params
    }).toString();
    const result = await this.request(`/orders?${query}`);
    return { data: { orders: result.data }, rateLimit: null };
  }

  async getOrder(orderId) {
    const result = await this.request(`/orders/${orderId}`);
    return { data: { order: result.data }, rateLimit: null };
  }

  async updateOrder(orderId, data) {
    return this.request(`/orders/${orderId}`, 'PUT', data);
  }

  async addOrderNote(orderId, note) {
    return this.request(`/orders/${orderId}/notes`, 'POST', { note });
  }

  async getProducts(params = {}) {
    const query = new URLSearchParams({ per_page: '100', ...params }).toString();
    const result = await this.request(`/products?${query}`);
    return { data: { products: result.data }, rateLimit: null };
  }

  async getCustomers(params = {}) {
    const query = new URLSearchParams({ per_page: '100', ...params }).toString();
    const result = await this.request(`/customers?${query}`);
    return { data: { customers: result.data }, rateLimit: null };
  }

  async registerWebhook(topic, deliveryUrl) {
    return this.request('/webhooks', 'POST', {
      name: `ProfitShield ${topic}`,
      topic,
      delivery_url: deliveryUrl,
      status: 'active'
    });
  }
}

class BigCommerceClient {
  constructor(storeHash, accessToken) {
    this.baseUrl = `https://api.bigcommerce.com/stores/${storeHash}/v3`;
    this.v2Url = `https://api.bigcommerce.com/stores/${storeHash}/v2`;
    this.accessToken = accessToken;
  }

  async request(endpoint, method = 'GET', body = null, useV2 = false) {
    const baseUrl = useV2 ? this.v2Url : this.baseUrl;
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'X-Auth-Token': this.accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`BigCommerce API error: ${response.status} - ${error}`);
    }

    return { data: await response.json(), rateLimit: null };
  }

  async getOrders(params = {}) {
    const query = new URLSearchParams({ limit: '250', ...params }).toString();
    const result = await this.request(`/orders?${query}`, 'GET', null, true);
    return { data: { orders: result.data }, rateLimit: null };
  }

  async getOrder(orderId) {
    const result = await this.request(`/orders/${orderId}`, 'GET', null, true);
    return { data: { order: result.data }, rateLimit: null };
  }

  async updateOrder(orderId, data) {
    return this.request(`/orders/${orderId}`, 'PUT', data, true);
  }

  async getProducts(params = {}) {
    const query = new URLSearchParams({ limit: '250', ...params }).toString();
    const result = await this.request(`/catalog/products?${query}`);
    return { data: { products: result.data.data }, rateLimit: null };
  }

  async getCustomers(params = {}) {
    const query = new URLSearchParams({ limit: '250', ...params }).toString();
    const result = await this.request(`/customers?${query}`);
    return { data: { customers: result.data.data }, rateLimit: null };
  }

  async registerWebhook(scope, destination) {
    return this.request('/hooks', 'POST', {
      scope,
      destination,
      is_active: true
    });
  }
}

// Factory to get platform client
async function getPlatformClient(integration, encryptionKey) {
  const credentials = await decryptCredentials(integration.credentials_encrypted, encryptionKey);
  
  switch (integration.platform) {
    case 'shopify':
      return new ShopifyClient(integration.store_url, credentials.access_token, integration.api_version);
    case 'woocommerce':
      return new WooCommerceClient(integration.store_url, credentials.consumer_key, credentials.consumer_secret);
    case 'bigcommerce':
      return new BigCommerceClient(credentials.store_hash, credentials.access_token);
    default:
      throw new Error(`Unsupported platform: ${integration.platform}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');

    switch (action) {
      case 'connect_platform': {
        const { tenant_id, platform, store_url, credentials, sync_config, two_way_sync } = params;
        
        // Encrypt credentials
        const encryptedCreds = await encryptCredentials(credentials, encryptionKey);
        
        // Create integration record
        const integration = await base44.asServiceRole.entities.PlatformIntegration.create({
          tenant_id,
          platform,
          store_url,
          status: 'pending',
          api_version: PLATFORM_CONFIGS[platform]?.apiVersion || 'latest',
          credentials_encrypted: encryptedCreds,
          sync_config: sync_config || {},
          two_way_sync: two_way_sync || {}
        });

        // Test connection
        try {
          const client = await getPlatformClient(integration, encryptionKey);
          await client.getOrders({ limit: '1' });
          
          await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
            status: 'connected'
          });

          return Response.json({ success: true, integration_id: integration.id, status: 'connected' });
        } catch (error) {
          await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
            status: 'error',
            error_log: [{ timestamp: new Date().toISOString(), error_type: 'connection', message: error.message }]
          });
          return Response.json({ success: false, error: error.message }, { status: 400 });
        }
      }

      case 'test_connection': {
        const { integration_id } = params;
        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
        if (!integrations.length) {
          return Response.json({ error: 'Integration not found' }, { status: 404 });
        }

        const integration = integrations[0];
        const client = await getPlatformClient(integration, encryptionKey);
        
        try {
          await client.getOrders({ limit: '1' });
          return Response.json({ success: true, status: 'connected' });
        } catch (error) {
          return Response.json({ success: false, error: error.message });
        }
      }

      case 'register_webhooks': {
        const { integration_id, webhook_base_url } = params;
        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
        if (!integrations.length) {
          return Response.json({ error: 'Integration not found' }, { status: 404 });
        }

        const integration = integrations[0];
        const client = await getPlatformClient(integration, encryptionKey);
        const config = PLATFORM_CONFIGS[integration.platform];
        
        const registeredWebhooks = {};
        const errors = [];

        for (const topic of config.webhookTopics) {
          try {
            const webhookUrl = `${webhook_base_url}/platformWebhook?platform=${integration.platform}&tenant=${integration.tenant_id}`;
            const result = await client.registerWebhook(topic, webhookUrl);
            registeredWebhooks[topic.replace('/', '_')] = result.data.webhook?.id || result.data.id;
          } catch (error) {
            errors.push({ topic, error: error.message });
          }
        }

        await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
          webhook_endpoints: registeredWebhooks
        });

        return Response.json({ success: true, webhooks: registeredWebhooks, errors });
      }

      case 'push_risk_score': {
        const { integration_id, order_id, platform_order_id, risk_score, risk_level, risk_reasons } = params;
        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
        if (!integrations.length) {
          return Response.json({ error: 'Integration not found' }, { status: 404 });
        }

        const integration = integrations[0];
        if (!integration.two_way_sync?.enabled) {
          return Response.json({ error: 'Two-way sync not enabled' }, { status: 400 });
        }

        const client = await getPlatformClient(integration, encryptionKey);
        const results = { tags_added: false, note_added: false, action_taken: null };

        // Add risk tags
        if (integration.two_way_sync.push_tags) {
          const tags = [`profitshield:${risk_level}`, `risk_score:${risk_score}`];
          if (risk_level === 'high') tags.push('review_required');
          
          if (client.addOrderTags) {
            await client.addOrderTags(platform_order_id, tags);
            results.tags_added = true;
          }
        }

        // Add risk note
        if (integration.two_way_sync.push_notes && risk_reasons?.length) {
          const note = `ProfitShield Risk Assessment:\nScore: ${risk_score}/100 (${risk_level})\nFactors: ${risk_reasons.join(', ')}`;
          await client.addOrderNote(platform_order_id, note);
          results.note_added = true;
        }

        // Auto-hold high risk orders
        if (integration.two_way_sync.auto_hold_high_risk && risk_level === 'high') {
          // Platform-specific hold logic
          if (integration.platform === 'shopify') {
            await client.addOrderTags(platform_order_id, ['hold_fulfillment']);
          }
          results.action_taken = 'hold';
        }

        // Auto-cancel if above threshold
        if (integration.two_way_sync.auto_cancel_threshold && risk_score >= integration.two_way_sync.auto_cancel_threshold) {
          if (client.cancelOrder) {
            await client.cancelOrder(platform_order_id, 'fraud');
            results.action_taken = 'cancelled';
          }
        }

        return Response.json({ success: true, results });
      }

      case 'deregister_webhooks': {
        const { integration_id } = params;
        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
        if (!integrations.length) {
          return Response.json({ error: 'Integration not found' }, { status: 404 });
        }

        const integration = integrations[0];
        const client = await getPlatformClient(integration, encryptionKey);
        const errors = [];
        const deleted = [];

        // Get registered webhooks
        const webhookEndpoints = integration.webhook_endpoints || {};
        
        for (const [topic, webhookId] of Object.entries(webhookEndpoints)) {
          try {
            if (webhookId && client.deleteWebhook) {
              await client.deleteWebhook(webhookId);
              deleted.push(topic);
            }
          } catch (error) {
            errors.push({ topic, error: error.message });
          }
        }

        // Clear webhook endpoints from integration
        await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
          webhook_endpoints: {}
        });

        return Response.json({ success: true, deleted, errors });
      }

      case 'reconnect_platform': {
        const { integration_id, credentials } = params;
        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
        if (!integrations.length) {
          return Response.json({ error: 'Integration not found' }, { status: 404 });
        }

        const integration = integrations[0];
        
        // Encrypt new credentials
        const encryptedCreds = await encryptCredentials(credentials, encryptionKey);
        
        // Update integration with new credentials
        await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
          credentials_encrypted: encryptedCreds,
          status: 'pending'
        });

        // Test connection
        try {
          const updatedIntegrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
          const client = await getPlatformClient(updatedIntegrations[0], encryptionKey);
          await client.getOrders({ limit: '1' });
          
          await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
            status: 'connected',
            error_log: []
          });

          return Response.json({ success: true, status: 'connected' });
        } catch (error) {
          await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
            status: 'error',
            error_log: [{ timestamp: new Date().toISOString(), error_type: 'connection', message: error.message }]
          });
          return Response.json({ success: false, error: error.message }, { status: 400 });
        }
      }

      case 'get_platform_config': {
        const { platform } = params;
        return Response.json({ config: PLATFORM_CONFIGS[platform] || null });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Platform connector error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});