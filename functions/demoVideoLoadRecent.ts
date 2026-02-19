import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Load recent demo video jobs for a tenant
 * Useful for "resume previous render" functionality
 */
Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId');
    const limit = parseInt(url.searchParams.get('limit') || '5');

    if (!tenantId) {
      return Response.json({
        ok: false,
        error: 'MISSING_TENANT_ID',
        message: 'tenantId query parameter required'
      }, { status: 400 });
    }

    // Fetch recent jobs (owner/admin only)
    const jobs = await base44.entities.DemoVideoJob.filter(
      { tenant_id: tenantId },
      '-created_date',
      limit
    );

    return Response.json({
      ok: true,
      jobs: jobs.map(job => ({
        jobId: job.id,
        status: job.status,
        version: job.version,
        mode: job.mode,
        progress: job.progress,
        createdAt: job.created_date,
        outputs: job.outputs || {},
        errorMessage: job.error_message
      }))
    }, { status: 200 });

  } catch (error) {
    console.error('Load recent jobs error:', error.message);
    return Response.json({
      ok: false,
      error: 'LOAD_ERROR',
      message: 'Failed to load recent jobs'
    }, { status: 500 });
  }
});