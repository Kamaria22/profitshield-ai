/**
 * shopifyTwoWaySync
 *
 * Handles two-way synchronization between ProfitShield and Shopify:
 *   - PUSH inventory levels from ProfitShield → Shopify
 *   - PUSH order fulfillment status from ProfitShield → Shopify
 *
 * Actions:
 *   sync_inventory   — update inventory quantity in Shopify for a product variant
 *   fulfill_order    — create a fulfillment in Shopify for a local order
 *   bulk_sync_inventory — push all ProfitShield inventory to Shopify
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_VERSION = '2024-01';

// AES-GCM decrypt (matches shopifyAuth encryption)
async function decryptToken(encryptedToken) {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const encoder = new TextEncoder();
  const keyData = encoder.encode((encryptionKey || '').padEnd(32, '0').slice(0, 32));
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function getShopifyCredentials(base44, tenant_id) {
  const [tenants, tokens] = await Promise.all([
    base44.asServiceRole.entities.Tenant.filter({ id: tenant_id }),
    base44.asServiceRole.entities.OAuthToken.filter({ tenant_id, platform: 'shopify', is_valid: true })
  ]);
  if (!tenants[0]) throw new Error('Tenant not found');
  if (!tokens[0]) throw new Error('No valid Shopify token found. Please reconnect your store.');

  const accessToken = await decryptToken(tokens[0].encrypted_access_token);
  return { tenant: tenants[0], accessToken };
}

function shopifyHeaders(accessToken) {
  return {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };
}

// ── Inventory Push ────────────────────────────────────────────────────────────

/**
 * Get the Shopify inventory_item_id for a variant
 */
async function getInventoryItemId(shopDomain, accessToken, variantId) {
  const res = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/variants/${variantId}.json`,
    { headers: shopifyHeaders(accessToken) }
  );
  if (!res.ok) throw new Error(`Failed to fetch variant: ${res.status}`);
  const { variant } = await res.json();
  return variant.inventory_item_id;
}

/**
 * Get the first location_id for the shop (needed for inventory adjustment)
 */
async function getFirstLocationId(shopDomain, accessToken) {
  const res = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/locations.json`,
    { headers: shopifyHeaders(accessToken) }
  );
  if (!res.ok) throw new Error(`Failed to fetch locations: ${res.status}`);
  const { locations } = await res.json();
  if (!locations || locations.length === 0) throw new Error('No locations found in Shopify store');
  return locations[0].id;
}

/**
 * Set absolute inventory level for an inventory_item at a location
 */
