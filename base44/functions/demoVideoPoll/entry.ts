import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Poll Shotstack render status and handle completion/transcode
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await req.json();
    if (!jobId) {
      return Response.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Get job
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // If already completed, return URLs
    if (job.status === 'completed' && job.outputs?.mp4_1080_url) {
      return Response.json({
        ok: true,
        status: 'completed',
        outputs: job.outputs
      });
    }

    // Poll Shotstack
    const shotStackKey = Deno.env.get('SHOTSTACK_API_KEY');
    const shotStackEnv = Deno.env.get('SHOTSTACK_ENV') || 'prod';
    const apiUrl = shotStackEnv === 'sandbox'
      ? 'https://api.shotstack.io/stage'
      : 'https://api.shotstack.io/v1';

    if (!shotStackKey || !job.request_id) {
      throw new Error('Cannot poll: missing API key or render ID');
    }

    const statusResponse = await fetch(`${apiUrl}/render/${job.request_id}`, {
      headers: {
        'x-api-key': shotStackKey
      }
    });

    if (!statusResponse.ok) {
      const error = await statusResponse.text();
      throw new Error(`Shotstack status error: ${statusResponse.status} - ${error}`);
    }

    const statusData = await statusResponse.json();
    const providerStatus = statusData.response?.status;
    const progress = statusData.response?.progress || 0;

    console.log(`[DemoVideoPoll] Job ${jobId}: status=${providerStatus}, progress=${progress}`);

    // Update progress
    await base44.entities.DemoVideoJob.update(jobId, {
      progress: Math.min(50 + progress / 2, 85)
    });

    // Check if done
    if (providerStatus === 'done') {
      const renderUrl = statusData.response?.url;

      if (!renderUrl) {
        // Retry fetching URL
        const retryResponse = await fetch(`${apiUrl}/render/${job.request_id}`, {
          headers: { 'x-api-key': shotStackKey }
        });
        const retryData = await retryResponse.json();
        const retryUrl = retryData.response?.url;

        if (!retryUrl) {
          throw new Error('No render URL returned after completion');
        }

        // Update with URL
        const outputs = generateOutputURLs(retryUrl);
        await base44.entities.DemoVideoJob.update(jobId, {
          status: 'completed',
          progress: 100,
          outputs: outputs
        });

        return Response.json({
          ok: true,
          status: 'completed',
          outputs: outputs
        });
      }

      // Generate output variants (use master URL)
      const outputs = generateOutputURLs(renderUrl);

      // Update job as completed
      await base44.entities.DemoVideoJob.update(jobId, {
        status: 'completed',
        progress: 100,
        outputs: outputs
      });

      return Response.json({
        ok: true,
        status: 'completed',
        outputs: outputs
      });
    }

    if (providerStatus === 'failed' || providerStatus === 'error') {
      const errorMsg = statusData.response?.error || 'Render failed';
      await base44.entities.DemoVideoJob.update(jobId, {
        status: 'failed',
        error_message: errorMsg
      });
      return Response.json({
        ok: false,
        status: 'failed',
        error: errorMsg
      }, { status: 400 });
    }

    // Still rendering
    return Response.json({
      ok: true,
      status: providerStatus || 'rendering',
      progress: progress
    });

  } catch (error) {
    console.error('[DemoVideoPoll]', error.message);
    return Response.json({
      error: error.message,
      ok: false
    }, { status: 500 });
  }
});

/**
 * Generate download URLs for video outputs
 */
function generateOutputURLs(masterUrl) {
  // In production, these would be actual variant URLs or proxy endpoints
  // For now, return the master URL for all variants
  return {
    mp4_1080_url: masterUrl,
    mp4_720_url: masterUrl,
    mp4_shopify_url: masterUrl,
    thumbnail_url: masterUrl + '?thumbnail=1'
  };
}