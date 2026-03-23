import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action, tenant_id, segment } = await req.json();

    switch (action) {
      case 'generate_benchmarks': {
        // Admin only - generate anonymized industry benchmarks
        if (user.role !== 'admin') {
          return Response.json({ error: 'Admin access required' }, { status: 403 });
        }

        // Get all tenants with sufficient data
        const allTenants = await base44.asServiceRole.entities.Tenant.filter({ status: 'active' });
        
        // Group by segment/industry
        const segmentData = {};
        
        for (const tenant of allTenants) {
          const orders = await base44.asServiceRole.entities.Order.filter({ 
            tenant_id: tenant.id 
          }, '-order_date', 500);

          if (orders.length < 10) continue; // Minimum sample size

          const tenantSegment = tenant.settings?.industry || 'general';
          
          if (!segmentData[tenantSegment]) {
            segmentData[tenantSegment] = {
              margins: [],
              discountRates: [],
              refundRates: [],
              riskScores: [],
              orderValues: [],
              tenantCount: 0
            };
          }

          // Calculate tenant metrics (anonymized)
          const totalRevenue = orders.reduce((s, o) => s + (o.total_revenue || 0), 0);
          const totalProfit = orders.reduce((s, o) => s + (o.net_profit || 0), 0);
          const totalDiscounts = orders.reduce((s, o) => s + (o.discount_total || 0), 0);
          const refundedOrders = orders.filter(o => o.status === 'refunded' || o.status === 'partially_refunded').length;
          const avgRiskScore = orders.reduce((s, o) => s + (o.fraud_score || 0), 0) / orders.length;
          const avgOrderValue = totalRevenue / orders.length;

          segmentData[tenantSegment].margins.push(totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0);
          segmentData[tenantSegment].discountRates.push(totalRevenue > 0 ? (totalDiscounts / totalRevenue) * 100 : 0);
          segmentData[tenantSegment].refundRates.push((refundedOrders / orders.length) * 100);
          segmentData[tenantSegment].riskScores.push(avgRiskScore);
          segmentData[tenantSegment].orderValues.push(avgOrderValue);
          segmentData[tenantSegment].tenantCount++;
        }

        // Generate benchmark records
        const period = new Date().toISOString().slice(0, 7); // YYYY-MM
        const benchmarks = [];

        for (const [seg, data] of Object.entries(segmentData)) {
          if (data.tenantCount < 5) continue; // Minimum 5 tenants for privacy

          const sortedMargins = [...data.margins].sort((a, b) => a - b);
          
          const benchmark = {
            segment: seg,
            period,
            period_type: 'monthly',
            sample_size: data.tenantCount,
            metrics: {
              avg_margin_pct: average(data.margins),
              median_margin_pct: median(sortedMargins),
              p25_margin_pct: percentile(sortedMargins, 25),
              p75_margin_pct: percentile(sortedMargins, 75),
              avg_discount_rate: average(data.discountRates),
              avg_refund_rate: average(data.refundRates),
              avg_risk_score: average(data.riskScores),
              avg_order_value: average(data.orderValues)
            },
            risk_index: calculateRiskIndex(data),
            is_published: true
          };

          await base44.asServiceRole.entities.IndustryBenchmark.create(benchmark);
          benchmarks.push(benchmark);
        }

        return Response.json({ success: true, benchmarks_created: benchmarks.length });
      }

      case 'get_tenant_comparison': {
        if (!tenant_id) {
          return Response.json({ error: 'tenant_id required' }, { status: 400 });
        }

        // Get tenant's segment
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
        if (tenants.length === 0) {
          return Response.json({ error: 'Tenant not found' }, { status: 404 });
        }

        const tenantSegment = tenants[0].settings?.industry || 'general';

        // Get latest benchmark for segment
        const benchmarks = await base44.asServiceRole.entities.IndustryBenchmark.filter({
          segment: tenantSegment,
          is_published: true
        }, '-period', 1);

        if (benchmarks.length === 0) {
          return Response.json({ 
            success: true, 
            comparison: null, 
            message: 'No benchmark data available for segment' 
          });
        }

        const benchmark = benchmarks[0];

        // Calculate tenant's current metrics
        const orders = await base44.asServiceRole.entities.Order.filter({ 
          tenant_id 
        }, '-order_date', 500);

        const totalRevenue = orders.reduce((s, o) => s + (o.total_revenue || 0), 0);
        const totalProfit = orders.reduce((s, o) => s + (o.net_profit || 0), 0);
        const tenantMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        // Calculate percentile rank
        const percentileRank = calculatePercentileRank(tenantMargin, benchmark.metrics.avg_margin_pct, benchmark.metrics.p25_margin_pct, benchmark.metrics.p75_margin_pct);

        return Response.json({
          success: true,
          comparison: {
            segment: tenantSegment,
            tenant_margin: tenantMargin,
            benchmark_avg_margin: benchmark.metrics.avg_margin_pct,
            benchmark_median_margin: benchmark.metrics.median_margin_pct,
            percentile_rank: percentileRank,
            outperforms_pct: percentileRank,
            risk_index: benchmark.risk_index,
            sample_size: benchmark.sample_size,
            period: benchmark.period
          }
        });
      }

      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Benchmark engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateRiskIndex(data) {
  // Composite risk index (0-100, higher = more risk in segment)
  const avgRisk = average(data.riskScores);
  const avgRefund = average(data.refundRates);
  const avgDiscount = average(data.discountRates);
  
  return Math.min(100, Math.round(
    (avgRisk * 0.5) + (avgRefund * 2) + (avgDiscount * 0.5)
  ));
}

function calculatePercentileRank(value, avg, p25, p75) {
  // Estimate percentile based on value relative to benchmarks
  if (value >= p75) return Math.min(95, 75 + ((value - p75) / (p75 - avg)) * 20);
  if (value >= avg) return 50 + ((value - avg) / (p75 - avg)) * 25;
  if (value >= p25) return 25 + ((value - p25) / (avg - p25)) * 25;
  return Math.max(5, 25 - ((p25 - value) / p25) * 20);
}