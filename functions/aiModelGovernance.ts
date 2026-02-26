import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  let level = "info";
  let message = "Initializing";
  let status = "success";
  let data = {};

  try {
    const base44 = createClientFromRequest(req);
    
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (e) {
      user = null;
    }
    
    if (user && user.role !== 'admin') {
      level = "error";
      message = "Admin access required";
      status = "error";
      return Response.json({ level, message, status, data }, { status: 403 });
    }

    let models = [];
    try {
      models = await base44.asServiceRole.entities.AIModelVersion.filter({ is_deployed: true });
    } catch (e) {
      models = [];
    }

    const highDrift = models.filter(m => (m.drift_score || 0) >= 75).length;
    const highBias = models.filter(m => (m.bias_score || 0) >= 75).length;
    const total = highDrift + highBias;

    if (total > 0) {
      level = "warn";
      message = `AI Governance: ${total} models need attention (drift=${highDrift}, bias=${highBias})`;
    } else {
      level = "info";
      message = `AI Governance: All ${models.length} models healthy`;
    }

    data = {
      models_checked: models.length,
      high_drift: highDrift,
      high_bias: highBias
    };

    return Response.json({ level, message, status, data });
    
  } catch (error) {
    level = "error";
    message = `Execution failed: ${error.message}`;
    status = "error";
    data = { error: error.message };
    return Response.json({ level, message, status, data }, { status: 500 });
  }
});