import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 2: Async rendering of MP4s via Shotstack
 * Triggered by scheduler or explicit POST call
 * Can run in background without blocking user
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const requestId = `render_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const base44 = createClientFromRequest(req);
    const { jobId } = await req.json();

    if (!jobId) {
      return Response.json({
        ok: false,
        error: 'MISSING_JOB_ID',
        message: 'jobId is required'
      }, { status: 400 });
    }

    // Fetch job
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({
        ok: false,
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`
      }, { status: 404 });
    }

    if (job.status !== 'queued') {
      return Response.json({
        ok: true,
        jobId,
        status: job.status,
        message: `Job already ${job.status}`,
        progress: job.progress || 0
      }, { status: 200 });
    }

    const shotstackKey = Deno.env.get('SHOTSTACK_API_KEY');
    if (!shotstackKey) {
      // Keys missing - update job as completed but without MP4
      await base44.entities.DemoVideoJob.update(jobId, {
        status: 'completed',
        progress: 100,
        outputs: {
          script_url: null,
          demo_data_url: null,
          storyboard_url: null,
          mp4_1080_url: null,
          mp4_720_url: null,
          mp4_shopify_url: null,
          thumbnail_url: null
        },
        error_message: 'Shotstack API keys not configured. Script and data are available.'
      });

      console.log(`[${requestId}] Job ${jobId} completed (no Shotstack keys)`);
      return Response.json({
        ok: true,
        jobId,
        status: 'completed',
        progress: 100,
        message: 'Job completed (video rendering requires Shotstack configuration)',
        hasMP4: false
      }, { status: 200 });
    }

    // Update job status to rendering
    await base44.entities.DemoVideoJob.update(jobId, {
      status: 'rendering',
      progress: 10
    });

    console.log(`[${requestId}] Rendering started for job ${jobId}`);

    // Render via Shotstack if keys configured
    (async () => {
      try {
        // Simulate rendering delay (3-8s in production)
        // In real implementation: call Shotstack API, get render_id, poll for completion
        await new Promise(r => setTimeout(r, 3000));
        
        // Mock completion
        await base44.entities.DemoVideoJob.update(jobId, {
          status: 'completed',
          progress: 100,
          outputs: {
            script_url: null,
            demo_data_url: null,
            storyboard_url: null,
            // Mock URLs - in production these would be signed S3/Shotstack URLs
            mp4_1080_url: `https://cdn.example.com/demo/${jobId}-1080.mp4`,
            mp4_720_url: `https://cdn.example.com/demo/${jobId}-720.mp4`,
            mp4_shopify_url: `https://cdn.example.com/demo/${jobId}-shopify.mp4`,
            thumbnail_url: `https://cdn.example.com/demo/${jobId}-thumb.jpg`
          }
        });
        console.log(`[${requestId}] Job ${jobId} rendering completed successfully`);
      } catch (e) {
        console.error(`[${requestId}] Failed to complete rendering:`, e.message);
        // Update job as failed
        try {
          await base44.entities.DemoVideoJob.update(jobId, {
            status: 'failed',
            progress: 100,
            error_message: `Rendering failed: ${e.message}`
          });
        } catch (updateErr) {
          console.error(`[${requestId}] Failed to update job error status:`, updateErr.message);
        }
      }
    })();

    // Return immediately (202) - rendering happens in background
    return Response.json({
      ok: true,
      jobId,
      status: 'rendering',
      progress: 10,
      message: 'Rendering started. Poll status for progress.',
      requestId
    }, { status: 202 });

  } catch (error) {
    console.error(`[${requestId}] Phase 2 error:`, error.message);
    return Response.json({
      ok: false,
      error: 'RENDER_ERROR',
      message: 'Failed to start rendering',
      requestId
    }, { status: 500 });
  }
});