import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Repair User Access
 * Links the current authenticated user to their Shopify tenant
 * Useful for troubleshooting 403 access issues
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get authenticated user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    const { shopDomain } = await req.json();
    
    if (!shopDomain) {
      return Response.json({ error: 'Shop domain is required' }, { status: 400 });
    }
    
    console.log('[repairUserAccess] Repairing access for user:', user.email, 'shop:', shopDomain);
    
    // Find tenant by shop domain
    const tenants = await base44.asServiceRole.entities.Tenant.filter({
      shop_domain: shopDomain,
      platform: 'shopify'
    });
    
    if (tenants.length === 0) {
      return Response.json({ 
        error: 'Tenant not found',
        message: `No tenant found for shop: ${shopDomain}`
      }, { status: 404 });
    }
    
    const tenant = tenants[0];
    
    // Check current user state
    const currentTenantId = user.tenant_id;
    const currentRole = user.role || 'user';
    
    let updated = false;
    let changes = {};
    
    // Link tenant if not linked
    if (!currentTenantId) {
      changes.tenant_id = tenant.id;
      updated = true;
      console.log('[repairUserAccess] Linking user to tenant:', tenant.id);
    } else if (currentTenantId !== tenant.id) {
      return Response.json({
        error: 'User already linked to different tenant',
        currentTenantId,
        requestedTenantId: tenant.id,
        message: 'User is already associated with a different store'
      }, { status: 409 });
    }
    
    // Upgrade to owner if currently 'user' role
    if (currentRole === 'user') {
      changes.role = 'owner';
      updated = true;
      console.log('[repairUserAccess] Upgrading user to owner role');
    }
    
    // Apply updates if needed
    if (updated) {
      await base44.auth.updateMe(changes);
      
      // Log the repair action
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: tenant.id,
        action: 'user_access_repaired',
        entity_type: 'user',
        entity_id: user.id,
        performed_by: user.email,
        description: `User access repaired for ${user.email}`,
        metadata: {
          shop_domain: shopDomain,
          changes
        },
        category: 'auth',
        severity: 'medium'
      });
      
      return Response.json({
        success: true,
        message: 'User access repaired successfully',
        changes,
        user: {
          email: user.email,
          tenant_id: tenant.id,
          role: changes.role || currentRole
        }
      });
    } else {
      return Response.json({
        success: true,
        message: 'User already has correct access',
        user: {
          email: user.email,
          tenant_id: currentTenantId,
          role: currentRole
        }
      });
    }
    
  } catch (error) {
    console.error('[repairUserAccess] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});