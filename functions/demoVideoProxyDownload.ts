import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function pickUrl(job, format) {
  const outputs = job?.outputs || {};
  
  // Standardized format mapping - EXACT key names only
  const mapping = {
    '1080p': outputs.mp4_1080_url,
    '720p': outputs.mp4_720_url,
    'shopify': outputs.mp4_shopify_url,
    '1600x900': outputs.mp4_shopify_url, // legacy alias
    'thumbnail': outputs.thumbnail_url,
    'thumb': outputs.thumbnail_url
  };
  
  const url = mapping[format];
  // Only return if it's a real HTTP(S) URL
  return (url && typeof url === 'string' && url.startsWith('http')) ? url : null;
}

Deno.serve(async (req) => {
  const requestId = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[${requestId}] ===== PROXY DOWNLOAD REQUEST =====`);
  console.log(`[${requestId}] Method:`, req.method);
  
  try {
    // CRITICAL FIX: Auth by tenant/session, NOT workspace membership
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    console.log(`[${requestId}] User auth: ${user?.email || 'NULL'}`);
    
    // Allow ANY authenticated user (embedded Shopify session counts)
    if (!user) {
      console.warn(`[${requestId}] ✗ No user session`);
      return Response.json({ error: 'unauthorized', note: 'Please login first' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId, format } = body || {};
    
    console.log(`[${requestId}] Request body:`, { jobId, format });
    
    if (!jobId || !format) {
      console.warn(`[${requestId}] ✗ Missing parameters`);
      return Response.json({ error: 'missing jobId or format' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId).catch(() => null);
    
    console.log(`[${requestId}] Job lookup: found=${!!job}`);
    
    if (!job) {
      console.warn(`[${requestId}] ✗ Job not found in DB`);
      return Response.json({ error: 'job not found' }, { status: 404 });
    }

    console.log(`[${requestId}] Job outputs keys:`, Object.keys(job.outputs || {}));

    const url = pickUrl(job, format);
    
    console.log(`[${requestId}] URL resolution: format=${format} url=${url || 'NULL'}`);
    
    if (!url) {
      console.error(`[${requestId}] ✗ URL not available in outputs`);
      console.error(`[${requestId}] Available keys:`, Object.keys(job.outputs || {}));
      console.error(`[${requestId}] Full outputs:`, JSON.stringify(job.outputs, null, 2));
      return Response.json({ 
        error: 'url_not_available', 
        note: 'Job exists but no asset URL stored yet. Ensure job completion persists URLs to outputs field.',
        availableKeys: Object.keys(job.outputs || {}),
        requestId
      }, { status: 409 });
    }

    console.log(`[${requestId}] Fetching upstream: ${url.slice(0, 100)}...`);

    const upstream = await fetch(url, { method: 'GET' });
    
    console.log(`[${requestId}] Upstream: status=${upstream.status} ok=${upstream.ok}`);
    
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      console.error(`[${requestId}] ✗ Upstream failed: ${upstream.status}`);
      console.error(`[${requestId}] Body:`, txt.slice(0, 500));
      return Response.json({ 
        error: 'upstream_fetch_failed', 
        status: upstream.status, 
        body: txt.slice(0, 500),
        requestId
      }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || '';
    const buf = new Uint8Array(await upstream.arrayBuffer());

    console.log(`[${requestId}] Content: type=${contentType} bytes=${buf.length}`);

    // CRITICAL PROOF CHECK: Must be real video/mp4 with minimum size
    const isVideo = format !== 'thumb';
    const minSize = isVideo ? 1_500_000 : 10_000; // 1.5MB for video, 10KB for thumb
    
    if (isVideo && !contentType.includes('video/mp4')) {
      console.error(`[${requestId}] ✗ WRONG CONTENT TYPE: ${contentType} (expected video/mp4)`);
      return Response.json({ 
        error: 'invalid_content_type', 
        contentType,
        expected: 'video/mp4',
        requestId 
      }, { status: 422 });
    }
    
    if (buf.length < minSize) {
      console.error(`[${requestId}] ✗ FILE TOO SMALL: ${buf.length} bytes (min: ${minSize})`);
      return Response.json({ 
        error: 'file_too_small', 
        bytes: buf.length, 
        minRequired: minSize,
        requestId 
      }, { status: 422 });
    }
    
    // Verify MP4 signature (first 4-12 bytes should contain 'ftyp')
    if (isVideo && buf.length > 12) {
      const header = new TextDecoder().decode(buf.slice(0, 32));
      if (!header.includes('ftyp')) {
        console.error(`[${requestId}] ✗ INVALID MP4: Missing ftyp header`);
        console.error(`[${requestId}] First 32 bytes:`, header);
        return Response.json({ 
          error: 'invalid_mp4_signature', 
          firstBytes: header,
          requestId 
        }, { status: 422 });
      }
    }

    const filename =
      format === '1080p'
        ? 'ProfitShieldAI-demo-1080p.mp4'
        : format === '720p'
        ? 'ProfitShieldAI-demo-720p.mp4'
        : format === '1600x900'
        ? 'ProfitShieldAI-app-store.mp4'
        : 'ProfitShieldAI-thumb.jpg';

    console.log(`[${requestId}] ===== PROXY DOWNLOAD SUCCESS =====`);
    console.log(`[${requestId}] Returning: ${filename}`);
    console.log(`[${requestId}] Content-Type: ${contentType}`);
    console.log(`[${requestId}] Content-Length: ${buf.length}`);
    console.log(`[${requestId}] ===================================`);

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
});