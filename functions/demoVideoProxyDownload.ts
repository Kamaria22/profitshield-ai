import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const requestId = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`[DV-SERVER][${requestId}] ===== PROXY DOWNLOAD REQUEST =====`);
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    console.log(`[DV-SERVER][${requestId}] Auth check: user=${user ? user.email : 'NULL'}`);
    
    // Auth: allow ANY authenticated user (embedded Shopify session counts)
    if (!user) {
      console.log(`[DV-SERVER][${requestId}] ❌ AUTH FAIL - no user`);
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[DV-SERVER][${requestId}] ✓ AUTH OK - ${user.email}`);

    const { jobId, format } = await req.json();
    
    console.log(`[DV-SERVER][${requestId}] jobId=${jobId}, format=${format}`);
    
    if (!jobId || !format) {
      console.log(`[DV-SERVER][${requestId}] ❌ Missing parameters`);
      return Response.json({ error: 'Missing jobId or format' }, { status: 400 });
    }

    // Get job from DB
    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId);
    
    console.log(`[DV-SERVER][${requestId}] Job status=${job?.status || 'NOT_FOUND'}`);
    console.log(`[DV-SERVER][${requestId}] Job outputs keys:`, job?.outputs ? Object.keys(job.outputs) : 'NULL');
    
    if (!job || !job.outputs) {
      console.log(`[DV-SERVER][${requestId}] ❌ Job not found or no outputs`);
      return Response.json({ error: 'Job not found or outputs missing' }, { status: 404 });
    }

    // Map format to URL key
    const urlMap = {
      '1080p': job.outputs.mp4_1080_url,
      '720p': job.outputs.mp4_720_url,
      'shopify': job.outputs.mp4_shopify_url,
      'thumb': job.outputs.thumbnail_url
    };

    const url = urlMap[format];
    
    console.log(`[DV-SERVER][${requestId}] Source URL for ${format}:`, url || 'NULL');
    
    if (!url || !url.startsWith('http')) {
      console.log(`[DV-SERVER][${requestId}] ❌ URL not available or invalid`);
      return Response.json({ error: `URL not available for ${format}` }, { status: 404 });
    }

    console.log(`[DV-SERVER][${requestId}] Fetching from upstream: ${url.substring(0, 80)}...`);
    
    // Fetch file from upstream
    const upstream = await fetch(url);
    
    console.log(`[DV-SERVER][${requestId}] Upstream response: ${upstream.status} ${upstream.statusText}`);
    console.log(`[DV-SERVER][${requestId}] Upstream Content-Type: ${upstream.headers.get('content-type')}`);
    console.log(`[DV-SERVER][${requestId}] Upstream Content-Length: ${upstream.headers.get('content-length')}`);
    
    if (!upstream.ok) {
      console.log(`[DV-SERVER][${requestId}] ❌ Upstream fetch failed`);
      return Response.json({ error: `Upstream fetch failed: ${upstream.status}` }, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const contentType = upstream.headers.get('content-type') || (format === 'thumb' ? 'image/jpeg' : 'video/mp4');

    console.log(`[DV-SERVER][${requestId}] Downloaded ${bytes.length} bytes`);

    // Validate file
    const isVideo = format !== 'thumb';
    const minSize = isVideo ? 1_500_000 : 10_000;
    
    if (bytes.length < minSize) {
      console.log(`[DV-SERVER][${requestId}] ❌ File too small: ${bytes.length} < ${minSize}`);
      return Response.json({ error: `File too small: ${bytes.length} bytes (min: ${minSize})` }, { status: 422 });
    }

    if (isVideo) {
      const header = new TextDecoder().decode(bytes.slice(0, 32));
      console.log(`[DV-SERVER][${requestId}] MP4 header check: ${header.substring(0, 20)}...`);
      if (!header.includes('ftyp')) {
        console.log(`[DV-SERVER][${requestId}] ❌ Invalid MP4 signature`);
        return Response.json({ error: 'Invalid MP4 file - missing ftyp signature' }, { status: 422 });
      }
      console.log(`[DV-SERVER][${requestId}] ✓ Valid MP4 signature detected`);
    }

    // Return file with proper headers
    const filename = format === '1080p' ? 'ProfitShieldAI-demo-1080p.mp4'
                  : format === '720p' ? 'ProfitShieldAI-demo-720p.mp4'
                  : format === 'shopify' ? 'ProfitShieldAI-app-store.mp4'
                  : 'ProfitShieldAI-thumb.jpg';

    console.log(`[DV-SERVER][${requestId}] ✓ Returning ${bytes.length} bytes as ${contentType}`);
    console.log(`[DV-SERVER][${requestId}] Filename: ${filename}`);
    console.log(`[DV-SERVER][${requestId}] =========================================`);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (err) {
    console.error(`[DV-SERVER][${requestId}] ❌ EXCEPTION:`, err.message);
    console.error(`[DV-SERVER][${requestId}] Stack:`, err.stack);
    return Response.json({ error: err.message }, { status: 500 });
  }
});