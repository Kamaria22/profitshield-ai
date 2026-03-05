/**
 * Profit Alert Watchdog
 * Iterates ALL tenants (via AlertRule entity) and runs profit alert checks per tenant.
 * Fixes the original "tenant_id is required" 400 error from global invocation.
 * Failsafe: skips invalid tenants, logs per-tenant failures, never crashes the job.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const startedAt = new Date().toISOString();
  const results = [];
  let successCount = 0;
  let failCount = 0;

  try {
    // Discover tenants by getting all active AlertRules — this avoids Tenant entity auth issues
    // AlertRule has tenant_id which lets us find all tenants that have configured rules
    const allRules = await base44.asServiceRole.entities.AlertRule.list('-created_date', 500);
    
    // Deduplicate tenant IDs from rules
    const tenantIds = [...new Set(allRules.map(r => r.tenant_id).filter(Boolean))];

    // Also try to get tenants directly as a supplement
    let extraTenantIds = [];
    try {
      const tenants = await base44.asServiceRole.entities.Tenant.list('-created_date', 200);
      extraTenantIds = tenants.map(t => t.id).filter(Boolean);
    } catch (_) {
      // Tenant entity may have security rules — fall back to AlertRule-derived list
      console.log('[ProfitAlertWatchdog] Could not list Tenants directly, using AlertRule-derived list');
    }

    // Merge: union of both lists
    const allTenantIds = [...new Set([...tenantIds, ...extraTenantIds])];

    if (allTenantIds.length === 0) {
      console.log('[ProfitAlertWatchdog] No tenants found — skipping.');
      return Response.json({
        success: true,
        message: 'No tenants found',
        tenant_count: 0,
        results: [],
        started_at: startedAt,
        finished_at: new Date().toISOString()
      });
    }

    console.log(`[ProfitAlertWatchdog] Running for ${allTenantIds.length} tenant(s)`);

    // Process each tenant — fail individually, never abort the loop
    for (const tenantId of allTenantIds) {
      try {
        const tenantRules = allRules.filter(r => r.tenant_id === tenantId && r.is_active !== false);

        if (tenantRules.length === 0) {
          results.push({ tenant_id: tenantId, status: 'success', alerts_triggered: 0, note: 'no active rules' });
          successCount++;
          continue;
        }

        // Fetch recent orders for this tenant
        const allOrders = await base44.asServiceRole.entities.Order.filter(
          { tenant_id: tenantId }, '-created_date', 200
        );

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recentOrders = allOrders.filter(o => o.created_date >= yesterday);

        let alertsTriggered = 0;

        for (const order of recentOrders) {
          for (const rule of tenantRules) {
            const match = checkRule(rule, order);
            if (match) {
              alertsTriggered++;
              try {
                await base44.asServiceRole.entities.Alert.create({
                  tenant_id: tenantId,
                  type: mapAlertType(rule.type),
                  severity: rule.severity || 'medium',
                  title: `${rule.name}: Order ${order.order_number || order.id}`,
                  message: match.message,
                  entity_type: 'order',
                  entity_id: order.id,
                  status: 'pending',
                  metadata: { rule_id: rule.id, rule_type: rule.type }
                });

                // Update rule trigger count
                await base44.asServiceRole.entities.AlertRule.update(rule.id, {
                  triggered_count: (rule.triggered_count || 0) + 1,
                  last_triggered_at: new Date().toISOString()
                });
              } catch (alertErr) {
                console.warn(`[ProfitAlertWatchdog] Alert create failed: ${alertErr.message}`);
              }
            }
          }
        }

        results.push({ tenant_id: tenantId, status: 'success', alerts_triggered: alertsTriggered, orders_checked: recentOrders.length });
        successCount++;
        console.log(`[ProfitAlertWatchdog] ✓ tenant=${tenantId} orders=${recentOrders.length} alerts=${alertsTriggered}`);

      } catch (tenantError) {
        failCount++;
        results.push({ tenant_id: tenantId, status: 'error', error: tenantError.message });
        console.error(`[ProfitAlertWatchdog] ✗ tenant=${tenantId} error=${tenantError.message}`);
      }
    }

    const summary = {
      success: true,
      tenant_count: allTenantIds.length,
      success_count: successCount,
      fail_count: failCount,
      results,
      started_at: startedAt,
      finished_at: new Date().toISOString()
    };

    console.log(`[ProfitAlertWatchdog] Complete — ${successCount}/${allTenantIds.length} tenants processed`);
    return Response.json(summary);

  } catch (error) {
    console.error('[ProfitAlertWatchdog] Fatal error:', error.message);
    return Response.json({
      success: false,
      error: error.message,
      success_count: successCount,
      fail_count: failCount,
      results,
      started_at: startedAt,
      finished_at: new Date().toISOString()
    }, { status: 500 });
  }
});

// --- Inline rule evaluator ---
function checkRule(rule, order) {
  switch (rule.type) {
    case 'low_margin': {
      const m = order.margin_pct || 0;
      if (m !== 0 && m < rule.threshold_value) {
        return { message: `Order margin (${m.toFixed(1)}%) below ${rule.threshold_value}% threshold` };
      }
      break;
    }
    case 'negative_profit': {
      const p = order.net_profit || 0;
      if (p < (rule.threshold_value || 0)) {
        return { message: `Order has negative profit ($${p.toFixed(2)})` };
      }
      break;
    }
    case 'shipping_discrepancy': {
      const charged = order.shipping_charged || 0;
      const cost = order.shipping_cost || 0;
      if (charged > 0 && cost > 0) {
        const diff = ((cost - charged) / charged) * 100;
        if (diff > rule.threshold_value) {
          return { message: `Shipping cost exceeds charged amount by ${diff.toFixed(1)}%` };
        }
      }
      break;
    }
    case 'high_discount': {
      const total = order.total_revenue || 0;
      const discount = order.discount_total || 0;
      if (total > 0 && discount > 0) {
        const pct = (discount / (total + discount)) * 100;
        if (pct > rule.threshold_value) {
          return { message: `Discount (${pct.toFixed(1)}%) exceeds ${rule.threshold_value}% threshold` };
        }
      }
      break;
    }
  }
  return null;
}

function mapAlertType(ruleType) {
  const map = {
    low_margin: 'negative_margin',
    negative_profit: 'negative_margin',
    shipping_discrepancy: 'shipping_loss',
    high_discount: 'discount_abuse',
    cogs_change: 'system'
  };
  return map[ruleType] || 'system';
}