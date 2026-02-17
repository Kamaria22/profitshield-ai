import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// CDNP Standard Schemas
const DATA_CONTRACTS = {
  OrderSchema_v1: {
    version: '1.0.0',
    fields: {
      order_id: { type: 'string', required: true },
      platform: { type: 'string', required: true, enum: ['shopify', 'woocommerce', 'bigcommerce', 'magento', 'stripe'] },
      total_amount: { type: 'number', required: true },
      currency: { type: 'string', required: true },
      customer_email: { type: 'string', required: true },
      line_items: { type: 'array', required: true },
      created_at: { type: 'datetime', required: true },
      shipping_address: { type: 'object', required: false },
      billing_address: { type: 'object', required: false }
    }
  },
  FraudSignalSchema_v1: {
    version: '1.0.0',
    fields: {
      signal_id: { type: 'string', required: true },
      order_id: { type: 'string', required: true },
      risk_score: { type: 'number', required: true, min: 0, max: 100 },
      risk_factors: { type: 'array', required: true },
      recommendation: { type: 'string', required: true, enum: ['approve', 'review', 'decline'] },
      confidence: { type: 'number', required: true, min: 0, max: 1 },
      timestamp: { type: 'datetime', required: true }
    }
  },
  ProfitEventSchema_v1: {
    version: '1.0.0',
    fields: {
      event_id: { type: 'string', required: true },
      event_type: { type: 'string', required: true, enum: ['sale', 'refund', 'chargeback', 'cost', 'fee'] },
      order_id: { type: 'string', required: false },
      amount: { type: 'number', required: true },
      currency: { type: 'string', required: true },
      category: { type: 'string', required: false },
      timestamp: { type: 'datetime', required: true }
    }
  },
  ChargebackOutcomeSchema_v1: {
    version: '1.0.0',
    fields: {
      chargeback_id: { type: 'string', required: true },
      order_id: { type: 'string', required: true },
      reason_code: { type: 'string', required: true },
      amount: { type: 'number', required: true },
      outcome: { type: 'string', required: true, enum: ['won', 'lost', 'pending'] },
      evidence_submitted: { type: 'boolean', required: true },
      response_deadline: { type: 'datetime', required: false },
      resolved_at: { type: 'datetime', required: false }
    }
  }
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

    if (action === 'validate_data') {
      return await validateDataContract(body);
    } else if (action === 'get_schemas') {
      return await getSchemas();
    } else if (action === 'certify_partner') {
      return await certifyPartner(base44, body);
    } else if (action === 'get_modules') {
      return await getModules(base44);
    } else if (action === 'export_documentation') {
      return await exportDocumentation();
    } else if (action === 'enforce_contracts') {
      return await enforceDataContracts(base44);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function validateDataContract(params) {
  const { schema_name, data } = params;
  
  const schema = DATA_CONTRACTS[schema_name];
  if (!schema) {
    return Response.json({ 
      valid: false, 
      error: `Unknown schema: ${schema_name}`,
      available_schemas: Object.keys(DATA_CONTRACTS)
    }, { status: 400 });
  }

  const errors = [];
  const warnings = [];

  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    const value = data[fieldName];
    
    // Required check
    if (fieldDef.required && (value === undefined || value === null)) {
      errors.push({ field: fieldName, error: 'Required field missing' });
      continue;
    }

    if (value !== undefined && value !== null) {
      // Type check
      if (fieldDef.type === 'number' && typeof value !== 'number') {
        errors.push({ field: fieldName, error: `Expected number, got ${typeof value}` });
      }
      if (fieldDef.type === 'string' && typeof value !== 'string') {
        errors.push({ field: fieldName, error: `Expected string, got ${typeof value}` });
      }
      if (fieldDef.type === 'array' && !Array.isArray(value)) {
        errors.push({ field: fieldName, error: `Expected array, got ${typeof value}` });
      }
      if (fieldDef.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push({ field: fieldName, error: `Expected object, got ${typeof value}` });
      }

      // Enum check
      if (fieldDef.enum && !fieldDef.enum.includes(value)) {
        errors.push({ field: fieldName, error: `Value must be one of: ${fieldDef.enum.join(', ')}` });
      }

      // Range check
      if (fieldDef.min !== undefined && value < fieldDef.min) {
        errors.push({ field: fieldName, error: `Value must be >= ${fieldDef.min}` });
      }
      if (fieldDef.max !== undefined && value > fieldDef.max) {
        errors.push({ field: fieldName, error: `Value must be <= ${fieldDef.max}` });
      }
    }
  }

  // Check for unknown fields
  for (const key of Object.keys(data)) {
    if (!schema.fields[key]) {
      warnings.push({ field: key, warning: 'Unknown field not in schema' });
    }
  }

  return Response.json({
    valid: errors.length === 0,
    schema_name,
    schema_version: schema.version,
    errors,
    warnings,
    fields_validated: Object.keys(schema.fields).length
  });
}

async function getSchemas() {
  const schemas = Object.entries(DATA_CONTRACTS).map(([name, schema]) => ({
    name,
    version: schema.version,
    fields: Object.entries(schema.fields).map(([fieldName, def]) => ({
      name: fieldName,
      type: def.type,
      required: def.required,
      enum: def.enum,
      min: def.min,
      max: def.max
    }))
  }));

  return Response.json({ schemas });
}

async function certifyPartner(base44, params) {
  const { partner_name, partner_type, test_data } = params;

  let integration_score = 100;
  let data_standard_adherence = 100;
  let issues_found = [];
  let schemas_validated = [];

  // Test data validation against schemas
  if (test_data) {
    for (const [schemaName, data] of Object.entries(test_data)) {
      const schema = DATA_CONTRACTS[schemaName];
      if (schema) {
        schemas_validated.push(schemaName);
        
        for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
          const value = data[fieldName];
          if (fieldDef.required && (value === undefined || value === null)) {
            integration_score -= 10;
            data_standard_adherence -= 15;
            issues_found.push({
              issue: `Missing required field: ${fieldName} in ${schemaName}`,
              severity: 'high',
              resolved: false
            });
          }
        }
      }
    }
  }

  // Determine certification level
  let certification_level = 'bronze';
  if (data_standard_adherence >= 95 && integration_score >= 90) certification_level = 'platinum';
  else if (data_standard_adherence >= 85 && integration_score >= 80) certification_level = 'gold';
  else if (data_standard_adherence >= 70 && integration_score >= 70) certification_level = 'silver';

  const approved_status = issues_found.filter(i => i.severity === 'high').length === 0 ? 'approved' : 'conditional';

  const certification = await base44.asServiceRole.entities.COSCertification.create({
    partner_name,
    partner_type: partner_type || 'platform',
    integration_score,
    data_standard_adherence,
    security_compliance_score: 80, // Default
    api_quality_score: 85, // Default
    approved_status,
    certification_level,
    schemas_validated,
    issues_found,
    certified_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  return Response.json({
    success: true,
    certification_id: certification.id,
    certification_level,
    approved_status,
    integration_score,
    data_standard_adherence,
    issues_count: issues_found.length
  });
}

async function getModules(base44) {
  const modules = await base44.asServiceRole.entities.COSModule.filter({});
  const certifications = await base44.asServiceRole.entities.COSCertification.filter({});

  return Response.json({
    modules: modules.map(m => ({
      id: m.id,
      name: m.module_name,
      version: m.version,
      type: m.module_type,
      compliance: m.compliance_status,
      scalability: m.scalability_score
    })),
    certifications: certifications.map(c => ({
      id: c.id,
      partner: c.partner_name,
      level: c.certification_level,
      status: c.approved_status,
      score: c.integration_score
    })),
    stats: {
      total_modules: modules.length,
      compliant_modules: modules.filter(m => m.compliance_status === 'compliant').length,
      total_partners: certifications.length,
      certified_partners: certifications.filter(c => c.approved_status === 'approved').length
    }
  });
}

async function exportDocumentation() {
  const docs = {
    title: 'Commerce Data Network Protocol (CDNP) Documentation',
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    schemas: DATA_CONTRACTS,
    integration_guide: {
      overview: 'CDNP provides standardized data contracts for commerce operations.',
      authentication: 'All API requests require OAuth2 bearer token.',
      rate_limits: '1000 requests per minute per integration.',
      endpoints: {
        validate: 'POST /api/cos/validate - Validate data against schema',
        certify: 'POST /api/cos/certify - Request partner certification',
        schemas: 'GET /api/cos/schemas - List available schemas'
      }
    },
    compliance_requirements: {
      data_format: 'All data must conform to specified schemas',
      security: 'TLS 1.2+ required, PCI-DSS compliance for payment data',
      retention: 'Data retention policies must align with GDPR/CCPA'
    }
  };

  return Response.json({ documentation: docs });
}

async function enforceDataContracts(base44) {
  // This would be called periodically to validate existing integrations
  const integrations = await base44.asServiceRole.entities.PlatformIntegration.filter({ status: 'connected' });
  const certifications = await base44.asServiceRole.entities.COSCertification.filter({});

  const enforcement_results = [];

  for (const integration of integrations) {
    const cert = certifications.find(c => 
      c.partner_name?.toLowerCase() === integration.platform?.toLowerCase()
    );

    if (!cert) {
      enforcement_results.push({
        integration_id: integration.id,
        platform: integration.platform,
        status: 'uncertified',
        action: 'requires_certification'
      });
    } else if (cert.approved_status === 'conditional') {
      enforcement_results.push({
        integration_id: integration.id,
        platform: integration.platform,
        status: 'conditional',
        action: 'resolve_issues',
        issues: cert.issues_found?.filter(i => !i.resolved).length || 0
      });
    } else {
      enforcement_results.push({
        integration_id: integration.id,
        platform: integration.platform,
        status: 'compliant',
        action: 'none'
      });
    }
  }

  return Response.json({
    enforcement_results,
    summary: {
      total: integrations.length,
      compliant: enforcement_results.filter(r => r.status === 'compliant').length,
      conditional: enforcement_results.filter(r => r.status === 'conditional').length,
      uncertified: enforcement_results.filter(r => r.status === 'uncertified').length
    }
  });
}