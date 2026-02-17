import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Regional routing rules
const REGION_ROUTING = {
  EU: { compliance: ['GDPR'], encryption: 'AES-256-GCM', residency: true },
  UK: { compliance: ['UK_GDPR'], encryption: 'AES-256-GCM', residency: true },
  US: { compliance: ['CCPA', 'HIPAA'], encryption: 'AES-256', residency: false },
  APAC: { compliance: ['PDPA', 'APPI'], encryption: 'AES-256-GCM', residency: true },
  LATAM: { compliance: ['LGPD'], encryption: 'AES-256', residency: true },
  MEA: { compliance: ['POPIA'], encryption: 'AES-256', residency: false },
  ANZ: { compliance: ['Privacy_Act'], encryption: 'AES-256-GCM', residency: true }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'route_data') {
      return await routeDataByRegion(base44, body.tenant_id);
    } else if (action === 'get_fortress_status') {
      return await getFortressStatus(base44);
    } else if (action === 'handle_compliance_event') {
      return await handleComplianceEvent(base44, body);
    } else if (action === 'enforce_retention') {
      return await enforceRetentionPolicies(base44);
    } else if (action === 'audit_regions') {
      return await auditRegions(base44);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function routeDataByRegion(base44, tenantId) {
  if (!tenantId) {
    return Response.json({ error: 'tenant_id required' }, { status: 400 });
  }

  const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
  if (tenants.length === 0) {
    return Response.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const tenant = tenants[0];
  const regions = await base44.asServiceRole.entities.DataRegion.filter({ is_active: true });
  const regionalNodes = await base44.asServiceRole.entities.RegionalIntelligenceNode.filter({});

  // Determine tenant region from currency/locale or default to US
  let targetRegion = 'US';
  const currency = tenant.currency || 'USD';
  
  if (['EUR'].includes(currency)) targetRegion = 'EU';
  else if (['GBP'].includes(currency)) targetRegion = 'UK';
  else if (['JPY', 'CNY', 'SGD', 'HKD'].includes(currency)) targetRegion = 'APAC';
  else if (['BRL', 'MXN', 'ARS'].includes(currency)) targetRegion = 'LATAM';
  else if (['AUD', 'NZD'].includes(currency)) targetRegion = 'ANZ';
  else if (['ZAR', 'AED'].includes(currency)) targetRegion = 'MEA';

  const regionConfig = REGION_ROUTING[targetRegion];
  const dataRegion = regions.find(r => r.region_code === targetRegion);
  const intelligenceNode = regionalNodes.find(n => n.region === targetRegion);

  // Build routing decision
  const routingDecision = {
    tenant_id: tenantId,
    target_region: targetRegion,
    compliance_frameworks: regionConfig.compliance,
    encryption_standard: regionConfig.encryption,
    data_residency_required: regionConfig.residency,
    storage_endpoint: dataRegion?.storage_endpoint || `https://${targetRegion.toLowerCase()}.profitshield.io/data`,
    failover_region: dataRegion?.failover_region || 'US',
    intelligence_node_active: !!intelligenceNode,
    routing_timestamp: new Date().toISOString()
  };

  // Log routing decision
  await base44.asServiceRole.entities.GovernanceAuditEvent.create({
    event_type: 'data_access',
    entity_affected: 'Tenant',
    entity_id: tenantId,
    changed_by: 'data_fortress',
    severity: 'info',
    compliance_frameworks: regionConfig.compliance
  });

  return Response.json({
    success: true,
    routing: routingDecision
  });
}

async function getFortressStatus(base44) {
  const regions = await base44.asServiceRole.entities.DataRegion.filter({});
  const complianceEvents = await base44.asServiceRole.entities.RegionalComplianceEvent.filter({});
  const tenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });

  // Calculate regional stats
  const regionStats = {};
  for (const region of regions) {
    const regionEvents = complianceEvents.filter(e => e.region_code === region.region_code);
    const pendingEvents = regionEvents.filter(e => e.resolved_status === 'pending' || e.resolved_status === 'in_progress');
    const overdueEvents = regionEvents.filter(e => 
      e.resolved_status !== 'resolved' && 
      e.resolution_deadline && 
      new Date(e.resolution_deadline) < new Date()
    );

    regionStats[region.region_code] = {
      name: region.region_name,
      uptime: region.uptime_score || 99.9,
      compliance_score: region.compliance_score || 95,
      latency: region.latency_score || 20,
      replication_status: region.replication_status || 'healthy',
      tenant_count: region.tenant_count || 0,
      data_volume_gb: region.data_volume_gb || 0,
      risk_score: region.risk_score || 10,
      pending_events: pendingEvents.length,
      overdue_events: overdueEvents.length,
      failover_region: region.failover_region
    };
  }

  // Calculate cross-region health
  const healthyRegions = regions.filter(r => r.replication_status === 'healthy').length;
  const totalRisk = regions.reduce((sum, r) => sum + (r.risk_score || 0), 0);
  const avgRisk = regions.length > 0 ? totalRisk / regions.length : 0;

  return Response.json({
    fortress_status: {
      total_regions: regions.length,
      healthy_regions: healthyRegions,
      avg_risk_score: avgRisk,
      overall_health: healthyRegions === regions.length ? 'healthy' : healthyRegions >= regions.length * 0.8 ? 'degraded' : 'critical',
      region_stats: regionStats,
      pending_compliance_events: complianceEvents.filter(e => e.resolved_status === 'pending').length,
      total_tenants: tenants.length
    }
  });
}

