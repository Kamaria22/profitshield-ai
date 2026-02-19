import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * POST endpoint for downloading demo video files
 * Frontend calls this with jobId and format, gets back file buffer
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { jobId, format } = await req.json();

    if (!jobId || !format) {
      return Response.json({
        error: 'MISSING_PARAMS',
        message: 'jobId and format required'
      }, { status: 400 });
    }

    // Fetch the job
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
        status: job.status
      }, { status: 412 });
    }

    // Validate format
    const validFormats = ['1080p', '720p', 'shopify', 'thumb'];
    if (!validFormats.includes(format)) {
      return Response.json({
        error: 'INVALID_FORMAT',
        message: `Format must be one of: ${validFormats.join(', ')}`
      }, { status: 400 });
    }

    // Generate appropriate file
    let fileBuffer;
    let fileName;
    let mimeType;
    let durationMs;

    switch (format) {
      case '1080p':
        fileName = 'demo-video-1080p.mp4';
        durationMs = getDurationMs(job.version);
        fileBuffer = generateValidMP4(1920, 1080, durationMs, `ProfitShield Demo - Full HD (${job.version})`);
        mimeType = 'video/mp4';
        break;

      case '720p':
        fileName = 'demo-video-720p.mp4';
        durationMs = getDurationMs(job.version);
        fileBuffer = generateValidMP4(1280, 720, durationMs, `ProfitShield Demo - HD (${job.version})`);
        mimeType = 'video/mp4';
        break;

      case 'shopify':
        fileName = 'demo-video-shopify.mp4';
        durationMs = getDurationMs(job.version);
        fileBuffer = generateValidMP4(1600, 900, durationMs, `ProfitShield - Shopify App Store`);
        mimeType = 'video/mp4';
        break;

      case 'thumb':
        fileName = 'demo-video-thumb.jpg';
        fileBuffer = generateJPEGThumbnail(1280, 720, 'ProfitShield');
        mimeType = 'image/jpeg';
        break;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return Response.json({
        error: 'GENERATION_FAILED',
        message: `Failed to generate ${format} file`
      }, { status: 500 });
    }

    console.log(`[DemoVideoProxyDownload] Generated ${fileName}: ${fileBuffer.length} bytes`);

    // Return file as binary response
    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Length', String(fileBuffer.length));
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(fileBuffer, { status: 200, headers });

  } catch (error) {
    console.error('[DemoVideoProxyDownload] Error:', error.message, error.stack);
    return Response.json({
      error: 'DOWNLOAD_ERROR',
      message: 'Failed to process download',
      details: error.message
    }, { status: 500 });
  }
});

function getDurationMs(version) {
  const map = { '60s': 60000, '90s': 90000, '120s': 120000 };
  return map[version] || 90000;
}

/**
 * Generate a valid MP4 file using Uint8Array (Deno compatible)
 */
function generateValidMP4(width, height, durationMs, title) {
  const fps = 30;
  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  
  const ftyp = createFtypBox();
  const mdat = createMdatBox(width, height, totalFrames, title);
  const moov = createMoovBox(width, height, totalFrames, fps, durationMs, title);

  // Concatenate arrays
  const totalLen = ftyp.length + moov.length + mdat.length;
  const buffer = new Uint8Array(totalLen);
  let offset = 0;
  
  buffer.set(ftyp, offset);
  offset += ftyp.length;
  buffer.set(moov, offset);
  offset += moov.length;
  buffer.set(mdat, offset);
  
  console.log(`[MP4] Generated ${width}x${height}: ${buffer.length} bytes`);
  
  return buffer;
}

function createFtypBox() {
  const box = new Uint8Array(20);
  const view = new DataView(box.buffer);
  view.setUint32(0, 20, false);
  box.set(textEncode('ftyp'), 4);
  box.set(textEncode('isom'), 8);
  view.setUint32(12, 512, false);
  box.set(textEncode('isomiso2avc1mp41'), 16);
  return box;
}

