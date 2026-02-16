import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { tenant_id } = await req.json();
    
    if (!tenant_id) {
      return Response.json({ error: 'Missing tenant_id' }, { status: 400 });
    }
    
    // Get tenant
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    if (tenants.length === 0) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }
    const tenant = tenants[0];
    
    // Get OAuth token
    const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ 
      tenant_id: tenant.id, 
      platform: 'shopify',
      is_valid: true 
    });
    
    if (tokens.length === 0) {
      return Response.json({ error: 'No valid Shopify token found. Please reconnect your store.' }, { status: 400 });
    }
    
    // Decrypt access token using AES-GCM
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
    const encryptedToken = tokens[0].encrypted_access_token;
    
    let accessToken;
    try {
      const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      
      const encoder = new TextEncoder();
      const keyData = encoder.encode((encryptionKey || '').padEnd(32, '0').slice(0, 32));
      
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encrypted
      );
      
      accessToken = new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error('Token decryption failed:', e);
      return Response.json({ error: 'Failed to decrypt access token. Please reconnect your store.' }, { status: 500 });
    }
    
    console.log('[createShopifyTestOrder] Creating test order for:', tenant.shop_domain);
    
    // Step 1: Fetch a product/variant from the store
    const productsUrl = `https://${tenant.shop_domain}/admin/api/2024-01/products.json?limit=1`;
    const productsRes = await fetch(productsUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });
    
    if (!productsRes.ok) {
      const errorText = await productsRes.text();
      console.error('[createShopifyTestOrder] Failed to fetch products:', productsRes.status, errorText);
      return Response.json({ error: `Failed to fetch products: ${productsRes.status}` }, { status: 500 });
    }
    
    const { products } = await productsRes.json();
    
    if (!products || products.length === 0) {
      return Response.json({ error: 'No products found in store. Please add at least one product.' }, { status: 400 });
    }
    
    const product = products[0];
    const variant = product.variants?.[0];
    
    if (!variant) {
      return Response.json({ error: 'No product variants found.' }, { status: 400 });
    }
    
    console.log('[createShopifyTestOrder] Using product:', product.title, 'variant:', variant.id);
    
    // Step 2: Create a draft order (then complete it) - this works for dev stores
    // Using draft orders allows creating "paid" orders in development
    const draftOrderPayload = {
      draft_order: {
        line_items: [
          {
            variant_id: variant.id,
            quantity: 1
          }
        ],
        email: user.email || 'test@profitshield.ai',
        note: `ProfitShield Test Order - Created ${new Date().toISOString()}`,
        tags: 'profitshield-test',
        shipping_address: {
          first_name: 'Test',
          last_name: 'Customer',
          address1: '123 Test Street',
          city: 'Test City',
          province: 'California',
          country: 'United States',
          zip: '90210',
          phone: '555-555-5555'
        },
        billing_address: {
          first_name: 'Test',
          last_name: 'Customer',
          address1: '123 Test Street',
          city: 'Test City',
          province: 'California',
          country: 'United States',
          zip: '90210',
          phone: '555-555-5555'
        }
      }
    };
    
    // Create draft order
    const draftOrderUrl = `https://${tenant.shop_domain}/admin/api/2024-01/draft_orders.json`;
    const draftOrderRes = await fetch(draftOrderUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(draftOrderPayload)
    });
    
    if (!draftOrderRes.ok) {
      const errorText = await draftOrderRes.text();
      console.error('[createShopifyTestOrder] Failed to create draft order:', draftOrderRes.status, errorText);
      return Response.json({ error: `Failed to create draft order: ${draftOrderRes.status} - ${errorText}` }, { status: 500 });
    }
    
    const { draft_order } = await draftOrderRes.json();
    console.log('[createShopifyTestOrder] Created draft order:', draft_order.id);
    
    // Step 3: Complete the draft order (marks it as paid)
    const completeUrl = `https://${tenant.shop_domain}/admin/api/2024-01/draft_orders/${draft_order.id}/complete.json`;
    const completeRes = await fetch(completeUrl, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ payment_pending: false })
    });
    
    if (!completeRes.ok) {
      const errorText = await completeRes.text();
      console.error('[createShopifyTestOrder] Failed to complete draft order:', completeRes.status, errorText);
      // Still return success since draft order was created
      return Response.json({ 
        success: true,
        order_id: draft_order.id,
        order_number: draft_order.name,
        created_at: draft_order.created_at,
        status: 'draft_created_but_not_completed',
        message: 'Draft order created but not completed. Check Shopify Admin.'
      });
    }
    
    const { draft_order: completedOrder } = await completeRes.json();
    console.log('[createShopifyTestOrder] Completed draft order. Order ID:', completedOrder.order_id, 'Name:', completedOrder.name);
    
    return Response.json({ 
      success: true,
      order_id: completedOrder.order_id,
      order_number: completedOrder.name,
      created_at: completedOrder.completed_at || completedOrder.created_at,
      product_title: product.title,
      variant_title: variant.title,
      total_price: completedOrder.total_price
    });
    
  } catch (error) {
    console.error('[createShopifyTestOrder] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});