/**
 * shopifyIntegrationSettings — Shopify Integration Management
 *
 * Handles getting, saving, and reconnecting Shopify integrations.
 * Works in both embedded (Shopify app) and non-embedded contexts.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      isAuthorized = !!user;
    } catch (_) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const action = body.action || 'get';
    const tenantId = body.tenant_id;
    const shop = body.shop;

    if (!tenantId) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    if (action === 'get') {
      return await getSettings(base44, tenantId);
    } else if (action === 'save') {
      return await saveSettings(base44, tenantId, body);
    } else if (action === 'reconnect') {
      if (!shop) {
        return Response.json({ error: 'shop required for reconnect' }, { status: 400 });
      }
      return await reconnectShopify(shop);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});

// ─────────────────────────────────────────────
// GET INTEGRATION & SETTINGS
// ─────────────────────────────────────────────

async function getSettings(base44, tenantId) {
  const db = base44.asServiceRole;

  const [integration, settings] = await Promise.all([
    db.entities.PlatformIntegration.filter({ tenant_id: tenantId, platform: 'shopify' })
      .then(r => r[0] || null)
      .catch(() => null),
    db.entities.TenantSettings.filter({ tenant_id: tenantId })
      .then(r => r[0] || {})
      .catch(() => ({}))
  ]);

  return Response.json({
    success: true,
    integration: integration ? {
      id: integration.id,
      platform: integration.platform,
      store_key: integration.store_key,
      store_url: integration.store_url,
      store_name: integration.store_name,
      status: integration.status,
      is_primary: integration.is_primary,
      installed_at: integration.installed_at,
      last_sync_at: integration.last_sync_at,
      last_connected_at: integration.last_connected_at,
      token_id: integration.token_id,
      sync_config: integration.sync_config || {},
      two_way_sync: integration.two_way_sync || {},
      api_version: integration.api_version
    } : null,
    settings: {
      auto_hold_high_risk: settings?.auto_hold_high_risk ?? false,
      auto_cancel_threshold: settings?.auto_cancel_threshold
    }
  });
}

// ─────────────────────────────────────────────
// SAVE SETTINGS
// ─────────────────────────────────────────────

async function saveSettings(base44, tenantId, body) {
  const db = base44.asServiceRole;
  const { sync_config, two_way_sync, auto_hold_high_risk, auto_cancel_threshold } = body;

  // Update PlatformIntegration
  const integrations = await db.entities.PlatformIntegration.filter({
    tenant_id: tenantId,
    platform: 'shopify'
  }).catch(() => []);

  if (integrations.length > 0) {
    await db.entities.PlatformIntegration.update(integrations[0].id, {
      sync_config: sync_config || {},
      two_way_sync: two_way_sync || {}
    });
  }

  // Update TenantSettings
  const settingsList = await db.entities.TenantSettings.filter({ tenant_id: tenantId }).catch(() => []);

  if (settingsList.length > 0) {
    await db.entities.TenantSettings.update(settingsList[0].id, {
      auto_hold_high_risk,
      auto_cancel_threshold
    });
  } else {
    await db.entities.TenantSettings.create({
      tenant_id: tenantId,
      auto_hold_high_risk,
      auto_cancel_threshold
    });
  }

  return Response.json({
    success: true,
    message: 'Settings saved'
  });
}

// ─────────────────────────────────────────────
// RECONNECT SHOPIFY (generate install URL)
// ─────────────────────────────────────────────

async function reconnectShopify(shop) {
  const apiKey = Deno.env.get('SHOPIFY_API_KEY') || '';
  const appUrl = Deno.env.get('APP_URL') || 'https://app.profitshield.ai';

  if (!apiKey) {
    return Response.json({ error: 'SHOPIFY_API_KEY not configured' }, { status: 500 });
  }

  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  const redirectUri = `${appUrl}/api/shopify/callback`;
  const scopes = [
    'write_orders',
    'read_orders',
    'write_products',
    'read_products',
    'write_customers',
    'read_customers',
    'read_fulfillments',
    'write_fulfillments',
    'write_inventory',
    'read_inventory'
  ].join(',');

  const installUrl = `https://${shopDomain}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return Response.json({
    success: true,
    install_url: installUrl,
    shop: shopDomain
  });
}