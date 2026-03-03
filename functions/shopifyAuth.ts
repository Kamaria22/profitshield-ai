import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import {
  SHOPIFY_API_KEY, SHOPIFY_API_SECRET, REQUIRED_SCOPES as SCOPES,
  REDIRECT_URI_CANONICAL, API_VERSION,
  canonicalizeShopDomain, encryptToken, decryptToken,
  validateRedirectWhitelist
} from './shopifyConfig.js';

// Normalize action + alias map
const ACTION_ALIASES = {
  reconnect: 'reauthorize',
  reconnect_oauth: 'reauthorize',
  reconnectoauth: 'reauthorize',  // camelCase variant lowercased
  reauth: 'reauthorize',
  reauthorize: 'reauthorize',
  install: 'install',
  callback: 'callback',
  registerwebhooks: 'registerWebhooks',
  register_webhooks: 'registerWebhooks',
};
const ALLOWED_ACTIONS = Object.keys(ACTION_ALIASES);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const rawAction = (body.action || '').toString().toLowerCase().trim();
    const action = ACTION_ALIASES[rawAction] || rawAction;
    const { shop, code, state } = body;
    
    console.log(`[shopifyAuth] action=${action} (raw=${rawAction}) shop=${shop}`);

    if (action === 'install' || action === 'reauthorize') {
      // Generate install URL
      if (!shop) {
        return Response.json({ error: 'Shop domain is required' }, { status: 400 });
      }
      
      const shopDomain = canonicalizeShopDomain(shop);
      if (!shopDomain) return Response.json({ error: 'Invalid shop domain' }, { status: 400 });

      // Always use CANONICAL redirect URI — must match Shopify Partner Dashboard whitelist exactly
      const redirectUri = REDIRECT_URI_CANONICAL;
      const isWhitelisted = validateRedirectWhitelist(redirectUri);
      const nonce = crypto.randomUUID();

      console.log(`[shopifyAuth] ${action} → redirect_uri=${redirectUri} whitelisted=${isWhitelisted} shop=${shopDomain}`);
      
      const authorizeUrl = `https://${shopDomain}/admin/oauth/authorize?` + new URLSearchParams({
        client_id: SHOPIFY_API_KEY,
        scope: SCOPES,
        redirect_uri: redirectUri,
        state: nonce
      }).toString();
      
      return Response.json({ 
        ok: true,
        install_url: authorizeUrl,    // legacy compat
        authorize_url: authorizeUrl,  // canonical
        state: nonce 
      });
    }
    
    if (action === 'registerWebhooks') {
      // Standalone webhook registration (called from Diagnose panel)
      if (!shop) {
        return Response.json({ error: 'Shop domain is required' }, { status: 400 });
      }
      const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

      // Look up integration + token
      const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ store_key: shopDomain, platform: 'shopify' });
      if (integrations.length === 0) return Response.json({ error: 'Integration not found' }, { status: 404 });
      const integration = integrations[0];

      const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ store_key: shopDomain, platform: 'shopify' });
      if (tokens.length === 0 || !tokens[0].encrypted_access_token) {
        return Response.json({ error: 'OAuth token not found — reconnect OAuth first' }, { status: 400 });
      }

      const accessToken = await decryptToken(tokens[0].encrypted_access_token);
      const result = await registerWebhooks(shopDomain, accessToken, integration.id, base44.asServiceRole);
      return Response.json({ ok: true, registered_count: Object.keys(result.registered).length, error_count: result.errors.length, registered: result.registered, errors: result.errors });
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
      let user = null;
      try {
        user = await base44.auth.me();
      } catch (e) {
        console.log('[shopifyAuth] No authenticated user yet');
      }
      
      // Resolve tenant (single source of truth)
      console.log('[shopifyAuth] Resolving tenant for shop:', shopDomain);
      
      let tenant;
      const existingTenants = await base44.asServiceRole.entities.Tenant.filter({ 
        shop_domain: shopDomain,
        platform: 'shopify'
      });
      
      if (existingTenants.length > 0) {
        tenant = existingTenants[0];
        await base44.asServiceRole.entities.Tenant.update(tenant.id, {
          status: 'active',
          shop_name: shopData.name || shopDomain
        });
        console.log('[shopifyAuth] Updated existing tenant:', tenant.id);
      } else {
        // Create new tenant
        const now = new Date();
        const trialEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        tenant = await base44.asServiceRole.entities.Tenant.create({
          shop_domain: shopDomain,
          shop_name: shopData.name || shopDomain,
          platform: 'shopify',
          status: 'active',
          subscription_tier: 'trial',
          plan_status: 'trial',
          monthly_order_limit: 100,
          orders_this_month: 0,
          onboarding_completed: false,
          trial_started_at: now.toISOString(),
          trial_ends_at: trialEnd.toISOString(),
          currency: shopData.currency || 'USD',
          webhook_secret: crypto.randomUUID()
        });
        console.log('[shopifyAuth] Created new tenant:', tenant.id);
        
        // Create default TenantSettings
        await base44.asServiceRole.entities.TenantSettings.create({
          tenant_id: tenant.id,
          default_payment_fee_pct: 2.9,
          default_payment_fee_fixed: 0.3,
          default_platform_fee_pct: 0,
          shipping_buffer_pct: 10,
          high_risk_threshold: 70,
          medium_risk_threshold: 40,
          enable_discount_protection: false,
          enable_shipping_alerts: true,
          enable_risk_alerts: true,
          weekly_report_enabled: true,
          badge_public: false,
          badge_style: 'light'
        });
      }
      
      // Create PlatformIntegration record
      const existingIntegrations = await base44.asServiceRole.entities.PlatformIntegration.filter({
        tenant_id: tenant.id,
        platform: 'shopify'
      });
      
      let integration;
      if (existingIntegrations.length > 0) {
        integration = existingIntegrations[0];
        await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
          status: 'connected',
          store_name: shopData.name || shopDomain,
          last_connected_at: new Date().toISOString()
        });
      } else {
        integration = await base44.asServiceRole.entities.PlatformIntegration.create({
          tenant_id: tenant.id,
          platform: 'shopify',
          store_key: shopDomain,
          store_url: `https://${shopDomain}`,
          store_name: shopData.name || shopDomain,
          status: 'connected',
          is_primary: true,
          installed_at: new Date().toISOString(),
          last_connected_at: new Date().toISOString(),
          scopes: scope.split(',')
        });
      }
      
      // Encrypt and store token
      const encryptedToken = await encryptToken(access_token);
      
      const existingTokens = await base44.asServiceRole.entities.OAuthToken.filter({ 
        tenant_id: tenant.id,
        platform: 'shopify'
      });

      let oauthToken;
      if (existingTokens.length > 0) {
        oauthToken = await base44.asServiceRole.entities.OAuthToken.update(existingTokens[0].id, {
          encrypted_access_token: encryptedToken,
          store_key: shopDomain,
          scopes: scope.split(','),
          is_valid: true,
          rotated_at: new Date().toISOString()
        });
        oauthToken = { ...existingTokens[0], encrypted_access_token: encryptedToken, store_key: shopDomain, is_valid: true };
        console.log('[shopifyAuth] Token updated for tenant:', tenant.id, 'token id:', existingTokens[0].id);
      } else {
        oauthToken = await base44.asServiceRole.entities.OAuthToken.create({
          tenant_id: tenant.id,
          platform: 'shopify',
          store_key: shopDomain,
          encrypted_access_token: encryptedToken,
          scopes: scope.split(','),
          is_valid: true
        });
        console.log('[shopifyAuth] Token created for tenant:', tenant.id, 'token id:', oauthToken.id);
      }

      // Write token_id back onto the integration record so lookups are O(1)
      await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
        token_id: oauthToken.id || existingTokens[0]?.id,
        store_key: shopDomain
      });

      // Audit log: token saved
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant.id,
        action: 'oauth_token_saved',
        entity_type: 'oauth_token',
        entity_id: oauthToken.id || existingTokens[0]?.id,
        performed_by: user?.email || 'system',
        description: `OAuth token saved for ${shopDomain}. Scopes: ${scope}`,
        severity: 'low',
        category: 'integration',
        metadata: { shop_domain: shopDomain, scopes: scope.split(',') }
      }).catch(() => {});
      
      // CRITICAL: Auto-provision — Shopify install ALWAYS grants owner role, no manual approval.
      if (user) {
        console.log('[shopifyAuth] Auto-provisioning user as owner for shop:', shopDomain);
        
        const currentTenantId = user.tenant_id;
        const currentRole = (user.role || '').toLowerCase();

        // Always ensure the installing user is owner of their tenant.
        // Never require manual approval for Shopify OAuth installs.
        const updates = {};
        if (!currentTenantId || currentTenantId === tenant.id) {
          updates.tenant_id = tenant.id;
        }
        // Upgrade role to owner unless already admin/owner
        if (currentRole !== 'admin' && currentRole !== 'owner') {
          updates.role = 'owner';
        }

        if (Object.keys(updates).length > 0) {
          await base44.auth.updateMe(updates);
          console.log('[shopifyAuth] User auto-provisioned:', updates);
        }
      } else {
        // No authenticated user yet — store pending provision so it runs on next login
        console.log('[shopifyAuth] No authenticated user — storing pending provision for shop:', shopDomain);
        await base44.asServiceRole.entities.Tenant.update(tenant.id, {
          pending_owner_email: null, // cleared once claimed
          pending_provision: true
        });
      }
      
      // Register webhooks — pass integration.id so we can store the webhook IDs
      const webhookResult = await registerWebhooks(shopDomain, access_token, integration.id, base44.asServiceRole);
      
      // Audit log for webhook registration
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant.id,
        action: webhookResult.errors.length === 0 ? 'webhook_register_success' : 'webhook_register_partial',
        entity_type: 'platform_integration',
        entity_id: integration.id,
        performed_by: user?.email || 'system',
        description: `Webhook registration: ${Object.keys(webhookResult.registered).length} registered, ${webhookResult.errors.length} failed. URL: ${Deno.env.get('APP_URL')}/api/functions/shopifyWebhook`,
        severity: webhookResult.errors.length > 0 ? 'medium' : 'low',
        category: 'integration',
        metadata: { registered: webhookResult.registered, errors: webhookResult.errors }
      }).catch(() => {});
      
      // Create audit log
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant.id,
        actor_email: user?.email || 'system',
        action: 'store_connected',
        entity_type: 'tenant',
        entity_id: tenant.id,
        metadata: { shop_domain: shopDomain }
      });
      
      // Build post-install redirect back into embedded context
      const storeSlug = shopDomain.replace('.myshopify.com', '');
      const hostEncoded = Buffer.from(`${storeSlug}.myshopify.com/admin`).toString('base64');
      const postInstallUrl = `https://admin.shopify.com/store/${storeSlug}/apps/profitshield-ai?shop=${shopDomain}&host=${hostEncoded}&embedded=1`;

      console.log(`[shopifyAuth] callback complete — redirecting to embedded context: ${postInstallUrl}`);

      return Response.json({ 
        success: true,
        auto_provisioned: true,
        context: 'shopify_install',
        tenant_id: tenant.id,
        integration_id: integration.id,
        shop_domain: shopDomain,
        shop_name: shopData.name || shopDomain,
        token_saved: true,
        webhooks_registered: Object.keys(webhookResult.registered).length,
        webhook_errors: webhookResult.errors.length,
        redirect_url: postInstallUrl
      });
    }
    
    return Response.json({ 
      error: 'Invalid action', 
      received_action: rawAction, 
      allowed_actions: ALLOWED_ACTIONS 
    }, { status: 400 });
    
  } catch (error) {
    console.error('Auth error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) {
    return atob(encryptedToken);
  }
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // Fallback for base64-only tokens
    return atob(encryptedToken);
  }
}

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

