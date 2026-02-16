import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenant_id, order_id } = await req.json();
    
    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    // Fetch active alert rules
    const alertRules = await base44.asServiceRole.entities.AlertRule.filter({ 
      tenant_id, 
      is_active: true 
    });

    if (alertRules.length === 0) {
      return Response.json({ success: true, alerts_triggered: 0, message: 'No active alert rules' });
    }

    // Fetch order(s) to check
    let ordersToCheck = [];
    if (order_id) {
      const orders = await base44.asServiceRole.entities.Order.filter({ id: order_id, tenant_id });
      ordersToCheck = orders;
    } else {
      // Check recent orders (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const allOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id });
      ordersToCheck = allOrders.filter(o => o.created_date >= yesterday);
    }

    // Fetch tenant settings
    const settingsData = await base44.asServiceRole.entities.TenantSettings.filter({ tenant_id });
    const settings = settingsData[0] || {};

    // Fetch cost mappings for COGS change detection
    const costMappings = await base44.asServiceRole.entities.CostMapping.filter({ tenant_id });

    let alertsTriggered = 0;
    const triggeredAlerts = [];

    for (const order of ordersToCheck) {
      for (const rule of alertRules) {
        const alertResult = await evaluateAlertRule(rule, order, settings, costMappings, base44, tenant_id);
        
        if (alertResult.triggered) {
          alertsTriggered++;
          triggeredAlerts.push({
            rule_name: rule.name,
            rule_type: rule.type,
            order_id: order.id,
            order_number: order.order_number,
            details: alertResult.details
          });

          // Create alert record
          await base44.asServiceRole.entities.Alert.create({
            tenant_id,
            type: mapAlertType(rule.type),
            severity: rule.severity,
            title: `${rule.name}: Order ${order.order_number}`,
            message: alertResult.message,
            entity_type: 'order',
            entity_id: order.id,
            recommended_action: alertResult.recommended_action,
            status: 'pending',
            metadata: {
              rule_id: rule.id,
              rule_type: rule.type,
              threshold: rule.threshold_value,
              actual_value: alertResult.actual_value
            }
          });

          // Execute automated actions
          await executeAlertActions(rule, order, alertResult, base44, tenant_id, user);

          // Update rule triggered count
          await base44.asServiceRole.entities.AlertRule.update(rule.id, {
            triggered_count: (rule.triggered_count || 0) + 1,
            last_triggered_at: new Date().toISOString()
          });
        }
      }
    }

    return Response.json({ 
      success: true, 
      alerts_triggered: alertsTriggered,
      details: triggeredAlerts
    });

  } catch (error) {
    console.error('Check profit alerts error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function evaluateAlertRule(rule, order, settings, costMappings, base44, tenantId) {
  const result = { triggered: false, message: '', details: {}, actual_value: null, recommended_action: 'none' };

  switch (rule.type) {
    case 'low_margin': {
      const marginPct = order.margin_pct || 0;
      if (marginPct < rule.threshold_value && marginPct !== 0) {
        result.triggered = true;
        result.actual_value = marginPct;
        result.message = `Order margin (${marginPct.toFixed(1)}%) is below ${rule.threshold_value}% threshold`;
        result.details = { margin_pct: marginPct, threshold: rule.threshold_value };
        result.recommended_action = marginPct < 0 ? 'verify' : 'none';
      }
      break;
    }

    case 'negative_profit': {
      const netProfit = order.net_profit || 0;
      if (netProfit < rule.threshold_value) {
        result.triggered = true;
        result.actual_value = netProfit;
        result.message = `Order has negative profit ($${netProfit.toFixed(2)})`;
        result.details = { net_profit: netProfit };
        result.recommended_action = 'verify';
      }
      break;
    }

    case 'shipping_discrepancy': {
      const shippingCharged = order.shipping_charged || 0;
      const shippingCost = order.shipping_cost || 0;
      
      if (shippingCharged > 0 && shippingCost > 0) {
        const discrepancyPct = ((shippingCost - shippingCharged) / shippingCharged) * 100;
        
        if (discrepancyPct > rule.threshold_value) {
          result.triggered = true;
          result.actual_value = discrepancyPct;
          result.message = `Shipping cost ($${shippingCost.toFixed(2)}) exceeds charged ($${shippingCharged.toFixed(2)}) by ${discrepancyPct.toFixed(1)}%`;
          result.details = { 
            shipping_charged: shippingCharged, 
            shipping_cost: shippingCost, 
            discrepancy_pct: discrepancyPct 
          };
        }
      }
      break;
    }

    case 'high_discount': {
      const total = order.total_revenue || 0;
      const discount = order.discount_total || 0;
      
      if (total > 0 && discount > 0) {
        const discountPct = (discount / (total + discount)) * 100;
        
        if (discountPct > rule.threshold_value) {
          result.triggered = true;
          result.actual_value = discountPct;
          result.message = `Discount (${discountPct.toFixed(1)}%) exceeds ${rule.threshold_value}% threshold`;
          result.details = { discount_total: discount, discount_pct: discountPct };
          result.recommended_action = 'verify';
        }
      }
      break;
    }

    case 'cogs_change': {
      // This requires historical comparison - check if COGS for items in this order have changed
      const platformData = order.platform_data;
      if (platformData?.line_items) {
        for (const item of platformData.line_items) {
          const sku = item.sku || item.variant_id?.toString();
          const currentMapping = costMappings.find(m => m.sku === sku);
          
          if (currentMapping) {
            // Compare with historical average (simplified - in production would use historical data)
            const expectedCost = currentMapping.cost_per_unit;
            const actualCost = item.price ? parseFloat(item.price) * 0.4 : expectedCost; // Estimate if no data
            
            if (expectedCost > 0) {
              const changePct = Math.abs((actualCost - expectedCost) / expectedCost) * 100;
              
              if (changePct > rule.threshold_value) {
                result.triggered = true;
                result.actual_value = changePct;
                result.message = `COGS for SKU ${sku} changed by ${changePct.toFixed(1)}% (expected: $${expectedCost.toFixed(2)})`;
                result.details = { sku, expected_cost: expectedCost, change_pct: changePct };
                break;
              }
            }
          }
        }
      }
      break;
    }
  }

  return result;
}

function mapAlertType(ruleType) {
  const typeMap = {
    low_margin: 'negative_margin',
    negative_profit: 'negative_margin',
    shipping_discrepancy: 'shipping_loss',
    high_discount: 'discount_abuse',
    cogs_change: 'system'
  };
  return typeMap[ruleType] || 'system';
}

async function executeAlertActions(rule, order, alertResult, base44, tenantId, user) {
  const actions = rule.actions || [];

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'email': {
          const email = rule.notify_email || user?.email;
          if (email) {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: email,
              subject: `[ProfitShield Alert] ${rule.name}: Order ${order.order_number}`,
              body: `
Alert: ${rule.name}

Order: ${order.order_number}
Customer: ${order.customer_name || 'N/A'} (${order.customer_email || 'N/A'})
Total: $${(order.total_revenue || 0).toFixed(2)}
Net Profit: $${(order.net_profit || 0).toFixed(2)}

Issue: ${alertResult.message}

View this order in ProfitShield to take action.
              `.trim()
            });
          }
          break;
        }

        case 'flag_order': {
          const currentTags = order.tags || [];
          if (!currentTags.includes('profit-alert')) {
            await base44.asServiceRole.entities.Order.update(order.id, {
              tags: [...currentTags, 'profit-alert', `alert-${rule.type}`]
            });
          }
          break;
        }

        case 'hold_order': {
          const currentTags = order.tags || [];
          if (!currentTags.includes('on-hold')) {
            await base44.asServiceRole.entities.Order.update(order.id, {
              tags: [...currentTags, 'on-hold'],
              recommended_action: 'hold'
            });
          }
          break;
        }

        case 'create_task': {
          await base44.asServiceRole.entities.Task.create({
            tenant_id: tenantId,
            title: `Review: ${rule.name} - Order ${order.order_number}`,
            description: alertResult.message,
            status: 'pending',
            priority: rule.severity === 'critical' ? 'urgent' : rule.severity === 'high' ? 'high' : 'medium',
            related_entity_type: 'order',
            related_entity_id: order.id,
            source_alert_id: rule.id,
            due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Due in 24 hours
          });
          break;
        }
      }
    } catch (actionError) {
      console.error(`Failed to execute action ${action.type}:`, actionError);
    }
  }

  // Handle Shopify actions
  const shopifyActionType = rule.shopify_action_type;
  if (shopifyActionType && shopifyActionType !== 'none' && order.platform_order_id) {
    const shopifyConfig = rule.shopify_action_config || {};
    const requireConfirmation = shopifyConfig.require_confirmation !== false;

    if (requireConfirmation || shopifyActionType === 'cancel_order') {
      // Create pending action for user confirmation
      await base44.asServiceRole.entities.PendingShopifyAction.create({
        tenant_id: tenantId,
        order_id: order.id,
        platform_order_id: order.platform_order_id,
        order_number: order.order_number,
        action_type: shopifyActionType,
        action_config: shopifyConfig,
        source_type: 'alert_rule',
        source_rule_id: rule.id,
        source_rule_name: rule.name,
        reason: alertResult.message,
        status: 'pending_confirmation'
      });
    } else {
      // Execute immediately (non-destructive actions without confirmation)
      try {
        await base44.asServiceRole.functions.invoke('shopifyOrderActions', {
          action: 'execute',
          tenant_id: tenantId,
          order_id: order.id,
          platform_order_id: order.platform_order_id,
          action_type: shopifyActionType,
          action_config: shopifyConfig
        });
      } catch (shopifyError) {
        console.error('Shopify action failed:', shopifyError);
      }
    }
  }
}