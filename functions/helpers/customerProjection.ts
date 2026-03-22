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

export async function upsertProjectedCustomer(db: any, tenantId: string, order: any) {
  if (!db?.entities?.Customer || !tenantId || !order) return null;

  const { email, name } = projectedCustomerIdentity(order);
  const existing = await db.entities.Customer.filter({ tenant_id: tenantId, email }, '-updated_date', 1).catch(() => []);
  const current = existing?.[0] || null;

  const totalOrders = Number(current?.total_orders || 0) || 0;
  const totalSpent = Number(current?.total_spent || 0) || 0;
  const totalProfit = Number(current?.total_profit || 0) || 0;
  const refundCount = Number(current?.refund_count || 0) || 0;
  const highRiskOrders = Number(current?.high_risk_orders || 0) || 0;

  const orderRevenue = Number(order?.total_revenue || 0) || 0;
  const orderProfit = Number(order?.net_profit || 0) || 0;
  const nextTotalOrders = current ? totalOrders : totalOrders + 1;
  const nextTotalSpent = current ? totalSpent : totalSpent + orderRevenue;
  const nextTotalProfit = current ? totalProfit : totalProfit + orderProfit;
  const nextRefundCount = current ? refundCount : refundCount + (String(order?.status || '').toLowerCase().includes('refund') ? 1 : 0);
  const nextHighRiskOrders = current ? highRiskOrders : highRiskOrders + ((String(order?.risk_level || '').toLowerCase() === 'high' || Number(order?.fraud_score || 0) >= 70) ? 1 : 0);

  const latestOrderAt = order?.order_date || current?.last_order_at || null;
  const payload = {
    tenant_id: tenantId,
    email,
    name,
    total_orders: nextTotalOrders,
    total_spent: nextTotalSpent,
    total_profit: nextTotalProfit,
    avg_order_value: nextTotalOrders > 0 ? nextTotalSpent / nextTotalOrders : 0,
    refund_count: nextRefundCount,
    high_risk_orders: nextHighRiskOrders,
    last_order_at: latestOrderAt,
    risk_profile: projectedRiskProfile(nextTotalOrders, nextHighRiskOrders)
  };

  if (current?.id) {
    return await db.entities.Customer.update(current.id, payload).catch(() => null);
  }
  return await db.entities.Customer.create(payload).catch(() => null);
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
    const existing = await db.entities.Customer.filter({ tenant_id: tenantId, email: customer.email }, '-updated_date', 1).catch(() => []);
    const payload = {
      tenant_id: tenantId,
      email: customer.email,
      name: customer.name,
      total_orders: customer.total_orders,
      total_spent: customer.total_spent,
      total_profit: customer.total_profit,
      avg_order_value: customer.total_orders > 0 ? customer.total_spent / customer.total_orders : 0,
      refund_count: customer.refund_count,
      high_risk_orders: customer.high_risk_orders,
      last_order_at: customer.last_order_at,
      risk_profile: projectedRiskProfile(customer.total_orders, customer.high_risk_orders)
    };
    if (existing?.[0]?.id) {
      await db.entities.Customer.update(existing[0].id, payload).catch(() => {});
      updated++;
    } else {
      await db.entities.Customer.create(payload).catch(() => {});
      created++;
    }
  }

  return { created, updated, projected: groups.size };
}
