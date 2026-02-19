import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GET /demo-video/status?jobId=...
 * Poll job status and download links
 * CRITICAL: Always returns fresh DB state (no caching)
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const requestId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const base44 = createClientFromRequest(req);
    const { jobId } = await req.json();

    if (!jobId) {
      return Response.json({
        ok: false,
        error: 'MISSING_JOB_ID',
        message: 'jobId query parameter required'
      }, { status: 400 });
    }

    console.log(`[${requestId}] Fetching job ${jobId}`);

    // CRITICAL: Always read fresh from DB (no cache)
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      console.warn(`[${requestId}] Job ${jobId} not found`);
      return Response.json({
        ok: false,
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`
      }, { status: 404 });
    }

    const outputs = job.outputs || {};
    const hasUrls = !!(outputs.mp4_1080_url || outputs.mp4_720_url);
    
    console.log(`[${requestId}] Job ${jobId} status=${job.status} hasUrls=${hasUrls}`);

    // If job stuck in "rendering" for > 2 min, mark as timed out
    if (job.status === 'rendering' && job.created_date) {
      const ageMs = Date.now() - new Date(job.created_date).getTime();
      if (ageMs > 120000) {
        console.warn(`[${requestId}] Job ${jobId} stuck in rendering (${Math.round(ageMs / 1000)}s), marking failed`);
        await base44.entities.DemoVideoJob.update(jobId, {
          status: 'failed',
          error_message: 'Rendering timed out after 2 minutes'
        });
        return Response.json({
          ok: true,
          jobId: job.id,
          status: 'failed',
          progress: 50,
          mode: job.mode,
          version: job.version,
          outputs: outputs,
          errorMessage: 'Rendering timed out after 2 minutes',
          createdAt: job.created_date
        }, { status: 200 });
      }
    }

    return Response.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      mode: job.mode,
      version: job.version,
      outputs: outputs,
      errorMessage: job.error_message,
      createdAt: job.created_date
    }, { status: 200 });

  } catch (error) {
    console.error(`[${requestId}] Status check error:`, error.message);
    return Response.json({
      ok: false,
      error: 'STATUS_CHECK_ERROR',
      message: 'Failed to check job status'
    }, { status: 500 });
  }
});