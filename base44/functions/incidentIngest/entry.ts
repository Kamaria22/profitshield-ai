import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const body = await req.json();
    const { incident } = body || {};
    
    if (!incident?.id) {
      return Response.json({ error: 'missing incident' }, { status: 400 });
    }

    await base44.asServiceRole.entities.Incident.create({
      incident_id: incident.id,
      severity: incident.severity,
      message: incident.message,
      stack: incident.stack || '',
      route: incident.route || '',
      search: incident.search || '',
      tags_json: JSON.stringify(incident.tags || {}),
      network_json: JSON.stringify(incident.network || []),
      resolver_json: JSON.stringify(incident.resolverContext || {}),
      synthetic_json: JSON.stringify(incident.synthetic || {}),
      user_email_masked: incident.userEmailMasked || (user?.email ? `${user.email.slice(0, 2)}***` : ''),
    });

    return Response.json({ ok: true, id: incident.id });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
});
