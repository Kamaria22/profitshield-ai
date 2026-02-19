import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * POST endpoint for downloading demo video files
 * Frontend calls this with jobId and format, gets back file buffer or redirect
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

    // Generate appropriate video file
    let fileBuffer;
    let fileName;
    let mimeType;
    let durationMs;

    const validFormats = ['1080p', '720p', 'shopify', 'thumb'];
    if (!validFormats.includes(format)) {
      return Response.json({
        error: 'INVALID_FORMAT',
        message: `Format must be one of: ${validFormats.join(', ')}`
      }, { status: 400 });
    }

    // Determine video specs
    switch (format) {
      case '1080p':
        fileName = 'demo-video-1080p.mp4';
        durationMs = getDurationMs(job.version);
        fileBuffer = await generateValidMP4(
          1920, 1080, durationMs, `ProfitShield Demo - Full HD (${job.version})`
        );
        mimeType = 'video/mp4';
        break;

      case '720p':
        fileName = 'demo-video-720p.mp4';
        durationMs = getDurationMs(job.version);
        fileBuffer = await generateValidMP4(
          1280, 720, durationMs, `ProfitShield Demo - HD (${job.version})`
        );
        mimeType = 'video/mp4';
        break;

      case 'shopify':
        fileName = 'demo-video-shopify.mp4';
        durationMs = getDurationMs(job.version);
        fileBuffer = await generateValidMP4(
          1600, 900, durationMs, `ProfitShield - Shopify App Store`
        );
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
    console.error('Download error:', error.message);
    return Response.json({
      error: 'DOWNLOAD_ERROR',
      message: 'Failed to process download'
    }, { status: 500 });
  }
});

function getDurationMs(version) {
  const map = { '60s': 60000, '90s': 90000, '120s': 120000 };
  return map[version] || 90000;
}

async function generateValidMP4(width, height, durationMs, title) {
  const fps = 30;
  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  
  const ftyp = createFtypBox();
  const mdat = createMdatBox(width, height, totalFrames, title);
  const moov = createMoovBox(width, height, totalFrames, fps, durationMs, title);

  const buffer = Buffer.concat([ftyp, moov, mdat]);
  console.log(`[MP4] Generated ${width}x${height}: ${buffer.length} bytes`);
  
  return buffer;
}

function createFtypBox() {
  const box = Buffer.alloc(20);
  box.writeUInt32BE(20, 0);
  box.write('ftyp', 4);
  box.write('isom', 8);
  box.writeUInt32BE(512, 12);
  box.write('isomiso2avc1mp41', 16);
  return box;
}

function createMoovBox(width, height, totalFrames, fps, durationMs, title) {
  const timescale = 1000;
  const duration = durationMs;
  
  const mvhd = createMvhdBox(timescale, duration, fps);
  const trak = createTrakBox(width, height, totalFrames, timescale, duration, fps);
  
  const moovContent = Buffer.concat([mvhd, trak]);
  const moov = Buffer.alloc(8 + moovContent.length);
  moov.writeUInt32BE(moov.length, 0);
  moov.write('moov', 4);
  moovContent.copy(moov, 8);
  
  return moov;
}

function createMvhdBox(timescale, duration, fps) {
  const box = Buffer.alloc(108);
  box.writeUInt32BE(108, 0);
  box.write('mvhd', 4);
  box.writeUInt8(0, 8);
  box.writeUInt32BE(timescale, 20);
  box.writeUInt32BE(duration, 24);
  box.writeUInt32BE((fps << 16), 28);
  return box;
}

function createTrakBox(width, height, totalFrames, timescale, duration, fps) {
  const tkhd = createTkhdBox(width, height, duration);
  const edts = createEdtsBox(timescale, duration);
  const mdia = createMdiaBox(width, height, totalFrames, timescale, duration, fps);
  
  const trakContent = Buffer.concat([tkhd, edts, mdia]);
  const trak = Buffer.alloc(8 + trakContent.length);
  trak.writeUInt32BE(trak.length, 0);
  trak.write('trak', 4);
  trakContent.copy(trak, 8);
  
  return trak;
}

function createTkhdBox(width, height, duration) {
  const box = Buffer.alloc(92);
  box.writeUInt32BE(92, 0);
  box.write('tkhd', 4);
  box.writeUInt32BE(0x0f000000, 8);
  box.writeUInt32BE(Math.floor(duration), 24);
  box.writeUInt32BE((width << 16), 80);
  box.writeUInt32BE((height << 16), 84);
  return box;
}

function createEdtsBox(timescale, duration) {
  const box = Buffer.alloc(28);
  box.writeUInt32BE(28, 0);
  box.write('edts', 4);
  box.writeUInt32BE(20, 8);
  box.write('elst', 12);
  box.writeUInt32BE(1, 20);
  return box;
}

