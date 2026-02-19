import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GET /demo-video/jobs/{jobId}
 * Poll job status and download links
 */
Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      return Response.json({
        ok: false,
        error: 'MISSING_JOB_ID',
        message: 'jobId query parameter required'
      }, { status: 400 });
    }

    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({
        ok: false,
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`
      }, { status: 404 });
    }

    return Response.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      mode: job.mode,
      version: job.version,
      outputs: job.outputs || {},
      errorMessage: job.error_message,
      createdAt: job.created_date
    }, { status: 200 });

  } catch (error) {
    console.error('Status check error:', error.message);
    return Response.json({
      ok: false,
      error: 'STATUS_CHECK_ERROR',
      message: 'Failed to check job status'
    }, { status: 500 });
  }
});