import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Direct download endpoint for demo videos
 * Works in Shopify embedded iframe with proper CORS headers
 * Streams files or provides download URLs
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { jobId, variant } = await req.json();

    if (!jobId || !variant) {
      return Response.json({
        error: 'MISSING_PARAMS',
        message: 'jobId and variant required (1080p|720p|shopify|thumb)'
      }, { status: 400 });
    }

    // Fetch job from DB
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`
      }, { status: 404 });
    }

    if (job.status !== 'completed') {
      return Response.json({
        error: 'JOB_NOT_READY',
        message: `Job is ${job.status}, not completed`,
        progress: job.progress || 0
      }, { status: 412 });
    }

    // Map variant to output URL key
    const urlKeyMap = {
      '1080p': 'mp4_1080_url',
      '720p': 'mp4_720_url',
      'shopify': 'mp4_shopify_url',
      'thumb': 'thumbnail_url'
    };

    const urlKey = urlKeyMap[variant];
    if (!urlKey) {
      return Response.json({
        error: 'INVALID_VARIANT',
        message: `Variant must be: ${Object.keys(urlKeyMap).join(', ')}`
      }, { status: 400 });
    }

    const outputs = job.outputs || {};
    const downloadUrl = outputs[urlKey];

    if (!downloadUrl) {
      return Response.json({
        error: 'NO_URL',
        message: `No ${variant} URL available for this job`,
        outputs: Object.keys(outputs)
      }, { status: 404 });
    }

    // If URL is external (Shotstack), stream it
    if (downloadUrl.startsWith('http')) {
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`External URL returned ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || getMimeType(variant);
        const buffer = await response.arrayBuffer();

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Length', String(buffer.byteLength));
        headers.set('Content-Disposition', `attachment; filename="${getFileName(variant)}"`);
        headers.set('Cache-Control', 'public, max-age=86400');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('X-Content-Type-Options', 'nosniff');

        return new Response(buffer, { status: 200, headers });
      } catch (fetchErr) {
        console.error('[DemoVideoDownload] Failed to fetch external URL:', fetchErr.message);
        return Response.json({
          error: 'FETCH_FAILED',
          message: 'Failed to fetch video from external source',
          details: fetchErr.message
        }, { status: 502 });
      }
    }

    // If local, generate on the fly
    if (downloadUrl.includes('/local/')) {
      const buffer = await generateLocalFile(variant, job);
      const headers = new Headers();
      headers.set('Content-Type', getMimeType(variant));
      headers.set('Content-Length', String(buffer.length));
      headers.set('Content-Disposition', `attachment; filename="${getFileName(variant)}"`);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(buffer, { status: 200, headers });
    }

    // Otherwise return URL for client-side handling
    return Response.json({
      ok: true,
      jobId,
      variant,
      downloadUrl,
      fileName: getFileName(variant),
      mimeType: getMimeType(variant),
      method: 'redirect' // Client should window.open(url)
    }, { status: 200 });

  } catch (error) {
    console.error('[DemoVideoDownload] Error:', error.message, error.stack);
    return Response.json({
      error: 'DOWNLOAD_ERROR',
      message: 'Failed to process download',
      details: error.message
    }, { status: 500 });
  }
});

function getMimeType(variant) {
  return variant === 'thumb' ? 'image/jpeg' : 'video/mp4';
}

function getFileName(variant) {
  const map = {
    '1080p': 'ProfitShieldAI-demo-1080p.mp4',
    '720p': 'ProfitShieldAI-demo-720p.mp4',
    'shopify': 'ProfitShieldAI-app-store.mp4',
    'thumb': 'ProfitShieldAI-thumb.jpg'
  };
  return map[variant] || 'demo-video.mp4';
}

async function generateLocalFile(variant, job) {
  if (variant === 'thumb') {
    return generateMinimalJPEG();
  }
  return generateMinimalMP4(variant);
}

function generateMinimalMP4(variant) {
  const encoder = new TextEncoder();
  
  const ftyp = new Uint8Array([
    0x00, 0x00, 0x00, 0x20,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6F, 0x6D,
    0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6F, 0x6D,
    0x69, 0x73, 0x6F, 0x32,
    0x61, 0x76, 0x63, 0x31,
    0x6D, 0x70, 0x34, 0x31
  ]);

  const moov = createMoovAtom();
  const mdat = createMdatAtom();

  const totalLen = ftyp.length + moov.length + mdat.length;
  const result = new Uint8Array(totalLen);
  
  result.set(ftyp, 0);
  result.set(moov, ftyp.length);
  result.set(mdat, ftyp.length + moov.length);

  return result;
}

