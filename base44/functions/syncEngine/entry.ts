import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Encryption utilities
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

// Platform client factory (simplified for sync engine)
async function createPlatformClient(integration, encryptionKey) {
  const credentials = await decryptCredentials(integration.credentials_encrypted, encryptionKey);
  
  const makeRequest = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  };

  if (integration.platform === 'shopify') {
    const baseUrl = `https://${integration.store_url}/admin/api/${integration.api_version || '2024-01'}`;
    return {
      getOrders: async (params = {}) => {
        const query = new URLSearchParams({ status: 'any', limit: '250', ...params }).toString();
        return makeRequest(`${baseUrl}/orders.json?${query}`, {
          headers: { 'X-Shopify-Access-Token': credentials.access_token }
        });
      },
      getProducts: async (params = {}) => {
        const query = new URLSearchParams({ limit: '250', ...params }).toString();
        return makeRequest(`${baseUrl}/products.json?${query}`, {
          headers: { 'X-Shopify-Access-Token': credentials.access_token }
        });
      },
      getCustomers: async (params = {}) => {
        const query = new URLSearchParams({ limit: '250', ...params }).toString();
        return makeRequest(`${baseUrl}/customers.json?${query}`, {
          headers: { 'X-Shopify-Access-Token': credentials.access_token }
        });
      },
      updateOrder: async (orderId, data) => {
        return makeRequest(`${baseUrl}/orders/${orderId}.json`, {
          method: 'PUT',
          headers: { 'X-Shopify-Access-Token': credentials.access_token },
          body: JSON.stringify({ order: data })
        });
      },
      addMetafield: async (orderId, metafield) => {
        return makeRequest(`${baseUrl}/orders/${orderId}/metafields.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': credentials.access_token },
          body: JSON.stringify({ metafield })
        });
      }
    };
  }

  if (integration.platform === 'woocommerce') {
    const baseUrl = `https://${integration.store_url}/wp-json/wc/v3`;
    const auth = btoa(`${credentials.consumer_key}:${credentials.consumer_secret}`);
    return {
      getOrders: async (params = {}) => {
        const query = new URLSearchParams({ per_page: '100', ...params }).toString();
        const data = await makeRequest(`${baseUrl}/orders?${query}`, {
          headers: { 'Authorization': `Basic ${auth}` }
        });
        return { orders: data };
      },
      getProducts: async (params = {}) => {
        const query = new URLSearchParams({ per_page: '100', ...params }).toString();
        const data = await makeRequest(`${baseUrl}/products?${query}`, {
          headers: { 'Authorization': `Basic ${auth}` }
        });
        return { products: data };
      },
      getCustomers: async (params = {}) => {
        const query = new URLSearchParams({ per_page: '100', ...params }).toString();
        const data = await makeRequest(`${baseUrl}/customers?${query}`, {
          headers: { 'Authorization': `Basic ${auth}` }
        });
        return { customers: data };
      },
      updateOrder: async (orderId, data) => {
        return makeRequest(`${baseUrl}/orders/${orderId}`, {
          method: 'PUT',
          headers: { 'Authorization': `Basic ${auth}` },
          body: JSON.stringify(data)
        });
      },
      addOrderNote: async (orderId, note) => {
        return makeRequest(`${baseUrl}/orders/${orderId}/notes`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}` },
          body: JSON.stringify({ note })
        });
      }
    };
  }

  if (integration.platform === 'bigcommerce') {
    const baseUrl = `https://api.bigcommerce.com/stores/${credentials.store_hash}`;
    return {
      getOrders: async (params = {}) => {
        const query = new URLSearchParams({ limit: '250', ...params }).toString();
        const data = await makeRequest(`${baseUrl}/v2/orders?${query}`, {
          headers: { 'X-Auth-Token': credentials.access_token }
        });
        return { orders: data };
      },
      getProducts: async (params = {}) => {
        const query = new URLSearchParams({ limit: '250', ...params }).toString();
        const data = await makeRequest(`${baseUrl}/v3/catalog/products?${query}`, {
          headers: { 'X-Auth-Token': credentials.access_token }
        });
        return { products: data.data };
      },
      getCustomers: async (params = {}) => {
        const query = new URLSearchParams({ limit: '250', ...params }).toString();
        const data = await makeRequest(`${baseUrl}/v3/customers?${query}`, {
          headers: { 'X-Auth-Token': credentials.access_token }
        });
        return { customers: data.data };
      },
      updateOrder: async (orderId, data) => {
        return makeRequest(`${baseUrl}/v2/orders/${orderId}`, {
          method: 'PUT',
          headers: { 'X-Auth-Token': credentials.access_token },
          body: JSON.stringify(data)
        });
      }
    };
  }

  throw new Error(`Unsupported platform: ${integration.platform}`);
}

// Transform functions for each platform
function transformShopifyOrder(data, tenantId) {
  return {
    tenant_id: tenantId,
    platform_order_id: String(data.id),
    order_number: data.name || data.order_number,
    customer_email: data.email || data.customer?.email,
    customer_name: data.customer ? `${data.customer.first_name || ''} ${data.customer.last_name || ''}`.trim() : null,
    order_date: data.created_at,
    status: data.financial_status === 'refunded' ? 'refunded' : 
            data.fulfillment_status === 'fulfilled' ? 'fulfilled' : 
            data.financial_status === 'paid' ? 'paid' : 'pending',
    fulfillment_status: data.fulfillment_status || 'unfulfilled',
    subtotal: parseFloat(data.subtotal_price) || 0,
    shipping_charged: parseFloat(data.total_shipping_price_set?.shop_money?.amount) || 0,
    tax_total: parseFloat(data.total_tax) || 0,
    discount_total: parseFloat(data.total_discounts) || 0,
    total_revenue: parseFloat(data.total_price) || 0,
    refund_amount: data.refunds?.reduce((sum, r) => sum + parseFloat(r.transactions?.[0]?.amount || 0), 0) || 0,
    billing_address: data.billing_address,
    shipping_address: data.shipping_address,
    discount_codes: data.discount_codes?.map(d => d.code) || [],
    tags: data.tags ? data.tags.split(', ') : [],
    is_first_order: data.customer?.orders_count === 1,
    is_demo: false,
    platform_data: data
  };
}

function transformWooCommerceOrder(data, tenantId) {
  return {
    tenant_id: tenantId,
    platform_order_id: String(data.id),
    order_number: data.number,
    customer_email: data.billing?.email,
    customer_name: `${data.billing?.first_name || ''} ${data.billing?.last_name || ''}`.trim(),
    order_date: data.date_created,
    status: data.status === 'refunded' ? 'refunded' : 
            data.status === 'completed' ? 'fulfilled' : 
            data.status === 'processing' ? 'paid' : 'pending',
    fulfillment_status: data.status === 'completed' ? 'fulfilled' : 'unfulfilled',
    subtotal: parseFloat(data.total) - parseFloat(data.shipping_total || 0) - parseFloat(data.total_tax || 0),
    shipping_charged: parseFloat(data.shipping_total) || 0,
    tax_total: parseFloat(data.total_tax) || 0,
    discount_total: parseFloat(data.discount_total) || 0,
    total_revenue: parseFloat(data.total) || 0,
    billing_address: data.billing,
    shipping_address: data.shipping,
    is_demo: false,
    platform_data: data
  };
}

function transformBigCommerceOrder(data, tenantId) {
  return {
    tenant_id: tenantId,
    platform_order_id: String(data.id),
    order_number: String(data.id),
    customer_email: data.billing_address?.email,
    customer_name: `${data.billing_address?.first_name || ''} ${data.billing_address?.last_name || ''}`.trim(),
    order_date: data.date_created,
    status: data.status_id === 4 ? 'cancelled' : 
            data.status_id >= 10 ? 'fulfilled' : 
            data.status_id === 11 ? 'paid' : 'pending',
    fulfillment_status: data.status_id >= 10 ? 'fulfilled' : 'unfulfilled',
    subtotal: parseFloat(data.subtotal_ex_tax) || 0,
    shipping_charged: parseFloat(data.shipping_cost_ex_tax) || 0,
    tax_total: parseFloat(data.total_tax) || 0,
    discount_total: parseFloat(data.discount_amount) || 0,
    total_revenue: parseFloat(data.total_inc_tax) || 0,
    billing_address: data.billing_address,
    shipping_address: data.shipping_addresses?.[0],
    is_demo: false,
    platform_data: data
  };
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, ...params } = await req.json();
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');

    switch (action) {
      case 'start_sync': {
        const { integration_id, job_type = 'incremental_sync', sync_window } = params;

        // Get integration
        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
        if (!integrations.length) {
          return Response.json({ error: 'Integration not found' }, { status: 404 });
        }
        const integration = integrations[0];

        // Create sync job
        const syncJob = await base44.asServiceRole.entities.SyncJob.create({
          tenant_id: integration.tenant_id,
          integration_id,
          platform: integration.platform,
          job_type,
          direction: 'inbound',
          status: 'running',
          priority: 5,
          started_at: new Date().toISOString(),
          sync_window: sync_window || {},
          progress: { total_items: 0, processed_items: 0, failed_items: 0 },
          triggered_by: 'manual'
        });

        try {
          const client = await createPlatformClient(integration, encryptionKey);
          const results = {
            orders_created: 0,
            orders_updated: 0,
            products_synced: 0,
            customers_synced: 0,
            errors: []
          };

          // Sync orders
          if (job_type === 'full_sync' || job_type === 'incremental_sync' || job_type === 'orders_only') {
            const orderParams = {};
            if (sync_window?.start_date) {
              orderParams.created_at_min = sync_window.start_date;
            }
            if (sync_window?.end_date) {
              orderParams.created_at_max = sync_window.end_date;
            }

            const ordersData = await client.getOrders(orderParams);
            const orders = ordersData.orders || [];

            for (const orderData of orders) {
              try {
                let transformedOrder;
                if (integration.platform === 'shopify') {
                  transformedOrder = transformShopifyOrder(orderData, integration.tenant_id);
                } else if (integration.platform === 'woocommerce') {
                  transformedOrder = transformWooCommerceOrder(orderData, integration.tenant_id);
                } else if (integration.platform === 'bigcommerce') {
                  transformedOrder = transformBigCommerceOrder(orderData, integration.tenant_id);
                }

                // Check if order exists
                const existingOrders = await base44.asServiceRole.entities.Order.filter({
                  tenant_id: integration.tenant_id,
                  platform_order_id: transformedOrder.platform_order_id
                });

                if (existingOrders.length > 0) {
                  await base44.asServiceRole.entities.Order.update(existingOrders[0].id, transformedOrder);
                  results.orders_updated++;
                } else {
                  const newOrder = await base44.asServiceRole.entities.Order.create(transformedOrder);
                  results.orders_created++;

                  // Analyze risk for new orders
                  try {
                    await base44.asServiceRole.functions.invoke('analyzeOrderRisk', {
                      order_id: newOrder.id,
                      tenant_id: integration.tenant_id
                    });
                  } catch (riskError) {
                    console.error('Risk analysis failed:', riskError);
                  }
                }
              } catch (orderError) {
                results.errors.push({
                  entity_type: 'order',
                  entity_id: orderData.id,
                  error: orderError.message
                });
              }
            }
          }

          // Sync products
          if ((job_type === 'full_sync' || job_type === 'products_only') && integration.sync_config?.sync_products) {
            try {
              const productsData = await client.getProducts();
              const products = productsData.products || [];
              
              for (const productData of products) {
                try {
                  const existingProducts = await base44.asServiceRole.entities.Product.filter({
                    tenant_id: integration.tenant_id,
                    platform_product_id: String(productData.id)
                  });

                  const productRecord = {
                    tenant_id: integration.tenant_id,
                    platform_product_id: String(productData.id),
                    title: productData.title || productData.name,
                    vendor: productData.vendor,
                    product_type: productData.product_type || productData.type,
                    status: productData.status || 'active',
                    image_url: productData.images?.[0]?.src || productData.image?.src,
                    tags: productData.tags ? (typeof productData.tags === 'string' ? productData.tags.split(', ') : productData.tags) : []
                  };

                  if (existingProducts.length > 0) {
                    await base44.asServiceRole.entities.Product.update(existingProducts[0].id, productRecord);
                  } else {
                    await base44.asServiceRole.entities.Product.create(productRecord);
                  }
                  results.products_synced++;
                } catch (productError) {
                  results.errors.push({
                    entity_type: 'product',
                    entity_id: productData.id,
                    error: productError.message
                  });
                }
              }
            } catch (productsError) {
              console.error('Products sync failed:', productsError);
            }
          }

          // Update sync job with results
          await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
            status: results.errors.length > 0 ? 'completed' : 'completed',
            completed_at: new Date().toISOString(),
            results,
            progress: {
              total_items: results.orders_created + results.orders_updated + results.products_synced,
              processed_items: results.orders_created + results.orders_updated + results.products_synced,
              failed_items: results.errors.length
            }
          });

          // Update integration last sync
          await base44.asServiceRole.entities.PlatformIntegration.update(integration.id, {
            last_sync_at: new Date().toISOString(),
            last_sync_status: results.errors.length > 0 ? 'partial' : 'success',
            last_sync_stats: {
              orders_synced: results.orders_created + results.orders_updated,
              products_synced: results.products_synced,
              errors_count: results.errors.length,
              duration_ms: Date.now() - startTime
            }
          });

          return Response.json({
            success: true,
            job_id: syncJob.id,
            results,
            duration_ms: Date.now() - startTime
          });

        } catch (syncError) {
          await base44.asServiceRole.entities.SyncJob.update(syncJob.id, {
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: syncError.message
          });

          throw syncError;
        }
      }

      case 'push_risk_scores': {
        const { integration_id, order_ids } = params;

        const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ id: integration_id });
        if (!integrations.length) {
          return Response.json({ error: 'Integration not found' }, { status: 404 });
        }
        const integration = integrations[0];

        if (!integration.two_way_sync?.enabled) {
          return Response.json({ error: 'Two-way sync not enabled' }, { status: 400 });
        }

        const client = await createPlatformClient(integration, encryptionKey);
        const results = { pushed: 0, failed: 0, errors: [] };

        // Get orders to push
        let ordersToProcess;
        if (order_ids?.length) {
          ordersToProcess = [];
          for (const id of order_ids) {
            const orders = await base44.asServiceRole.entities.Order.filter({ id });
            if (orders.length) ordersToProcess.push(orders[0]);
          }
        } else {
          // Get recent orders with risk scores that haven't been pushed
          ordersToProcess = await base44.asServiceRole.entities.Order.filter({
            tenant_id: integration.tenant_id
          });
          ordersToProcess = ordersToProcess.filter(o => o.fraud_score !== null && o.fraud_score !== undefined);
        }

        for (const order of ordersToProcess) {
          try {
            // Build tags
            const tags = [`profitshield:${order.risk_level}`, `risk:${order.fraud_score}`];
            if (order.risk_level === 'high') tags.push('review_required');

            // Update order in platform
            if (integration.two_way_sync.push_tags) {
              const existingTags = order.tags || [];
              const newTags = [...new Set([...existingTags, ...tags])];
              
              await client.updateOrder(order.platform_order_id, {
                tags: newTags.join(', ')
              });
            }

            // Add note with risk details
            if (integration.two_way_sync.push_notes && client.addOrderNote) {
              const note = `ProfitShield Risk: ${order.fraud_score}/100 (${order.risk_level})\n` +
                          `Factors: ${(order.risk_reasons || []).join(', ')}`;
              await client.addOrderNote(order.platform_order_id, note);
            }

            results.pushed++;
          } catch (pushError) {
            results.failed++;
            results.errors.push({
              order_id: order.id,
              error: pushError.message
            });
          }
        }

        return Response.json({ success: true, results });
      }

      case 'get_sync_status': {
        const { job_id } = params;
        const jobs = await base44.asServiceRole.entities.SyncJob.filter({ id: job_id });
        if (!jobs.length) {
          return Response.json({ error: 'Job not found' }, { status: 404 });
        }
        return Response.json({ job: jobs[0] });
      }

      case 'list_sync_jobs': {
        const { integration_id, limit = 20 } = params;
        const jobs = await base44.asServiceRole.entities.SyncJob.filter(
          { integration_id },
          '-created_date',
          limit
        );
        return Response.json({ jobs });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Sync engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});