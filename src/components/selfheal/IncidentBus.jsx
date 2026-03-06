/**
 * IncidentBus — Frontend incident publisher
 * Classifies errors and dispatches to selfHeal backend.
 * Non-admin users see friendly "Reconnecting..." messages only.
 */
import { base44 } from '@/api/base44Client';

const SUBSYSTEMS = {
  AUTH: 'AUTH',
  SHOPIFY_OAUTH: 'SHOPIFY_OAUTH',
  SHOPIFY_WEBHOOKS: 'SHOPIFY_WEBHOOKS',
  SHOPIFY_SYNC: 'SHOPIFY_SYNC',
  STRIPE_BILLING: 'STRIPE_BILLING',
  AUTOMATION: 'AUTOMATION',
  QUEUE: 'QUEUE',
  UI_ROUTING: 'UI_ROUTING',
  PERFORMANCE: 'PERFORMANCE',
  SECRETS: 'SECRETS',
  GENERAL: 'GENERAL',
};

function classifyError(error, context = {}) {
  const msg = (error?.message || String(error)).toLowerCase();
  const url = (context.url || '').toLowerCase();

  if (msg.includes('token') && msg.includes('revok')) return { subsystem: SUBSYSTEMS.SHOPIFY_OAUTH, issue_code: 'TOKEN_REVOKED', severity: 'critical' };
  if (msg.includes('401') && url.includes('shopify')) return { subsystem: SUBSYSTEMS.SHOPIFY_OAUTH, issue_code: 'SHOPIFY_401', severity: 'high' };
  if (msg.includes('webhook') && msg.includes('missing')) return { subsystem: SUBSYSTEMS.SHOPIFY_WEBHOOKS, issue_code: 'WEBHOOK_MISSING', severity: 'high' };
  if (msg.includes('stripe') || url.includes('stripe')) return { subsystem: SUBSYSTEMS.STRIPE_BILLING, issue_code: 'STRIPE_ERROR', severity: 'high' };
  if (msg.includes('no_context') || msg.includes('needs_selection')) return { subsystem: SUBSYSTEMS.UI_ROUTING, issue_code: 'RESOLVER_NO_CONTEXT', severity: 'medium' };
  if (msg.includes('queue') || msg.includes('dead_letter')) return { subsystem: SUBSYSTEMS.QUEUE, issue_code: 'QUEUE_ERROR', severity: 'medium' };
  if (msg.includes('automation') || msg.includes('scheduled')) return { subsystem: SUBSYSTEMS.AUTOMATION, issue_code: 'AUTOMATION_FAILURE', severity: 'medium' };
  if (msg.includes('secret') || msg.includes('env')) return { subsystem: SUBSYSTEMS.SECRETS, issue_code: 'MISSING_SECRET', severity: 'high' };
  if (context.statusCode >= 500) return { subsystem: SUBSYSTEMS.GENERAL, issue_code: 'SERVER_ERROR_5XX', severity: 'high' };
  return { subsystem: SUBSYSTEMS.GENERAL, issue_code: 'UNKNOWN_ERROR', severity: 'low' };
}

let publishQueue = [];
let publishTimer = null;
let flushInFlight = false;

async function flush() {
  if (!publishQueue.length || flushInFlight) return;
  flushInFlight = true;
  const batch = publishQueue.splice(0, 10);
  try {
    for (const incident of batch) {
      await base44.functions.invoke('selfHeal', {
        action: 'publish_incident',
        ...incident
      });
    }
  } catch (e) {
    console.warn('[IncidentBus] flush failed:', e?.message);
    publishQueue = [...batch, ...publishQueue].slice(0, 100);
  } finally {
    flushInFlight = false;
    if (publishQueue.length > 0 && !publishTimer) {
      publishTimer = setTimeout(() => {
        flush();
        publishTimer = null;
      }, 1500);
    }
  }
}

export function publishIncident({ subsystem, issue_code, severity = 'medium', tenant_id, context = {} }) {
  publishQueue.push({ subsystem, issue_code, severity, tenant_id, context, detected_at: new Date().toISOString() });
  if (publishQueue.length >= 10 && !flushInFlight && !publishTimer) {
    flush();
    return;
  }
  if (!publishTimer) {
    publishTimer = setTimeout(() => { flush(); publishTimer = null; }, 2000);
  }
}

export function publishError(error, context = {}) {
  const classification = classifyError(error, context);
  publishIncident({ ...classification, tenant_id: context.tenant_id, context: { ...context, message: error?.message } });
}

export class IncidentBusClient {
  publishIncident(payload) {
    publishIncident(payload);
  }

  publishError(error, context = {}) {
    publishError(error, context);
  }
}

export { SUBSYSTEMS, classifyError };
