export async function downloadViaProxy(args) {
  try {
    const res = await fetch('/api/functions/demoVideoProxyDownload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ jobId: args.jobId, format: args.variant }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `proxyDownload failed: ${res.status} ${txt}` };
    }

    const blob = await res.blob();
    const bytes = blob.size;
    const type = blob.type || res.headers.get('content-type') || '';

    if (!bytes || bytes < 1024) {
      return { ok: false, error: `download blob too small: ${bytes} bytes`, bytes, type };
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = args.filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    }, 250);

    return { ok: true, bytes, type };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}