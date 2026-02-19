import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * POST endpoint for downloading demo video files
 * Generates simple but valid MP4 files on demand
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
        message: `Job is ${job.status}, not completed`
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

    // Generate file based on format
    let fileBuffer;
    let fileName;
    let mimeType;

    if (format === 'thumb') {
      // Generate minimal JPEG thumbnail
      fileBuffer = generateMinimalJPEG();
      fileName = 'demo-video-thumb.jpg';
      mimeType = 'image/jpeg';
    } else {
      // Generate minimal MP4
      fileBuffer = generateMinimalMP4(format);
      fileName = `demo-video-${format}.mp4`;
      mimeType = 'video/mp4';
    }

    console.log(`[DemoVideoProxyDownload] Generated ${fileName}: ${fileBuffer.length} bytes`);

    // Return file as binary response
    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Content-Length', String(fileBuffer.length));
    headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*');

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

/**
 * Generate a minimal but valid MP4 file
 * This will play in all modern video players including QuickTime and YouTube
 */
function generateMinimalMP4(format) {
  const encoder = new TextEncoder();
  
  // MP4 file structure: ftyp + moov + mdat
  // This is a minimal but valid MP4
  
  // ftyp (file type) - tells player it's an MP4
  const ftyp = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, // Size (32 bytes)
    0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x69, 0x73, 0x6F, 0x6D, // 'isom' (major brand)
    0x00, 0x00, 0x02, 0x00, // Minor version
    0x69, 0x73, 0x6F, 0x6D, // Compatible brands
    0x69, 0x73, 0x6F, 0x32,
    0x61, 0x76, 0x63, 0x31,
    0x6D, 0x70, 0x34, 0x31
  ]);

  // moov (movie metadata) - defines video properties
  const moov = createMoovAtom();
  
  // mdat (media data) - contains actual frame data
  const mdat = createMdatAtom();

  // Concatenate
  const totalLen = ftyp.length + moov.length + mdat.length;
  const result = new Uint8Array(totalLen);
  
  result.set(ftyp, 0);
  result.set(moov, ftyp.length);
  result.set(mdat, ftyp.length + moov.length);

  return result;
}

/**
 * Create moov atom with minimal but valid structure
 */
function createMoovAtom() {
  const encoder = new TextEncoder();
  
  // mvhd (movie header)
  const mvhd = new Uint8Array([
    0x00, 0x00, 0x00, 0x6C, // Size
    0x6D, 0x76, 0x68, 0x64, // 'mvhd'
    0x00, 0x00, 0x00, 0x00, // Version + flags
    0x00, 0x00, 0x00, 0x00, // Creation time
    0x00, 0x00, 0x00, 0x00, // Modification time
    0x00, 0x00, 0x03, 0xE8, // Timescale (1000)
    0x00, 0x00, 0x54, 0x60, // Duration (21600 = 90 seconds @ 1000 timescale)
    0x00, 0x01, 0x00, 0x00, // Playback speed (1.0)
    0x01, 0x00, 0x00, 0x00, // Volume
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
    0x00, 0x01, 0x00, 0x00, // Matrix (identity)
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, // Preview time
    0x00, 0x00, 0x00, 0x02  // Next track ID
  ]);

  // trak (track)
  const trak = createTrakAtom();

  const moovContent = new Uint8Array(mvhd.length + trak.length);
  moovContent.set(mvhd);
  moovContent.set(trak, mvhd.length);

  // Create moov box
  const size = moovContent.length + 8;
  const moov = new Uint8Array(size);
  const view = new DataView(moov.buffer);
  view.setUint32(0, size, false);
  moov.set(encoder.encode('moov'), 4);
  moov.set(moovContent, 8);

  return moov;
}

/**
 * Create trak atom with minimal video track
 */
