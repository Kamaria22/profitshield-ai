import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, action, action_id } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    // Handle rollback action
    if (action === 'rollback') {
      if (!action_id) {
        return Response.json({ error: 'action_id required for rollback' }, { status: 400 });
      }

      const logs = await base44.asServiceRole.entities.AuditLog.filter({ id: action_id });
      const log = logs[0];
      
      if (!log || log.tenant_id !== tenant_id) {
        return Response.json({ error: 'Action not found' }, { status: 404 });
      }

      // Get tokens for Shopify rollback
      const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ 
        tenant_id, 
        platform: 'shopify', 
        is_valid: true 
      });
      const token = tokens[0];
      const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
      const tenant = tenants[0];

      if (log.action === 'ai_auto_price_update' && log.changes?.previous_price) {
        // Rollback price change
        if (token && tenant) {
          const shopifyResponse = await fetch(
            `https://${tenant.shop_domain}/admin/api/2024-01/variants/${log.changes.variant_id}.json`,
            {
              method: 'PUT',
              headers: {
                'X-Shopify-Access-Token': token.access_token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                variant: { id: log.changes.variant_id, price: log.changes.previous_price.toString() }
              })
            }
          );

          if (!shopifyResponse.ok) {
            throw new Error('Failed to rollback price in Shopify');
          }
        }

        await base44.asServiceRole.entities.AuditLog.update(log.id, {
          rolled_back: true,
          rolled_back_at: new Date().toISOString(),
          rolled_back_by: user.email
        });

        return Response.json({ success: true, message: 'Price reverted to previous value' });
      }

      if (log.action === 'ai_auto_discount_created' && log.changes?.price_rule_id) {
        // Delete the discount
        if (token && tenant) {
          await fetch(
            `https://${tenant.shop_domain}/admin/api/2024-01/price_rules/${log.changes.price_rule_id}.json`,
            {
              method: 'DELETE',
              headers: { 'X-Shopify-Access-Token': token.access_token }
            }
          );
        }

        await base44.asServiceRole.entities.AuditLog.update(log.id, {
          rolled_back: true,
          rolled_back_at: new Date().toISOString(),
          rolled_back_by: user.email
        });

        return Response.json({ success: true, message: 'Discount deleted' });
      }

      return Response.json({ error: 'Cannot rollback this action type' }, { status: 400 });
    }

    // Handle confirm action
    if (action === 'confirm') {
      if (!action_id) {
        return Response.json({ error: 'action_id required' }, { status: 400 });
      }

      await base44.asServiceRole.entities.AuditLog.update(action_id, {
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.email
      });

      return Response.json({ success: true, message: 'Action confirmed' });
    }

    // Handle dismiss action
    if (action === 'dismiss') {
      if (!action_id) {
        return Response.json({ error: 'action_id required' }, { status: 400 });
      }

      await base44.asServiceRole.entities.AuditLog.update(action_id, {
        dismissed: true,
        dismissed_at: new Date().toISOString(),
        dismissed_by: user.email
      });

      return Response.json({ success: true, message: 'Action dismissed' });
    }

    // Get pending auto-actions
    if (action === 'get_pending') {
      const pendingActions = await base44.asServiceRole.entities.AuditLog.filter({
        tenant_id,
        is_auto_action: true,
        confirmed: null,
        rolled_back: null,
        dismissed: null
      }, '-created_date', 20);

      return Response.json({ success: true, actions: pendingActions });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('AI Auto Actions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});