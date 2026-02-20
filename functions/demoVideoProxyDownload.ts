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
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    if (!user) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId, format } = body || {};
    
    if (!jobId || !format) {
      return Response.json({ error: 'missing jobId or format' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId).catch(() => null);
    
    if (!job) {
      return Response.json({ error: 'job not found' }, { status: 404 });
    }

    const url = pickUrl(job, format);
    
    if (!url) {
      return Response.json({ 
        error: 'url_not_available', 
        note: 'Job exists but no asset URL stored yet. Ensure job completion persists URLs to outputs field.',
        availableKeys: Object.keys(job.outputs || {})
      }, { status: 409 });
    }

    const upstream = await fetch(url, { method: 'GET' });
    
    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '');
      return Response.json({ 
        error: 'upstream_fetch_failed', 
        status: upstream.status, 
        body: txt.slice(0, 500) 
      }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || (format === 'thumbnail' ? 'image/jpeg' : 'video/mp4');
    const buf = new Uint8Array(await upstream.arrayBuffer());

    if (!buf || buf.length < 1024) {
      return Response.json({ error: 'upstream_empty', bytes: buf?.length || 0 }, { status: 502 });
    }

    const filename =
      format === '1080p'
        ? 'ProfitShieldAI-demo-1080p.mp4'
        : format === '720p'
        ? 'ProfitShieldAI-demo-720p.mp4'
        : format === '1600x900'
        ? 'ProfitShieldAI-app-store.mp4'
        : 'ProfitShieldAI-thumb.jpg';

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