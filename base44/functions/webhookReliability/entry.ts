import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'get_dead_letters') {
      return await getDeadLetters(base44, body.tenant_id);
    } else if (action === 'replay_webhook') {
      return await replayWebhook(base44, body.dead_letter_id, user.email);
    } else if (action === 'retry_failed') {
      return await retryFailedWebhooks(base44);
    } else if (action === 'get_health_dashboard') {
      return await getWebhookHealthDashboard(base44, body.tenant_id);
    } else if (action === 'add_to_dead_letter') {
      return await addToDeadLetter(base44, body);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getDeadLetters(base44, tenantId) {
  const filter = tenantId ? { tenant_id: tenantId } : {};
  const deadLetters = await base44.asServiceRole.entities.WebhookDeadLetter.filter(filter);
  
  const pending = deadLetters.filter(d => d.status === 'pending' || d.status === 'retrying');
  const failed = deadLetters.filter(d => d.status === 'failed' || d.status === 'expired');

  return Response.json({
    dead_letters: deadLetters.map(d => ({
      id: d.id,
      tenant_id: d.tenant_id,
      platform: d.platform,
      topic: d.webhook_topic,
      failure_reason: d.failure_reason,
      retry_count: d.retry_count,
      status: d.status,
      original_timestamp: d.original_timestamp,
      next_retry_at: d.next_retry_at
    })),
    summary: {
      total: deadLetters.length,
      pending: pending.length,
      failed: failed.length,
      by_topic: groupBy(deadLetters, 'webhook_topic'),
      by_platform: groupBy(deadLetters, 'platform')
    }
  });
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

async function replayWebhook(base44, deadLetterId, userEmail) {
  const deadLetters = await base44.asServiceRole.entities.WebhookDeadLetter.filter({ id: deadLetterId });
  if (deadLetters.length === 0) {
    return Response.json({ error: 'Dead letter not found' }, { status: 404 });
  }

  const dl = deadLetters[0];

  // Simulate replay processing
  const success = Math.random() > 0.2; // 80% success rate for replays

  if (success) {
    await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, {
      status: 'replayed',
      replayed_by: userEmail,
      replayed_at: new Date().toISOString(),
      replay_result: 'success'
    });

    // Log the replay
    await base44.asServiceRole.entities.GovernanceAuditEvent.create({
      event_type: 'data_access',
      entity_affected: 'WebhookDeadLetter',
      entity_id: dl.id,
      changed_by: userEmail,
      change_reason: 'Manual webhook replay',
      severity: 'info'
    });

    return Response.json({
      success: true,
      dead_letter_id: deadLetterId,
      replay_result: 'success',
      message: 'Webhook successfully replayed'
    });
  } else {
    await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, {
      retry_count: (dl.retry_count || 0) + 1,
      last_retry_at: new Date().toISOString(),
      replay_result: 'failed'
    });

    return Response.json({
      success: false,
      dead_letter_id: deadLetterId,
      replay_result: 'failed',
      message: 'Replay failed, will retry automatically'
    });
  }
}

async function retryFailedWebhooks(base44) {
  const deadLetters = await base44.asServiceRole.entities.WebhookDeadLetter.filter({ status: 'pending' });
  const results = { success: 0, failed: 0, skipped: 0 };

  for (const dl of deadLetters) {
    if ((dl.retry_count || 0) >= (dl.max_retries || 5)) {
      await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, { status: 'expired' });
      results.skipped++;
      continue;
    }

    // Simulate retry
    const success = Math.random() > 0.3;

    if (success) {
      await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, {
        status: 'replayed',
        replayed_at: new Date().toISOString(),
        replay_result: 'auto_retry_success'
      });
      results.success++;
    } else {
      const nextRetry = new Date(Date.now() + Math.pow(2, dl.retry_count || 1) * 60000); // Exponential backoff
      await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, {
        retry_count: (dl.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
        next_retry_at: nextRetry.toISOString(),
        status: 'retrying'
      });
      results.failed++;
    }
  }

  return Response.json({
    success: true,
    processed: deadLetters.length,
    results
  });
}

async function getWebhookHealthDashboard(base44, tenantId) {
  const webhookEvents = await base44.asServiceRole.entities.WebhookEvent.filter(
    tenantId ? { tenant_id: tenantId } : {}
  );
  const deadLetters = await base44.asServiceRole.entities.WebhookDeadLetter.filter(
    tenantId ? { tenant_id: tenantId } : {}
  );

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = webhookEvents.filter(w => new Date(w.created_date) >= last24h);

  const successRate = recent.length > 0 
    ? ((recent.filter(w => w.status === 'processed').length / recent.length) * 100).toFixed(1)
    : 100;

  // Group by topic
  const topicStats = {};
  for (const w of recent) {
    const topic = w.topic || 'unknown';
    topicStats[topic] = topicStats[topic] || { total: 0, success: 0, failed: 0 };
    topicStats[topic].total++;
    if (w.status === 'processed') topicStats[topic].success++;
    else topicStats[topic].failed++;
  }

  return Response.json({
    health_dashboard: {
      overall_success_rate: parseFloat(successRate),
      total_webhooks_24h: recent.length,
      failed_webhooks_24h: recent.filter(w => w.status !== 'processed').length,
      dead_letters_pending: deadLetters.filter(d => d.status === 'pending').length,
      dead_letters_total: deadLetters.length,
      topic_stats: Object.entries(topicStats).map(([topic, stats]) => ({
        topic,
        ...stats,
        success_rate: ((stats.success / stats.total) * 100).toFixed(1)
      })),
      health_status: parseFloat(successRate) >= 99 ? 'healthy' :
                     parseFloat(successRate) >= 95 ? 'degraded' : 'critical'
    }
  });
}

async function addToDeadLetter(base44, data) {
  const deadLetter = await base44.asServiceRole.entities.WebhookDeadLetter.create({
    tenant_id: data.tenant_id,
    integration_id: data.integration_id,
    platform: data.platform,
    webhook_topic: data.topic,
    webhook_id: data.webhook_id,
    payload: data.payload,
    payload_hash: hashPayload(data.payload),
    original_timestamp: data.timestamp || new Date().toISOString(),
    failure_reason: data.failure_reason,
    error_code: data.error_code,
    retry_count: 0,
    max_retries: 5,
    status: 'pending',
    next_retry_at: new Date(Date.now() + 60000).toISOString() // First retry in 1 minute
  });

  return Response.json({ success: true, dead_letter_id: deadLetter.id });
}

function hashPayload(payload) {
  return btoa(JSON.stringify(payload)).slice(0, 32);
}