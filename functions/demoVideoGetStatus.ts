import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Get demo video job status - FIXED
 * Returns fresh DB state with outputs map
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
        error: 'Missing jobId',
        code: 'MISSING_JOB_ID'
      }, { status: 400 });
    }

    console.log(`[${requestId}] Fetching job ${jobId}`);

    // Always read fresh from DB
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      console.warn(`[${requestId}] Job ${jobId} not found`);
      return Response.json({
        error: 'Job not found',
        code: 'JOB_NOT_FOUND'
      }, { status: 404 });
    }

    const outputs = job.outputs || {};
    
    console.log(`[${requestId}] Job ${jobId} status=${job.status}`);
    console.log(`[${requestId}] Outputs:`, Object.keys(outputs));

    // If stuck in rendering > 2 min, mark failed
    if (job.status === 'rendering' && job.created_date) {
      const ageMs = Date.now() - new Date(job.created_date).getTime();
      if (ageMs > 120000) {
        console.warn(`[${requestId}] Job ${jobId} stuck (${Math.round(ageMs / 1000)}s), marking failed`);
        await base44.entities.DemoVideoJob.update(jobId, {
          status: 'failed',
          error_message: 'Rendering timed out after 2 minutes'
        });
        return Response.json({
          jobId: job.id,
          status: 'failed',
          progress: 50,
          mode: job.mode,
          version: job.version,
          outputs: outputs,
          errorMessage: 'Rendering timed out after 2 minutes'
        }, { status: 200 });
      }
    }

    return Response.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress || 0,
      mode: job.mode,
      version: job.version,
      outputs: outputs,
      errorMessage: job.error_message
    }, { status: 200 });

  } catch (error) {
    console.error(`[${requestId}] Status check error:`, error.message);
    return Response.json({
      error: 'Failed to check job status',
      code: 'STATUS_CHECK_ERROR'
    }, { status: 500 });
  }
});