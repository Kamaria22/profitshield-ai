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

// Anomaly detection thresholds
const ANOMALY_THRESHOLDS = {
  volume_deviation_factor: 3.0,      // Standard deviations from baseline
  off_hours_sensitivity: 0.7,        // 0-1 sensitivity for off-hours access
  geographic_mismatch_confidence: 0.8,
  rapid_extraction_records_per_min: 1000,
  cross_region_leak_confidence: 0.85
};

// Threat severity mapping
const THREAT_SEVERITY = {
  ip_reputation: { high_risk: 'critical', medium_risk: 'high', low_risk: 'medium' },
  cross_region: { confirmed: 'critical', suspected: 'high', potential: 'medium' },
  behavioral: { major_deviation: 'high', minor_deviation: 'medium', slight: 'low' }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const action = body?.action || null;

    if (!action) {
      return Response.json({ error: 'action required' }, { status: 400 });
    }

    // Authenticate user - allow scheduled automations (no user) to proceed
    const user = await base44.auth.me().catch(() => null);
    
    // If there is a user, verify admin role
    if (user && user.role !== 'admin') {
      return Response.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      );
    }

    // Route actions
    switch (action) {
      case 'route_data':
        return await routeDataByRegion(base44, body.tenant_id);
      case 'get_status':
        return await getFortressStatus(base44);
      case 'handle_compliance':
        return await handleComplianceEvent(base44, body);
      case 'enforce_retention':
        return await enforceRetentionPolicies(base44);
      case 'audit_regions':
        return await auditRegions(base44);
      case 'run_anomaly_detection':
        return await runAnomalyDetection(base44);
      case 'detect_cross_region_leaks':
        return await detectCrossRegionLeaks(base44);
      case 'update_threat_intel':
        return await updateThreatIntel(base44);
      case 'calibrate_baselines':
        return await calibrateBaselines(base44);
      case 'get_security_dashboard':
        return await getSecurityDashboard(base44);
      case 'investigate_anomaly':
        return await investigateAnomaly(base44, body.anomaly_id, body.investigation_action, user.email);
      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
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

// ==================== ANOMALY DETECTION ====================

async function runAnomalyDetection(base44) {
  const regions = await base44.asServiceRole.entities.DataRegion.filter({ is_active: true });
  const baselines = await base44.asServiceRole.entities.RegionalAccessBaseline.filter({});
  const threatFeeds = await base44.asServiceRole.entities.ThreatIntelFeed.filter({ is_active: true });
  
  const anomaliesDetected = [];
  const currentHour = new Date().getHours();
  const currentDay = new Date().getDay();

  for (const region of regions) {
    // Simulate current access metrics (in production, would query real access logs)
    const currentMetrics = simulateCurrentMetrics(region);
    
    // Get baselines for this region
    const regionBaselines = baselines.filter(b => b.region_code === region.region_code);
    
    // Check for volume anomalies
    const volumeBaseline = regionBaselines.find(b => b.metric_type === 'hourly_requests' && b.bucket_value === currentHour);
    if (volumeBaseline) {
      const deviation = calculateDeviation(currentMetrics.hourly_requests, volumeBaseline);
      if (Math.abs(deviation) > ANOMALY_THRESHOLDS.volume_deviation_factor) {
        const anomaly = await createAnomaly(base44, {
          region_code: region.region_code,
          anomaly_type: 'unusual_volume',
          severity: Math.abs(deviation) > 5 ? 'critical' : Math.abs(deviation) > 4 ? 'high' : 'medium',
          confidence_score: Math.min(95, 60 + Math.abs(deviation) * 8),
          baseline_value: volumeBaseline.baseline_mean,
          observed_value: currentMetrics.hourly_requests,
          deviation_factor: deviation,
          affected_data_types: ['all'],
          records_affected: currentMetrics.hourly_requests
        });
        anomaliesDetected.push(anomaly);
      }
    }

    // Check for off-hours access
    const isOffHours = currentHour < 6 || currentHour > 22;
    const isWeekend = currentDay === 0 || currentDay === 6;
    if ((isOffHours || isWeekend) && currentMetrics.hourly_requests > 100) {
      const offHoursBaseline = regionBaselines.find(b => b.metric_type === 'hourly_requests' && b.time_bucket === 'hour_of_day' && b.bucket_value === currentHour);
      const expectedOffHours = offHoursBaseline?.baseline_mean || 10;
      
      if (currentMetrics.hourly_requests > expectedOffHours * 3) {
        const anomaly = await createAnomaly(base44, {
          region_code: region.region_code,
          anomaly_type: 'off_hours_access',
          severity: currentMetrics.hourly_requests > expectedOffHours * 10 ? 'high' : 'medium',
          confidence_score: 75,
          baseline_value: expectedOffHours,
          observed_value: currentMetrics.hourly_requests,
          deviation_factor: currentMetrics.hourly_requests / Math.max(1, expectedOffHours),
          affected_data_types: ['user_data', 'transaction_data']
        });
        anomaliesDetected.push(anomaly);
      }
    }

    // Check for rapid data extraction
    if (currentMetrics.export_rate > ANOMALY_THRESHOLDS.rapid_extraction_records_per_min) {
      const anomaly = await createAnomaly(base44, {
        region_code: region.region_code,
        anomaly_type: 'rapid_extraction',
        severity: 'critical',
        confidence_score: 90,
        baseline_value: ANOMALY_THRESHOLDS.rapid_extraction_records_per_min,
        observed_value: currentMetrics.export_rate,
        deviation_factor: currentMetrics.export_rate / ANOMALY_THRESHOLDS.rapid_extraction_records_per_min,
        affected_data_types: ['bulk_export'],
        records_affected: currentMetrics.export_rate * 5
      });
      anomaliesDetected.push(anomaly);
    }

    // Check against threat intelligence
    const threatMatches = checkThreatIntel(currentMetrics, threatFeeds);
    for (const match of threatMatches) {
      const anomaly = await createAnomaly(base44, {
        region_code: region.region_code,
        anomaly_type: 'unauthorized_access',
        severity: match.threat_level === 'high' ? 'critical' : match.threat_level === 'medium' ? 'high' : 'medium',
        confidence_score: match.confidence,
        source_ip: match.indicator_value,
        threat_indicators: [match],
        affected_data_types: ['all']
      });
      anomaliesDetected.push(anomaly);
    }
  }

  // Log telemetry with safe defaults
  const criticalCount = anomaliesDetected.filter(a => a.severity === 'critical').length;
  try {
    await base44.asServiceRole.entities.ClientTelemetry.create({
      level: criticalCount > 0 ? 'error' : anomaliesDetected.length > 0 ? 'warn' : 'info',
      message: `Data Fortress scan: ${regions.length} regions scanned, ${anomaliesDetected.length} anomalies detected (${criticalCount} critical)`,
      context_json: {
        event_type: 'anomaly_detection_scan',
        regions_scanned: regions.length,
        anomalies_detected: anomaliesDetected.length,
        critical_anomalies: criticalCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (telemetryError) {
    // If telemetry fails, log to console but don't fail the whole operation
    console.error('[DataFortress] Telemetry logging failed:', telemetryError.message);
  }

  return Response.json({
    success: true,
    regions_scanned: regions.length,
    anomalies_detected: anomaliesDetected.length,
    anomalies: anomaliesDetected.map(a => ({
      id: a.id,
      region: a.region_code,
      type: a.anomaly_type,
      severity: a.severity,
      confidence: a.confidence_score
    })),
    threat_level: anomaliesDetected.some(a => a.severity === 'critical') ? 'critical' :
                  anomaliesDetected.some(a => a.severity === 'high') ? 'high' :
                  anomaliesDetected.length > 0 ? 'elevated' : 'normal'
  });
}

function simulateCurrentMetrics(region) {
  // Simulate current access metrics with some randomness
  const baseRequests = (region.tenant_count || 10) * 50;
  const hour = new Date().getHours();
  const hourMultiplier = hour >= 9 && hour <= 17 ? 1.5 : 0.3;
  
  return {
    hourly_requests: Math.floor(baseRequests * hourMultiplier * (0.8 + Math.random() * 0.4)),
    unique_users: Math.floor((region.tenant_count || 10) * (0.5 + Math.random() * 0.5)),
    data_volume_mb: Math.floor(baseRequests * 0.1 * (0.7 + Math.random() * 0.6)),
    export_rate: Math.floor(Math.random() * 500), // Records per minute
    cross_region_transfers: Math.floor(Math.random() * 20),
    suspicious_ips: generateSuspiciousIPs()
  };
}

function generateSuspiciousIPs() {
  // Simulate some potentially suspicious IPs
  const ips = [];
  if (Math.random() < 0.1) {
    ips.push({ ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, requests: Math.floor(Math.random() * 1000) });
  }
  return ips;
}

function calculateDeviation(observed, baseline) {
  if (!baseline || !baseline.baseline_std || baseline.baseline_std === 0) return 0;
  return (observed - baseline.baseline_mean) / baseline.baseline_std;
}

function checkThreatIntel(metrics, feeds) {
  const matches = [];
  
  for (const feed of feeds) {
    if (!feed.indicators) continue;
    
    for (const ip of (metrics.suspicious_ips || [])) {
      const indicator = feed.indicators.find(i => i.indicator_value === ip.ip);
      if (indicator) {
        matches.push({
          indicator_type: 'ip_address',
          indicator_value: ip.ip,
          threat_level: indicator.threat_level || 'medium',
          confidence: indicator.confidence || 70,
          source: feed.feed_name
        });
      }
    }
  }
  
  return matches;
}

async function createAnomaly(base44, data) {
  const anomaly = await base44.asServiceRole.entities.DataAccessAnomaly.create({
    ...data,
    status: 'detected',
    detected_at: new Date().toISOString()
  });

  // Log governance event for critical/high severity
  if (data.severity === 'critical' || data.severity === 'high') {
    await base44.asServiceRole.entities.GovernanceAuditEvent.create({
      event_type: 'security_event',
      entity_affected: 'DataRegion',
      entity_id: data.region_code,
      changed_by: 'data_fortress_anomaly_detector',
      severity: data.severity,
      compliance_frameworks: ['SOC2', 'ISO27001'],
      requires_review: true
    });
  }

  return anomaly;
}

// ==================== CROSS-REGION LEAK DETECTION ====================

async function detectCrossRegionLeaks(base44) {
  const regions = await base44.asServiceRole.entities.DataRegion.filter({ is_active: true });
  const recentAnomalies = await base44.asServiceRole.entities.DataAccessAnomaly.filter({});
  
  const leaksDetected = [];
  const regionPairs = [];

  // Generate all region pairs to check
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      regionPairs.push([regions[i], regions[j]]);
    }
  }

  for (const [regionA, regionB] of regionPairs) {
    // Simulate cross-region transfer analysis
    const transfers = simulateCrossRegionTransfers(regionA, regionB);
    
    // Check for suspicious patterns
    if (transfers.unauthorized_attempts > 0) {
      const leak = await base44.asServiceRole.entities.DataAccessAnomaly.create({
        region_code: regionA.region_code,
        anomaly_type: 'cross_region_leak',
        severity: transfers.unauthorized_attempts > 10 ? 'critical' : 'high',
        confidence_score: ANOMALY_THRESHOLDS.cross_region_leak_confidence * 100,
        source_region: regionA.region_code,
        destination_region: regionB.region_code,
        records_affected: transfers.records_transferred,
        threat_indicators: [{
          indicator_type: 'cross_region_transfer',
          indicator_value: `${regionA.region_code} -> ${regionB.region_code}`,
          threat_level: 'high',
          source: 'internal_monitoring'
        }],
        status: 'detected',
        detected_at: new Date().toISOString()
      });
      leaksDetected.push(leak);

      // Check data residency violations
      if (regionA.data_residency_required || regionB.data_residency_required) {
        await base44.asServiceRole.entities.RegionalComplianceEvent.create({
          region_code: regionA.region_code,
          event_type: 'breach_notification',
          compliance_framework: regionA.compliance_frameworks?.[0] || 'GDPR',
          data_subjects_affected: Math.floor(transfers.records_transferred / 10),
          resolved_status: 'pending',
          resolution_deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() // 72 hours for breach notification
        });
      }
    }

    // Check for geographic mismatch patterns
    if (transfers.geographic_mismatches > 5) {
      const mismatch = await base44.asServiceRole.entities.DataAccessAnomaly.create({
        region_code: regionA.region_code,
        anomaly_type: 'geographic_mismatch',
        severity: 'medium',
        confidence_score: 70,
        source_region: regionA.region_code,
        destination_region: regionB.region_code,
        records_affected: transfers.geographic_mismatches,
        status: 'detected',
        detected_at: new Date().toISOString()
      });
      leaksDetected.push(mismatch);
    }
  }

  return Response.json({
    success: true,
    region_pairs_analyzed: regionPairs.length,
    leaks_detected: leaksDetected.length,
    leaks: leaksDetected.map(l => ({
      id: l.id,
      type: l.anomaly_type,
      source: l.source_region,
      destination: l.destination_region,
      severity: l.severity,
      records: l.records_affected
    })),
    residency_violations: leaksDetected.filter(l => l.anomaly_type === 'cross_region_leak').length
  });
}

function simulateCrossRegionTransfers(regionA, regionB) {
  // Simulate cross-region transfer patterns
  return {
    total_transfers: Math.floor(Math.random() * 100),
    records_transferred: Math.floor(Math.random() * 10000),
    unauthorized_attempts: Math.random() < 0.15 ? Math.floor(Math.random() * 20) : 0,
    geographic_mismatches: Math.random() < 0.2 ? Math.floor(Math.random() * 15) : 0
  };
}

// ==================== THREAT INTELLIGENCE ====================

async function updateThreatIntel(base44) {
  // Simulate fetching threat intelligence from multiple sources
  const threatSources = [
    { name: 'IP Reputation Feed', type: 'ip_reputation', source: 'internal_honeypot' },
    { name: 'Domain Blocklist', type: 'domain_blocklist', source: 'community_feed' },
    { name: 'Breach Indicators', type: 'breach_indicators', source: 'dark_web_monitor' },
    { name: 'Geo Threat Intel', type: 'geo_threat', source: 'regional_certs' },
    { name: 'Behavioral Patterns', type: 'behavioral_patterns', source: 'ml_detection' }
  ];

  const updatedFeeds = [];

  for (const source of threatSources) {
    // Check if feed exists
    const existingFeeds = await base44.asServiceRole.entities.ThreatIntelFeed.filter({
      feed_name: source.name
    });

    const indicators = generateThreatIndicators(source.type);

    if (existingFeeds.length > 0) {
      await base44.asServiceRole.entities.ThreatIntelFeed.update(existingFeeds[0].id, {
        indicators,
        indicator_count: indicators.length,
        last_updated: new Date().toISOString(),
        match_count_24h: Math.floor(Math.random() * 50)
      });
      updatedFeeds.push({ ...source, indicators_count: indicators.length, action: 'updated' });
    } else {
      const feed = await base44.asServiceRole.entities.ThreatIntelFeed.create({
        feed_name: source.name,
        feed_type: source.type,
        source: source.source,
        indicators,
        indicator_count: indicators.length,
        last_updated: new Date().toISOString(),
        update_frequency_hours: 24,
        is_active: true,
        match_count_24h: 0,
        false_positive_rate: 0.05
      });
      updatedFeeds.push({ ...source, indicators_count: indicators.length, action: 'created' });
    }
  }

  return Response.json({
    success: true,
    feeds_updated: updatedFeeds.length,
    feeds: updatedFeeds,
    total_indicators: updatedFeeds.reduce((sum, f) => sum + f.indicators_count, 0)
  });
}

function generateThreatIndicators(feedType) {
  const indicators = [];
  const count = Math.floor(10 + Math.random() * 40);

  for (let i = 0; i < count; i++) {
    if (feedType === 'ip_reputation') {
      indicators.push({
        indicator_type: 'ip_address',
        indicator_value: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        threat_level: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        first_seen: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        last_seen: new Date().toISOString(),
        confidence: 60 + Math.floor(Math.random() * 40),
        tags: ['malicious', 'scanner', 'botnet'].slice(0, Math.floor(Math.random() * 3) + 1)
      });
    } else if (feedType === 'domain_blocklist') {
      indicators.push({
        indicator_type: 'domain',
        indicator_value: `malicious${i}.example.com`,
        threat_level: ['medium', 'high'][Math.floor(Math.random() * 2)],
        confidence: 70 + Math.floor(Math.random() * 30),
        tags: ['phishing', 'malware']
      });
    } else if (feedType === 'breach_indicators') {
      indicators.push({
        indicator_type: 'credential_hash',
        indicator_value: `hash_${Math.random().toString(36).substring(7)}`,
        threat_level: 'high',
        confidence: 85,
        tags: ['compromised', 'leaked']
      });
    } else if (feedType === 'geo_threat') {
      indicators.push({
        indicator_type: 'geo_region',
        indicator_value: ['TOR_EXIT', 'HIGH_RISK_VPN', 'SANCTIONED_COUNTRY'][Math.floor(Math.random() * 3)],
        threat_level: 'medium',
        confidence: 75,
        tags: ['anonymization', 'geo_risk']
      });
    } else {
      indicators.push({
        indicator_type: 'behavior_pattern',
        indicator_value: ['rapid_enumeration', 'credential_stuffing', 'data_exfiltration'][Math.floor(Math.random() * 3)],
        threat_level: 'high',
        confidence: 80,
        tags: ['behavioral', 'ml_detected']
      });
    }
  }

  return indicators;
}

// ==================== BASELINE CALIBRATION ====================

async function calibrateBaselines(base44) {
  const regions = await base44.asServiceRole.entities.DataRegion.filter({ is_active: true });
  const metricTypes = ['hourly_requests', 'data_volume', 'unique_users', 'api_calls', 'export_requests', 'cross_region_transfers'];
  
  const baselinesCreated = [];

  for (const region of regions) {
    for (const metricType of metricTypes) {
      // Calibrate hourly baselines
      for (let hour = 0; hour < 24; hour++) {
        const baseline = generateBaseline(region, metricType, hour);
        
        // Check if baseline exists
        const existing = await base44.asServiceRole.entities.RegionalAccessBaseline.filter({
          region_code: region.region_code,
          metric_type: metricType,
          time_bucket: 'hour_of_day',
          bucket_value: hour
        });

        if (existing.length > 0) {
          await base44.asServiceRole.entities.RegionalAccessBaseline.update(existing[0].id, {
            ...baseline,
            sample_count: (existing[0].sample_count || 0) + 1,
            last_calibrated: new Date().toISOString()
          });
        } else {
          await base44.asServiceRole.entities.RegionalAccessBaseline.create({
            region_code: region.region_code,
            metric_type: metricType,
            time_bucket: 'hour_of_day',
            bucket_value: hour,
            ...baseline,
            sample_count: 1,
            last_calibrated: new Date().toISOString()
          });
          baselinesCreated.push({ region: region.region_code, metric: metricType, hour });
        }
      }
    }
  }

  return Response.json({
    success: true,
    regions_calibrated: regions.length,
    metrics_calibrated: metricTypes.length,
    baselines_created: baselinesCreated.length,
    total_baselines: regions.length * metricTypes.length * 24
  });
}

function generateBaseline(region, metricType, hour) {
  const tenantCount = region.tenant_count || 10;
  const isBusinessHours = hour >= 9 && hour <= 17;
  const hourMultiplier = isBusinessHours ? 1.0 : 0.2;

  let baseMean, baseStd;

  switch (metricType) {
    case 'hourly_requests':
      baseMean = tenantCount * 50 * hourMultiplier;
      baseStd = baseMean * 0.3;
      break;
    case 'data_volume':
      baseMean = tenantCount * 10 * hourMultiplier;
      baseStd = baseMean * 0.4;
      break;
    case 'unique_users':
      baseMean = tenantCount * 0.3 * hourMultiplier;
      baseStd = baseMean * 0.5;
      break;
    case 'api_calls':
      baseMean = tenantCount * 200 * hourMultiplier;
      baseStd = baseMean * 0.25;
      break;
    case 'export_requests':
      baseMean = tenantCount * 2 * hourMultiplier;
      baseStd = baseMean * 0.6;
      break;
    case 'cross_region_transfers':
      baseMean = tenantCount * 0.5;
      baseStd = baseMean * 0.8;
      break;
    default:
      baseMean = 100;
      baseStd = 30;
  }

  return {
    baseline_mean: baseMean,
    baseline_std: baseStd,
    baseline_min: Math.max(0, baseMean - 2 * baseStd),
    baseline_max: baseMean + 3 * baseStd,
    anomaly_threshold_low: baseMean - ANOMALY_THRESHOLDS.volume_deviation_factor * baseStd,
    anomaly_threshold_high: baseMean + ANOMALY_THRESHOLDS.volume_deviation_factor * baseStd
  };
}

// ==================== SECURITY DASHBOARD ====================

async function getSecurityDashboard(base44) {
  const anomalies = await base44.asServiceRole.entities.DataAccessAnomaly.filter({});
  const threatFeeds = await base44.asServiceRole.entities.ThreatIntelFeed.filter({});
  const regions = await base44.asServiceRole.entities.DataRegion.filter({ is_active: true });
  const baselines = await base44.asServiceRole.entities.RegionalAccessBaseline.filter({});

  // Recent anomalies (last 24 hours)
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentAnomalies = anomalies.filter(a => new Date(a.detected_at) >= last24h);
  
  // Anomaly breakdown
  const anomalyBreakdown = {
    by_type: {},
    by_severity: { critical: 0, high: 0, medium: 0, low: 0 },
    by_region: {},
    by_status: { detected: 0, investigating: 0, confirmed: 0, mitigated: 0, false_positive: 0 }
  };

  for (const anomaly of recentAnomalies) {
    anomalyBreakdown.by_type[anomaly.anomaly_type] = (anomalyBreakdown.by_type[anomaly.anomaly_type] || 0) + 1;
    anomalyBreakdown.by_severity[anomaly.severity] = (anomalyBreakdown.by_severity[anomaly.severity] || 0) + 1;
    anomalyBreakdown.by_region[anomaly.region_code] = (anomalyBreakdown.by_region[anomaly.region_code] || 0) + 1;
    anomalyBreakdown.by_status[anomaly.status] = (anomalyBreakdown.by_status[anomaly.status] || 0) + 1;
  }

  // Threat intel summary
  const totalIndicators = threatFeeds.reduce((sum, f) => sum + (f.indicator_count || 0), 0);
  const totalMatches24h = threatFeeds.reduce((sum, f) => sum + (f.match_count_24h || 0), 0);

  // Calculate threat level
  const criticalCount = anomalyBreakdown.by_severity.critical;
  const highCount = anomalyBreakdown.by_severity.high;
  const threatLevel = criticalCount > 0 ? 'critical' : highCount > 2 ? 'high' : highCount > 0 ? 'elevated' : 'normal';

  // Cross-region leak summary
  const crossRegionLeaks = recentAnomalies.filter(a => a.anomaly_type === 'cross_region_leak');

  return Response.json({
    security_dashboard: {
      threat_level: threatLevel,
      last_scan: new Date().toISOString(),
      anomalies_24h: recentAnomalies.length,
      anomaly_breakdown: anomalyBreakdown,
      critical_anomalies: recentAnomalies.filter(a => a.severity === 'critical').map(a => ({
        id: a.id,
        type: a.anomaly_type,
        region: a.region_code,
        confidence: a.confidence_score,
        detected_at: a.detected_at
      })),
      threat_intel: {
        active_feeds: threatFeeds.filter(f => f.is_active).length,
        total_indicators: totalIndicators,
        matches_24h: totalMatches24h,
        feeds: threatFeeds.map(f => ({
          name: f.feed_name,
          type: f.feed_type,
          indicators: f.indicator_count,
          matches: f.match_count_24h,
          last_updated: f.last_updated
        }))
      },
      cross_region_leaks: {
        count: crossRegionLeaks.length,
        leaks: crossRegionLeaks.map(l => ({
          source: l.source_region,
          destination: l.destination_region,
          records: l.records_affected,
          severity: l.severity
        }))
      },
      regions_monitored: regions.length,
      baselines_configured: baselines.length,
      pending_investigations: recentAnomalies.filter(a => a.status === 'detected' || a.status === 'investigating').length
    }
  });
}

// ==================== ANOMALY INVESTIGATION ====================

async function investigateAnomaly(base44, anomalyId, action, userEmail) {
  const anomalies = await base44.asServiceRole.entities.DataAccessAnomaly.filter({ id: anomalyId });
  if (anomalies.length === 0) {
    return Response.json({ error: 'Anomaly not found' }, { status: 404 });
  }

  const anomaly = anomalies[0];
  const updates = {};
  const mitigationAction = { action, timestamp: new Date().toISOString(), status: 'completed' };

  switch (action) {
    case 'investigate':
      updates.status = 'investigating';
      updates.investigated_by = userEmail;
      break;
    case 'confirm':
      updates.status = 'confirmed';
      mitigationAction.action = 'confirmed_threat';
      break;
    case 'false_positive':
      updates.status = 'false_positive';
      updates.resolution_notes = 'Marked as false positive after investigation';
      updates.resolved_at = new Date().toISOString();
      break;
    case 'mitigate':
      updates.status = 'mitigated';
      updates.resolved_at = new Date().toISOString();
      mitigationAction.action = 'threat_mitigated';
      break;
    case 'escalate':
      updates.status = 'escalated';
      mitigationAction.action = 'escalated_to_security_team';
      break;
    default:
      return Response.json({ error: 'Invalid action' }, { status: 400 });
  }

  updates.mitigation_actions = [...(anomaly.mitigation_actions || []), mitigationAction];

  await base44.asServiceRole.entities.DataAccessAnomaly.update(anomalyId, updates);

  // Log governance event
  await base44.asServiceRole.entities.GovernanceAuditEvent.create({
    event_type: 'security_event',
    entity_affected: 'DataAccessAnomaly',
    entity_id: anomalyId,
    changed_by: userEmail,
    change_reason: `Anomaly ${action}`,
    severity: action === 'escalate' ? 'critical' : 'info',
    compliance_frameworks: ['SOC2'],
    requires_review: action === 'escalate'
  });

  return Response.json({ success: true, anomaly_id: anomalyId, new_status: updates.status });
}