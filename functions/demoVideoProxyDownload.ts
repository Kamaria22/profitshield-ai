import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function pickUrl(job, format) {
  const outputs = job?.outputs || {};
  
  const map = {
    '1080p': ['mp4_1080_url', 'url_1080', 'mp4_1080', 'download_1080', 'fullhd'],
    '720p': ['mp4_720_url', 'url_720', 'mp4_720', 'download_720', 'hd'],
    '1600x900': ['mp4_shopify_url', 'url_shopify', 'mp4_shopify', 'appstore'],
    'thumbnail': ['thumbnail_url', 'thumb_url', 'jpeg_url', 'thumbnail'],
  };

  const keys = map[format] || [];
  for (const k of keys) {
    const v = outputs?.[k];
    if (typeof v === 'string' && v.startsWith('http')) return v;
  }
  return null;
}

Deno.serve(async (req) => {
  const requestId = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[${requestId}] ===== PROXY DOWNLOAD REQUEST =====`);
  console.log(`[${requestId}] Method:`, req.method);
  console.log(`[${requestId}] Headers:`, Object.fromEntries(req.headers.entries()));
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    console.log(`[${requestId}] Auth check: user=${user?.email || 'NULL'}`);
    
    if (!user) {
      console.warn(`[${requestId}] ✗ Unauthorized - no user session`);
      return Response.json({ error: 'unauthorized' }, { status: 401 });
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
    
    console.log(`[${requestId}] Upstream response: status=${upstream.status} ok=${upstream.ok}`);
    
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      console.error(`[${requestId}] ✗ Upstream fetch failed: ${upstream.status}`);
      console.error(`[${requestId}] Response body:`, txt.slice(0, 500));
      return Response.json({ 
        error: 'upstream_fetch_failed', 
        status: upstream.status, 
        body: txt.slice(0, 500),
        requestId
      }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || (format === 'thumbnail' ? 'image/jpeg' : 'video/mp4');
    const buf = new Uint8Array(await upstream.arrayBuffer());

    console.log(`[${requestId}] Upstream content: type=${contentType} bytes=${buf.length}`);

    if (!buf || buf.length < 1024) {
      console.error(`[${requestId}] ✗ Upstream returned empty/tiny file: ${buf?.length || 0} bytes`);
      return Response.json({ error: 'upstream_empty', bytes: buf?.length || 0, requestId }, { status: 502 });
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