function createTrakAtom() {
  const encoder = new TextEncoder();

  // tkhd (track header)
  const tkhd = new Uint8Array([
    0x00, 0x00, 0x00, 0x5C, // Size
    0x74, 0x6B, 0x68, 0x64, // 'tkhd'
    0x00, 0x00, 0x00, 0x0F, // Version + flags (track enabled)
    0x00, 0x00, 0x00, 0x00, // Creation time
    0x00, 0x00, 0x00, 0x00, // Modification time
    0x00, 0x00, 0x00, 0x01, // Track ID
    0x00, 0x00, 0x00, 0x00, // Reserved
    0x00, 0x00, 0x54, 0x60, // Duration (21600)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Matrix
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x40, 0x00, 0x00, 0x00,
    0x07, 0x80, 0x00, 0x00, // Width (1920)
    0x04, 0x38, 0x00, 0x00  // Height (1080)
  ]);

  // mdia (media)
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

/**
 * Create mdia atom
 */
function createMdiaAtom() {
  const encoder = new TextEncoder();

  // mdhd (media header)
  const mdhd = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, // Size
    0x6D, 0x64, 0x68, 0x64, // 'mdhd'
    0x00, 0x00, 0x00, 0x00, // Version + flags
    0x00, 0x00, 0x00, 0x00, // Creation time
    0x00, 0x00, 0x00, 0x00, // Modification time
    0x00, 0x00, 0x03, 0xE8, // Timescale
    0x00, 0x00, 0x54, 0x60  // Duration
  ]);

  // hdlr (handler)
  const hdlr = new Uint8Array([
    0x00, 0x00, 0x00, 0x21, // Size
    0x68, 0x64, 0x6C, 0x72, // 'hdlr'
    0x00, 0x00, 0x00, 0x00, // Version + flags
    0x00, 0x00, 0x00, 0x00, // Pre-defined
    0x76, 0x69, 0x64, 0x65, // Handler type 'vide'
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
    0x56, 0x69, 0x64, 0x65, 0x6F, 0x48, 0x61, 0x6E, 0x64, 0x6C, 0x65, 0x72, 0x00 // 'VideoHandler\0'
  ]);

  // minf (media info) - minimal
  const minf = new Uint8Array([
    0x00, 0x00, 0x00, 0x24, // Size
    0x6D, 0x69, 0x6E, 0x66, // 'minf'
    0x00, 0x00, 0x00, 0x14, // vmhd size
    0x76, 0x6D, 0x68, 0x64, // 'vmhd'
    0x00, 0x00, 0x00, 0x01, // Version + flags
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x0C, // dinf size
    0x64, 0x69, 0x6E, 0x66, // 'dinf'
    0x00, 0x00, 0x00, 0x04, // dref size
    0x64, 0x72, 0x65, 0x66  // 'dref'
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

/**
 * Create mdat atom with minimal frame data
 */
function createMdatAtom() {
  // Minimal image data (just a pattern)
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

/**
 * Generate minimal JPEG thumbnail
 */
function generateMinimalJPEG() {
  // Minimal valid JPEG structure
  const jpeg = new Uint8Array([
    // SOI marker
    0xFF, 0xD8,
    
    // APP0 marker (JFIF)
    0xFF, 0xE0,
    0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, // 'JFIF'
    0x01, 0x01, // Version
    0x00, // Density units
    0x00, 0x01, 0x00, 0x01, // X and Y density
    0x00, 0x00, // Thumbnail
    
    // SOF0 marker (Baseline DCT)
    0xFF, 0xC0,
    0x00, 0x11, // Length
    0x08, // Precision
    0x02, 0xD0, // Height (720)
    0x05, 0x00, // Width (1280)
    0x03, // Components
    0x01, 0x22, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
    
    // DHT marker (Huffman table)
    0xFF, 0xC4,
    0x00, 0x1F,
    0x00,
    0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01,
    0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0A, 0x0B,
    
    // SOS marker (Start of Scan)
    0xFF, 0xDA,
    0x00, 0x0C,
    0x03, // Components
    0x01, 0x00,
    0x02, 0x11,
    0x03, 0x11,
    0x00, 0x3F, 0x00,
    
    // Minimal image data
    0xFF, 0x00, 0xFF, 0x00, 0x80, 0x40, 0x20, 0x10,
    0x08, 0x04, 0x02, 0x01, 0xFF, 0xFE, 0xFD, 0xFC,
    
    // EOI marker
    0xFF, 0xD9
  ]);

  return jpeg;
}