async function setInventoryLevel(shopDomain, accessToken, inventoryItemId, locationId, quantity) {
  const res = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/inventory_levels/set.json`,
    {
      method: 'POST',
      headers: shopifyHeaders(accessToken),
      body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId, available: quantity })
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.errors || `Inventory set failed: ${res.status}`);
  }
  return await res.json();
}

// ── Order Fulfillment Push ────────────────────────────────────────────────────

/**
 * Create a fulfillment for a Shopify order.
 * Uses the fulfillment_order API (2024-01+).
 */
async function fulfillShopifyOrder(shopDomain, accessToken, platformOrderId, trackingInfo = {}) {
  // Step 1: Get fulfillment orders
  const foRes = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/orders/${platformOrderId}/fulfillment_orders.json`,
    { headers: shopifyHeaders(accessToken) }
  );

  if (!foRes.ok) {
    const err = await foRes.text();
    throw new Error(`Failed to get fulfillment orders: ${foRes.status} ${err}`);
  }

  const { fulfillment_orders } = await foRes.json();
  const openFO = (fulfillment_orders || []).filter(fo => fo.status === 'open');

  if (openFO.length === 0) {
    return { success: false, error: 'No open fulfillment orders found (may already be fulfilled)' };
  }

  // Step 2: Create fulfillment
  const fulfillmentPayload = {
    fulfillment: {
      line_items_by_fulfillment_order: openFO.map(fo => ({
        fulfillment_order_id: fo.id,
        fulfillment_order_line_items: fo.line_items.map(li => ({
          id: li.id,
          quantity: li.fulfillable_quantity
        }))
      }))
    }
  };

  if (trackingInfo.number) {
    fulfillmentPayload.fulfillment.tracking_info = {
      number: trackingInfo.number,
      url: trackingInfo.url || null,
      company: trackingInfo.company || null
    };
    fulfillmentPayload.fulfillment.notify_customer = trackingInfo.notify_customer !== false;
  }

  const fulfillRes = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/fulfillments.json`,
    {
      method: 'POST',
      headers: shopifyHeaders(accessToken),
      body: JSON.stringify(fulfillmentPayload)
    }
  );

  if (!fulfillRes.ok) {
    const err = await fulfillRes.json().catch(() => ({}));
    return { success: false, error: err.errors || `Fulfillment failed: ${fulfillRes.status}` };
  }

  const { fulfillment } = await fulfillRes.json();
  return { success: true, fulfillment_id: fulfillment.id, status: fulfillment.status };
}

// ── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, tenant_id } = body;

    if (!tenant_id) return Response.json({ error: 'tenant_id required' }, { status: 400 });

    const { tenant, accessToken } = await getShopifyCredentials(base44, tenant_id);
    const shopDomain = tenant.shop_domain;

    // ── sync_inventory ───────────────────────────────────────────────────────
    if (action === 'sync_inventory') {
      const { variant_id, quantity, product_id } = body;
      if (!variant_id || quantity === undefined) {
        return Response.json({ error: 'variant_id and quantity required' }, { status: 400 });
      }

      const [inventoryItemId, locationId] = await Promise.all([
        getInventoryItemId(shopDomain, accessToken, variant_id),
        getFirstLocationId(shopDomain, accessToken)
      ]);

      await setInventoryLevel(shopDomain, accessToken, inventoryItemId, locationId, quantity);

      // Log to audit
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id,
        action: 'shopify_inventory_pushed',
        entity_type: 'ProductVariant',
        entity_id: String(variant_id),
        performed_by: user.email,
        description: `Inventory synced to Shopify: variant ${variant_id} → qty ${quantity}`,
        category: 'integration',
        severity: 'low'
      });

      return Response.json({ success: true, variant_id, quantity, location_id: locationId });
    }

    // ── bulk_sync_inventory ──────────────────────────────────────────────────
    if (action === 'bulk_sync_inventory') {
      const products = await base44.asServiceRole.entities.Product.filter({ tenant_id });
      const variants = await base44.asServiceRole.entities.ProductVariant.filter({ tenant_id });

      let locationId;
      try {
        locationId = await getFirstLocationId(shopDomain, accessToken);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
      }

      const results = [];
      for (const variant of variants) {
        if (!variant.platform_variant_id || variant.inventory_quantity === undefined) continue;
        try {
          const inventoryItemId = await getInventoryItemId(shopDomain, accessToken, variant.platform_variant_id);
          await setInventoryLevel(shopDomain, accessToken, inventoryItemId, locationId, variant.inventory_quantity);
          results.push({ variant_id: variant.platform_variant_id, quantity: variant.inventory_quantity, success: true });
        } catch (e) {
          results.push({ variant_id: variant.platform_variant_id, success: false, error: e.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id,
        action: 'shopify_bulk_inventory_pushed',
        entity_type: 'Product',
        performed_by: user.email,
        description: `Bulk inventory sync: ${successCount}/${results.length} variants updated`,
        category: 'integration',
        severity: 'low'
      });

      return Response.json({ success: true, synced: successCount, total: results.length, results });
    }

    // ── fulfill_order ────────────────────────────────────────────────────────
    if (action === 'fulfill_order') {
      const { order_id, platform_order_id, tracking_number, tracking_url, tracking_company, notify_customer } = body;

      if (!platform_order_id) {
        return Response.json({ error: 'platform_order_id required' }, { status: 400 });
      }

      const result = await fulfillShopifyOrder(shopDomain, accessToken, platform_order_id, {
        number: tracking_number,
        url: tracking_url,
        company: tracking_company,
        notify_customer: notify_customer !== false
      });

      if (result.success && order_id) {
        // Update local order record
        await base44.asServiceRole.entities.Order.update(order_id, {
          fulfillment_status: 'fulfilled',
          status: 'fulfilled'
        });

        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          action: 'shopify_order_fulfilled',
          entity_type: 'Order',
          entity_id: order_id,
          performed_by: user.email,
          description: `Order fulfilled in Shopify: ${platform_order_id}${tracking_number ? ` (tracking: ${tracking_number})` : ''}`,
          category: 'integration',
          severity: 'low'
        });
      }

      return Response.json(result);
    }

    return Response.json({ error: 'Invalid action. Use: sync_inventory, bulk_sync_inventory, fulfill_order' }, { status: 400 });

  } catch (error) {
    console.error('[shopifyTwoWaySync] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});