/**
 * Profit Alert Watchdog
 * 
 * Scheduled runner that iterates ALL active tenants and executes
 * checkProfitAlerts per tenant. Fixes the "tenant_id is required" 400 error
 * that occurred when the automation called checkProfitAlerts globally.
 * 
 * Failsafe: skips invalid tenants, logs per-tenant failures, never crashes the job.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow scheduled (no auth) or admin-only manual invocation
  let isScheduled = false;
  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
  } catch (_) {
    // Scheduled automations have no user session — allow via service role
    isScheduled = true;
  }

  const startedAt = new Date().toISOString();
  const results = [];
  let successCount = 0;
  let failCount = 0;

  try {
    // 1. Fetch all tenants — try active first, fall back to all
    let rawTenants = [];
    try {
      rawTenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
    } catch (_) {}
    if (rawTenants.length === 0) {
      try {
        rawTenants = await base44.asServiceRole.entities.Tenant.list('-created_date', 500);
      } catch (_) {}
    }

    // Alternatively derive tenants from PlatformIntegration (more reliable for connected stores)
    let integrations = rawTenants.map(t => ({ tenant_id: t.id }));
    if (integrations.length === 0) {
      try {
        const connected = await base44.asServiceRole.entities.PlatformIntegration.filter({ status: 'connected' });
        integrations = connected;
      } catch (_) {}
    }

    if (!integrations || integrations.length === 0) {
      console.log('[ProfitAlertWatchdog] No active integrations found — skipping.');
      return Response.json({
        success: true,
        message: 'No active tenants found',
        tenant_count: 0,
        results: [],
        started_at: startedAt,
        finished_at: new Date().toISOString()
      });
    }

    // Deduplicate by tenant_id (one tenant may have multiple integrations)
    const tenantIds = [...new Set(integrations.map(i => i.tenant_id).filter(Boolean))];
    console.log(`[ProfitAlertWatchdog] Running for ${tenantIds.length} tenant(s)`);

    // 2. Process each tenant — fail individually, never abort the loop
    for (const tenantId of tenantIds) {
      try {
        // Use asServiceRole for all entity ops — no user session in scheduled context
        let alertRules = [], allOrders = [];
        try {
          alertRules = await base44.asServiceRole.entities.AlertRule.filter({ tenant_id: tenantId, is_active: true });
        } catch (e) {
          console.warn(`[ProfitAlertWatchdog] AlertRule fetch failed for ${tenantId}: ${e.message}`);
        }
        try {
          allOrders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }, '-created_date', 200);
        } catch (e) {
          console.warn(`[ProfitAlertWatchdog] Order fetch failed for ${tenantId}: ${e.message}`);
        }

        if (!alertRules || alertRules.length === 0) {
          results.push({ tenant_id: tenantId, status: 'success', alerts_triggered: 0, note: 'no active rules' });
          successCount++;
          continue;
        }

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recentOrders = allOrders.filter(o => o.created_date >= yesterday);

        let alertsTriggered = 0;
        for (const order of recentOrders) {
          for (const rule of alertRules) {
            const shouldAlert = checkRule(rule, order);
            if (shouldAlert) {
              alertsTriggered++;
              try {
                await base44.asServiceRole.entities.Alert.create({
                  tenant_id: tenantId,
                  type: mapAlertType(rule.type),
                  severity: rule.severity,
                  title: `${rule.name}: Order ${order.order_number}`,
                  message: shouldAlert.message,
                  entity_type: 'order',
                  entity_id: order.id,
                  status: 'pending',
                  metadata: { rule_id: rule.id, rule_type: rule.type }
                });
              } catch (alertErr) {
                console.warn(`[ProfitAlertWatchdog] Alert create failed: ${alertErr.message}`);
              }
            }
          }
        }

        const result = { data: { alerts_triggered: alertsTriggered } };

        const data = result?.data || result;
        const alertsTriggered = data?.alerts_triggered ?? 0;

        results.push({ tenant_id: tenantId, status: 'success', alerts_triggered: alertsTriggered });
        successCount++;
        console.log(`[ProfitAlertWatchdog] ✓ tenant=${tenantId} alerts=${alertsTriggered}`);
      } catch (tenantError) {
        // Failsafe: log and continue — never crash the whole job
        failCount++;
        results.push({ tenant_id: tenantId, status: 'error', error: tenantError.message });
        console.error(`[ProfitAlertWatchdog] ✗ tenant=${tenantId} error=${tenantError.message}`);
      }
    }

    const summary = {
      success: true,
      tenant_count: tenantIds.length,
      success_count: successCount,
      fail_count: failCount,
      results,
      started_at: startedAt,
      finished_at: new Date().toISOString()
    };

    console.log(`[ProfitAlertWatchdog] Done — ${successCount}/${tenantIds.length} tenants processed`);
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

// --- Inline rule evaluator (no cross-file import) ---
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
      if (p < rule.threshold_value) {
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
          return { message: `Shipping cost exceeds charged by ${diff.toFixed(1)}%` };
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