/**
 * churnPrevention — Daily Churn Prediction Engine (Hotfix: asServiceRole removal)
 *
 * Uses base44.entities directly (no asServiceRole).
 * Supports: predict_churn, run_anomaly_detection (alias), trigger_retention, get_at_risk_tenants, debug_signals, debug_sdk
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const DAY_MS = 86_400_000;

const LIMITS = {
  ORDERS_PER_TENANT: 2000,
  SYNCJOBS_PER_TENANT: 300,
  ALERTS_PER_TENANT: 200,
  AUDITLOGS_PER_TENANT: 500,
  TENANTS_PAGE: 500,
};

const WINDOWS = {
  ORDERS_DAYS: 30,
  SYNCJOBS_DAYS: 14,
  AUDITLOGS_DAYS: 14,
  ALERTS_DAYS: 30,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth check
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      // Not authenticated (ok for automations)
    }

    const body = await safeJson(req);
    const action = body?.action || "predict_churn";

    const validActions = [
      "predict_churn",
      "run_anomaly_detection",
      "trigger_retention",
      "get_at_risk_tenants",
      "debug_signals",
      "debug_sdk",
    ];

    if (!validActions.includes(action)) {
      return Response.json({ error: "Invalid action: " + action }, {
        status: 400,
      });
    }

    // Normalize alias
    const normalizedAction = action === "run_anomaly_detection"
      ? "predict_churn"
      : action;

    // Authorization logic
    // - predict_churn, debug_sdk: always allowed
    // - trigger_retention, debug_signals: require user OR admin_override
    if (
      (normalizedAction === "trigger_retention" ||
        normalizedAction === "debug_signals") &&
      !user &&
      !body?.admin_override
    ) {
      return Response.json(
        { error: "Unauthorized (no user session and no admin_override)" },
        { status: 401 }
      );
    }

    // Dispatch
    if (normalizedAction === "predict_churn") {
      return await predictChurn(base44.entities);
    }
    if (normalizedAction === "trigger_retention") {
      return await triggerRetention(base44.entities, body?.tenant_id, user);
    }
    if (normalizedAction === "get_at_risk_tenants") {
      return await getAtRiskTenants(base44.entities);
    }
    if (normalizedAction === "debug_signals") {
      return await debugSignals(base44.entities, body?.tenant_id, user);
    }
    if (action === "debug_sdk") {
      return debugSdk(base44);
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[churnPrevention] fatal", error);
    return Response.json(
      { error: String(error?.message || error), stack: String(error?.stack || "") },
      { status: 500 }
    );
  }
});

// ─────────────────────────────────────────────
// MAIN PREDICTION ENGINE
// ─────────────────────────────────────────────

async function predictChurn(db) {
  const now = new Date();
  const nowMs = now.getTime();

  // Load active tenants (bounded)
  const tenants = await db.Tenant
    .filter({ status: "active" }, "-created_date", LIMITS.TENANTS_PAGE)
    .catch(() => []);

  if (!tenants?.length) {
    return Response.json({
      success: true,
      tenants_analyzed: 0,
      at_risk_count: 0,
      message: "No active tenants found",
      run_at: now.toISOString(),
    });
  }

  // Bulk-load existing predictions
  const existingPreds = await db.ChurnPrediction
    .filter({}, "-updated_date", 5000)
    .catch(() => []);
  const predByTenant = new Map(existingPreds.map((p) => [p.tenant_id, p]));

  const predictions = [];

  // Process tenants with concurrency cap
  const concurrency = 6;
  for (let i = 0; i < tenants.length; i += concurrency) {
    const chunk = tenants.slice(i, i + concurrency);

    const results = await Promise.all(
      chunk.map(async (tenant) => {
        const tenantId = tenant.id;

        // Pull only recent data with limits
        const windowStart = new Date(nowMs - WINDOWS.ORDERS_DAYS * DAY_MS)
          .toISOString();
        const syncWindowStart = new Date(
          nowMs - WINDOWS.SYNCJOBS_DAYS * DAY_MS
        ).toISOString();
        const alertWindowStart = new Date(
          nowMs - WINDOWS.ALERTS_DAYS * DAY_MS
        ).toISOString();
        const auditWindowStart = new Date(
          nowMs - WINDOWS.AUDITLOGS_DAYS * DAY_MS
        ).toISOString();

        const [integrations, orders, syncJobs, alerts, auditLogs] = await Promise
          .all([
            db.PlatformIntegration.filter({ tenant_id: tenantId }).catch(
              () => []
            ),

            db.Order
              .filter({ tenant_id: tenantId }, "-created_date", LIMITS.ORDERS_PER_TENANT)
              .catch(() => [])
              .then((list) =>
                list.filter((o) => {
                  const t = safeTime(o.order_date || o.created_date);
                  return !t || t >= new Date(windowStart).getTime();
                })
              ),

            db.SyncJob
              .filter(
                { tenant_id: tenantId },
                "-created_date",
                LIMITS.SYNCJOBS_PER_TENANT
              )
              .catch(() => [])
              .then((list) =>
                list.filter((s) => {
                  const t = safeTime(s.created_date);
                  return !t || t >= new Date(syncWindowStart).getTime();
                })
              ),

            db.Alert
              .filter(
                { tenant_id: tenantId, status: "pending" },
                "-created_date",
                LIMITS.ALERTS_PER_TENANT
              )
              .catch(() => [])
              .then((list) =>
                list.filter((a) => {
                  const t = safeTime(a.created_date);
                  return !t || t >= new Date(alertWindowStart).getTime();
                })
              ),

            db.AuditLog
              .filter(
                { tenant_id: tenantId },
                "-created_date",
                LIMITS.AUDITLOGS_PER_TENANT
              )
              .catch(() => [])
              .then((list) =>
                list.filter((a) => {
                  const t = safeTime(a.created_date);
                  return !t || t >= new Date(auditWindowStart).getTime();
                })
              ),
          ]);

        const scored = scoreTenant({
          tenant,
          integrations,
          orders,
          syncJobs,
          alerts,
          auditLogs,
          now,
        });

        const record = {
          tenant_id: tenantId,
          prediction_date: now.toISOString(),
          churn_probability: scored.churnScore,
          risk_level: scored.riskLevel,
          days_to_churn_estimate: scored.daysToChurn,
          contributing_factors: scored.factors,
          usage_metrics: scored.metrics,
          ltv_at_risk: scored.ltvAtRisk,
          subscription_tier: tenant.subscription_tier || "trial",
          months_as_customer: scored.monthsAsCustomer,
          status:
            scored.riskLevel === "critical" || scored.riskLevel === "high"
              ? "at_risk"
              : "active",
          updated_at: now.toISOString(),
        };

        // Upsert
        const existing = predByTenant.get(tenantId);
        if (existing?.id) {
          await db.ChurnPrediction.update(existing.id, record).catch(() => {});
        } else {
          const created = await db.ChurnPrediction.create(record).catch(
            () => null
          );
          if (created?.tenant_id) predByTenant.set(created.tenant_id, created);
        }

        return {
          tenant_id: tenantId,
          shop_name: tenant.shop_name || tenant.shop_domain,
          churn_probability: scored.churnScore,
          risk_level: scored.riskLevel,
          ltv_at_risk: scored.ltvAtRisk,
          top_factors: scored.factors
            .slice(0, 3)
            .map((f) => f.factor),
        };
      })
    );

    predictions.push(...results.filter(Boolean));
  }

  const atRisk = predictions.filter(
    (p) => p.risk_level === "critical" || p.risk_level === "high"
  );
  const totalLtvAtRisk = atRisk.reduce((s, p) => s + (p.ltv_at_risk || 0), 0);

  return Response.json({
    success: true,
    tenants_analyzed: predictions.length,
    at_risk_count: atRisk.length,
    total_ltv_at_risk: totalLtvAtRisk,
    predictions,
    breakdown: {
      critical: predictions.filter((p) => p.risk_level === "critical").length,
      high: predictions.filter((p) => p.risk_level === "high").length,
      medium: predictions.filter((p) => p.risk_level === "medium").length,
      low: predictions.filter((p) => p.risk_level === "low").length,
    },
    run_at: now.toISOString(),
  });
}

// ─────────────────────────────────────────────
// SCORING ENGINE
// ─────────────────────────────────────────────

function scoreTenant({
  tenant,
  integrations,
  orders,
  syncJobs,
  alerts,
  auditLogs,
  now,
}) {
  const factors = [];
  let churnScore = 0;

  const nowMs = now.getTime();
  const d7ago = nowMs - 7 * DAY_MS;
  const d14ago = nowMs - 14 * DAY_MS;

  // 1) TRIAL / BILLING STATUS
  const planStatus = tenant.plan_status || "trial";
  const trialEndsAtMs = safeTime(tenant.trial_ends_at);

  if (planStatus === "trial" && trialEndsAtMs) {
    const daysLeft = Math.floor((trialEndsAtMs - nowMs) / DAY_MS);

    if (daysLeft <= 0) {
      churnScore += 30;
      factors.push({
        factor: "trial_expired",
        weight: 30,
        current_value: daysLeft,
        threshold: 0,
        trend: "critical",
      });
    } else if (daysLeft <= 3) {
      churnScore += 25;
      factors.push({
        factor: "trial_expiring_soon",
        weight: 25,
        current_value: daysLeft,
        threshold: 3,
        trend: "critical",
      });
    } else if (daysLeft <= 7) {
      churnScore += 15;
      factors.push({
        factor: "trial_ending_this_week",
        weight: 15,
        current_value: daysLeft,
        threshold: 7,
        trend: "declining",
      });
    }
  }

  if (planStatus === "past_due") {
    churnScore += 35;
    factors.push({
      factor: "payment_past_due",
      weight: 35,
      current_value: 1,
      threshold: 0,
      trend: "critical",
    });
  }
  if (planStatus === "canceled" || planStatus === "expired") {
    churnScore += 50;
    factors.push({
      factor: "subscription_canceled",
      weight: 50,
      current_value: 1,
      threshold: 0,
      trend: "critical",
    });
  }

  // 2) INTEGRATION HEALTH
  const connected = integrations.filter((i) => i.status === "connected").length;
  const errored = integrations.filter(
    (i) => i.status === "error" || i.status === "disconnected"
  ).length;

  if (integrations.length === 0) {
    churnScore += 20;
    factors.push({
      factor: "no_integration_connected",
      weight: 20,
      current_value: 0,
      threshold: 1,
      trend: "critical",
    });
  } else if (errored > 0 && connected === 0) {
    churnScore += 25;
    factors.push({
      factor: "all_integrations_broken",
      weight: 25,
      current_value: errored,
      threshold: 0,
      trend: "critical",
    });
  } else if (errored > 0) {
    churnScore += 10;
    factors.push({
      factor: "integration_errors",
      weight: 10,
      current_value: errored,
      threshold: 0,
      trend: "declining",
    });
  }

  // Days since last sync
  const successfulSyncs = syncJobs
    .filter((s) => s.status === "completed" && s.completed_at)
    .sort((a, b) => safeTime(b.completed_at) - safeTime(a.completed_at));

  const lastSyncMs = successfulSyncs.length
    ? safeTime(successfulSyncs[0].completed_at)
    : null;
  const daysSinceSync = lastSyncMs
    ? Math.floor((nowMs - lastSyncMs) / DAY_MS)
    : 999;

  if (daysSinceSync >= 7 && integrations.length > 0) {
    churnScore += 15;
    factors.push({
      factor: "stale_sync",
      weight: 15,
      current_value: daysSinceSync,
      threshold: 7,
      trend: "declining",
    });
  }

  // Recent sync failures
  const recentFailedSyncs = syncJobs.filter((s) => {
    if (s.status !== "failed") return false;
    const t = safeTime(s.created_date);
    return t && t > d7ago;
  });

  if (recentFailedSyncs.length >= 3) {
    churnScore += 15;
    factors.push({
      factor: "repeated_sync_failures",
      weight: 15,
      current_value: recentFailedSyncs.length,
      threshold: 3,
      trend: "increasing",
    });
  }

  // 3) ORDER VOLUME TREND
  const ordersLast7d = ordersCountInRange(orders, d7ago, nowMs);
  const ordersPrior7d = ordersCountInRange(orders, d14ago, d7ago);

  const orderDecline =
    ordersPrior7d > 0
      ? ((ordersPrior7d - ordersLast7d) / ordersPrior7d) * 100
      : ordersLast7d === 0
        ? 50
        : 0;

  const tenantCreatedMs = safeTime(tenant.created_date) || nowMs;
  const daysSinceCreation = Math.floor((nowMs - tenantCreatedMs) / DAY_MS);

  if (ordersLast7d === 0 && ordersPrior7d === 0) {
    if (daysSinceCreation > 14) {
      churnScore += 20;
      factors.push({
        factor: "no_order_activity",
        weight: 20,
        current_value: 0,
        threshold: 1,
        trend: "critical",
      });
    }
  } else if (orderDecline >= 70) {
    churnScore += 20;
    factors.push({
      factor: "severe_order_decline",
      weight: 20,
      current_value: Math.round(orderDecline),
      threshold: 70,
      trend: "declining",
    });
  } else if (orderDecline >= 40) {
    churnScore += 10;
    factors.push({
      factor: "order_volume_declining",
      weight: 10,
      current_value: Math.round(orderDecline),
      threshold: 40,
      trend: "declining",
    });
  }

  // 4) UNRESOLVED ALERTS
  const criticalAlerts = alerts.filter(
    (a) => a.severity === "critical" || a.severity === "high"
  );
  if (criticalAlerts.length >= 5) {
    churnScore += 15;
    factors.push({
      factor: "many_unresolved_alerts",
      weight: 15,
      current_value: criticalAlerts.length,
      threshold: 5,
      trend: "increasing",
    });
  } else if (criticalAlerts.length >= 3) {
    churnScore += 8;
    factors.push({
      factor: "elevated_alert_count",
      weight: 8,
      current_value: criticalAlerts.length,
      threshold: 3,
      trend: "increasing",
    });
  }

  // 5) ENGAGEMENT ACTIVITY
  const recentActivityCount = auditLogs.filter((a) => {
    const t = safeTime(a.created_date);
    return t && t > d14ago;
  }).length;

  if (recentActivityCount === 0) {
    churnScore += 20;
    factors.push({
      factor: "no_recent_activity",
      weight: 20,
      current_value: 0,
      threshold: 1,
      trend: "critical",
    });
  } else if (recentActivityCount < 5) {
    churnScore += 10;
    factors.push({
      factor: "low_engagement",
      weight: 10,
      current_value: recentActivityCount,
      threshold: 5,
      trend: "declining",
    });
  }

  // 6) NEW CUSTOMER BONUS
  if (daysSinceCreation <= 7 && tenant.onboarding_completed) {
    churnScore = Math.max(0, churnScore - 10);
  }

  churnScore = Math.min(100, Math.max(0, Math.round(churnScore)));

  const riskLevel =
    churnScore >= 70
      ? "critical"
      : churnScore >= 50
        ? "high"
        : churnScore >= 25
          ? "medium"
          : "low";
  const daysToChurn =
    riskLevel === "critical" ? 7 : riskLevel === "high" ? 21 : riskLevel === "medium" ? 45 : 90;

  const tierMrr = {
    enterprise: 799,
    pro: 299,
    growth: 99,
    starter: 29,
    trial: 0,
  };
  const mrr = tierMrr[String(tenant.subscription_tier || "trial")] || 0;
  const ltvAtRisk = mrr * 12;

  const metrics = {
    orders_last_7d: ordersLast7d,
    orders_prior_7d: ordersPrior7d,
    days_since_last_sync: daysSinceSync >= 999 ? null : daysSinceSync,
    connected_integrations: connected,
    errored_integrations: errored,
    unresolved_critical_alerts: criticalAlerts.length,
    audit_log_events_14d: recentActivityCount,
    days_since_creation: daysSinceCreation,
    plan_status: planStatus,
    trial_days_remaining: trialEndsAtMs
      ? Math.max(0, Math.floor((trialEndsAtMs - nowMs) / DAY_MS))
      : null,
    recent_sync_failures: recentFailedSyncs.length,
  };

  return {
    churnScore,
    riskLevel,
    daysToChurn,
    factors,
    metrics,
    ltvAtRisk,
    monthsAsCustomer: Math.floor(daysSinceCreation / 30),
  };
}

// ─────────────────────────────────────────────
// RETENTION TRIGGER
// ─────────────────────────────────────────────

async function triggerRetention(db, tenantId, user) {
  if (!tenantId) {
    return Response.json({ error: "tenant_id required" }, { status: 400 });
  }

  const preds = await db.ChurnPrediction.filter(
    { tenant_id: tenantId },
    "-updated_date",
    1
  ).catch(() => []);

  if (!preds.length) {
    return Response.json(
      { error: "No prediction found for tenant. Run predict_churn first." },
      { status: 404 }
    );
  }

  const prediction = preds[0];
  const actions = Array.isArray(prediction.retention_actions_triggered)
    ? prediction.retention_actions_triggered
    : [];

  let actionType = "engagement_email";
  if (prediction.risk_level === "critical") actionType = "personal_outreach";
  else if (prediction.risk_level === "high") actionType = "discount_offer";

  actions.push({
    action_type: actionType,
    triggered_at: new Date().toISOString(),
    status: "triggered",
    outcome: "pending",
  });

  await db.ChurnPrediction.update(prediction.id, {
    retention_actions_triggered: actions,
    status: "intervention",
  });

  await db.AuditLog
    .create({
      tenant_id: tenantId,
      action: "retention_triggered",
      entity_type: "ChurnPrediction",
      entity_id: prediction.id,
      performed_by: user?.id || "system",
      description: `Retention action triggered: ${actionType} for risk_level=${prediction.risk_level}`,
      is_auto_action: true,
      category: "ai_action",
      severity: prediction.risk_level === "critical" ? "critical" : "high",
    })
    .catch(() => {});

  return Response.json({
    success: true,
    action_triggered: actionType,
    tenant_id: tenantId,
    risk_level: prediction.risk_level,
    churn_probability: prediction.churn_probability,
  });
}

// ─────────────────────────────────────────────
// DEBUG SIGNALS
// ─────────────────────────────────────────────

async function debugSignals(db, tenantId, user) {
  if (!tenantId) {
    return Response.json({ error: "tenant_id required" }, { status: 400 });
  }

  const now = new Date();
  const nowMs = now.getTime();

  const windowStart = new Date(nowMs - WINDOWS.ORDERS_DAYS * DAY_MS)
    .toISOString();
  const syncWindowStart = new Date(
    nowMs - WINDOWS.SYNCJOBS_DAYS * DAY_MS
  ).toISOString();
  const alertWindowStart = new Date(
    nowMs - WINDOWS.ALERTS_DAYS * DAY_MS
  ).toISOString();
  const auditWindowStart = new Date(
    nowMs - WINDOWS.AUDITLOGS_DAYS * DAY_MS
  ).toISOString();

  const [tenant, integrations, orders, syncJobs, alerts, auditLogs] = await Promise
    .all([
      db.Tenant.filter({ id: tenantId }, "-created_date", 1)
        .then((r) => r[0] || null)
        .catch(() => null),
      db.PlatformIntegration.filter({ tenant_id: tenantId }).catch(() => []),
      db.Order
        .filter({ tenant_id: tenantId }, "-created_date", LIMITS.ORDERS_PER_TENANT)
        .catch(() => [])
        .then((list) =>
          list.filter((o) => {
            const t = safeTime(o.order_date || o.created_date);
            return !t || t >= new Date(windowStart).getTime();
          })
        ),
      db.SyncJob
        .filter(
          { tenant_id: tenantId },
          "-created_date",
          LIMITS.SYNCJOBS_PER_TENANT
        )
        .catch(() => [])
        .then((list) =>
          list.filter((s) => {
            const t = safeTime(s.created_date);
            return !t || t >= new Date(syncWindowStart).getTime();
          })
        ),
      db.Alert
        .filter(
          { tenant_id: tenantId, status: "pending" },
          "-created_date",
          LIMITS.ALERTS_PER_TENANT
        )
        .catch(() => [])
        .then((list) =>
          list.filter((a) => {
            const t = safeTime(a.created_date);
            return !t || t >= new Date(alertWindowStart).getTime();
          })
        ),
      db.AuditLog
        .filter(
          { tenant_id: tenantId },
          "-created_date",
          LIMITS.AUDITLOGS_PER_TENANT
        )
        .catch(() => [])
        .then((list) =>
          list.filter((a) => {
            const t = safeTime(a.created_date);
            return !t || t >= new Date(auditWindowStart).getTime();
          })
        ),
    ]);

  if (!tenant) {
    return Response.json({ error: `Tenant ${tenantId} not found` }, {
      status: 404,
    });
  }

  const result = scoreTenant({
    tenant,
    integrations,
    orders,
    syncJobs,
    alerts,
    auditLogs,
    now,
  });

  return Response.json({
    tenant_id: tenantId,
    shop_name: tenant.shop_name || tenant.shop_domain,
    signal_counts: {
      integrations: integrations.length,
      orders: orders.length,
      sync_jobs: syncJobs.length,
      pending_alerts: alerts.length,
      audit_logs: auditLogs.length,
    },
    score_result: result,
    tenant_data: {
      plan_status: tenant.plan_status,
      subscription_tier: tenant.subscription_tier,
      trial_ends_at: tenant.trial_ends_at,
      onboarding_completed: tenant.onboarding_completed,
      status: tenant.status,
    },
  });
}

// ─────────────────────────────────────────────
// GET AT-RISK TENANTS
// ─────────────────────────────────────────────

async function getAtRiskTenants(db) {
  const predictions = await db.ChurnPrediction
    .filter({}, "-churn_probability", 5000)
    .catch(() => []);

  const atRisk = predictions.filter(
    (p) => p.risk_level === "critical" || p.risk_level === "high"
  );

  return Response.json({
    at_risk_tenants: atRisk.map((p) => ({
      id: p.id,
      tenant_id: p.tenant_id,
      churn_probability: p.churn_probability,
      risk_level: p.risk_level,
      ltv_at_risk: p.ltv_at_risk,
      days_to_churn: p.days_to_churn_estimate,
      subscription_tier: p.subscription_tier,
      top_factors: (p.contributing_factors || [])
        .slice(0, 3)
        .map((f) => f.factor),
      status: p.status,
      prediction_date: p.prediction_date,
    })),
    summary: {
      total_at_risk: atRisk.length,
      total_ltv_at_risk: atRisk.reduce((s, p) => s + (p.ltv_at_risk || 0), 0),
      critical_count: atRisk.filter((p) => p.risk_level === "critical").length,
      high_count: atRisk.filter((p) => p.risk_level === "high").length,
    },
  });
}

// ─────────────────────────────────────────────
// DEBUG SDK
// ─────────────────────────────────────────────

function debugSdk(base44) {
  return Response.json({
    keys: Object.keys(base44).slice(0, 80),
    has_entities: !!base44.entities,
    entities_keys: base44.entities
      ? Object.keys(base44.entities).slice(0, 80)
      : [],
    has_auth: !!base44.auth,
    auth_keys: base44.auth ? Object.keys(base44.auth).slice(0, 80) : [],
    timestamp: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function safeJson(req) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return {};
    const text = await req.text();
    if (!text || !text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function safeTime(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function ordersCountInRange(orders, minMs, maxMs) {
  let c = 0;
  for (const o of orders) {
    const t = safeTime(o.order_date) || safeTime(o.created_date);
    if (!t) continue;
    if (t > minMs && t <= maxMs) c++;
  }
  return c;
}