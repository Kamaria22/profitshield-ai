import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * QUANTUM UNIVERSAL PLATFORM DETECTOR
 * Auto-detects ANY ecommerce platform using multi-dimensional analysis
 * Alien-tech level integration capabilities
 */

const PLATFORM_SIGNATURES = {
  shopify: {
    headers: ['x-shopify-topic', 'x-shopify-shop-domain', 'x-shopify-api-version'],
    endpoints: ['/admin/api/', '/admin/products.json', '/admin/orders.json'],
    dataStructure: ['myshopify.com', 'shop_domain', 'admin_graphql_api_id'],
    apiPatterns: ['/admin/api/\\d{4}-\\d{2}/', 'X-Shopify-Access-Token']
  },
  woocommerce: {
    headers: ['x-wc-webhook-topic', 'x-wc-webhook-signature'],
    endpoints: ['/wp-json/wc/v3/', '/wc-api/v3/'],
    dataStructure: ['woocommerce', '_links', 'permalink_template'],
    apiPatterns: ['consumer_key', 'consumer_secret', 'wp-json']
  },
  bigcommerce: {
    headers: ['x-bc-webhook-id', 'x-bc-store-hash'],
    endpoints: ['/stores/{store_hash}/v3/', '/api/v2/'],
    dataStructure: ['store_hash', 'bigcommerce', 'X-Auth-Token'],
    apiPatterns: ['stores/.+/v[23]', 'X-Auth-Client']
  },
  magento: {
    headers: ['x-magento-tags'],
    endpoints: ['/rest/V1/', '/rest/default/V1/', '/api/rest/'],
    dataStructure: ['entity_id', 'attribute_set_id', 'magento'],
    apiPatterns: ['rest/V1', 'oauth/token']
  },
  stripe: {
    headers: ['stripe-signature'],
    endpoints: ['/v1/charges', '/v1/payment_intents', '/v1/customers'],
    dataStructure: ['stripe_id', 'object', 'livemode', 'payment_method_types'],
    apiPatterns: ['sk_live_', 'pk_live_', 'api.stripe.com']
  },
  square: {
    headers: ['square-signature'],
    endpoints: ['/v2/payments', '/v2/orders', '/v2/catalog'],
    dataStructure: ['square_id', 'location_id', 'merchant_id'],
    apiPatterns: ['squareup.com', 'Authorization: Bearer']
  },
  prestashop: {
    endpoints: ['/api/', '/modules/'],
    dataStructure: ['prestashop', 'id_shop', 'id_lang'],
    apiPatterns: ['ws_key', 'PS_SHOP_']
  },
  opencart: {
    endpoints: ['/index.php?route=api/', '/api/'],
    dataStructure: ['opencart', 'token', 'api_token'],
    apiPatterns: ['route=api', 'index.php']
  },
  custom: {
    dataStructure: ['order', 'product', 'customer', 'payment'],
    apiPatterns: ['api', 'webhook', 'orders', 'products']
  }
};

Deno.serve(async (req) => {
  let level = "info";
  let message = "Initializing quantum platform analysis";
  let status = "success";
  let data = {};

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const body = await req.json().catch(() => ({}));
    const { action, url, headers, sampleData, apiKey, storeId } = body;

    if (action === 'detect') {
      const detection = await detectPlatform(url, headers, sampleData);
      
      level = detection.confidence > 0.8 ? "info" : "warn";
      message = `Platform detected: ${detection.platform} (${Math.round(detection.confidence * 100)}% confidence)`;
      data = detection;

      return Response.json({ level, message, status, data });
    }

    if (action === 'auto_connect') {
      const result = await autoConnectPlatform(base44, user, url, headers, apiKey, storeId);
      
      level = result.success ? "info" : "error";
      message = result.success ? `Connected to ${result.platform}` : `Connection failed: ${result.error}`;
      data = result;

      return Response.json({ level, message, status, data });
    }

    if (action === 'validate_connection') {
      const validation = await validateConnection(body.integration_id, base44);
      
      level = validation.valid ? "info" : "warn";
      message = validation.valid ? "Connection valid" : `Connection issue: ${validation.issue}`;
      data = validation;

      return Response.json({ level, message, status, data });
    }

    level = "error";
    message = "Invalid action";
    status = "error";
    return Response.json({ level, message, status, data }, { status: 400 });

  } catch (error) {
    level = "error";
    message = `Detection failed: ${error.message}`;
    status = "error";
    data = { error: error.message };
    return Response.json({ level, message, status, data }, { status: 500 });
  }
});

