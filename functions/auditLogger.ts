import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      tenant_id, 
      action_type, 
      entity_type, 
      entity_id, 
      previous_state, 
      new_state, 
      reason,
      metadata 
    } = await req.json();

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    if (!action_type) {
      return Response.json({ error: 'action_type is required' }, { status: 400 });
    }

    // Create audit log entry
    const auditLog = await base44.asServiceRole.entities.AuditLog.create({
      tenant_id,
      user_id: user.id,
      user_email: user.email,
      action_type,
      entity_type,
      entity_id,
      previous_state: previous_state || null,
      new_state: new_state || null,
      reason,
      metadata,
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent')
    });

    return Response.json({ success: true, audit_log_id: auditLog.id });

  } catch (error) {
    console.error('Audit logger error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});