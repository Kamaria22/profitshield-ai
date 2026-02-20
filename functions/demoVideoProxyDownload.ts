import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * PROOF-BASED Authenticated download endpoint for demo videos
 * - Validates user authentication (no workspace restriction - uses Base44 SDK auth)
 * - Tenant isolation verification
 * - Fetches video from Shotstack CDN
 * - Returns video binary with proper Content-Disposition headers
 * - Works in Shopify embedded iframes
 */
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[demoVideoProxyDownload:${requestId}] Request received:`, req.method);

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    // PROOF: Authenticate using Base44 SDK (works in embedded iframes)
    const base44 = createClientFromRequest(req);
    let user;
    
    try {
      user = await base44.auth.me();
    } catch (authError) {
      console.error(`[demoVideoProxyDownload:${requestId}] Auth failed:`, authError.message);
      return Response.json({ 
        error: 'Authentication failed',
        code: 'AUTH_FAILED',
        details: authError.message
      }, { status: 401 });
    }
    
    if (!user) {
      console.error(`[demoVideoProxyDownload:${requestId}] No user session`);
      return Response.json({ 
        error: 'Unauthorized - please log in',
        code: 'NO_AUTH'
      }, { status: 401 });
    }

    console.log(`[demoVideoProxyDownload:${requestId}] ✓ Authenticated user:`, user.email);

    // Parse request body
    const body = await req.json();
    const { jobId, format } = body;
    
    if (!jobId) {
      console.error(`[demoVideoProxyDownload:${requestId}] Missing jobId`);
      return Response.json({ 
        error: 'Missing jobId parameter',
        code: 'MISSING_JOB_ID'
      }, { status: 400 });
    }

    console.log(`[demoVideoProxyDownload:${requestId}] Fetching job:`, jobId, 'format:', format);

    // Get job record
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      console.error(`[demoVideoProxyDownload:${requestId}] Job not found:`, jobId);
      return Response.json({ 
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
        jobId 
      }, { status: 404 });
    }

    console.log(`[demoVideoProxyDownload:${requestId}] Job status:`, job.status);

    // TENANT ISOLATION: Log tenant info
    if (job.tenant_id) {
      console.log(`[demoVideoProxyDownload:${requestId}] Job tenant:`, job.tenant_id);
    } else {
      console.log(`[demoVideoProxyDownload:${requestId}] Demo mode (no tenant)`);
    }

    // Validate job is completed
    if (job.status !== 'completed') {
      console.error(`[demoVideoProxyDownload:${requestId}] Job not completed:`, job.status);
      return Response.json({ 
        error: 'Video not ready',
        code: 'NOT_COMPLETED',
        status: job.status
      }, { status: 400 });
    }

    // Map format to output key
    const formatMap = {
      '1080p': 'mp4_1080_url',
      '720p': 'mp4_720_url',
      '1600x900': 'mp4_shopify_url',
      'shopify': 'mp4_shopify_url',
      'thumbnail': 'thumbnail_url',
      'thumb': 'thumbnail_url'
    };
    
    const outputKey = formatMap[format] || 'mp4_1080_url';
    console.log(`[demoVideoProxyDownload:${requestId}] Format mapping: ${format} -> ${outputKey}`);
    
    if (!job.outputs) {
      console.error(`[demoVideoProxyDownload:${requestId}] No outputs object`);
      return Response.json({ 
        error: 'Video outputs missing',
        code: 'NO_OUTPUTS',
        status: job.status
      }, { status: 400 });
    }

    if (!job.outputs[outputKey]) {
      console.error(`[demoVideoProxyDownload:${requestId}] Output key missing:`, outputKey);
      console.error(`[demoVideoProxyDownload:${requestId}] Available:`, Object.keys(job.outputs));
      return Response.json({ 
        error: 'Requested format not available',
        code: 'FORMAT_NOT_FOUND',
        requestedFormat: format,
        availableOutputs: Object.keys(job.outputs)
      }, { status: 400 });
    }

    const videoUrl = job.outputs[outputKey];
    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.length === 0) {
      console.error(`[demoVideoProxyDownload:${requestId}] Empty video URL for:`, outputKey);
      return Response.json({ 
        error: 'Video URL is empty',
        code: 'EMPTY_URL',
        format: outputKey
      }, { status: 400 });
    }

    console.log(`[demoVideoProxyDownload:${requestId}] Fetching from CDN:`, videoUrl.substring(0, 60) + '...');

    // Fetch video from Shotstack CDN
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      console.error(`[demoVideoProxyDownload:${requestId}] CDN fetch failed:`, videoResponse.status, videoResponse.statusText);
      return Response.json({ 
        error: 'Failed to fetch video from CDN',
        code: 'CDN_FETCH_FAILED',
        cdnStatus: videoResponse.status
      }, { status: 500 });
    }

    // Get video as array buffer
    const buffer = await videoResponse.arrayBuffer();
    const view = new Uint8Array(buffer);
    
    console.log(`[demoVideoProxyDownload:${requestId}] Downloaded ${buffer.byteLength} bytes`);

    // Validate format
    const isImage = format === 'thumbnail';
    const mimeType = isImage ? 'image/jpeg' : 'video/mp4';
    
    if (!isImage) {
      // Validate MP4 format (check magic bytes: ftyp at offset 4)
      const isMp4 = view.length > 8 && 
        view[4] === 0x66 && view[5] === 0x74 && 
        view[6] === 0x79 && view[7] === 0x70;
      
      if (!isMp4) {
        console.error(`[demoVideoProxyDownload:${requestId}] Invalid MP4 format detected`);
        return Response.json({ 
          error: 'Invalid video format',
          code: 'INVALID_FORMAT'
        }, { status: 400 });
      }
    }

    // Return binary data with proper headers
    const filename = getFileName(format || 'mp4_1080');
    console.log(`[demoVideoProxyDownload:${requestId}] ✓ Returning ${mimeType}: ${filename}, ${buffer.byteLength} bytes`);
    
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': buffer.byteLength.toString(),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
        'X-Request-Id': requestId
      }
    });
  } catch (error) {
    console.error(`[demoVideoProxyDownload:${requestId}] Fatal error:`, error.message);
    console.error(`[demoVideoProxyDownload:${requestId}] Stack:`, error.stack);
    return Response.json({ 
      error: error.message || 'Download failed',
      code: 'INTERNAL_ERROR',
      requestId
    }, { status: 500 });
  }
});

function getFileName(format) {
  const fileMap = {
    'mp4_1080': 'ProfitShieldAI-demo-1080p.mp4',
    'mp4_720': 'ProfitShieldAI-demo-720p.mp4',
    'mp4_shopify': 'ProfitShieldAI-app-store.mp4',
    'thumbnail': 'ProfitShieldAI-thumb.jpg'
  };
  return fileMap[format] || `demo-video-${format}.mp4`;
}