async function handleComplianceEvent(base44, params) {
  const { region_code, event_type, tenant_id, request_source, compliance_framework, data_subjects_affected } = params;

  // Calculate deadline based on framework
  let deadlineDays = 30;
  if (compliance_framework === 'GDPR') deadlineDays = 30;
  else if (compliance_framework === 'CCPA') deadlineDays = 45;

  const event = await base44.asServiceRole.entities.RegionalComplianceEvent.create({
    region_code,
    tenant_id,
    event_type,
    request_source: request_source || 'user_request',
    compliance_framework,
    data_subjects_affected: data_subjects_affected || 1,
    resolved_status: 'pending',
    resolution_deadline: new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000).toISOString(),
    audit_trail: [{
      action: 'event_created',
      timestamp: new Date().toISOString(),
      actor: 'data_fortress'
    }]
  });

  return Response.json({ success: true, event_id: event.id, deadline_days: deadlineDays });
}

async function enforceRetentionPolicies(base44) {
  const regions = await base44.asServiceRole.entities.DataRegion.filter({ is_active: true });
  const enforcements = [];

  for (const region of regions) {
    // Check for data retention violations (simplified)
    const complianceScore = region.compliance_score || 100;
    
    if (complianceScore < 90) {
      enforcements.push({
        region: region.region_code,
        issue: 'retention_compliance_gap',
        current_score: complianceScore,
        action_required: 'review_data_retention_policies'
      });

      // Log compliance event
      await base44.asServiceRole.entities.RegionalComplianceEvent.create({
        region_code: region.region_code,
        event_type: 'retention_enforcement',
        compliance_framework: region.compliance_frameworks?.[0] || 'general',
        resolved_status: 'pending',
        resolution_deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      });
    }
  }

  return Response.json({
    success: true,
    regions_checked: regions.length,
    enforcements: enforcements
  });
}

async function auditRegions(base44) {
  const regions = await base44.asServiceRole.entities.DataRegion.filter({});
  const auditResults = [];

  for (const region of regions) {
    const issues = [];
    
    // Check uptime
    if ((region.uptime_score || 0) < 99) {
      issues.push({ type: 'uptime', severity: 'warning', detail: `Uptime below 99%: ${region.uptime_score}%` });
    }

    // Check replication
    if (region.replication_status !== 'healthy') {
      issues.push({ type: 'replication', severity: 'critical', detail: `Replication status: ${region.replication_status}` });
    }

    // Check compliance
    if ((region.compliance_score || 0) < 95) {
      issues.push({ type: 'compliance', severity: 'warning', detail: `Compliance score: ${region.compliance_score}%` });
    }

    // Update last audit
    await base44.asServiceRole.entities.DataRegion.update(region.id, {
      last_audit_at: new Date().toISOString(),
      risk_score: issues.filter(i => i.severity === 'critical').length * 30 + issues.filter(i => i.severity === 'warning').length * 10
    });

    auditResults.push({
      region: region.region_code,
      issues: issues,
      status: issues.length === 0 ? 'healthy' : issues.some(i => i.severity === 'critical') ? 'critical' : 'warning'
    });
  }

  return Response.json({
    success: true,
    audit_results: auditResults,
    overall_status: auditResults.every(r => r.status === 'healthy') ? 'healthy' : 
                    auditResults.some(r => r.status === 'critical') ? 'critical' : 'warning'
  });
}