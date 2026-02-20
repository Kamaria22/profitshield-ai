export async function downloadViaProxy(args) {
  console.info('===== DOWNLOAD PROOF: REQUEST =====');
  console.info('Request URL: /api/functions/demoVideoProxyDownload');
  console.info('Method: POST');
  console.info('Credentials: include');
  console.info('Body:', JSON.stringify({ jobId: args.jobId, format: args.variant }));
  
  try {
    const res = await fetch('/api/functions/demoVideoProxyDownload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ jobId: args.jobId, format: args.variant }),
    });

    console.info('===== DOWNLOAD PROOF: RESPONSE =====');
    console.info('Status:', res.status, res.statusText);
    console.info('OK:', res.ok);
    console.info('Content-Type:', res.headers.get('content-type'));
    console.info('Content-Length:', res.headers.get('content-length'));
    console.info('Content-Disposition:', res.headers.get('content-disposition'));

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('===== DOWNLOAD PROOF: ERROR BODY =====');
      console.error('Response body:', txt);
      console.error('======================================');
      return { ok: false, error: `proxyDownload failed: ${res.status} ${txt}` };
    }

    const blob = await res.blob();
    const bytes = blob.size;
    const type = blob.type || res.headers.get('content-type') || '';

    console.info('===== DOWNLOAD PROOF: BLOB =====');
    console.info('Blob size:', bytes, 'bytes');
    console.info('Blob type:', type);
    console.info('================================');

    // CRITICAL PROOF CHECK: Must be real video
    const isVideo = !args.variant.includes('thumb');
    const minSize = isVideo ? 1_500_000 : 10_000; // 1.5MB for video, 10KB for thumb
    
    if (isVideo && !type.includes('video/mp4')) {
      // Got JSON error instead of video - parse it
      const errorText = await blob.text();
      console.error('===== ERROR: Not a video =====');
      console.error('Content-Type:', type);
      console.error('Body:', errorText);
      return { ok: false, error: `Not a video file: ${errorText.slice(0, 200)}` };
    }
    
    if (bytes < minSize) {
      console.error('===== ERROR: File too small =====');
      console.error('Got:', bytes, 'bytes, need:', minSize, 'bytes');
      return { ok: false, error: `File too small: ${bytes} bytes (expected >${minSize})`, bytes, type };
    }
    
    // Verify MP4 signature
    if (isVideo) {
      const header = await blob.slice(0, 32).text();
      if (!header.includes('ftyp')) {
        console.error('===== ERROR: Invalid MP4 =====');
        console.error('First 32 bytes:', header);
        return { ok: false, error: 'Invalid MP4 file (missing ftyp signature)' };
      }
      console.info('✓ Valid MP4 signature detected (ftyp)');
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = args.filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    console.info('===== DOWNLOAD PROOF: SUCCESS =====');
    console.info('File triggered for download:', args.filename);
    console.info('Size:', bytes, 'bytes');
    console.info('====================================');

    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    }, 250);

    return { ok: true, bytes, type };
  } catch (e) {
    console.error('===== DOWNLOAD PROOF: EXCEPTION =====');
    console.error('Error:', e?.message || String(e));
    console.error('Stack:', e?.stack);
    console.error('=====================================');
    return { ok: false, error: e?.message || String(e) };
  }
}