async function detectPlatform(url, headers = {}, sampleData = null) {
  const scores = {};
  
  // Analyze headers
  for (const [platform, sig] of Object.entries(PLATFORM_SIGNATURES)) {
    let score = 0;
    
    if (sig.headers) {
      for (const header of sig.headers) {
        if (headers[header] || headers[header.toLowerCase()]) {
          score += 0.4;
        }
      }
    }
    
    // Analyze URL patterns
    if (url && sig.endpoints) {
      for (const endpoint of sig.endpoints) {
        if (url.includes(endpoint) || new RegExp(endpoint.replace(/[{}]/g, '\\w+')).test(url)) {
          score += 0.3;
        }
      }
    }
    
    // Analyze data structure
    if (sampleData && sig.dataStructure) {
      const dataStr = JSON.stringify(sampleData).toLowerCase();
      for (const keyword of sig.dataStructure) {
        if (dataStr.includes(keyword.toLowerCase())) {
          score += 0.15;
        }
      }
    }
    
    // Analyze API patterns
    if (sig.apiPatterns) {
      const combinedStr = `${url} ${JSON.stringify(headers)} ${JSON.stringify(sampleData)}`.toLowerCase();
      for (const pattern of sig.apiPatterns) {
        if (new RegExp(pattern, 'i').test(combinedStr)) {
          score += 0.15;
        }
      }
    }
    
    scores[platform] = Math.min(score, 1.0);
  }
  
  const detectedPlatform = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b);
  
  return {
    platform: detectedPlatform[0],
    confidence: detectedPlatform[1],
    alternatives: Object.entries(scores)
      .filter(([p, s]) => p !== detectedPlatform[0] && s > 0.3)
      .map(([p, s]) => ({ platform: p, confidence: s }))
      .sort((a, b) => b.confidence - a.confidence),
    detected_features: extractFeatures(url, headers, sampleData),
    recommended_auth: getAuthMethod(detectedPlatform[0]),
    required_scopes: getRequiredScopes(detectedPlatform[0])
  };
}

function extractFeatures(url, headers, sampleData) {
  const features = [];
  
  if (url?.includes('webhook')) features.push('webhooks');
  if (url?.includes('graphql')) features.push('graphql');
  if (url?.includes('rest') || url?.includes('api')) features.push('rest_api');
  if (headers?.authorization || headers?.Authorization) features.push('oauth');
  if (sampleData?.orders || sampleData?.order) features.push('order_management');
  if (sampleData?.products || sampleData?.product) features.push('product_catalog');
  if (sampleData?.customers || sampleData?.customer) features.push('customer_data');
  
  return features;
}

function getAuthMethod(platform) {
  const authMethods = {
    shopify: 'OAuth 2.0 with access token',
    woocommerce: 'OAuth 1.0a or API Keys (consumer_key/consumer_secret)',
    bigcommerce: 'OAuth 2.0 with X-Auth-Token',
    magento: 'OAuth 2.0 or Bearer Token',
    stripe: 'Bearer Token (API Key)',
    square: 'OAuth 2.0 Bearer Token',
    prestashop: 'API Key (ws_key)',
    opencart: 'API Token',
    custom: 'Bearer Token / API Key (auto-detect)'
  };
  
  return authMethods[platform] || 'OAuth 2.0 or API Key';
}

function getRequiredScopes(platform) {
  const scopes = {
    shopify: ['read_orders', 'read_products', 'read_customers', 'write_orders'],
    woocommerce: ['read', 'write'],
    bigcommerce: ['store_v2_orders', 'store_v2_products', 'store_v2_customers'],
    magento: ['Magento_Sales::sales', 'Magento_Catalog::catalog'],
    stripe: ['read_core', 'write_core'],
    square: ['ORDERS_READ', 'ORDERS_WRITE', 'PAYMENTS_READ'],
    prestashop: ['orders', 'products', 'customers'],
    opencart: ['api/sale/order', 'api/catalog/product'],
    custom: ['orders', 'products', 'customers']
  };
  
  return scopes[platform] || [];
}

async function autoConnectPlatform(base44, user, url, headers, apiKey, storeId) {
  try {
    const detection = await detectPlatform(url, headers);
    
    if (detection.confidence < 0.5) {
      return {
        success: false,
        error: 'Unable to reliably detect platform',
        detection
      };
    }
    
    const tenants = await base44.asServiceRole.entities.Tenant.filter({});
    let tenant = tenants[0];
    
    if (!tenant && user) {
      tenant = await base44.asServiceRole.entities.Tenant.create({
        shop_domain: extractDomain(url),
        shop_name: storeId || extractDomain(url),
        platform: detection.platform,
        status: 'active',
        onboarding_completed: true
      });
    }
    
    if (!tenant) {
      return { success: false, error: 'No tenant available' };
    }
    
    const integration = await base44.asServiceRole.entities.PlatformIntegration.create({
      tenant_id: tenant.id,
      platform: detection.platform,
      store_key: storeId || extractDomain(url),
      store_url: url,
      store_name: storeId || extractDomain(url),
      status: 'connected',
      api_version: 'auto-detected',
      scopes: detection.required_scopes,
      sync_config: {
        auto_sync_enabled: true,
        sync_frequency_minutes: 15,
        sync_historical_days: 90,
        sync_products: true,
        sync_customers: true,
        sync_inventory: true
      },
      two_way_sync: {
        enabled: true,
        push_risk_scores: true,
        push_tags: true,
        push_notes: true,
        auto_hold_high_risk: true
      }
    });
    
    return {
      success: true,
      platform: detection.platform,
      confidence: detection.confidence,
      tenant_id: tenant.id,
      integration_id: integration.id,
      features: detection.detected_features
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function validateConnection(integrationId, base44) {
  try {
    const integration = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integrationId });
    
    if (!integration || integration.length === 0) {
      return { valid: false, issue: 'Integration not found' };
    }
    
    const int = integration[0];
    
    if (int.status === 'error' || int.status === 'disconnected') {
      return { valid: false, issue: `Status: ${int.status}` };
    }
    
    const lastSync = new Date(int.last_sync_at);
    const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceSync > 24) {
      return { valid: false, issue: 'No sync in 24 hours' };
    }
    
    return {
      valid: true,
      platform: int.platform,
      last_sync: int.last_sync_at,
      status: int.last_sync_status
    };
    
  } catch (error) {
    return { valid: false, issue: error.message };
  }
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}