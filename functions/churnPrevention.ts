/**
 * churnPrevention — Daily Churn Prediction Engine
 *
 * Uses REAL signals from the database:
 *  - Order volume trends (last 7d vs prior 7d)
 *  - Integration health (connected vs error/disconnected)
 *  - Sync job failures in last 7d
 *  - Days since last successful sync
 *  - Trial expiry proximity
 *  - Alert volume (unresolved high/critical alerts)
 *  - AuditLog login activity (last 14d)
 *  - Subscription tier / plan status
 *  - months_as_customer
 *
 * Called by:
 *  - Daily Churn Prediction automation (action: predict_churn, no user token)
 *  - Frontend via base44.functions.invoke('churnPrevention', { action: '...' })
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Support both authenticated calls (frontend) and unauthenticated scheduled calls
    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      isAuthorized = !!user;
    } catch (_) {
      // Scheduled automation — no user token, run as service role only
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      // Scheduled calls may have no body — default to predict_churn
      body = {};
    }
    const action = body.action || 'predict_churn';

    if (action === 'predict_churn') {
      return await predictChurn(base44);
    } else if (action === 'trigger_retention') {
      return await triggerRetention(base44, body.tenant_id);
    } else if (action === 'get_at_risk_tenants') {
      return await getAtRiskTenants(base44);
    } else if (action === 'debug_signals') {
      return await debugSignals(base44, body.tenant_id);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});

// ─────────────────────────────────────────────
//  MAIN PREDICTION ENGINE
// ─────────────────────────────────────────────

async function predictChurn(base44) {
  const now = new Date();
  const db = base44.asServiceRole;

  // Load all active tenants
  const tenants = await db.entities.Tenant.filter({ status: 'active' });
  if (!tenants || tenants.length === 0) {
    return Response.json({
      success: true,
      tenants_analyzed: 0,
      at_risk_count: 0,
      message: 'No active tenants found'
    });
  }

  // Bulk-load supporting data once (avoid N+1 queries)
  const [allIntegrations, allOrders, allSyncJobs, allAlerts, allAuditLogs, allSupportConversations] = await Promise.all([
    db.entities.PlatformIntegration.filter({}).catch(() => []),
    db.entities.Order.filter({}).catch(() => []),
    db.entities.SyncJob.filter({}).catch(() => []),
    db.entities.Alert.filter({ status: 'pending' }).catch(() => []),
    db.entities.AuditLog.filter({}).catch(() => []),
    db.entities.SupportConversation.filter({}).catch(() => [])
  ]);

  // Index by tenant_id for O(1) lookups
  const integsByTenant = groupBy(allIntegrations, 'tenant_id');
  const ordersByTenant = groupBy(allOrders, 'tenant_id');
  const syncsByTenant = groupBy(allSyncJobs, 'tenant_id');
  const alertsByTenant = groupBy(allAlerts, 'tenant_id');
  const auditsByTenant = groupBy(allAuditLogs, 'tenant_id');
  const supportByTenant = groupBy(allSupportConversations, 'tenant_id');

  const predictions = [];

  for (const tenant of tenants) {
    const result = scoreTenant({
      tenant,
      integrations: integsByTenant[tenant.id] || [],
      orders: ordersByTenant[tenant.id] || [],
      syncJobs: syncsByTenant[tenant.id] || [],
      alerts: alertsByTenant[tenant.id] || [],
      auditLogs: auditsByTenant[tenant.id] || [],
      supportConversations: supportByTenant[tenant.id] || [],
      now
    });

    // Upsert ChurnPrediction record
    const existing = await db.entities.ChurnPrediction.filter({ tenant_id: tenant.id }).catch(() => []);

    const record = {
      tenant_id: tenant.id,
      prediction_date: now.toISOString(),
      churn_probability: result.churnScore,
      risk_level: result.riskLevel,
      days_to_churn_estimate: result.daysToChurn,
      contributing_factors: result.factors,
      usage_metrics: result.metrics,
      ltv_at_risk: result.ltvAtRisk,
      subscription_tier: tenant.subscription_tier || 'trial',
      months_as_customer: result.monthsAsCustomer,
      status: result.riskLevel === 'critical' || result.riskLevel === 'high' ? 'at_risk' : 'active'
    };

    if (existing.length > 0) {
      await db.entities.ChurnPrediction.update(existing[0].id, record);
    } else {
      await db.entities.ChurnPrediction.create(record);
    }

    predictions.push({
      tenant_id: tenant.id,
      shop_name: tenant.shop_name || tenant.shop_domain,
      churn_probability: result.churnScore,
      risk_level: result.riskLevel,
      ltv_at_risk: result.ltvAtRisk,
      top_factors: result.factors.slice(0, 3).map(f => f.factor)
    });
  }

  const atRisk = predictions.filter(p => p.risk_level === 'critical' || p.risk_level === 'high');
  const totalLtvAtRisk = atRisk.reduce((s, p) => s + (p.ltv_at_risk || 0), 0);

  return Response.json({
    success: true,
    tenants_analyzed: predictions.length,
    at_risk_count: atRisk.length,
    total_ltv_at_risk: totalLtvAtRisk,
    predictions,
    breakdown: {
      critical: predictions.filter(p => p.risk_level === 'critical').length,
      high: predictions.filter(p => p.risk_level === 'high').length,
      medium: predictions.filter(p => p.risk_level === 'medium').length,
      low: predictions.filter(p => p.risk_level === 'low').length
    },
    run_at: now.toISOString()
  });
}

// ─────────────────────────────────────────────
//  SCORING ENGINE — pure function, fully testable
// ─────────────────────────────────────────────

function scoreTenant({ tenant, integrations, orders, syncJobs, alerts, auditLogs, supportConversations, now }) {
  const factors = [];
  let churnScore = 0;

  const nowMs = now.getTime();
  const DAY = 86400000;
  const d7ago = nowMs - 7 * DAY;
  const d14ago = nowMs - 14 * DAY;
  const d30ago = nowMs - 30 * DAY;
  const d90ago = nowMs - 90 * DAY;

  // ── 1. TRIAL EXPIRY (0-30 pts) ──────────────────────────────
  const trialEndsAt = tenant.trial_ends_at ? new Date(tenant.trial_ends_at).getTime() : null;
  const planStatus = tenant.plan_status || 'trial';

  if (planStatus === 'trial' && trialEndsAt) {
    const daysLeft = Math.floor((trialEndsAt - nowMs) / DAY);
    if (daysLeft <= 0) {
      churnScore += 30;
      factors.push({ factor: 'trial_expired', weight: 30, current_value: daysLeft, threshold: 0, trend: 'critical' });
    } else if (daysLeft <= 3) {
      churnScore += 25;
      factors.push({ factor: 'trial_expiring_soon', weight: 25, current_value: daysLeft, threshold: 3, trend: 'critical' });
    } else if (daysLeft <= 7) {
      churnScore += 15;
      factors.push({ factor: 'trial_ending_this_week', weight: 15, current_value: daysLeft, threshold: 7, trend: 'declining' });
    }
  }

  if (planStatus === 'past_due') {
    churnScore += 35;
    factors.push({ factor: 'payment_past_due', weight: 35, current_value: 1, threshold: 0, trend: 'critical' });
  }

  if (planStatus === 'canceled' || planStatus === 'expired') {
    churnScore += 50;
    factors.push({ factor: 'subscription_canceled', weight: 50, current_value: 1, threshold: 0, trend: 'critical' });
  }

  // ── 2. INTEGRATION HEALTH (0-25 pts) ──────────────────────────────
  const connected = integrations.filter(i => i.status === 'connected').length;
  const errored = integrations.filter(i => i.status === 'error' || i.status === 'disconnected').length;

  if (integrations.length === 0) {
    churnScore += 20;
    factors.push({ factor: 'no_integration_connected', weight: 20, current_value: 0, threshold: 1, trend: 'critical' });
  } else if (errored > 0 && connected === 0) {
    churnScore += 25;
    factors.push({ factor: 'all_integrations_broken', weight: 25, current_value: errored, threshold: 0, trend: 'critical' });
  } else if (errored > 0) {
    churnScore += 10;
    factors.push({ factor: 'integration_errors', weight: 10, current_value: errored, threshold: 0, trend: 'declining' });
  }

  // Days since last successful sync
  const successfulSyncs = syncJobs
    .filter(s => s.status === 'completed' && s.completed_at)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  const lastSyncMs = successfulSyncs.length > 0 ? new Date(successfulSyncs[0].completed_at).getTime() : null;
  const daysSinceSync = lastSyncMs ? Math.floor((nowMs - lastSyncMs) / DAY) : 999;

  if (daysSinceSync >= 7 && integrations.length > 0) {
    churnScore += 15;
    factors.push({ factor: 'stale_sync', weight: 15, current_value: daysSinceSync, threshold: 7, trend: 'declining' });
  }

  // Recent sync failures
  const recentFailedSyncs = syncJobs.filter(s => s.status === 'failed' && new Date(s.created_date || 0).getTime() > d7ago);
  if (recentFailedSyncs.length >= 3) {
    churnScore += 15;
    factors.push({ factor: 'repeated_sync_failures', weight: 15, current_value: recentFailedSyncs.length, threshold: 3, trend: 'increasing' });
  }

  // ── 3. ORDER VOLUME TREND (0-20 pts) ──────────────────────────────
  const ordersLast7d = orders.filter(o => {
    const t = new Date(o.order_date || o.created_date || 0).getTime();
    return t > d7ago;
  }).length;

  const ordersPrior7d = orders.filter(o => {
    const t = new Date(o.order_date || o.created_date || 0).getTime();
    return t > d14ago && t <= d7ago;
  }).length;

  const orderDecline = ordersPrior7d > 0
    ? ((ordersPrior7d - ordersLast7d) / ordersPrior7d) * 100
    : ordersLast7d === 0 ? 50 : 0;

  if (ordersLast7d === 0 && ordersPrior7d === 0) {
    // No orders at all — only flag if older tenant
    const daysSinceCreation = Math.floor((nowMs - new Date(tenant.created_date || now).getTime()) / DAY);
    if (daysSinceCreation > 14) {
      churnScore += 20;
      factors.push({ factor: 'no_order_activity', weight: 20, current_value: 0, threshold: 1, trend: 'critical' });
    }
  } else if (orderDecline >= 70) {
    churnScore += 20;
    factors.push({ factor: 'severe_order_decline', weight: 20, current_value: Math.round(orderDecline), threshold: 70, trend: 'declining' });
  } else if (orderDecline >= 40) {
    churnScore += 10;
    factors.push({ factor: 'order_volume_declining', weight: 10, current_value: Math.round(orderDecline), threshold: 40, trend: 'declining' });
  }

  // ── 4. UNRESOLVED HIGH-SEVERITY ALERTS (0-15 pts) ──────────────────
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high');
  if (criticalAlerts.length >= 5) {
    churnScore += 15;
    factors.push({ factor: 'many_unresolved_alerts', weight: 15, current_value: criticalAlerts.length, threshold: 5, trend: 'increasing' });
  } else if (criticalAlerts.length >= 3) {
    churnScore += 8;
    factors.push({ factor: 'elevated_alert_count', weight: 8, current_value: criticalAlerts.length, threshold: 3, trend: 'increasing' });
  }

  // ── 5. LOGIN / ENGAGEMENT ACTIVITY (0-20 pts) ──────────────────────
  // Use AuditLog entries as proxy for login/engagement activity
  const recentActivity = auditLogs.filter(a => {
    const t = new Date(a.created_date || 0).getTime();
    return t > d14ago;
  }).length;

  if (recentActivity === 0) {
    churnScore += 20;
    factors.push({ factor: 'no_recent_activity', weight: 20, current_value: 0, threshold: 1, trend: 'critical' });
  } else if (recentActivity < 5) {
    churnScore += 10;
    factors.push({ factor: 'low_engagement', weight: 10, current_value: recentActivity, threshold: 5, trend: 'declining' });
  }

  // ── 6. SUPPORT & CUSTOMER HEALTH (0-25 pts) ────────────────────────
  // Support ticket volume and resolution time
  const recentSupportTickets = supportConversations.filter(s => {
    const t = new Date(s.created_date || 0).getTime();
    return t > d30ago;
  });

  const openTickets = recentSupportTickets.filter(s => s.status === 'open' || s.status === 'pending').length;
  const avgResolutionTime = calculateAvgResolutionTime(recentSupportTickets);
  
  // Escalated or unresolved tickets indicate customer frustration
  if (openTickets >= 5) {
    churnScore += 15;
    factors.push({ factor: 'high_unresolved_tickets', weight: 15, current_value: openTickets, threshold: 5, trend: 'increasing' });
  } else if (openTickets >= 2) {
    churnScore += 8;
    factors.push({ factor: 'moderate_ticket_volume', weight: 8, current_value: openTickets, threshold: 2, trend: 'increasing' });
  }

  // Slow resolution time (>7 days avg) suggests support quality issues
  if (avgResolutionTime > 7) {
    churnScore += 10;
    factors.push({ factor: 'slow_ticket_resolution', weight: 10, current_value: Math.round(avgResolutionTime), threshold: 7, trend: 'declining' });
  } else if (avgResolutionTime > 3) {
    churnScore += 5;
    factors.push({ factor: 'moderate_resolution_time', weight: 5, current_value: Math.round(avgResolutionTime), threshold: 3, trend: 'declining' });
  }

  // High recent support volume (lots of tickets) relative to tenant age suggests issues
  const ticketDensity = recentSupportTickets.length / Math.max(1, Math.floor(daysSinceCreation / 30));
  if (ticketDensity > 5) {
    churnScore += 8;
    factors.push({ factor: 'high_support_volume', weight: 8, current_value: Math.round(ticketDensity * 10) / 10, threshold: 5, trend: 'increasing' });
  }

  // ── 7. NEW CUSTOMER BONUS (reduce score if onboarding_completed recently) ──
  const daysSinceCreation = Math.floor((nowMs - new Date(tenant.created_date || now).getTime()) / DAY);
  if (daysSinceCreation <= 7 && tenant.onboarding_completed) {
    // Healthy new customer — reduce score
    churnScore = Math.max(0, churnScore - 10);
  }

  // Cap at 100
  churnScore = Math.min(100, Math.max(0, Math.round(churnScore)));

  // Risk level
  const riskLevel = churnScore >= 70 ? 'critical' : churnScore >= 50 ? 'high' : churnScore >= 25 ? 'medium' : 'low';
  const daysToChurn = riskLevel === 'critical' ? 7 : riskLevel === 'high' ? 21 : riskLevel === 'medium' ? 45 : 90;

  // LTV at risk
  const tierMrr = { enterprise: 799, pro: 299, growth: 99, starter: 29, trial: 0 };
  const mrr = tierMrr[tenant.subscription_tier] || 0;
  const ltvAtRisk = mrr * 12;

  // Metrics snapshot (for display in the UI)
  const metrics = {
    orders_last_7d: ordersLast7d,
    orders_prior_7d: ordersPrior7d,
    days_since_last_sync: daysSinceSync >= 999 ? null : daysSinceSync,
    connected_integrations: connected,
    errored_integrations: errored,
    unresolved_critical_alerts: criticalAlerts.length,
    audit_log_events_14d: recentActivity,
    days_since_creation: daysSinceCreation,
    plan_status: planStatus,
    trial_days_remaining: trialEndsAt ? Math.max(0, Math.floor((trialEndsAt - nowMs) / DAY)) : null,
    recent_sync_failures: recentFailedSyncs.length,
    support_open_tickets: openTickets,
    avg_support_resolution_days: Math.round(avgResolutionTime * 10) / 10,
    support_tickets_30d: recentSupportTickets.length,
    ticket_volume_density: Math.round(ticketDensity * 10) / 10
  };

  return {
    churnScore,
    riskLevel,
    daysToChurn,
    factors,
    metrics,
    ltvAtRisk,
    monthsAsCustomer: Math.floor(daysSinceCreation / 30)
  };
}

// ─────────────────────────────────────────────
//  RETENTION TRIGGER
// ─────────────────────────────────────────────

async function triggerRetention(base44, tenantId) {
  if (!tenantId) return Response.json({ error: 'tenant_id required' }, { status: 400 });

  const db = base44.asServiceRole;
  const predictions = await db.entities.ChurnPrediction.filter({ tenant_id: tenantId });
  if (predictions.length === 0) {
    return Response.json({ error: 'No prediction found for tenant. Run predict_churn first.' }, { status: 404 });
  }

  const prediction = predictions[0];
  const actions = prediction.retention_actions_triggered || [];

  let actionType;
  if (prediction.risk_level === 'critical') {
    actionType = 'personal_outreach';
  } else if (prediction.risk_level === 'high') {
    actionType = 'discount_offer';
  } else {
    actionType = 'engagement_email';
  }

  actions.push({
    action_type: actionType,
    triggered_at: new Date().toISOString(),
    status: 'triggered',
    outcome: 'pending'
  });

  await db.entities.ChurnPrediction.update(prediction.id, {
    retention_actions_triggered: actions,
    status: 'intervention'
  });

  // Log audit event
  await db.entities.AuditLog.create({
    tenant_id: tenantId,
    action: 'retention_triggered',
    entity_type: 'ChurnPrediction',
    entity_id: prediction.id,
    performed_by: 'system',
    description: `Retention action triggered: ${actionType} for risk_level=${prediction.risk_level}`,
    is_auto_action: true,
    category: 'ai_action',
    severity: prediction.risk_level === 'critical' ? 'critical' : 'high'
  }).catch(() => {});

  return Response.json({
    success: true,
    action_triggered: actionType,
    tenant_id: tenantId,
    risk_level: prediction.risk_level,
    churn_probability: prediction.churn_probability
  });
}

// ─────────────────────────────────────────────
//  DEBUG SIGNALS (for testing/verification)
// ─────────────────────────────────────────────

async function debugSignals(base44, tenantId) {
  if (!tenantId) return Response.json({ error: 'tenant_id required' }, { status: 400 });

  const db = base44.asServiceRole;
  const now = new Date();

  const [tenant, integrations, orders, syncJobs, alerts, auditLogs] = await Promise.all([
    db.entities.Tenant.filter({ id: tenantId }).then(r => r[0] || null).catch(() => null),
    db.entities.PlatformIntegration.filter({ tenant_id: tenantId }).catch(() => []),
    db.entities.Order.filter({ tenant_id: tenantId }).catch(() => []),
    db.entities.SyncJob.filter({ tenant_id: tenantId }).catch(() => []),
    db.entities.Alert.filter({ tenant_id: tenantId, status: 'pending' }).catch(() => []),
    db.entities.AuditLog.filter({ tenant_id: tenantId }).catch(() => [])
  ]);

  if (!tenant) return Response.json({ error: `Tenant ${tenantId} not found` }, { status: 404 });

  const result = scoreTenant({ tenant, integrations, orders, syncJobs, alerts, auditLogs, now });

  return Response.json({
    tenant_id: tenantId,
    shop_name: tenant.shop_name || tenant.shop_domain,
    signal_counts: {
      integrations: integrations.length,
      orders: orders.length,
      sync_jobs: syncJobs.length,
      pending_alerts: alerts.length,
      audit_logs: auditLogs.length
    },
    score_result: result,
    tenant_data: {
      plan_status: tenant.plan_status,
      subscription_tier: tenant.subscription_tier,
      trial_ends_at: tenant.trial_ends_at,
      onboarding_completed: tenant.onboarding_completed,
      status: tenant.status
    }
  });
}

// ─────────────────────────────────────────────
//  GET AT-RISK TENANTS
// ─────────────────────────────────────────────

async function getAtRiskTenants(base44) {
  const db = base44.asServiceRole;
  const predictions = await db.entities.ChurnPrediction.filter({});

  const atRisk = predictions
    .filter(p => p.risk_level === 'critical' || p.risk_level === 'high')
    .sort((a, b) => (b.churn_probability || 0) - (a.churn_probability || 0));

  return Response.json({
    at_risk_tenants: atRisk.map(p => ({
      id: p.id,
      tenant_id: p.tenant_id,
      churn_probability: p.churn_probability,
      risk_level: p.risk_level,
      ltv_at_risk: p.ltv_at_risk,
      days_to_churn: p.days_to_churn_estimate,
      subscription_tier: p.subscription_tier,
      top_factors: (p.contributing_factors || []).slice(0, 3).map(f => f.factor),
      status: p.status,
      prediction_date: p.prediction_date
    })),
    summary: {
      total_at_risk: atRisk.length,
      total_ltv_at_risk: atRisk.reduce((s, p) => s + (p.ltv_at_risk || 0), 0),
      critical_count: atRisk.filter(p => p.risk_level === 'critical').length,
      high_count: atRisk.filter(p => p.risk_level === 'high').length
    }
  });
}

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key];
    if (!k) continue;
    if (!map[k]) map[k] = [];
    map[k].push(item);
  }
  return map;
}