async function registerWebhooks(shopDomain, accessToken, integrationId, db) {
  const appUrl = Deno.env.get('APP_URL') || 'https://app.base44.com';
  const webhookUrl = `${appUrl}/api/functions/shopifyWebhook`;
  
  const topics = [
    'orders/create',
    'orders/updated',
    'orders/paid',
    'orders/cancelled',
    'refunds/create',
    'products/update',
    'app/uninstalled'
  ];

  // First, delete any existing webhooks pointing to our URL to avoid duplicates
  try {
    const existingRes = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken }
    });
    if (existingRes.ok) {
      const { webhooks } = await existingRes.json();
      for (const wh of (webhooks || [])) {
        if (wh.address === webhookUrl) {
          await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks/${wh.id}.json`, {
            method: 'DELETE',
            headers: { 'X-Shopify-Access-Token': accessToken }
          });
          console.log(`[registerWebhooks] Deleted existing webhook ${wh.id} for topic ${wh.topic}`);
        }
      }
    }
  } catch (e) {
    console.warn('[registerWebhooks] Could not clean up old webhooks:', e.message);
  }
  
  const registeredIds = {};
  const errors = [];

  for (const topic of topics) {
    try {
      const res = await fetch(`https://${shopDomain}/admin/api/2024-01/webhooks.json`, {
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
      const data = await res.json();
      if (data.webhook?.id) {
        registeredIds[topic.replace('/', '_')] = data.webhook.id.toString();
        console.log(`[registerWebhooks] Registered ${topic} → webhook id ${data.webhook.id}`);
      } else {
        console.error(`[registerWebhooks] Failed to register ${topic}:`, JSON.stringify(data));
        errors.push({ topic, error: JSON.stringify(data) });
      }
    } catch (e) {
      console.error(`[registerWebhooks] Exception for ${topic}:`, e.message);
      errors.push({ topic, error: e.message });
    }
  }

  // Store registered webhook IDs on the integration record
  if (integrationId && db) {
    try {
      await db.entities.PlatformIntegration.update(integrationId, {
        webhook_endpoints: registeredIds,
        last_connected_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('[registerWebhooks] Could not save webhook IDs:', e.message);
    }
  }

  console.log(`[registerWebhooks] Done. Registered: ${Object.keys(registeredIds).length}/${topics.length}. Errors: ${errors.length}`);
  return { registered: registeredIds, errors };
}