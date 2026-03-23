import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action } = body;

    if (action === 'create_agency') {
      return await createAgency(base44, body);
    } else if (action === 'add_client') {
      return await addClient(base44, body);
    } else if (action === 'get_agency_dashboard') {
      return await getAgencyDashboard(base44, body.agency_id);
    } else if (action === 'update_branding') {
      return await updateBranding(base44, body.agency_id, body.branding);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function createAgency(base44, data) {
  const agency = await base44.asServiceRole.entities.AgencyAccount.create({
    agency_id: `AGENCY-${Date.now()}`,
    agency_name: data.agency_name,
    white_label_config: data.branding || {
      brand_name: data.agency_name,
      primary_color: '#10b981',
      secondary_color: '#0d9488',
      support_email: data.support_email
    },
    managed_tenants: [],
    permissions: {
      can_manage_billing: true,
      can_view_all_data: true,
      can_configure_rules: true,
      can_export_reports: true
    },
    billing: {
      billing_model: 'revenue_share',
      commission_rate: 20,
      monthly_minimum: 0,
      current_mrr: 0
    },
    total_managed_revenue: 0,
    total_orders_managed: 0,
    status: 'active'
  });

  return Response.json({
    success: true,
    agency_id: agency.agency_id,
    agency_name: agency.agency_name
  });
}

async function addClient(base44, data) {
  const { agency_id, tenant_id, client_name, billing_type } = data;

  const agencies = await base44.asServiceRole.entities.AgencyAccount.filter({ agency_id });
  if (agencies.length === 0) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const agency = agencies[0];
  const managedTenants = agency.managed_tenants || [];

  // Check if already managed
  if (managedTenants.some(t => t.tenant_id === tenant_id)) {
    return Response.json({ error: 'Client already managed by this agency' }, { status: 400 });
  }

  managedTenants.push({
    tenant_id,
    client_name,
    added_at: new Date().toISOString(),
    status: 'active',
    billing_type: billing_type || 'included'
  });

  await base44.asServiceRole.entities.AgencyAccount.update(agency.id, {
    managed_tenants: managedTenants
  });

  return Response.json({
    success: true,
    agency_id,
    clients_count: managedTenants.length
  });
}

async function getAgencyDashboard(base44, agencyId) {
  const agencies = await base44.asServiceRole.entities.AgencyAccount.filter({ agency_id: agencyId });
  if (agencies.length === 0) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  const agency = agencies[0];
  const clientStats = [];
  let totalRevenue = 0, totalOrders = 0, totalMRR = 0;

  for (const client of agency.managed_tenants || []) {
    const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: client.tenant_id });
    const tenant = await base44.asServiceRole.entities.Tenant.filter({ id: client.tenant_id });
    
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const mrr = tenant[0]?.subscription_tier === 'pro' ? 299 : 
                tenant[0]?.subscription_tier === 'growth' ? 99 : 29;

    clientStats.push({
      client_name: client.client_name,
      tenant_id: client.tenant_id,
      status: client.status,
      revenue,
      orders: orders.length,
      mrr,
      added_at: client.added_at
    });

    totalRevenue += revenue;
    totalOrders += orders.length;
    totalMRR += mrr;
  }

  // Update agency totals
  await base44.asServiceRole.entities.AgencyAccount.update(agency.id, {
    total_managed_revenue: totalRevenue,
    total_orders_managed: totalOrders,
    billing: {
      ...agency.billing,
      current_mrr: totalMRR
    }
  });

  return Response.json({
    agency_dashboard: {
      agency_name: agency.agency_name,
      branding: agency.white_label_config,
      total_clients: clientStats.length,
      total_revenue: totalRevenue,
      total_orders: totalOrders,
      total_mrr: totalMRR,
      commission_earned: totalMRR * (agency.billing?.commission_rate || 20) / 100,
      clients: clientStats.sort((a, b) => b.revenue - a.revenue),
      permissions: agency.permissions
    }
  });
}

async function updateBranding(base44, agencyId, branding) {
  const agencies = await base44.asServiceRole.entities.AgencyAccount.filter({ agency_id: agencyId });
  if (agencies.length === 0) {
    return Response.json({ error: 'Agency not found' }, { status: 404 });
  }

  await base44.asServiceRole.entities.AgencyAccount.update(agencies[0].id, {
    white_label_config: {
      ...agencies[0].white_label_config,
      ...branding
    }
  });

  return Response.json({ success: true, branding });
}