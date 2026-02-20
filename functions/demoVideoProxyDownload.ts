import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    // Auth: allow ANY authenticated user (embedded Shopify session counts)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId, format } = await req.json();
    
    if (!jobId || !format) {
      return Response.json({ error: 'Missing jobId or format' }, { status: 400 });
    }

    // Get job from DB
    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId);
    
    if (!job || !job.outputs) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Map format to URL key
    const urlMap = {
      '1080p': job.outputs.mp4_1080_url,
      '720p': job.outputs.mp4_720_url,
      'shopify': job.outputs.mp4_shopify_url,
      'thumb': job.outputs.thumbnail_url
    };

    const url = urlMap[format];
    
    if (!url || !url.startsWith('http')) {
      return Response.json({ error: 'URL not available' }, { status: 404 });
    }

    // Fetch file from upstream
    const upstream = await fetch(url);
    
    if (!upstream.ok) {
      return Response.json({ error: 'Upstream fetch failed' }, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const contentType = upstream.headers.get('content-type') || (format === 'thumb' ? 'image/jpeg' : 'video/mp4');

    // Validate file
    const isVideo = format !== 'thumb';
    const minSize = isVideo ? 1_500_000 : 10_000;
    
    if (bytes.length < minSize) {
      return Response.json({ error: `File too small: ${bytes.length} bytes` }, { status: 422 });
    }

    if (isVideo) {
      const header = new TextDecoder().decode(bytes.slice(0, 32));
      if (!header.includes('ftyp')) {
        return Response.json({ error: 'Invalid MP4 file' }, { status: 422 });
      }
    }

    // Return file with proper headers
    const filename = format === '1080p' ? 'ProfitShieldAI-demo-1080p.mp4'
                  : format === '720p' ? 'ProfitShieldAI-demo-720p.mp4'
                  : format === 'shopify' ? 'ProfitShieldAI-app-store.mp4'
                  : 'ProfitShieldAI-thumb.jpg';

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});