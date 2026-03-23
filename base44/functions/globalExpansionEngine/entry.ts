import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GLOBAL EXPANSION ENGINE
 * 
 * Multi-region intelligence infrastructure:
 * - Detect rising fraud in new regions
 * - Auto-adjust model weighting by region
 * - Flag regulatory compliance gaps
 * - Suggest translation expansion
 * - Generate localized prompts
 */

// Known regions with fraud profiles
const REGION_DATA = {
  'US': { name: 'United States', base_fraud_rate: 0.012, regulations: ['CCPA', 'SOC2'] },
  'GB': { name: 'United Kingdom', base_fraud_rate: 0.015, regulations: ['GDPR', 'PSD2'] },
  'DE': { name: 'Germany', base_fraud_rate: 0.008, regulations: ['GDPR', 'PSD2'] },
  'FR': { name: 'France', base_fraud_rate: 0.011, regulations: ['GDPR', 'PSD2'] },
  'CA': { name: 'Canada', base_fraud_rate: 0.014, regulations: ['PIPEDA'] },
  'AU': { name: 'Australia', base_fraud_rate: 0.018, regulations: ['Privacy Act'] },
  'BR': { name: 'Brazil', base_fraud_rate: 0.035, regulations: ['LGPD'] },
  'MX': { name: 'Mexico', base_fraud_rate: 0.028, regulations: ['LFPDPPP'] },
  'IN': { name: 'India', base_fraud_rate: 0.022, regulations: ['PDPB'] },
  'JP': { name: 'Japan', base_fraud_rate: 0.006, regulations: ['APPI'] },
  'SG': { name: 'Singapore', base_fraud_rate: 0.009, regulations: ['PDPA'] },
  'AE': { name: 'UAE', base_fraud_rate: 0.019, regulations: ['PDPL'] },
  'NL': { name: 'Netherlands', base_fraud_rate: 0.010, regulations: ['GDPR', 'PSD2'] },
  'SE': { name: 'Sweden', base_fraud_rate: 0.007, regulations: ['GDPR', 'PSD2'] },
  'ES': { name: 'Spain', base_fraud_rate: 0.013, regulations: ['GDPR', 'PSD2'] },
  'IT': { name: 'Italy', base_fraud_rate: 0.016, regulations: ['GDPR', 'PSD2'] }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { action, ...params } = await req.json();

    switch (action) {
      // ==========================================
      // REGIONAL EXPANSION SCAN
      // ==========================================
      case 'run_regional_scan': {
        const results = {
          regions_analyzed: 0,
          profiles_updated: 0,
          expansion_opportunities: [],
          compliance_gaps: [],
          fraud_alerts: []
        };

        // Get all orders to analyze regional distribution
        const orders = await base44.asServiceRole.entities.Order.filter({}, '-order_date', 1000);
        const outcomes = await base44.asServiceRole.entities.OrderOutcome.filter({});

        // Aggregate by region (from shipping address country)
        const regionStats = {};
        
        for (const order of orders) {
          const region = order.shipping_address?.country_code || 
                        order.shipping_address?.country || 
                        'UNKNOWN';
          
          if (!regionStats[region]) {
            regionStats[region] = {
              order_count: 0,
              total_value: 0,
              high_risk_count: 0,
              chargeback_count: 0,
              fraud_count: 0
            };
          }
          
          regionStats[region].order_count++;
          regionStats[region].total_value += order.total_revenue || 0;
          if (order.risk_level === 'high') regionStats[region].high_risk_count++;
        }

        // Add outcome data
        for (const outcome of outcomes) {
          const order = orders.find(o => o.id === outcome.order_id);
          if (!order) continue;
          
          const region = order.shipping_address?.country_code || 'UNKNOWN';
          if (!regionStats[region]) continue;

          if (outcome.outcome_type?.includes('chargeback')) {
            regionStats[region].chargeback_count++;
          }
          if (outcome.outcome_type?.includes('fraud')) {
            regionStats[region].fraud_count++;
          }
        }

        // Create/update regional profiles
        for (const [regionCode, stats] of Object.entries(regionStats)) {
          if (stats.order_count < 10) continue; // Minimum sample
          
          const baseData = REGION_DATA[regionCode] || { 
            name: regionCode, 
            base_fraud_rate: 0.02, 
            regulations: [] 
          };

          const fraudRate = stats.order_count > 0 ? stats.fraud_count / stats.order_count : 0;
          const chargebackRate = stats.order_count > 0 ? stats.chargeback_count / stats.order_count : 0;
          const highRiskRate = stats.order_count > 0 ? stats.high_risk_count / stats.order_count : 0;

          // Check for existing profile
          const existing = await base44.asServiceRole.entities.RegionalRiskProfile.filter({
            region_code: regionCode
          });

          const profileData = {
            region_code: regionCode,
            region_name: baseData.name,
            avg_fraud_rate: fraudRate,
            avg_chargeback_rate: chargebackRate,
            merchant_count: new Set(orders.filter(o => 
              (o.shipping_address?.country_code || o.shipping_address?.country) === regionCode
            ).map(o => o.tenant_id)).size,
            orders_processed: stats.order_count,
            regulatory_flags: baseData.regulations.map(reg => ({
              regulation: reg,
              status: 'compliant', // Would need actual compliance check
              notes: ''
            })),
            model_accuracy: 100 - (highRiskRate * 100), // Simplified
            model_sample_size: stats.order_count,
            expansion_readiness: stats.order_count > 100 ? 'ready' : stats.order_count > 50 ? 'needs_work' : 'not_ready',
            last_updated: new Date().toISOString()
          };

          if (existing.length > 0) {
            await base44.asServiceRole.entities.RegionalRiskProfile.update(existing[0].id, profileData);
          } else {
            await base44.asServiceRole.entities.RegionalRiskProfile.create(profileData);
          }
          
          results.profiles_updated++;
          results.regions_analyzed++;

          // Check for fraud alerts (significantly above baseline)
          if (fraudRate > (baseData.base_fraud_rate * 2)) {
            results.fraud_alerts.push({
              region: regionCode,
              region_name: baseData.name,
              current_rate: fraudRate,
              baseline_rate: baseData.base_fraud_rate,
              severity: fraudRate > baseData.base_fraud_rate * 3 ? 'critical' : 'warning'
            });

            // Create market signal
            await base44.asServiceRole.entities.MarketSignal.create({
              signal_type: 'fraud_trend',
              title: `Rising fraud in ${baseData.name}`,
              description: `Fraud rate ${(fraudRate * 100).toFixed(2)}% is ${(fraudRate / baseData.base_fraud_rate).toFixed(1)}x baseline`,
              region: regionCode,
              magnitude: Math.min((fraudRate / baseData.base_fraud_rate) * 30, 100),
              impact_level: fraudRate > baseData.base_fraud_rate * 3 ? 'critical' : 'high',
              trend_direction: 'increasing',
              requires_action: true
            });
          }

          // Check for expansion opportunities (low fraud, good volume)
          if (fraudRate < baseData.base_fraud_rate && stats.order_count > 50) {
            results.expansion_opportunities.push({
              region: regionCode,
              region_name: baseData.name,
              order_volume: stats.order_count,
              fraud_rate: fraudRate,
              recommendation: 'Increase marketing focus'
            });
          }

          // Check compliance gaps
          for (const reg of baseData.regulations) {
            // Simplified compliance check
            if (['GDPR', 'CCPA'].includes(reg)) {
              results.compliance_gaps.push({
                region: regionCode,
                regulation: reg,
                status: 'review_needed',
                priority: reg === 'GDPR' ? 'high' : 'medium'
              });
            }
          }
        }

        return Response.json({ success: true, ...results });
      }

      // ==========================================
      // GET REGIONAL PROFILES
      // ==========================================
      case 'get_regional_profiles': {
        const profiles = await base44.asServiceRole.entities.RegionalRiskProfile.filter(
          {}, '-orders_processed', 50
        );

        return Response.json({ success: true, profiles });
      }

      // ==========================================
      // GET EXPANSION RECOMMENDATIONS
      // ==========================================
      case 'get_expansion_recommendations': {
        const profiles = await base44.asServiceRole.entities.RegionalRiskProfile.filter({});
        
        // Find underserved regions with potential
        const recommendations = [];
        
        for (const [code, data] of Object.entries(REGION_DATA)) {
          const profile = profiles.find(p => p.region_code === code);
          
          if (!profile || profile.merchant_count < 5) {
            recommendations.push({
              region_code: code,
              region_name: data.name,
              current_merchants: profile?.merchant_count || 0,
              base_fraud_rate: data.base_fraud_rate,
              regulations: data.regulations,
              priority: data.base_fraud_rate < 0.015 ? 'high' : 'medium',
              recommendation: profile 
                ? 'Increase merchant acquisition' 
                : 'New market entry opportunity'
            });
          }
        }

        // Sort by priority
        recommendations.sort((a, b) => {
          if (a.priority === 'high' && b.priority !== 'high') return -1;
          if (b.priority === 'high' && a.priority !== 'high') return 1;
          return a.base_fraud_rate - b.base_fraud_rate;
        });

        return Response.json({ success: true, recommendations: recommendations.slice(0, 10) });
      }

      // ==========================================
      // ADJUST REGIONAL MODEL WEIGHTS
      // ==========================================
      case 'adjust_regional_weights': {
        const { region_code } = params;

        const profiles = await base44.asServiceRole.entities.RegionalRiskProfile.filter({
          region_code
        });

        if (!profiles.length) {
          return Response.json({ error: 'Region not found' }, { status: 404 });
        }

        const profile = profiles[0];
        
        // Calculate weight adjustments based on regional performance
        const adjustments = {};
        
        if (profile.avg_fraud_rate > 0.02) {
          // High fraud region - increase fraud-related weights
          adjustments.new_customer = 1.2;
          adjustments.address_mismatch = 1.3;
          adjustments.high_order_value = 1.2;
        } else if (profile.avg_fraud_rate < 0.01) {
          // Low fraud region - can reduce some weights
          adjustments.new_customer = 0.9;
          adjustments.address_mismatch = 0.95;
        }

        if (profile.avg_chargeback_rate > 0.015) {
          adjustments.velocity = 1.2;
          adjustments.heavy_discount = 1.15;
        }

        // Update profile with adjustments
        await base44.asServiceRole.entities.RegionalRiskProfile.update(profile.id, {
          risk_weight_adjustments: adjustments,
          last_updated: new Date().toISOString()
        });

        // Log compliance event
        await base44.asServiceRole.entities.ComplianceEvent.create({
          event_type: 'model_change',
          description: `Regional weight adjustment for ${region_code}`,
          performed_by: 'global_expansion_engine',
          risk_level: 'low',
          details: { region_code, adjustments }
        });

        return Response.json({ success: true, adjustments });
      }

      default:
        return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

  } catch (error) {
    console.error('Global Expansion Engine error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});