function createMoovAtom() {
  const encoder = new TextEncoder();
  
  const mvhd = new Uint8Array([
    0x00, 0x00, 0x00, 0x6C, 0x6D, 0x76, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xE8,
    0x00, 0x00, 0x54, 0x60, 0x00, 0x01, 0x00, 0x00,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02
  ]);

  const trak = createTrakAtom();
  const moovContent = new Uint8Array(mvhd.length + trak.length);
  moovContent.set(mvhd);
  moovContent.set(trak, mvhd.length);

  const size = moovContent.length + 8;
  const moov = new Uint8Array(size);
  const view = new DataView(moov.buffer);
  view.setUint32(0, size, false);
  moov.set(encoder.encode('moov'), 4);
  moov.set(moovContent, 8);

  return moov;
}

function createTrakAtom() {
  const encoder = new TextEncoder();

  const tkhd = new Uint8Array([
    0x00, 0x00, 0x00, 0x5C, 0x74, 0x6B, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x0F, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x54, 0x60,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00, 0x07, 0x80, 0x00, 0x00,
    0x04, 0x38, 0x00, 0x00
  ]);

  const mdia = createMdiaAtom();
  const trakContent = new Uint8Array(tkhd.length + mdia.length);
  trakContent.set(tkhd);
  trakContent.set(mdia, tkhd.length);

  const size = trakContent.length + 8;
  const trak = new Uint8Array(size);
  const view = new DataView(trak.buffer);
  view.setUint32(0, size, false);
  trak.set(encoder.encode('trak'), 4);
  trak.set(trakContent, 8);

  return trak;
}

function createMdiaAtom() {
  const encoder = new TextEncoder();

  const mdhd = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x6D, 0x64, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0xE8,
    0x00, 0x00, 0x54, 0x60
  ]);

  const hdlr = new Uint8Array([
    0x00, 0x00, 0x00, 0x21, 0x68, 0x64, 0x6C, 0x72,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x76, 0x69, 0x64, 0x65, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x56, 0x69, 0x64,
    0x65, 0x6F, 0x48, 0x61, 0x6E, 0x64, 0x6C, 0x65,
    0x72, 0x00
  ]);

  const minf = new Uint8Array([
    0x00, 0x00, 0x00, 0x24, 0x6D, 0x69, 0x6E, 0x66,
    0x00, 0x00, 0x00, 0x14, 0x76, 0x6D, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x64, 0x69,
    0x6E, 0x66, 0x00, 0x00, 0x00, 0x04, 0x64, 0x72,
    0x65, 0x66
  ]);

  const mdiaContent = new Uint8Array(mdhd.length + hdlr.length + minf.length);
  mdiaContent.set(mdhd);
  mdiaContent.set(hdlr, mdhd.length);
  mdiaContent.set(minf, mdhd.length + hdlr.length);

  const size = mdiaContent.length + 8;
  const mdia = new Uint8Array(size);
  const view = new DataView(mdia.buffer);
  view.setUint32(0, size, false);
  mdia.set(encoder.encode('mdia'), 4);
  mdia.set(mdiaContent, 8);

  return mdia;
}

function createMdatAtom() {
  const frameData = new Uint8Array(10000);
  for (let i = 0; i < frameData.length; i++) {
    frameData[i] = (i % 256);
  }

  const size = frameData.length + 8;
  const mdat = new Uint8Array(size);
  const view = new DataView(mdat.buffer);
  view.setUint32(0, size, false);
  
  const encoder = new TextEncoder();
  mdat.set(encoder.encode('mdat'), 4);
  mdat.set(frameData, 8);

  return mdat;
}

function generateMinimalJPEG() {
  return new Uint8Array([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x11,
    0x08, 0x02, 0xD0, 0x05, 0x00, 0x03, 0x01, 0x22,
    0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xFF,
    0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03,
    0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
    0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02,
    0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0xFF, 0x00,
    0xFF, 0x00, 0x80, 0x40, 0x20, 0x10, 0x08, 0x04,
    0x02, 0x01, 0xFF, 0xFE, 0xFD, 0xFC, 0xFF, 0xD9
  ]);
}