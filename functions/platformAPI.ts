import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_VERSION = '2024-01';

Deno.serve(async (req) => {
  try {
    // Extract API key from header
    const authHeader = req.headers.get('Authorization');
    const apiKey = authHeader?.replace('Bearer ', '');
    
    if (!apiKey) {
      return Response.json({ error: 'API key required', code: 'AUTH_REQUIRED' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    
    // Validate API key
    const keyPrefix = apiKey.substring(0, 12);
    const keys = await base44.asServiceRole.entities.APIKey.filter({ key_prefix: keyPrefix, status: 'active' });
    
    if (keys.length === 0) {
      return Response.json({ error: 'Invalid API key', code: 'INVALID_KEY' }, { status: 401 });
    }

    const apiKeyRecord = keys[0];
    
    // Check rate limits
    const rateLimitResult = await checkRateLimit(base44, apiKeyRecord);
    if (!rateLimitResult.allowed) {
      return Response.json({ 
        error: 'Rate limit exceeded', 
        code: 'RATE_LIMIT',
        retry_after: rateLimitResult.retry_after 
      }, { 
        status: 429,
        headers: { 'Retry-After': String(rateLimitResult.retry_after) }
      });
    }

    // Parse request
    const url = new URL(req.url);
    const path = url.pathname.replace('/api/v1', '');
    const method = req.method;
    const body = method !== 'GET' ? await req.json().catch(() => ({})) : {};
    const query = Object.fromEntries(url.searchParams);

    // Route request
    const response = await routeRequest(base44, apiKeyRecord, method, path, body, query);

    // Update usage stats
    await updateUsageStats(base44, apiKeyRecord);

    return Response.json({
      ...response,
      _meta: {
        api_version: API_VERSION,
        request_id: crypto.randomUUID()
      }
    });

  } catch (error) {
    console.error('Platform API error:', error);
    return Response.json({ 
      error: error.message, 
      code: 'INTERNAL_ERROR' 
    }, { status: 500 });
  }
});

async function checkRateLimit(base44, apiKey) {
  const limits = apiKey.rate_limit || { requests_per_minute: 60 };
  const usage = apiKey.usage_stats || { requests_today: 0 };
  
  // Simple rate limiting (would be Redis-based in production)
  if (usage.requests_today >= (limits.requests_per_day || 10000)) {
    return { allowed: false, retry_after: 3600 };
  }
  
  return { allowed: true };
}

async function updateUsageStats(base44, apiKey) {
  const usage = apiKey.usage_stats || { total_requests: 0, requests_today: 0 };
  await base44.asServiceRole.entities.APIKey.update(apiKey.id, {
    usage_stats: {
      ...usage,
      total_requests: (usage.total_requests || 0) + 1,
      requests_today: (usage.requests_today || 0) + 1,
      last_used_at: new Date().toISOString()
    }
  });
}

async function routeRequest(base44, apiKey, method, path, body, query) {
  const tenantId = apiKey.tenant_id;
  const permissions = apiKey.permissions || [];

  // Permission check helper
  const hasPermission = (perm) => permissions.includes('full_access') || permissions.includes(perm);

  // Orders API
  if (path.startsWith('/orders')) {
    if (!hasPermission('orders:read') && !hasPermission('orders:write')) {
      return { error: 'Insufficient permissions', code: 'FORBIDDEN' };
    }

    if (method === 'GET' && path === '/orders') {
      const orders = await base44.asServiceRole.entities.Order.filter({ 
        tenant_id: tenantId 
      }, '-order_date', parseInt(query.limit) || 50);
      return { orders: orders.map(sanitizeOrder) };
    }

    if (method === 'GET' && path.match(/^\/orders\/[\w-]+$/)) {
      const orderId = path.split('/')[2];
      const orders = await base44.asServiceRole.entities.Order.filter({ id: orderId, tenant_id: tenantId });
      if (orders.length === 0) return { error: 'Order not found', code: 'NOT_FOUND' };
      return { order: sanitizeOrder(orders[0]) };
    }

    if (method === 'GET' && path.match(/^\/orders\/[\w-]+\/risk$/)) {
      const orderId = path.split('/')[2];
      const audits = await base44.asServiceRole.entities.RiskScoreAudit.filter({ order_id: orderId, tenant_id: tenantId });
      if (audits.length === 0) return { error: 'Risk audit not found', code: 'NOT_FOUND' };
      return { risk_analysis: audits[0] };
    }
  }

  // Risk API
  if (path.startsWith('/risk')) {
    if (!hasPermission('risk:read') && !hasPermission('risk:write')) {
      return { error: 'Insufficient permissions', code: 'FORBIDDEN' };
    }

    if (method === 'POST' && path === '/risk/score') {
      if (!hasPermission('risk:write')) return { error: 'Insufficient permissions', code: 'FORBIDDEN' };
      const result = await base44.asServiceRole.functions.invoke('globalRiskBrain', {
        action: 'score_order',
        order_id: body.order_id,
        tenant_id: tenantId
      });
      return { score: result.data?.score };
    }

    if (method === 'GET' && path === '/risk/rules') {
      const rules = await base44.asServiceRole.entities.RiskRule.filter({ tenant_id: tenantId });
      return { rules };
    }

    if (method === 'POST' && path === '/risk/rules') {
      if (!hasPermission('risk:write')) return { error: 'Insufficient permissions', code: 'FORBIDDEN' };
      const rule = await base44.asServiceRole.entities.RiskRule.create({ ...body, tenant_id: tenantId });
      return { rule };
    }
  }

  // Analytics API
  if (path.startsWith('/analytics')) {
    if (!hasPermission('analytics:read')) {
      return { error: 'Insufficient permissions', code: 'FORBIDDEN' };
    }

    if (method === 'GET' && path === '/analytics/summary') {
      const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
      return {
        summary: {
          total_orders: orders.length,
          total_revenue: orders.reduce((s, o) => s + (o.total_revenue || 0), 0),
          total_profit: orders.reduce((s, o) => s + (o.net_profit || 0), 0),
          high_risk_orders: orders.filter(o => o.risk_level === 'high').length,
          avg_risk_score: orders.length > 0 
            ? orders.reduce((s, o) => s + (o.fraud_score || 0), 0) / orders.length 
            : 0
        }
      };
    }

    if (method === 'GET' && path === '/analytics/benchmarks') {
      const benchmarks = await base44.asServiceRole.entities.IndustryBenchmark.filter({});
      return { benchmarks };
    }
  }

  // Webhooks API
  if (path.startsWith('/webhooks')) {
    if (!hasPermission('webhooks:manage')) {
      return { error: 'Insufficient permissions', code: 'FORBIDDEN' };
    }

    // Would handle webhook subscription management
    return { message: 'Webhook management endpoint' };
  }

  return { error: 'Endpoint not found', code: 'NOT_FOUND' };
}

function sanitizeOrder(order) {
  // Remove sensitive internal fields
  const { platform_data, ...safe } = order;
  return safe;
}