import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, action_type, action_data } = body;

    if (!tenant_id || !action_type) {
      return Response.json({ error: 'tenant_id and action_type required' }, { status: 400 });
    }

    // Get tenant and OAuth token
    const [tenants, tokens] = await Promise.all([
      base44.asServiceRole.entities.Tenant.filter({ id: tenant_id }),
      base44.asServiceRole.entities.OAuthToken.filter({ tenant_id, platform: 'shopify', is_valid: true })
    ]);

    const tenant = tenants[0];
    const token = tokens[0];

    if (!tenant) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const shopDomain = tenant.shop_domain;
    const accessToken = token?.access_token;

    switch (action_type) {
      case 'update_price': {
        if (!accessToken) {
          return Response.json({ error: 'Shopify not connected. Please connect your store first.' }, { status: 400 });
        }

        const { product_id, variant_id, new_price, reason } = action_data;
        
        if (!variant_id || !new_price) {
          return Response.json({ error: 'variant_id and new_price required' }, { status: 400 });
        }

        // Update price via Shopify API
        const shopifyResponse = await fetch(
          `https://${shopDomain}/admin/api/2024-01/variants/${variant_id}.json`,
          {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              variant: {
                id: variant_id,
                price: new_price.toString()
              }
            })
          }
        );

        if (!shopifyResponse.ok) {
          const error = await shopifyResponse.text();
          throw new Error(`Shopify API error: ${error}`);
        }

        const result = await shopifyResponse.json();

        // Log the action
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          action: 'price_update',
          entity_type: 'product',
          entity_id: product_id || variant_id,
          changes: { new_price, reason },
          performed_by: user.email
        });

        return Response.json({
          success: true,
          message: `Price updated to $${new_price}`,
          data: result.variant
        });
      }

      case 'create_discount': {
        if (!accessToken) {
          return Response.json({ error: 'Shopify not connected. Please connect your store first.' }, { status: 400 });
        }

        const { 
          title, 
          discount_type = 'percentage', 
          value, 
          target_type = 'all',
          starts_at,
          ends_at,
          usage_limit
        } = action_data;

        if (!title || !value) {
          return Response.json({ error: 'title and value required' }, { status: 400 });
        }

        // Create price rule first
        const priceRuleResponse = await fetch(
          `https://${shopDomain}/admin/api/2024-01/price_rules.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              price_rule: {
                title,
                target_type: target_type === 'shipping' ? 'shipping_line' : 'line_item',
                target_selection: 'all',
                allocation_method: 'across',
                value_type: discount_type,
                value: discount_type === 'percentage' ? `-${value}` : `-${value}`,
                customer_selection: 'all',
                starts_at: starts_at || new Date().toISOString(),
                ends_at: ends_at || null,
                usage_limit: usage_limit || null
              }
            })
          }
        );

        if (!priceRuleResponse.ok) {
          const error = await priceRuleResponse.text();
          throw new Error(`Shopify API error: ${error}`);
        }

        const priceRule = await priceRuleResponse.json();

        // Create discount code
        const code = title.toUpperCase().replace(/\s+/g, '') + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        const discountResponse = await fetch(
          `https://${shopDomain}/admin/api/2024-01/price_rules/${priceRule.price_rule.id}/discount_codes.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              discount_code: { code }
            })
          }
        );

        if (!discountResponse.ok) {
          const error = await discountResponse.text();
          throw new Error(`Shopify discount code error: ${error}`);
        }

        const discount = await discountResponse.json();

        // Log the action
        await base44.asServiceRole.entities.AuditLog.create({
          tenant_id,
          action: 'discount_created',
          entity_type: 'discount',
          entity_id: discount.discount_code.id.toString(),
          changes: { title, code, value, discount_type },
          performed_by: user.email
        });

        return Response.json({
          success: true,
          message: `Discount code "${code}" created`,
          data: {
            price_rule_id: priceRule.price_rule.id,
            discount_code: discount.discount_code.code,
            discount_id: discount.discount_code.id
          }
        });
      }

      case 'create_task': {
        const { title, description, priority = 'medium', due_date, category, source_recommendation } = action_data;

        if (!title) {
          return Response.json({ error: 'title required' }, { status: 400 });
        }

        const task = await base44.asServiceRole.entities.Task.create({
          tenant_id,
          title,
          description,
          priority,
          status: 'pending',
          category: category || 'profit_optimization',
          due_date: due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          source: 'ai_recommendation',
          source_data: source_recommendation,
          assigned_to: user.email,
          created_by_system: true
        });

        return Response.json({
          success: true,
          message: 'Task created successfully',
          data: task
        });
      }

      case 'create_alert': {
        const { title, message, severity = 'medium', action_url, action_label, category } = action_data;

        if (!title) {
          return Response.json({ error: 'title required' }, { status: 400 });
        }

        const alert = await base44.asServiceRole.entities.Alert.create({
          tenant_id,
          alert_type: category || 'profit_optimization',
          severity,
          title,
          message,
          status: 'pending',
          action_url: action_url || '/Tasks',
          action_label: action_label || 'View Details',
          source: 'ai_recommendation'
        });

        return Response.json({
          success: true,
          message: 'Alert created successfully',
          data: alert
        });
      }

      default:
        return Response.json({ error: `Unknown action type: ${action_type}` }, { status: 400 });
    }

  } catch (error) {
    console.error('Apply profit action error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});