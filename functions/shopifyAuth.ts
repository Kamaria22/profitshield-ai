import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const SHOPIFY_API_KEY = Deno.env.get('SHOPIFY_API_KEY');
const SHOPIFY_API_SECRET = Deno.env.get('SHOPIFY_API_SECRET');
const SCOPES = 'read_orders,read_products,read_customers,read_inventory,read_fulfillments,read_shipping';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, shop, code, state } = await req.json();
    
    if (action === 'install') {
      // Generate install URL
      if (!shop) {
        return Response.json({ error: 'Shop domain is required' }, { status: 400 });
      }
      
      const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
      const redirectUri = `${Deno.env.get('APP_URL') || req.headers.get('origin')}/api/shopify/callback`;
      const nonce = crypto.randomUUID();
      
      const installUrl = `https://${shopDomain}/admin/oauth/authorize?` + new URLSearchParams({
        client_id: SHOPIFY_API_KEY,
        scope: SCOPES,
        redirect_uri: redirectUri,
        state: nonce
      }).toString();
      
      return Response.json({ 
        install_url: installUrl,
        state: nonce 
      });
    }
    
    if (action === 'callback') {
      // Exchange code for access token
      if (!shop || !code) {
        return Response.json({ error: 'Missing shop or code' }, { status: 400 });
      }
      
      const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
      
      // Exchange code for token
      const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: SHOPIFY_API_KEY,
          client_secret: SHOPIFY_API_SECRET,
          code
        })
      });
      
      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('Token exchange failed:', error);
        return Response.json({ error: 'Failed to get access token' }, { status: 400 });
      }
      
      const { access_token, scope } = await tokenResponse.json();
      
      // Get shop info
      const shopResponse = await fetch(`https://${shopDomain}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': access_token }
      });
      
      const shopData = shopResponse.ok ? (await shopResponse.json()).shop : {};
      
      // Get current user
      const user = await base44.auth.me();
      
      // Check if tenant exists
      let tenant;
      const existingTenants = await base44.asServiceRole.entities.Tenant.filter({ 
        shop_domain: shopDomain 
      });
      
      if (existingTenants.length > 0) {
        tenant = existingTenants[0];
        await base44.asServiceRole.entities.Tenant.update(tenant.id, {
          status: 'pending_setup',
          shop_name: shopData.name || shopDomain
        });
      } else {
        // Create new tenant
        tenant = await base44.asServiceRole.entities.Tenant.create({
          shop_domain: shopDomain,
          shop_name: shopData.name || shopDomain,
          platform: 'shopify',
          status: 'pending_setup',
          subscription_tier: 'trial',
          monthly_order_limit: 100,
          orders_this_month: 0,
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          currency: shopData.currency || 'USD',
          webhook_secret: crypto.randomUUID()
        });
      }
      
      // Encrypt and store token
      const encryptedToken = await encryptToken(access_token);
      
      const existingTokens = await base44.asServiceRole.entities.OAuthToken.filter({ 
        tenant_id: tenant.id 
      });
      
      if (existingTokens.length > 0) {
        await base44.asServiceRole.entities.OAuthToken.update(existingTokens[0].id, {
          encrypted_access_token: encryptedToken,
          scopes: scope.split(','),
          is_valid: true,
          rotated_at: new Date().toISOString()
        });
      } else {
        await base44.asServiceRole.entities.OAuthToken.create({
          tenant_id: tenant.id,
          platform: 'shopify',
          encrypted_access_token: encryptedToken,
          scopes: scope.split(','),
          is_valid: true
        });
      }
      
      // Update user with tenant_id
      if (user) {
        await base44.auth.updateMe({ tenant_id: tenant.id });
      }
      
      // Register webhooks
      await registerWebhooks(shopDomain, access_token, tenant.webhook_secret);
      
      // Create audit log
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant.id,
        actor_email: user?.email || 'system',
        action: 'store_connected',
        entity_type: 'tenant',
        entity_id: tenant.id,
        metadata: { shop_domain: shopDomain }
      });
      
      return Response.json({ 
        success: true, 
        tenant_id: tenant.id,
        shop_name: shopData.name || shopDomain
      });
    }
    
    return Response.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('Auth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function encryptToken(token) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    console.warn('ENCRYPTION_KEY not set, storing token with basic encoding');
    return btoa(token);
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function registerWebhooks(shopDomain, accessToken, webhookSecret) {
  const webhookUrl = `${Deno.env.get('APP_URL') || 'https://app.base44.com'}/api/functions/shopifyWebhook`;
  
  const topics = [
    'orders/create',
    'orders/updated', 
    'orders/paid',
    'orders/fulfilled',
    'orders/cancelled',
    'refunds/create',
    'app/uninstalled'
  ];
  
  for (const topic of topics) {
    try {
      await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address: webhookUrl,
            format: 'json'
          }
        })
      });
    } catch (e) {
      console.error(`Failed to register webhook ${topic}:`, e);
    }
  }
}