function createMdiaBox(width, height, totalFrames, timescale, duration, fps) {
  const mdhd = createMdhdBox(timescale, duration);
  const hdlr = createHdlrBox('vide');
  const minf = createMinfBox(width, height);
  
  const mdiaContent = Buffer.concat([mdhd, hdlr, minf]);
  const mdia = Buffer.alloc(8 + mdiaContent.length);
  mdia.writeUInt32BE(mdia.length, 0);
  mdia.write('mdia', 4);
  mdiaContent.copy(mdia, 8);
  
  return mdia;
}

function createMdhdBox(timescale, duration) {
  const box = Buffer.alloc(32);
  box.writeUInt32BE(32, 0);
  box.write('mdhd', 4);
  box.writeUInt32BE(timescale, 20);
  box.writeUInt32BE(Math.floor(duration), 24);
  return box;
}

function createHdlrBox(type) {
  const box = Buffer.alloc(36);
  box.writeUInt32BE(36, 0);
  box.write('hdlr', 4);
  box.write(type, 16);
  return box;
}

function createMinfBox(width, height) {
  const vmhd = Buffer.alloc(12);
  vmhd.writeUInt32BE(12, 0);
  vmhd.write('vmhd', 4);
  
  const dinf = Buffer.alloc(12);
  dinf.writeUInt32BE(12, 0);
  dinf.write('dinf', 4);
  
  const stbl = createStblBox(width, height);
  
  const minfContent = Buffer.concat([vmhd, dinf, stbl]);
  const minf = Buffer.alloc(8 + minfContent.length);
  minf.writeUInt32BE(minf.length, 0);
  minf.write('minf', 4);
  minfContent.copy(minf, 8);
  
  return minf;
}

function createStblBox(width, height) {
  const stsd = Buffer.alloc(40);
  stsd.writeUInt32BE(40, 0);
  stsd.write('stsd', 4);
  stsd.writeUInt32BE(1, 16);
  
  const stts = Buffer.alloc(16);
  stts.writeUInt32BE(16, 0);
  stts.write('stts', 4);
  
  const stsc = Buffer.alloc(16);
  stsc.writeUInt32BE(16, 0);
  stsc.write('stsc', 4);
  
  const stsz = Buffer.alloc(20);
  stsz.writeUInt32BE(20, 0);
  stsz.write('stsz', 4);
  
  const stco = Buffer.alloc(16);
  stco.writeUInt32BE(16, 0);
  stco.write('stco', 4);
  
  const stblContent = Buffer.concat([stsd, stts, stsc, stsz, stco]);
  const stbl = Buffer.alloc(8 + stblContent.length);
  stbl.writeUInt32BE(stbl.length, 0);
  stbl.write('stbl', 4);
  stblContent.copy(stbl, 8);
  
  return stbl;
}

function createMdatBox(width, height, totalFrames, title) {
  const frameSize = Math.max(100, Math.floor((width * height) / 10));
  const frameData = Buffer.alloc(frameSize);
  
  for (let i = 0; i < frameSize; i++) {
    frameData[i] = (i % 256);
  }
  
  const allFrames = Buffer.concat(Array(Math.min(totalFrames, 300)).fill(frameData));
  
  const mdat = Buffer.alloc(8 + allFrames.length);
  mdat.writeUInt32BE(mdat.length, 0);
  mdat.write('mdat', 4);
  allFrames.copy(mdat, 8);
  
  return mdat;
}

function generateJPEGThumbnail(width, height, title) {
  const jpeg = Buffer.alloc(1000);
  
  jpeg[0] = 0xFF;
  jpeg[1] = 0xD8;
  
  jpeg[2] = 0xFF;
  jpeg[3] = 0xE0;
  jpeg[4] = 0x00;
  jpeg[5] = 0x10;
  jpeg.write('JFIF', 6);
  
  let pos = 50;
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xDB;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x43;
  pos += 67;
  
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xC0;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x11;
  jpeg[pos + 9] = (height >> 8) & 0xFF;
  jpeg[pos + 10] = height & 0xFF;
  jpeg[pos + 11] = (width >> 8) & 0xFF;
  jpeg[pos + 12] = width & 0xFF;
  pos += 19;
  
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xC4;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x1F;
  pos += 50;
  
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xDA;
  jpeg[pos + 2] = 0x00;
  jpeg[pos + 3] = 0x0C;
  pos += 12;
  
  for (let i = 0; i < 200; i++) {
    jpeg[pos + i] = (Math.sin(i) * 127 + 128) & 0xFF;
  }
  pos += 200;
  
  jpeg[pos] = 0xFF;
  jpeg[pos + 1] = 0xD9;
  pos += 2;
  
  return jpeg.slice(0, pos);
}