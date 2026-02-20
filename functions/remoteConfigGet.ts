import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    if (!user) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const config = {
      disableDirectExternalDownloads: true,
      enableSyntheticChecks: true,
      enableIncidentUpload: true,
      enableVideoAutoRepoll: true,
      videoAutoRepollMaxMs: 120000,
      videoAutoRepollIntervalMs: 2000,
      minValidDownloadBytes: 50000,
    };

    return Response.json({ config, ts: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
});