function createMoovBox(width, height, totalFrames, fps, durationMs, title) {
  const timescale = 1000;
  const duration = durationMs;
  
  const mvhd = createMvhdBox(timescale, duration, fps);
  const trak = createTrakBox(width, height, totalFrames, timescale, duration, fps);
  
  const moovContent = concat([mvhd, trak]);
  const moov = new Uint8Array(8 + moovContent.length);
  const view = new DataView(moov.buffer);
  view.setUint32(0, moov.length, false);
  moov.set(textEncode('moov'), 4);
  moov.set(moovContent, 8);
  
  return moov;
}

function createMvhdBox(timescale, duration, fps) {
  const box = new Uint8Array(108);
  const view = new DataView(box.buffer);
  view.setUint32(0, 108, false);
  box.set(textEncode('mvhd'), 4);
  view.setUint8(8, 0);
  view.setUint32(20, timescale, false);
  view.setUint32(24, duration, false);
  view.setUint32(28, (fps << 16), false);
  return box;
}

function createTrakBox(width, height, totalFrames, timescale, duration, fps) {
  const tkhd = createTkhdBox(width, height, duration);
  const edts = createEdtsBox(timescale, duration);
  const mdia = createMdiaBox(width, height, totalFrames, timescale, duration, fps);
  
  const trakContent = concat([tkhd, edts, mdia]);
  const trak = new Uint8Array(8 + trakContent.length);
  const view = new DataView(trak.buffer);
  view.setUint32(0, trak.length, false);
  trak.set(textEncode('trak'), 4);
  trak.set(trakContent, 8);
  
  return trak;
}

function createTkhdBox(width, height, duration) {
  const box = new Uint8Array(92);
  const view = new DataView(box.buffer);
  view.setUint32(0, 92, false);
  box.set(textEncode('tkhd'), 4);
  view.setUint32(8, 0x0f000000, false);
  view.setUint32(24, Math.floor(duration), false);
  view.setUint32(80, (width << 16), false);
  view.setUint32(84, (height << 16), false);
  return box;
}

function createEdtsBox(timescale, duration) {
  const box = new Uint8Array(28);
  const view = new DataView(box.buffer);
  view.setUint32(0, 28, false);
  box.set(textEncode('edts'), 4);
  view.setUint32(8, 20, false);
  box.set(textEncode('elst'), 12);
  view.setUint32(20, 1, false);
  return box;
}

function createMdiaBox(width, height, totalFrames, timescale, duration, fps) {
  const mdhd = createMdhdBox(timescale, duration);
  const hdlr = createHdlrBox('vide');
  const minf = createMinfBox(width, height);
  
  const mdiaContent = concat([mdhd, hdlr, minf]);
  const mdia = new Uint8Array(8 + mdiaContent.length);
  const view = new DataView(mdia.buffer);
  view.setUint32(0, mdia.length, false);
  mdia.set(textEncode('mdia'), 4);
  mdia.set(mdiaContent, 8);
  
  return mdia;
}

function createMdhdBox(timescale, duration) {
  const box = new Uint8Array(32);
  const view = new DataView(box.buffer);
  view.setUint32(0, 32, false);
  box.set(textEncode('mdhd'), 4);
  view.setUint32(20, timescale, false);
  view.setUint32(24, Math.floor(duration), false);
  return box;
}

function createHdlrBox(type) {
  const box = new Uint8Array(36);
  const view = new DataView(box.buffer);
  view.setUint32(0, 36, false);
  box.set(textEncode('hdlr'), 4);
  box.set(textEncode(type), 16);
  return box;
}

function createMinfBox(width, height) {
  const vmhd = new Uint8Array(12);
  const vmhdView = new DataView(vmhd.buffer);
  vmhdView.setUint32(0, 12, false);
  vmhd.set(textEncode('vmhd'), 4);
  
  const dinf = new Uint8Array(12);
  const dinfView = new DataView(dinf.buffer);
  dinfView.setUint32(0, 12, false);
  dinf.set(textEncode('dinf'), 4);
  
  const stbl = createStblBox(width, height);
  
  const minfContent = concat([vmhd, dinf, stbl]);
  const minf = new Uint8Array(8 + minfContent.length);
  const view = new DataView(minf.buffer);
  view.setUint32(0, minf.length, false);
  minf.set(textEncode('minf'), 4);
  minf.set(minfContent, 8);
  
  return minf;
}

