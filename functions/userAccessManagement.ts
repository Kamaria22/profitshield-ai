import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only allow access for the app owner
    if (!user || user.email !== 'rohan.a.roberts@gmail.com') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { action, requestId, email, role } = await req.json();

    switch (action) {
      case 'listPending': {
        // Get all pending access requests using service role
        const pendingRequests = await base44.asServiceRole.users.listPendingRequests();
        return Response.json({ requests: pendingRequests || [] });
      }

      case 'approve': {
        if (!requestId || !email) {
          return Response.json({ error: 'Missing requestId or email' }, { status: 400 });
        }
        // Approve and invite the user
        await base44.asServiceRole.users.approveRequest(requestId);
        await base44.asServiceRole.users.inviteUser(email, role || 'user');
        return Response.json({ success: true, message: `Access granted to ${email}` });
      }

      case 'deny': {
        if (!requestId) {
          return Response.json({ error: 'Missing requestId' }, { status: 400 });
        }
        await base44.asServiceRole.users.denyRequest(requestId);
        return Response.json({ success: true, message: 'Request denied' });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('User access management error:', error);
    return Response.json({ 
      error: error.message || 'Failed to process request',
      details: error.toString()
    }, { status: 500 });
  }
});