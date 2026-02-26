import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const response = { level: "info", message: "Starting", status: "success", data: {} };
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    
    if (user && user.role !== 'admin') {
      response.level = "error";
      response.message = "Admin access required";
      response.status = "error";
      return Response.json(response, { status: 403 });
    }

    const models = await base44.asServiceRole.entities.AIModelVersion
      .filter({ is_deployed: true })
      .catch(() => []);

    const highDrift = models.filter(m => (m.drift_score || 0) >= 75).length;
    const highBias = models.filter(m => (m.bias_score || 0) >= 75).length;
    const total = highDrift + highBias;

    response.level = total > 0 ? "warn" : "info";
    response.message = total > 0 
      ? `AI Governance: ${total} models need attention (drift=${highDrift}, bias=${highBias})`
      : `AI Governance: All ${models.length} models healthy`;
    response.data = {
      models_checked: models.length,
      high_drift: highDrift,
      high_bias: highBias
    };

    return Response.json(response);
    
  } catch (error) {
    response.level = "error";
    response.message = `Failed: ${error.message}`;
    response.status = "error";
    response.data = { error: error.message };
    return Response.json(response, { status: 500 });
  }
});