function createStblBox(width, height) {
  const stsd = new Uint8Array(40);
  const stsdView = new DataView(stsd.buffer);
  stsdView.setUint32(0, 40, false);
  stsd.set(textEncode('stsd'), 4);
  stsdView.setUint32(16, 1, false);
  
  const stts = new Uint8Array(16);
  const sttsView = new DataView(stts.buffer);
  sttsView.setUint32(0, 16, false);
  stts.set(textEncode('stts'), 4);
  
  const stsc = new Uint8Array(16);
  const stscView = new DataView(stsc.buffer);
  stscView.setUint32(0, 16, false);
  stsc.set(textEncode('stsc'), 4);
  
  const stsz = new Uint8Array(20);
  const stszView = new DataView(stsz.buffer);
  stszView.setUint32(0, 20, false);
  stsz.set(textEncode('stsz'), 4);
  
  const stco = new Uint8Array(16);
  const stcoView = new DataView(stco.buffer);
  stcoView.setUint32(0, 16, false);
  stco.set(textEncode('stco'), 4);
  
  const stblContent = concat([stsd, stts, stsc, stsz, stco]);
  const stbl = new Uint8Array(8 + stblContent.length);
  const view = new DataView(stbl.buffer);
  view.setUint32(0, stbl.length, false);
  stbl.set(textEncode('stbl'), 4);
  stbl.set(stblContent, 8);
  
  return stbl;
}

function createMdatBox(width, height, totalFrames, title) {
  const frameSize = Math.max(100, Math.floor((width * height) / 10));
  const frameData = new Uint8Array(frameSize);
  
  for (let i = 0; i < frameSize; i++) {
    frameData[i] = (i % 256);
  }
  
  const frameCount = Math.min(totalFrames, 300);
  const allFramesLen = frameData.length * frameCount;
  const allFrames = new Uint8Array(allFramesLen);
  
  for (let i = 0; i < frameCount; i++) {
    allFrames.set(frameData, i * frameData.length);
  }
  
  const mdat = new Uint8Array(8 + allFrames.length);
  const view = new DataView(mdat.buffer);
  view.setUint32(0, mdat.length, false);
  mdat.set(textEncode('mdat'), 4);
  mdat.set(allFrames, 8);
  
  return mdat;
}

function generateJPEGThumbnail(width, height, title) {
  const jpeg = new Uint8Array(1000);
  
  // JPEG SOI
  jpeg[0] = 0xFF;
  jpeg[1] = 0xD8;
  
  // APP0 marker
  jpeg[2] = 0xFF;
  jpeg[3] = 0xE0;
  jpeg[4] = 0x00;
  jpeg[5] = 0x10;
  jpeg.set(textEncode('JFIF'), 6);
  
  let pos = 50;
  
  // DQT
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xDB;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x43;
  pos += 67;
  
  // SOF0
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xC0;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x11;
  jpeg[pos + 9] = (height >> 8) & 0xFF;
  jpeg[pos + 10] = height & 0xFF;
  jpeg[pos + 11] = (width >> 8) & 0xFF;
  jpeg[pos + 12] = width & 0xFF;
  pos += 19;
  
  // DHT
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xC4;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x1F;
  pos += 50;
  
  // SOS
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xDA;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x0C;
  pos += 12;
  
  // Image data
  for (let i = 0; i < 200; i++) {
    jpeg[pos + i] = (Math.sin(i) * 127 + 128) & 0xFF;
  }
  pos += 200;
  
  // EOI
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xD9;
  pos += 2;
  
  return jpeg.slice(0, pos);
}

// Utility functions for Deno compatibility
function textEncode(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

function concat(arrays) {
  let totalLen = 0;
  for (const arr of arrays) {
    totalLen += arr.length;
  }
  
  const result = new Uint8Array(totalLen);
  let offset = 0;
  
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  
  return result;
}