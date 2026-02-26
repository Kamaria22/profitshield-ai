import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * STATE MANAGER
 * Handles web↔desktop state continuity and route restoration
 */

Deno.serve(async (req) => {
  let level = "info";
  let message = "Processing state";
  let status = "success";
  let data = {};

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      level = "error";
      message = "Authentication required";
      status = "error";
      return Response.json({ level, message, status, data }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { action, route, tenant_id, store_connection_id, ui_state } = body;

    if (action === 'save_state') {
      const result = await saveUserState(base44, user.id, {
        last_visited_route: route,
        last_tenant_id: tenant_id,
        last_store_connection_id: store_connection_id,
        last_ui_state_json: ui_state
      });

      level = result.success ? "info" : "error";
      message = result.success ? "State saved" : result.error;
      data = result;
      return Response.json({ level, message, status, data });
    }

    if (action === 'restore_state') {
      const state = await restoreUserState(base44, user.id);
      
      level = "info";
      message = "State restored";
      data = state;
      return Response.json({ level, message, status, data });
    }

    if (action === 'mark_desktop_installed') {
      const result = await markDesktopInstalled(base44, user.id);
      
      level = "info";
      message = "Desktop installation tracked";
      data = result;
      return Response.json({ level, message, status, data });
    }

    level = "error";
    message = "Invalid action";
    status = "error";
    return Response.json({ level, message, status, data }, { status: 400 });

  } catch (error) {
    level = "error";
    message = `State error: ${error.message}`;
    status = "error";
    data = { error: error.message };
    return Response.json({ level, message, status, data }, { status: 500 });
  }
});

async function saveUserState(base44, userId, stateData) {
  try {
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_id: userId });
    
    if (profiles.length === 0) {
      await base44.asServiceRole.entities.UserProfile.create({
        user_id: userId,
        ...stateData
      });
    } else {
      await base44.asServiceRole.entities.UserProfile.update(profiles[0].id, stateData);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function restoreUserState(base44, userId) {
  try {
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_id: userId });
    
    if (profiles.length === 0) {
      return {
        last_visited_route: '/Home',
        last_tenant_id: null,
        last_store_connection_id: null,
        last_ui_state_json: {}
      };
    }

    const profile = profiles[0];
    return {
      last_visited_route: profile.last_visited_route || '/Home',
      last_tenant_id: profile.last_tenant_id,
      last_store_connection_id: profile.last_store_connection_id,
      last_ui_state_json: profile.last_ui_state_json || {}
    };

  } catch (error) {
    return {
      last_visited_route: '/Home',
      last_tenant_id: null,
      last_store_connection_id: null,
      last_ui_state_json: {},
      error: error.message
    };
  }
}

async function markDesktopInstalled(base44, userId) {
  try {
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ user_id: userId });
    
    if (profiles.length > 0) {
      await base44.asServiceRole.entities.UserProfile.update(profiles[0].id, {
        desktop_installed: true,
        preferred_platform: 'desktop'
      });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      tenant_id: 'system',
      action: 'desktop_install_completed',
      entity_type: 'UserProfile',
      entity_id: profiles[0]?.id || 'unknown',
      performed_by: userId,
      description: 'User installed desktop app'
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}