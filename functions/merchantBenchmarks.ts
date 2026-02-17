import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Industry benchmark data (simulated)
const INDUSTRY_BENCHMARKS = {
  ecommerce: {
    gross_margin: { p25: 35, avg: 45, p75: 55 },
    net_margin: { p25: 5, avg: 10, p75: 18 },
    chargeback_rate: { p25: 0.3, avg: 0.6, p75: 1.0 },
    fraud_rate: { p25: 0.5, avg: 1.2, p75: 2.5 },
    refund_rate: { p25: 3, avg: 8, p75: 15 },
    aov: { p25: 45, avg: 75, p75: 120 },
    conversion_rate: { p25: 1.5, avg: 2.5, p75: 4.0 },
    cac: { p25: 15, avg: 35, p75: 60 },
    ltv: { p25: 100, avg: 200, p75: 400 }
  },
  fashion: {
    gross_margin: { p25: 40, avg: 55, p75: 65 },
    net_margin: { p25: 3, avg: 8, p75: 15 },
    refund_rate: { p25: 10, avg: 20, p75: 35 },
    aov: { p25: 60, avg: 95, p75: 150 }
  },
  electronics: {
    gross_margin: { p25: 15, avg: 25, p75: 35 },
    net_margin: { p25: 2, avg: 5, p75: 10 },
    chargeback_rate: { p25: 0.5, avg: 1.0, p75: 2.0 },
    aov: { p25: 100, avg: 200, p75: 400 }
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, tenant_id } = body;

    if (action === 'calculate_benchmarks') {
      return await calculateBenchmarks(base44, tenant_id, body.industry);
    } else if (action === 'get_playbook') {
      return await getPersonalizedPlaybook(base44, tenant_id);
    } else if (action === 'compare_peers') {
      return await compareToPeers(base44, tenant_id);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function calculateBenchmarks(base44, tenantId, industry = 'ecommerce') {
  const tenant = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
  
  const benchmarkData = INDUSTRY_BENCHMARKS[industry] || INDUSTRY_BENCHMARKS.ecommerce;
  
  // Calculate merchant metrics
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalProfit = orders.reduce((sum, o) => sum + (o.profit || 0), 0);
  const totalCost = orders.reduce((sum, o) => sum + (o.cost || 0), 0);
  
  const chargebacks = orders.filter(o => o.chargeback_status === 'lost').length;
  const refunds = orders.filter(o => o.status === 'refunded').length;
  const fraudulent = orders.filter(o => (o.risk_score || 0) > 80).length;
  
  const metrics = {
    gross_margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
    net_margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    chargeback_rate: orders.length > 0 ? (chargebacks / orders.length) * 100 : 0,
    fraud_rate: orders.length > 0 ? (fraudulent / orders.length) * 100 : 0,
    refund_rate: orders.length > 0 ? (refunds / orders.length) * 100 : 0,
    aov: orders.length > 0 ? totalRevenue / orders.length : 0,
    conversion_rate: 2.5 + Math.random() * 2, // Simulated
    cac: 25 + Math.random() * 30, // Simulated
    ltv: (totalRevenue / Math.max(1, new Set(orders.map(o => o.customer_email)).size))
  };

  // Calculate benchmark comparisons
  const comparisons = [];
  const opportunities = [];

  for (const [metricKey, yourValue] of Object.entries(metrics)) {
    const benchmark = benchmarkData[metricKey];
    if (!benchmark) continue;

    const percentile = calculatePercentile(yourValue, benchmark, metricKey);
    const trend = 'stable'; // Would calculate from historical data

    comparisons.push({
      metric: metricKey,
      your_value: yourValue,
      industry_avg: benchmark.avg,
      industry_p25: benchmark.p25,
      industry_p75: benchmark.p75,
      percentile_rank: percentile,
      trend
    });

    // Identify improvement opportunities
    if (percentile < 50) {
      const gapToAvg = benchmark.avg - yourValue;
      const isHigherBetter = !['chargeback_rate', 'fraud_rate', 'refund_rate', 'cac'].includes(metricKey);
      
      if ((isHigherBetter && gapToAvg > 0) || (!isHigherBetter && gapToAvg < 0)) {
        opportunities.push({
          metric: metricKey,
          gap_to_avg: Math.abs(gapToAvg),
          potential_impact: calculateImpact(metricKey, Math.abs(gapToAvg), totalRevenue),
          recommendation: getRecommendation(metricKey, yourValue, benchmark.avg),
          priority: percentile < 25 ? 'high' : 'medium'
        });
      }
    }
  }

  // Calculate overall health score
  const healthScore = comparisons.reduce((sum, c) => sum + c.percentile_rank, 0) / comparisons.length;

  // Determine size tier
  const sizeTier = totalRevenue < 10000 ? 'micro' : 
                   totalRevenue < 100000 ? 'small' : 
                   totalRevenue < 1000000 ? 'medium' : 
                   totalRevenue < 10000000 ? 'large' : 'enterprise';

  const benchmarkRecord = {
    tenant_id: tenantId,
    industry,
    size_tier: sizeTier,
    period: new Date().toISOString().slice(0, 7),
    metrics,
    benchmark_comparisons: comparisons,
    improvement_opportunities: opportunities.sort((a, b) => b.potential_impact - a.potential_impact),
    overall_health_score: healthScore,
    peer_group_size: 150 + Math.floor(Math.random() * 100)
  };

  // Upsert
  const existing = await base44.asServiceRole.entities.MerchantBenchmark.filter({ tenant_id: tenantId });
  if (existing.length > 0) {
    await base44.asServiceRole.entities.MerchantBenchmark.update(existing[0].id, benchmarkRecord);
  } else {
    await base44.asServiceRole.entities.MerchantBenchmark.create(benchmarkRecord);
  }

  return Response.json({
    success: true,
    benchmark_summary: {
      health_score: healthScore,
      industry,
      size_tier: sizeTier,
      peer_group_size: benchmarkRecord.peer_group_size,
      top_opportunities: opportunities.slice(0, 5),
      metrics_above_avg: comparisons.filter(c => c.percentile_rank >= 50).length,
      metrics_below_avg: comparisons.filter(c => c.percentile_rank < 50).length
    },
    comparisons: comparisons.sort((a, b) => a.percentile_rank - b.percentile_rank)
  });
}

function calculatePercentile(value, benchmark, metric) {
  const isHigherBetter = !['chargeback_rate', 'fraud_rate', 'refund_rate', 'cac'].includes(metric);
  
  if (isHigherBetter) {
    if (value >= benchmark.p75) return 75 + (value - benchmark.p75) / (benchmark.p75 - benchmark.avg) * 25;
    if (value >= benchmark.avg) return 50 + (value - benchmark.avg) / (benchmark.p75 - benchmark.avg) * 25;
    if (value >= benchmark.p25) return 25 + (value - benchmark.p25) / (benchmark.avg - benchmark.p25) * 25;
    return Math.max(0, 25 * value / benchmark.p25);
  } else {
    if (value <= benchmark.p25) return 75 + (benchmark.p25 - value) / benchmark.p25 * 25;
    if (value <= benchmark.avg) return 50 + (benchmark.avg - value) / (benchmark.avg - benchmark.p25) * 25;
    if (value <= benchmark.p75) return 25 + (benchmark.p75 - value) / (benchmark.p75 - benchmark.avg) * 25;
    return Math.max(0, 25 * (1 - (value - benchmark.p75) / benchmark.p75));
  }
}

function calculateImpact(metric, gap, revenue) {
  switch (metric) {
    case 'gross_margin':
    case 'net_margin':
      return revenue * (gap / 100);
    case 'chargeback_rate':
    case 'fraud_rate':
      return revenue * (gap / 100) * 0.5;
    case 'aov':
      return gap * 100; // Assume 100 orders
    case 'conversion_rate':
      return revenue * (gap / 100) * 2;
    default:
      return gap * 10;
  }
}

function getRecommendation(metric, yourValue, avgValue) {
  const recommendations = {
    gross_margin: 'Review supplier costs and negotiate better terms. Consider value-based pricing.',
    net_margin: 'Reduce operational overhead. Optimize shipping and fulfillment costs.',
    chargeback_rate: 'Implement better fraud detection. Improve order confirmation and communication.',
    fraud_rate: 'Enable advanced risk scoring. Review and update risk rules.',
    refund_rate: 'Improve product descriptions and images. Enhance quality control.',
    aov: 'Implement cross-selling and upselling. Create bundle offers.',
    conversion_rate: 'Optimize checkout flow. Reduce friction and improve trust signals.',
    cac: 'Improve targeting. Focus on high-converting channels.',
    ltv: 'Implement retention campaigns. Launch loyalty program.'
  };
  return recommendations[metric] || 'Analyze this metric and identify improvement areas.';
}

async function getPersonalizedPlaybook(base44, tenantId) {
  const benchmarks = await base44.asServiceRole.entities.MerchantBenchmark.filter({ tenant_id: tenantId });
  if (benchmarks.length === 0) {
    return Response.json({ error: 'Run benchmark calculation first' }, { status: 404 });
  }

  const benchmark = benchmarks[0];
  const playbook = {
    tenant_id: tenantId,
    industry: benchmark.industry,
    health_score: benchmark.overall_health_score,
    priority_actions: (benchmark.improvement_opportunities || []).slice(0, 5).map(opp => ({
      action: opp.recommendation,
      metric: opp.metric,
      potential_impact: opp.potential_impact,
      priority: opp.priority,
      estimated_effort: opp.priority === 'high' ? 'medium' : 'low'
    })),
    quick_wins: (benchmark.improvement_opportunities || [])
      .filter(o => o.priority === 'medium' && o.potential_impact > 100)
      .slice(0, 3),
    strengths: (benchmark.benchmark_comparisons || [])
      .filter(c => c.percentile_rank >= 75)
      .map(c => ({ metric: c.metric, percentile: c.percentile_rank }))
  };

  return Response.json({ playbook });
}

async function compareToPeers(base44, tenantId) {
  const benchmarks = await base44.asServiceRole.entities.MerchantBenchmark.filter({ tenant_id: tenantId });
  if (benchmarks.length === 0) {
    return Response.json({ error: 'Run benchmark calculation first' }, { status: 404 });
  }

  const benchmark = benchmarks[0];
  
  return Response.json({
    peer_comparison: {
      your_health_score: benchmark.overall_health_score,
      peer_group_size: benchmark.peer_group_size,
      industry: benchmark.industry,
      size_tier: benchmark.size_tier,
      ranking: Math.floor(benchmark.peer_group_size * (1 - benchmark.overall_health_score / 100)),
      percentile: benchmark.overall_health_score,
      metrics: (benchmark.benchmark_comparisons || []).map(c => ({
        metric: c.metric,
        your_value: c.your_value,
        peer_avg: c.industry_avg,
        vs_peers: c.your_value - c.industry_avg,
        percentile: c.percentile_rank
      }))
    }
  });
}