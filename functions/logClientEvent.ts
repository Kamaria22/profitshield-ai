import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Client-side telemetry logging endpoint
 * Rate-limited: max 20 events per user per day
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Optional auth - telemetry works for both authenticated and anonymous
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      // Anonymous - that's okay
    }
    
    const payload = await req.json();
    
    // Validate required fields
    if (!payload.level || !payload.message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Rate limiting check - max 20 events per user per day
    const today = new Date().toISOString().split('T')[0];
    const userKey = user?.email || 'anonymous';
    
    const recentEvents = await base44.asServiceRole.entities.ClientTelemetry.filter({
      user_email_masked: userKey,
      timestamp: { $gte: `${today}T00:00:00Z` }
    });
    
    if (recentEvents.length >= 20) {
      return Response.json({ 
        error: 'Rate limit exceeded', 
        limit: 20, 
        current: recentEvents.length 
      }, { status: 429 });
    }
    
    // Create telemetry record
    const telemetry = {
      timestamp: new Date().toISOString(),
      level: payload.level,
      route: payload.route || 'unknown',
      platform: payload.platform || null,
      store_key_masked: payload.store_key_masked || null,
      tenant_id_partial: payload.tenant_id_partial || null,
      user_email_masked: userKey,
      message: payload.message,
      context_json: payload.context || {},
      user_agent: req.headers.get('user-agent') || 'unknown',
      viewport_width: payload.viewport?.width || null,
      viewport_height: payload.viewport?.height || null
    };
    
    await base44.asServiceRole.entities.ClientTelemetry.create(telemetry);
    
    return Response.json({ success: true, count: recentEvents.length + 1 });
    
  } catch (error) {
    console.error('[logClientEvent] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});