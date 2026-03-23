import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, tenant_id } = body;

    if (action === 'analyze_pricing') {
      return await analyzePricing(base44, tenant_id);
    } else if (action === 'get_recommendations') {
      return await getPricingRecommendations(base44, tenant_id);
    } else if (action === 'start_ab_test') {
      return await startPricingABTest(base44, body.product_id, body.test_price);
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function analyzePricing(base44, tenantId) {
  const products = await base44.asServiceRole.entities.Product.filter({ tenant_id: tenantId });
  const pricingAnalysis = [];

  for (const product of products.slice(0, 50)) {
    // Simulate competitor pricing data
    const competitorPrices = generateCompetitorPrices(product.price || 0);
    const avgCompetitorPrice = competitorPrices.reduce((sum, c) => sum + c.price, 0) / competitorPrices.length;
    
    // Calculate market position
    const position = product.price < avgCompetitorPrice * 0.9 ? 'lowest' :
                    product.price < avgCompetitorPrice * 0.98 ? 'below_avg' :
                    product.price < avgCompetitorPrice * 1.02 ? 'average' :
                    product.price < avgCompetitorPrice * 1.1 ? 'above_avg' : 'highest';

    // Calculate price elasticity (simulated)
    const elasticityScore = 30 + Math.floor(Math.random() * 50);
    
    // Calculate optimization opportunity
    const optimalPrice = calculateOptimalPrice(product.price, product.cost || 0, competitorPrices, elasticityScore);
    const currentMargin = product.cost ? ((product.price - product.cost) / product.price) * 100 : 0;
    const optimalMargin = product.cost ? ((optimalPrice - product.cost) / optimalPrice) * 100 : 0;
    const opportunity = (optimalMargin - currentMargin) * (product.inventory_quantity || 10);

    const pricingData = {
      tenant_id: tenantId,
      product_id: product.id,
      product_sku: product.sku,
      product_name: product.title,
      current_price: product.price,
      cost: product.cost || product.price * 0.6,
      current_margin: currentMargin,
      competitor_prices: competitorPrices,
      market_position: position,
      recommended_price: optimalPrice,
      price_elasticity_score: elasticityScore,
      optimization_opportunity: Math.max(0, opportunity)
    };

    // Upsert pricing analysis
    const existing = await base44.asServiceRole.entities.CompetitivePricing.filter({ 
      tenant_id: tenantId, 
      product_id: product.id 
    });

    if (existing.length > 0) {
      await base44.asServiceRole.entities.CompetitivePricing.update(existing[0].id, pricingData);
    } else {
      await base44.asServiceRole.entities.CompetitivePricing.create(pricingData);
    }

    pricingAnalysis.push({
      product_id: product.id,
      product_name: product.title,
      current_price: product.price,
      recommended_price: optimalPrice,
      opportunity: opportunity,
      position: position
    });
  }

  const totalOpportunity = pricingAnalysis.reduce((sum, p) => sum + (p.opportunity || 0), 0);

  return Response.json({
    success: true,
    products_analyzed: pricingAnalysis.length,
    total_optimization_opportunity: totalOpportunity,
    position_breakdown: {
      lowest: pricingAnalysis.filter(p => p.position === 'lowest').length,
      below_avg: pricingAnalysis.filter(p => p.position === 'below_avg').length,
      average: pricingAnalysis.filter(p => p.position === 'average').length,
      above_avg: pricingAnalysis.filter(p => p.position === 'above_avg').length,
      highest: pricingAnalysis.filter(p => p.position === 'highest').length
    },
    top_opportunities: pricingAnalysis
      .sort((a, b) => b.opportunity - a.opportunity)
      .slice(0, 10)
  });
}

function generateCompetitorPrices(basePrice) {
  const competitors = ['Amazon', 'Walmart', 'Target', 'eBay', 'Best Buy'];
  return competitors.map(name => ({
    competitor: name,
    price: basePrice * (0.85 + Math.random() * 0.3),
    url: `https://${name.toLowerCase().replace(' ', '')}.com/product`,
    last_checked: new Date().toISOString(),
    in_stock: Math.random() > 0.2
  }));
}

function calculateOptimalPrice(currentPrice, cost, competitorPrices, elasticity) {
  const avgCompetitor = competitorPrices.reduce((sum, c) => sum + c.price, 0) / competitorPrices.length;
  const minMarginPrice = cost * 1.2; // 20% minimum margin
  
  // Higher elasticity = more price sensitive = price closer to competitors
  const elasticityFactor = elasticity / 100;
  const targetPrice = currentPrice * (1 - elasticityFactor * 0.1) + avgCompetitor * elasticityFactor * 0.1;
  
  return Math.max(minMarginPrice, targetPrice);
}

async function getPricingRecommendations(base44, tenantId) {
  const pricing = await base44.asServiceRole.entities.CompetitivePricing.filter({ tenant_id: tenantId });
  
  const recommendations = pricing
    .filter(p => p.optimization_opportunity > 10)
    .sort((a, b) => b.optimization_opportunity - a.optimization_opportunity)
    .slice(0, 20);

  return Response.json({
    recommendations: recommendations.map(p => ({
      product_id: p.product_id,
      product_name: p.product_name,
      current_price: p.current_price,
      recommended_price: p.recommended_price,
      price_change: p.recommended_price - p.current_price,
      price_change_pct: ((p.recommended_price - p.current_price) / p.current_price) * 100,
      current_margin: p.current_margin,
      potential_margin: p.cost ? ((p.recommended_price - p.cost) / p.recommended_price) * 100 : 0,
      opportunity: p.optimization_opportunity,
      market_position: p.market_position,
      elasticity: p.price_elasticity_score
    })),
    summary: {
      total_products: pricing.length,
      products_with_opportunity: recommendations.length,
      total_opportunity: recommendations.reduce((sum, p) => sum + p.optimization_opportunity, 0)
    }
  });
}

async function startPricingABTest(base44, productId, testPrice) {
  const pricingRecords = await base44.asServiceRole.entities.CompetitivePricing.filter({ product_id: productId });
  if (pricingRecords.length === 0) {
    return Response.json({ error: 'Product pricing not found' }, { status: 404 });
  }

  const pricing = pricingRecords[0];
  
  // Create A/B test experiment
  const experiment = await base44.asServiceRole.entities.PricingExperiment.create({
    tenant_id: pricing.tenant_id,
    experiment_name: `Price Test: ${pricing.product_name}`,
    product_id: productId,
    control_price: pricing.current_price,
    variant_price: testPrice,
    traffic_split: 50,
    status: 'running',
    started_at: new Date().toISOString(),
    metrics: {
      control_conversions: 0,
      variant_conversions: 0,
      control_revenue: 0,
      variant_revenue: 0
    }
  });

  await base44.asServiceRole.entities.CompetitivePricing.update(pricing.id, {
    ab_test_active: true,
    ab_test_id: experiment.id
  });

  return Response.json({
    success: true,
    experiment_id: experiment.id,
    product_id: productId,
    control_price: pricing.current_price,
    variant_price: testPrice,
    traffic_split: 50
  });
}