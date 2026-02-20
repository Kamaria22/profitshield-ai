import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Proxy download endpoint for demo videos from Shotstack
 * - Validates MP4 format
 * - Streams binary data with proper headers
 * - Handles multiple video formats
 * - Works in Shopify embedded iframes (GET request + query params)
 */
Deno.serve(async (req) => {
  // Support both GET and POST for iframe compatibility
  if (req.method !== 'GET' && req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse params from query string (GET) or body (POST)
    let jobId, format;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      jobId = url.searchParams.get('jobId');
      format = url.searchParams.get('format') || 'mp4_1080';
    } else {
      const body = await req.json();
      jobId = body.jobId;
      format = body.format || 'mp4_1080';
    }
    
    if (!jobId) {
      return Response.json({ error: 'Missing jobId' }, { status: 400 });
    }

    // Get job record
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Validate output exists
    const outputKey = `${format}_url`;
    if (!job.outputs?.[outputKey]) {
      return Response.json({ 
        error: 'Video not ready',
        status: job.status
      }, { status: 400 });
    }

    const videoUrl = job.outputs[outputKey];
    if (!videoUrl) {
      return Response.json({ error: 'No video URL' }, { status: 400 });
    }

    // Fetch video from Shotstack
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      return Response.json({ 
        error: 'Failed to fetch video',
        status: videoResponse.status
      }, { status: 500 });
    }

    // Validate it's actually MP4 (check magic bytes: ftyp = 66 74 79 70)
    const buffer = await videoResponse.arrayBuffer();
    const view = new Uint8Array(buffer);
    
    // Check for MP4 magic bytes (should have 'ftyp' at offset 4)
    const isMp4 = view.length > 8 && 
      view[4] === 0x66 && view[5] === 0x74 && 
      view[6] === 0x79 && view[7] === 0x70;
    
    if (!isMp4) {
      console.error('Invalid MP4 format detected');
      return Response.json({ error: 'Invalid video format' }, { status: 400 });
    }

    // Stream video with proper headers for universal playback
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': buffer.byteLength.toString(),
        'Content-Disposition': `attachment; filename="demo-video-${jobId}.mp4"`,
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('[demoVideoProxyDownload]', error.message);
    return Response.json({ 
      error: error.message || 'Download failed'
    }, { status: 500 });
  }
});