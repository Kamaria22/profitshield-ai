function normalizeEmail(value?: string | null): string | null {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function normalizeName(value?: string | null): string | null {
  const name = String(value || '').trim();
  return name || null;
}

function syntheticGuestEmail(order: any): string {
  const name = normalizeName(order?.customer_name || order?.shipping_address?.name || order?.billing_address?.name);
  if (name) {
    return `guest_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}@guest.local`;
  }
  const platformOrderId = String(order?.platform_order_id || order?.id || crypto.randomUUID());
  return `guest_${platformOrderId.toLowerCase()}@guest.local`;
}

function projectedCustomerIdentity(order: any) {
  const email = normalizeEmail(order?.customer_email || order?.email) || syntheticGuestEmail(order);
  const name = normalizeName(order?.customer_name) || normalizeName(order?.shipping_address?.name) || 'Guest Customer';
  return { email, name };
}

function projectedRiskProfile(totalOrders: number, highRiskOrders: number) {
  const highRiskRatio = totalOrders > 0 ? highRiskOrders / totalOrders : 0;
  if (highRiskRatio >= 0.35) return 'high';
  if (highRiskRatio >= 0.15) return 'medium';
  return 'low';
}

function splitName(name?: string | null) {
  const normalized = normalizeName(name) || '';
  if (!normalized) return { firstName: 'Guest', lastName: 'Customer' };
  const [firstName, ...rest] = normalized.split(/\s+/);
  return {
    firstName: firstName || 'Guest',
    lastName: rest.join(' ') || 'Customer',
  };
}

function buildCustomerPayload(tenantId: string, email: string, name: string, metrics: {
  totalOrders: number;
  totalSpent: number;
  totalProfit: number;
  refundCount: number;
  highRiskOrders: number;
  lastOrderAt?: string | null;
}) {
  const { firstName, lastName } = splitName(name);
  const totalOrders = Math.max(0, Number(metrics.totalOrders) || 0);
  const totalSpent = Number(metrics.totalSpent) || 0;
  const totalProfit = Number(metrics.totalProfit) || 0;
  const refundCount = Math.max(0, Number(metrics.refundCount) || 0);
  const highRiskOrders = Math.max(0, Number(metrics.highRiskOrders) || 0);
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
  const riskProfile = projectedRiskProfile(totalOrders, highRiskOrders);
  const riskScore = totalOrders > 0 ? Math.min(100, Math.round((highRiskOrders / totalOrders) * 100)) : 0;

  return {
    tenant_id: tenantId,
    email,
    name,
    first_name: firstName,
    last_name: lastName,
    total_orders: totalOrders,
    orders_count: totalOrders,
    total_spent: totalSpent,
    total_profit: totalProfit,
    ltv: totalSpent,
    avg_order_value: avgOrderValue,
    refund_count: refundCount,
    high_risk_orders: highRiskOrders,
    risk_profile: riskProfile,
    risk_score: riskScore,
    last_order_at: metrics.lastOrderAt || null,
  };
}

async function loadExistingCustomer(db: any, tenantId: string, email: string) {
  const byUpdated = await db.entities.Customer.filter({ tenant_id: tenantId, email }, '-updated_date', 1).catch(() => []);
  if (byUpdated?.[0]) return byUpdated[0];
  const byCreated = await db.entities.Customer.filter({ tenant_id: tenantId, email }, '-created_date', 1).catch(() => []);
  return byCreated?.[0] || null;
}

async function writeProjectedCustomer(db: any, current: any, payload: Record<string, any>) {
  try {
    const action = current?.id ? 'update' : 'create';
    const result = current?.id
      ? await db.entities.Customer.update(current.id, payload)
      : await db.entities.Customer.create(payload);

    if (!result || (!result?.id && action === 'create')) {
      throw new Error(`customer_projection_${action}_returned_empty`);
    }

    if (current?.id && String(result?.id || current.id) !== String(current.id)) {
      throw new Error('customer_projection_update_mismatched_id');
    }

    return result;
  } catch (error) {
    const message = String(error?.message || error || 'customer_projection_write_failed');
    console.error('[customerProjection] persistence failed', {
      customerId: current?.id || null,
      tenant_id: payload?.tenant_id,
      email: payload?.email,
      message,
    });
    throw error;
  }
}

export async function upsertProjectedCustomer(db: any, tenantId: string, order: any) {
  if (!db?.entities?.Customer || !tenantId || !order) return null;

  const { email, name } = projectedCustomerIdentity(order);
  const current = await loadExistingCustomer(db, tenantId, email);

  const totalOrders = Number(current?.total_orders ?? current?.orders_count || 0) || 0;
  const totalSpent = Number(current?.total_spent || 0) || 0;
  const totalProfit = Number(current?.total_profit || 0) || 0;
  const refundCount = Number(current?.refund_count || 0) || 0;
  const highRiskOrders = Number(current?.high_risk_orders || 0) || 0;

  const orderRevenue = Number(order?.total_revenue || 0) || 0;
  const orderProfit = Number(order?.net_profit ?? order?.total_profit || 0) || 0;
  const isRefunded = String(order?.status || '').toLowerCase().includes('refund');
  const isHighRisk = String(order?.risk_level || '').toLowerCase() === 'high' || Number(order?.fraud_score || order?.risk_score || 0) >= 70;
  const candidateOrderAt = order?.order_date || order?.created_date || current?.last_order_at || null;
  const currentLastOrderAt = current?.last_order_at || current?.created_date || null;
  const latestOrderAt = !currentLastOrderAt || (candidateOrderAt && new Date(candidateOrderAt).getTime() >= new Date(currentLastOrderAt).getTime())
    ? candidateOrderAt
    : currentLastOrderAt;

  const payload = buildCustomerPayload(tenantId, email, name, {
    totalOrders: totalOrders + 1,
    totalSpent: totalSpent + orderRevenue,
    totalProfit: totalProfit + orderProfit,
    refundCount: refundCount + (isRefunded ? 1 : 0),
    highRiskOrders: highRiskOrders + (isHighRisk ? 1 : 0),
    lastOrderAt: latestOrderAt,
  });

  return await writeProjectedCustomer(db, current, payload);
}

export async function rebuildProjectedCustomersFromOrders(db: any, tenantId: string, limit = 500) {
  if (!db?.entities?.Customer || !db?.entities?.Order || !tenantId) return { created: 0, updated: 0, projected: 0 };
  const orders = await db.entities.Order.filter({ tenant_id: tenantId }, '-order_date', limit).catch(() => []);
  if (!Array.isArray(orders) || orders.length === 0) return { created: 0, updated: 0, projected: 0 };

  const groups = new Map<string, any>();
  for (const order of orders) {
    const { email, name } = projectedCustomerIdentity(order);
    const current = groups.get(email) || {
      email,
      name,
      total_orders: 0,
      total_spent: 0,
      total_profit: 0,
      refund_count: 0,
      high_risk_orders: 0,
      last_order_at: null,
    };
    current.total_orders += 1;
    current.total_spent += Number(order?.total_revenue || 0) || 0;
    current.total_profit += Number(order?.net_profit || 0) || 0;
    if (String(order?.status || '').toLowerCase().includes('refund')) current.refund_count += 1;
    if (String(order?.risk_level || '').toLowerCase() === 'high' || Number(order?.fraud_score || 0) >= 70) current.high_risk_orders += 1;
    if (!current.last_order_at || new Date(order?.order_date || 0).getTime() > new Date(current.last_order_at || 0).getTime()) {
      current.last_order_at = order?.order_date || current.last_order_at;
    }
    groups.set(email, current);
  }

  let created = 0;
  let updated = 0;
  for (const customer of groups.values()) {
    const existing = await loadExistingCustomer(db, tenantId, customer.email);
    const payload = buildCustomerPayload(tenantId, customer.email, customer.name, {
      totalOrders: customer.total_orders,
      totalSpent: customer.total_spent,
      totalProfit: customer.total_profit,
      refundCount: customer.refund_count,
      highRiskOrders: customer.high_risk_orders,
      lastOrderAt: customer.last_order_at,
    });
    if (existing?.id) {
      await writeProjectedCustomer(db, existing, payload);
      updated++;
    } else {
      await writeProjectedCustomer(db, null, payload);
      created++;
    }
  }

  return { created, updated, projected: groups.size };
}
