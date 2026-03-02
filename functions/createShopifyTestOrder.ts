/**
 * ADMIN-ONLY: Creates a test order in a Shopify dev store via Admin API,
 * then polls for up to 60s to verify it appears in Base44 DB.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function decryptToken(encryptedToken) {
  const key = Deno.env.get('ENCRYPTION_KEY');
  if (!key) return null;
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch (_) { return null; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { shop_domain } = await req.json();
    if (!shop_domain) {
      return Response.json({ error: 'shop_domain required' }, { status: 400 });
    }

    const db = base44.asServiceRole;
    const normalized = shop_domain.includes('.myshopify.com')
      ? shop_domain.toLowerCase()
      : `${shop_domain.toLowerCase()}.myshopify.com`;

    // Resolve tenant
    const tenants = await db.entities.Tenant.filter({ shop_domain: normalized });
    const tenant = tenants[0];
    if (!tenant) {
      return Response.json({ error: 'Tenant not found for this shop' }, { status: 404 });
    }

    // Get access token
    const tokens = await db.entities.OAuthToken.filter({ tenant_id: tenant.id, platform: 'shopify', is_valid: true });
    if (!tokens[0]) {
      return Response.json({ error: 'No valid OAuth token found. Reconnect store first.' }, { status: 400 });
    }
    const accessToken = await decryptToken(tokens[0].encrypted_access_token);
    if (!accessToken) {
      return Response.json({ error: 'Failed to decrypt token.' }, { status: 500 });
    }

    // Create test order in Shopify
    const testOrder = {
      order: {
        line_items: [{
          title: "ProfitShield Test Product",
          quantity: 1,
          price: "24.99",
          grams: 100
        }],
        customer: {
          first_name: "Test",
          last_name: "Order",
          email: "testorder@profitshield.test"
        },
        billing_address: {
          first_name: "Test", last_name: "Order",
          address1: "123 Test St", city: "Test City",
          province: "California", country: "United States",
          zip: "90210", phone: "555-555-5555"
        },
        financial_status: "paid",
        send_receipt: false,
        send_fulfillment_receipt: false,
        test: true
      }
    };

    const createRes = await fetch(`https://${normalized}/admin/api/2024-01/orders.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify(testOrder)
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return Response.json({ error: `Shopify API error: ${createRes.status}: ${errText}` }, { status: 500 });
    }

    const { order: shopifyOrder } = await createRes.json();
    const shopifyOrderId = shopifyOrder.id.toString();
    const shopifyOrderNumber = shopifyOrder.order_number || shopifyOrder.name;
    
    console.log(`[createShopifyTestOrder] Created Shopify order ${shopifyOrderId} (#${shopifyOrderNumber})`);

    // Also trigger a manual sync to force the order in (in case webhooks aren't set up yet)
    let syncResult = null;
    try {
      const { data } = await base44.functions.invoke('syncShopifyOrders', {
        tenant_id: tenant.id,
        days: 1
      });
      syncResult = data;
      console.log('[createShopifyTestOrder] Manual sync triggered:', JSON.stringify(syncResult));
    } catch (e) {
      console.warn('[createShopifyTestOrder] Manual sync failed:', e.message);
      syncResult = { error: e.message };
    }

    // Poll for up to 60s for the order to appear in Base44
    let orderRow = null;
    let elapsedMs = 0;
    const pollInterval = 5000;
    const maxWait = 60000;

    while (elapsedMs < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      elapsedMs += pollInterval;

      const found = await db.entities.Order.filter({
        tenant_id: tenant.id,
        platform_order_id: shopifyOrderId
      });

      if (found.length > 0) {
        orderRow = found[0];
        console.log(`[createShopifyTestOrder] Order found in DB after ${elapsedMs}ms`);
        break;
      }
      console.log(`[createShopifyTestOrder] Polling... ${elapsedMs}ms elapsed, order not yet in DB`);
    }

    // Check queue job
    const queueJobs = await db.entities.WebhookQueue.filter({ tenant_id: tenant.id }, '-created_date', 10);
    const relatedJob = queueJobs.find(j => 
      j.payload?.id?.toString() === shopifyOrderId || 
      j.event_type === 'orders/create'
    );

    const passed = !!orderRow;

    return Response.json({
      passed,
      evidence: {
        shopify_order_id: shopifyOrderId,
        shopify_order_number: shopifyOrderNumber,
        shopify_order_total: shopifyOrder.total_price,
        created_at_shopify: shopifyOrder.created_at,
        found_in_db: !!orderRow,
        elapsed_ms: elapsedMs,
        order_row_id: orderRow?.id || null,
        order_db_platform_order_id: orderRow?.platform_order_id || null,
        queue_job_id: relatedJob?.id || null,
        queue_job_status: relatedJob?.status || null,
        manual_sync_result: syncResult
      },
      message: passed
        ? `PASS: Order ${shopifyOrderId} found in Base44 within ${elapsedMs}ms`
        : `FAIL: Order ${shopifyOrderId} NOT found in Base44 after ${maxWait}ms. Check webhook registration and queue processor.`
    });

  } catch (error) {
    console.error('[createShopifyTestOrder]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});