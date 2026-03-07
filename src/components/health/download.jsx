import { stabilityAgent } from '@/agents/StabilityAgent';

export async function downloadViaProxy(args) {
  const isDev = window.location.hostname === 'localhost' || window.location.hostname.includes('dev');
  
  if (isDev) {
    console.info('===== DOWNLOAD PROOF: REQUEST =====');
    console.info('Request URL: /api/functions/demoVideoProxyDownload');
    console.info('Method: POST');
    console.info('Credentials: include');
    console.info('Body:', JSON.stringify({ jobId: args.jobId, format: args.variant }));
  }
  
  try {
    const result = await stabilityAgent.safeFetch('/api/functions/demoVideoProxyDownload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ jobId: args.jobId, format: args.variant }),
    }, { ok: false, fallback: true, error: 'download_proxy_failed' });
    const res = result?.response;
    if (!res) {
      return { ok: false, fallback: true, error: result?.data?.error || 'No response from proxy' };
    }

    const contentType = res.headers.get('content-type') || '';
    const contentLength = res.headers.get('content-length') || '0';
    const contentDisposition = res.headers.get('content-disposition') || '';

    if (isDev) {
      console.info('===== DOWNLOAD PROOF: RESPONSE =====');
      console.info('Status:', res.status, res.statusText);
      console.info('OK:', res.ok);
      console.info('Content-Type:', contentType);
      console.info('Content-Length:', contentLength);
      console.info('Content-Disposition:', contentDisposition);
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (isDev) {
        console.error('===== DOWNLOAD PROOF: ERROR BODY =====');
        console.error('Response body:', txt);
        console.error('======================================');
      }
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }

    const blob = await res.blob();
    const bytes = blob.size;
    const type = blob.type || contentType;

    if (isDev) {
      console.info('===== DOWNLOAD PROOF: BLOB =====');
      console.info('Blob size:', bytes, 'bytes');
      console.info('Blob type:', type);
      console.info('================================');
    }

    // CRITICAL PROOF CHECK: Must be real video
    const isVideo = !args.variant.includes('thumb');
    const minSize = isVideo ? 1_500_000 : 10_000; // 1.5MB for video, 10KB for thumb
    
    if (isVideo && !type.includes('video/mp4')) {
      // Got JSON error instead of video - parse it
      const errorText = await blob.text().catch(() => 'Could not read error');
      if (isDev) {
        console.error('===== ERROR: Not a video =====');
        console.error('Content-Type:', type);
        console.error('Body:', errorText.slice(0, 500));
      }
      return { ok: false, error: `Not a video file (got ${type})` };
    }
    
    if (bytes < minSize) {
      if (isDev) {
        console.error('===== ERROR: File too small =====');
        console.error('Got:', bytes, 'bytes, need:', minSize, 'bytes');
      }
      return { ok: false, error: `File too small: ${(bytes/1000).toFixed(1)}KB (min ${(minSize/1000).toFixed(1)}KB)`, bytes, type };
    }
    
    // Verify MP4 signature
    if (isVideo) {
      const headerSlice = blob.slice(0, 32);
      const headerBuf = await headerSlice.arrayBuffer();
      const header = new TextDecoder().decode(headerBuf);
      
      if (!header.includes('ftyp')) {
        if (isDev) {
          console.error('===== ERROR: Invalid MP4 =====');
          console.error('First 32 bytes:', header);
        }
        return { ok: false, error: 'Invalid MP4 file (missing ftyp signature)' };
      }
      if (isDev) {
        console.info('✓ Valid MP4 signature detected (ftyp)');
      }
    }
    
    // If dryRun, return proof without triggering download
    if (args.dryRun) {
      return { ok: true, bytes, type, dryRun: true };
    }

    // Trigger download via blob URL (iframe-safe)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = args.filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    if (isDev) {
      console.info('===== DOWNLOAD PROOF: SUCCESS =====');
      console.info('File triggered for download:', args.filename);
      console.info('Size:', bytes, 'bytes', `(${(bytes/1_000_000).toFixed(2)}MB)`);
      console.info('Type:', type);
      console.info('====================================');
    }

    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    }, 250);

    return { ok: true, bytes, type };
  } catch (e) {
    if (isDev) {
      console.error('===== DOWNLOAD PROOF: EXCEPTION =====');
      console.error('Error:', e?.message || String(e));
      console.error('Stack:', e?.stack);
      console.error('=====================================');
    }
    return { ok: false, error: e?.message || String(e) };
  }
}
