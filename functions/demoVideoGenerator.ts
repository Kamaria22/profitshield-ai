import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * DEMO VIDEO GENERATOR - FIXED
 * No secrets in responses, proper 500 error handling, input validation
 */

Deno.serve(async (req) => {
  const requestId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'owner') {
      return Response.json({ error: 'Forbidden', code: 'ADMIN_REQUIRED' }, { status: 403 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch (parseError) {
      console.error(`[${requestId}] JSON parse error:`, parseError);
      return Response.json({ 
        error: 'Invalid request body',
        code: 'INVALID_JSON'
      }, { status: 400 });
    }

    const { tenant_id = null, mode = 'demo', version = '90s', options = {} } = payload;

    // Validate version
    const validVersions = ['60s', '90s', '120s', '2m'];
    if (!validVersions.includes(version)) {
      return Response.json({ 
        error: `Invalid version. Must be one of: ${validVersions.join(', ')}`,
        code: 'INVALID_VERSION'
      }, { status: 400 });
    }

    console.log(`[${requestId}] Video generation request:`, { 
      tenantId: tenant_id ? tenant_id.slice(0, 8) + '...' : 'null', 
      mode,
      version
    });

    // Create job record
    const job = await base44.asServiceRole.entities.DemoVideoJob.create({
      tenant_id,
      mode,
      version,
      options,
      status: 'queued',
      progress: 0,
      request_id: requestId
    });

    console.log(`[${requestId}] Created job ${job.id}`);

    // Return immediately with jobId
    return Response.json({
      success: true,
      jobId: job.id,
      status: 'queued',
      message: 'Video generation started'
    }, { status: 200 });

  } catch (error) {
    console.error(`[${requestId}] Generation error:`, error.message);
    console.error(`[${requestId}] Stack:`, error.stack);
    
    // NEVER leak secrets/tokens in error response
    return Response.json({ 
      error: 'Generation failed',
      code: 'GENERATION_ERROR'
    }, { status: 500 });
  }
});