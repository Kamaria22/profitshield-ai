import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Simple XOR-based decryption (must match encryption in shopifyAuth)
function decrypt(encryptedText, key) {
  try {
    const data = atob(encryptedText);
    let result = '';
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch (e) {
    console.error('Decryption failed:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, tenant_id, order_id, platform_order_id, action_type, action_config, pending_action_id } = await req.json();

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    // Get tenant and OAuth token
    const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
    const tenant = tenants[0];
    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ tenant_id, platform: 'shopify', is_valid: true });
    const token = tokens[0];
    if (!token) {
      return Response.json({ error: 'No valid Shopify token found' }, { status: 400 });
    }

    const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
    const accessToken = decrypt(token.encrypted_access_token, encryptionKey);
    if (!accessToken) {
      return Response.json({ error: 'Failed to decrypt access token' }, { status: 500 });
    }

    const shopDomain = tenant.shop_domain;

    // Handle different actions
    switch (action) {
      case 'execute': {
        // Execute a Shopify action directly
        const result = await executeShopifyAction(shopDomain, accessToken, platform_order_id, action_type, action_config);
        
        // Update pending action if provided
        if (pending_action_id) {
          await base44.asServiceRole.entities.PendingShopifyAction.update(pending_action_id, {
            status: result.success ? 'executed' : 'failed',
            executed_at: new Date().toISOString(),
            executed_by: user.email,
            error_message: result.error || null
          });
        }

        // Update local order tags
        if (result.success && order_id) {
          const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id });
          if (orders[0]) {
            const currentTags = orders[0].tags || [];
            let newTags = [...currentTags];
            
            if (action_type === 'add_tag' && action_config?.tag_name) {
              if (!newTags.includes(action_config.tag_name)) {
                newTags.push(action_config.tag_name);
              }
            } else if (action_type === 'cancel_order') {
              newTags.push('shopify-cancelled');
              await base44.asServiceRole.entities.Order.update(order_id, { 
                status: 'cancelled',
                tags: newTags 
              });
            } else if (action_type === 'hold_fulfillment') {
              newTags.push('fulfillment-on-hold');
            }
            
            if (action_type !== 'cancel_order') {
              await base44.asServiceRole.entities.Order.update(order_id, { tags: newTags });
            }
          }
        }

        return Response.json(result);
      }

      case 'approve': {
        // Approve and execute a pending action
        if (!pending_action_id) {
          return Response.json({ error: 'pending_action_id required' }, { status: 400 });
        }

        const pendingActions = await base44.asServiceRole.entities.PendingShopifyAction.filter({ id: pending_action_id });
        const pendingAction = pendingActions[0];
        if (!pendingAction) {
          return Response.json({ error: 'Pending action not found' }, { status: 404 });
        }

        // Execute the action
        const result = await executeShopifyAction(
          shopDomain, 
          accessToken, 
          pendingAction.platform_order_id, 
          pendingAction.action_type, 
          pendingAction.action_config
        );

        await base44.asServiceRole.entities.PendingShopifyAction.update(pending_action_id, {
          status: result.success ? 'executed' : 'failed',
          executed_at: new Date().toISOString(),
          executed_by: user.email,
          error_message: result.error || null
        });

        // Update local order
        if (result.success && pendingAction.order_id) {
          const orders = await base44.asServiceRole.entities.Order.filter({ id: pendingAction.order_id });
          if (orders[0]) {
            const currentTags = orders[0].tags || [];
            let updateData = {};
            
            if (pendingAction.action_type === 'cancel_order') {
              updateData = { status: 'cancelled', tags: [...currentTags, 'shopify-cancelled'] };
            } else if (pendingAction.action_type === 'add_tag' && pendingAction.action_config?.tag_name) {
              updateData = { tags: [...currentTags, pendingAction.action_config.tag_name] };
            } else if (pendingAction.action_type === 'hold_fulfillment') {
              updateData = { tags: [...currentTags, 'fulfillment-on-hold'] };
            }
            
            await base44.asServiceRole.entities.Order.update(pendingAction.order_id, updateData);
          }
        }

        return Response.json({ success: result.success, message: result.success ? 'Action executed' : result.error });
      }

      case 'reject': {
        // Reject a pending action
        if (!pending_action_id) {
          return Response.json({ error: 'pending_action_id required' }, { status: 400 });
        }

        await base44.asServiceRole.entities.PendingShopifyAction.update(pending_action_id, {
          status: 'rejected',
          executed_by: user.email
        });

        return Response.json({ success: true, message: 'Action rejected' });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Shopify order actions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function executeShopifyAction(shopDomain, accessToken, platformOrderId, actionType, actionConfig) {
  const baseUrl = `https://${shopDomain}/admin/api/2024-01`;
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  };

  try {
    switch (actionType) {
      case 'cancel_order': {
        const reason = actionConfig?.cancel_reason || 'other';
        const response = await fetch(`${baseUrl}/orders/${platformOrderId}/cancel.json`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            reason: reason,
            email: true // Notify customer
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return { success: false, error: errorData.errors || `Cancel failed: ${response.status}` };
        }

        return { success: true, action: 'cancel_order' };
      }

      case 'add_tag': {
        const tagName = actionConfig?.tag_name;
        if (!tagName) {
          return { success: false, error: 'Tag name not specified' };
        }

        // First get current order to preserve existing tags
        const getResponse = await fetch(`${baseUrl}/orders/${platformOrderId}.json`, {
          method: 'GET',
          headers
        });

        if (!getResponse.ok) {
          return { success: false, error: 'Failed to fetch order' };
        }

        const orderData = await getResponse.json();
        const currentTags = orderData.order.tags || '';
        const tagsArray = currentTags.split(',').map(t => t.trim()).filter(Boolean);
        
        if (!tagsArray.includes(tagName)) {
          tagsArray.push(tagName);
        }

        const response = await fetch(`${baseUrl}/orders/${platformOrderId}.json`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            order: {
              id: platformOrderId,
              tags: tagsArray.join(', ')
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return { success: false, error: errorData.errors || `Add tag failed: ${response.status}` };
        }

        return { success: true, action: 'add_tag', tag: tagName };
      }

      case 'hold_fulfillment': {
        // Add a hold tag and update fulfillment hold status if available
        const holdTag = actionConfig?.tag_name || 'HOLD-FULFILLMENT';
        
        // Get current order
        const getResponse = await fetch(`${baseUrl}/orders/${platformOrderId}.json`, {
          method: 'GET',
          headers
        });

        if (!getResponse.ok) {
          return { success: false, error: 'Failed to fetch order' };
        }

        const orderData = await getResponse.json();
        const currentTags = orderData.order.tags || '';
        const tagsArray = currentTags.split(',').map(t => t.trim()).filter(Boolean);
        
        if (!tagsArray.includes(holdTag)) {
          tagsArray.push(holdTag);
        }

        // Update order with hold tag
        const response = await fetch(`${baseUrl}/orders/${platformOrderId}.json`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            order: {
              id: platformOrderId,
              tags: tagsArray.join(', ')
            }
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return { success: false, error: errorData.errors || `Hold fulfillment failed: ${response.status}` };
        }

        return { success: true, action: 'hold_fulfillment' };
      }

      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  } catch (error) {
    console.error('Shopify API error:', error);
    return { success: false, error: error.message };
  }
}