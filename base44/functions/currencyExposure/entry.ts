import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Simulated FX rates (in production, would fetch from API)
const FX_RATES = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
  MXN: 17.2,
  BRL: 4.97
};

const FX_VOLATILITY = {
  EUR: 0.05,
  GBP: 0.07,
  CAD: 0.04,
  AUD: 0.08,
  JPY: 0.06,
  MXN: 0.12,
  BRL: 0.15
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

    if (action === 'analyze_exposure') {
      return await analyzeExposure(base44, tenant_id);
    } else if (action === 'get_hedging_recommendations') {
      return await getHedgingRecommendations(base44, tenant_id);
    } else if (action === 'get_fx_dashboard') {
      return await getFXDashboard(base44, tenant_id);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function analyzeExposure(base44, tenantId) {
  const orders = await base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId });
  
  // Group orders by currency
  const currencyBreakdown = {};
  for (const order of orders) {
    const currency = order.currency || 'USD';
    currencyBreakdown[currency] = currencyBreakdown[currency] || { revenue: 0, orders: 0 };
    currencyBreakdown[currency].revenue += order.total || 0;
    currencyBreakdown[currency].orders++;
  }

  const totalRevenue = Object.values(currencyBreakdown).reduce((sum, c) => sum + c.revenue, 0);
  const baseCurrency = 'USD';

  // Calculate exposures
  const exposures = [];
  let totalFXGainLoss = 0;
  let atRiskAmount = 0;

  for (const [currency, data] of Object.entries(currencyBreakdown)) {
    if (currency === baseCurrency) continue;

    const rate = FX_RATES[currency] || 1;
    const revenueBase = data.revenue / rate;
    const exposurePct = (data.revenue / totalRevenue) * 100;
    const volatility = FX_VOLATILITY[currency] || 0.05;
    const valueAtRisk = revenueBase * volatility;

    // Simulate FX gain/loss (random for demo)
    const fxChange = (Math.random() - 0.5) * volatility;
    const gainLoss = revenueBase * fxChange;
    totalFXGainLoss += gainLoss;
    atRiskAmount += valueAtRisk;

    let hedgingRec = 'none';
    if (exposurePct > 20 && volatility > 0.08) {
      hedgingRec = 'forward_contract';
    } else if (exposurePct > 10 && volatility > 0.05) {
      hedgingRec = 'options';
    } else if (exposurePct > 5) {
      hedgingRec = 'natural_hedge';
    }

    exposures.push({
      currency,
      revenue_local: data.revenue,
      revenue_base: revenueBase,
      exchange_rate: rate,
      exposure_percentage: exposurePct,
      volatility_30d: volatility * 100,
      hedging_recommendation: hedgingRec
    });
  }

  // Calculate hedging recommendations
  const recommendedHedges = exposures
    .filter(e => e.hedging_recommendation !== 'none')
    .map(e => ({
      currency_pair: `USD/${e.currency}`,
      hedge_type: e.hedging_recommendation,
      amount: e.revenue_base,
      cost_estimate: e.revenue_base * 0.005 // 0.5% hedging cost estimate
    }));

  const exposureData = {
    tenant_id: tenantId,
    base_currency: baseCurrency,
    period: new Date().toISOString().slice(0, 7),
    exposures,
    total_fx_gain_loss: totalFXGainLoss,
    at_risk_amount: atRiskAmount,
    hedging_status: recommendedHedges.length > 3 ? 'none' : recommendedHedges.length > 0 ? 'partial' : 'full',
    recommended_hedges: recommendedHedges
  };

  // Upsert exposure record
  const existing = await base44.asServiceRole.entities.CurrencyExposure.filter({ tenant_id: tenantId });
  if (existing.length > 0) {
    await base44.asServiceRole.entities.CurrencyExposure.update(existing[0].id, exposureData);
  } else {
    await base44.asServiceRole.entities.CurrencyExposure.create(exposureData);
  }

  return Response.json({
    success: true,
    exposure_analysis: {
      total_revenue: totalRevenue,
      currencies_count: Object.keys(currencyBreakdown).length,
      fx_gain_loss: totalFXGainLoss,
      value_at_risk: atRiskAmount,
      exposures: exposures.sort((a, b) => b.exposure_percentage - a.exposure_percentage),
      hedging_recommendations: recommendedHedges.length,
      estimated_hedging_cost: recommendedHedges.reduce((sum, h) => sum + h.cost_estimate, 0)
    }
  });
}

async function getHedgingRecommendations(base44, tenantId) {
  const exposures = await base44.asServiceRole.entities.CurrencyExposure.filter({ tenant_id: tenantId });
  if (exposures.length === 0) {
    return Response.json({ error: 'No exposure data found. Run analysis first.' }, { status: 404 });
  }

  const exposure = exposures[0];

  return Response.json({
    hedging_recommendations: {
      status: exposure.hedging_status,
      value_at_risk: exposure.at_risk_amount,
      recommended_hedges: exposure.recommended_hedges,
      total_hedging_cost: (exposure.recommended_hedges || []).reduce((sum, h) => sum + h.cost_estimate, 0),
      risk_reduction_potential: exposure.at_risk_amount * 0.7 // Assumes 70% risk reduction with hedging
    }
  });
}

async function getFXDashboard(base44, tenantId) {
  const filter = tenantId ? { tenant_id: tenantId } : {};
  const exposures = await base44.asServiceRole.entities.CurrencyExposure.filter(filter);

  const aggregated = {
    total_value_at_risk: 0,
    total_fx_gain_loss: 0,
    currencies_exposed: new Set(),
    tenants_analyzed: exposures.length
  };

  for (const exp of exposures) {
    aggregated.total_value_at_risk += exp.at_risk_amount || 0;
    aggregated.total_fx_gain_loss += exp.total_fx_gain_loss || 0;
    (exp.exposures || []).forEach(e => aggregated.currencies_exposed.add(e.currency));
  }

  return Response.json({
    fx_dashboard: {
      ...aggregated,
      currencies_exposed: Array.from(aggregated.currencies_exposed),
      current_rates: FX_RATES,
      market_status: Math.abs(aggregated.total_fx_gain_loss) < 1000 ? 'stable' : 
                     aggregated.total_fx_gain_loss > 0 ? 'favorable' : 'unfavorable'
    }
  });
}