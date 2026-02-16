import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Calculate exponential backoff delay
function getBackoffDelay(retryCount) {
  const baseDelay = 1000; // 1 second
  const maxDelay = 300000; // 5 minutes
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  return delay + Math.random() * 1000; // Add jitter
}

// Generate SHA-256 hash
async function hashPayload(payload) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { action, event_data, event_id } = await req.json();

    switch (action) {
      case 'enqueue': {
        // Add new event to processing queue
        const { tenant_id, source, event_type, payload } = event_data;
        
        if (!tenant_id) {
          return Response.json({ error: 'tenant_id is required' }, { status: 400 });
        }

        const payloadHash = await hashPayload(payload);
        const idempotencyKey = `${tenant_id}:${event_type}:${payloadHash}`;

        // Check for duplicate
        const existing = await base44.asServiceRole.entities.EventLog.filter({ 
          idempotency_key: idempotencyKey 
        });

        if (existing.length > 0) {
          return Response.json({ 
            success: true, 
            duplicate: true, 
            existing_event_id: existing[0].event_id 
          });
        }

        const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const eventLog = await base44.asServiceRole.entities.EventLog.create({
          tenant_id,
          event_id: eventId,
          source,
          event_type,
          payload_hash: payloadHash,
          processing_status: 'pending',
          retry_count: 0,
          max_retries: 5,
          idempotency_key: idempotencyKey
        });

        return Response.json({ success: true, event_id: eventId, log_id: eventLog.id });
      }

      case 'process': {
        // Process pending events
        const pendingEvents = await base44.asServiceRole.entities.EventLog.filter({
          processing_status: 'pending'
        }, 'created_date', 50);

        let processed = 0;
        let failed = 0;

        for (const event of pendingEvents) {
          const startTime = Date.now();
          
          try {
            await base44.asServiceRole.entities.EventLog.update(event.id, {
              processing_status: 'processing'
            });

            // Process based on event type
            // This would call the appropriate handler
            // For now, mark as completed
            
            await base44.asServiceRole.entities.EventLog.update(event.id, {
              processing_status: 'completed',
              processed_at: new Date().toISOString(),
              processing_duration_ms: Date.now() - startTime
            });

            processed++;
          } catch (error) {
            const newRetryCount = (event.retry_count || 0) + 1;
            const maxRetries = event.max_retries || 5;

            if (newRetryCount >= maxRetries) {
              // Move to dead letter queue
              await base44.asServiceRole.entities.EventLog.update(event.id, {
                processing_status: 'dead_letter',
                error_message: error.message,
                retry_count: newRetryCount
              });
            } else {
              // Schedule retry with exponential backoff
              const nextRetryAt = new Date(Date.now() + getBackoffDelay(newRetryCount));
              await base44.asServiceRole.entities.EventLog.update(event.id, {
                processing_status: 'pending',
                error_message: error.message,
                retry_count: newRetryCount,
                next_retry_at: nextRetryAt.toISOString()
              });
            }
            failed++;
          }
        }

        return Response.json({ success: true, processed, failed });
      }

      case 'retry_failed': {
        // Retry events that are ready for retry
        const now = new Date().toISOString();
        const retryableEvents = await base44.asServiceRole.entities.EventLog.filter({
          processing_status: 'pending'
        });

        const readyForRetry = retryableEvents.filter(e => 
          e.retry_count > 0 && (!e.next_retry_at || e.next_retry_at <= now)
        );

        return Response.json({ 
          success: true, 
          events_ready_for_retry: readyForRetry.length 
        });
      }

      case 'get_dead_letter': {
        const { tenant_id } = event_data || {};
        const query = { processing_status: 'dead_letter' };
        if (tenant_id) query.tenant_id = tenant_id;

        const deadLetterEvents = await base44.asServiceRole.entities.EventLog.filter(query);
        return Response.json({ success: true, events: deadLetterEvents });
      }

      case 'requeue_dead_letter': {
        // Manually requeue a dead letter event
        if (!event_id) {
          return Response.json({ error: 'event_id is required' }, { status: 400 });
        }

        const events = await base44.asServiceRole.entities.EventLog.filter({ event_id });
        if (events.length === 0) {
          return Response.json({ error: 'Event not found' }, { status: 404 });
        }

        await base44.asServiceRole.entities.EventLog.update(events[0].id, {
          processing_status: 'pending',
          retry_count: 0,
          error_message: null,
          next_retry_at: null
        });

        return Response.json({ success: true, requeued: true });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Event processor error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});