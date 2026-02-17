import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, action = 'generate', segment_id, campaign_id } = body;

    if (!tenant_id) {
      return Response.json({ error: 'tenant_id required' }, { status: 400 });
    }

    if (action === 'execute_campaign' && campaign_id) {
      // Execute a campaign - send emails, create discounts, etc.
      const campaigns = await base44.asServiceRole.entities.GrowthExperiment.filter({ id: campaign_id });
      const campaign = campaigns[0];
      
      if (!campaign) {
        return Response.json({ error: 'Campaign not found' }, { status: 404 });
      }

      // Get target customers
      const customers = await base44.asServiceRole.entities.Customer.filter({ 
        tenant_id,
        segment_id: campaign.target_segment_id 
      });

      // Create discount if needed
      let discountCode = null;
      if (campaign.discount_value) {
        const tokens = await base44.asServiceRole.entities.OAuthToken.filter({ 
          tenant_id, platform: 'shopify', is_valid: true 
        });
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: tenant_id });
        
        if (tokens[0] && tenants[0]) {
          const code = `CAMP${campaign_id.slice(-6).toUpperCase()}`;
          // Create Shopify discount
          const priceRuleRes = await fetch(
            `https://${tenants[0].shop_domain}/admin/api/2024-01/price_rules.json`,
            {
              method: 'POST',
              headers: {
                'X-Shopify-Access-Token': tokens[0].access_token,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                price_rule: {
                  title: campaign.name,
                  target_type: 'line_item',
                  target_selection: 'all',
                  allocation_method: 'across',
                  value_type: 'percentage',
                  value: `-${campaign.discount_value}`,
                  customer_selection: 'all',
                  starts_at: new Date().toISOString(),
                  ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                }
              })
            }
          );
          
          if (priceRuleRes.ok) {
            const priceRule = await priceRuleRes.json();
            await fetch(
              `https://${tenants[0].shop_domain}/admin/api/2024-01/price_rules/${priceRule.price_rule.id}/discount_codes.json`,
              {
                method: 'POST',
                headers: {
                  'X-Shopify-Access-Token': tokens[0].access_token,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ discount_code: { code } })
              }
            );
            discountCode = code;
          }
        }
      }

      // Send emails to customers
      let emailsSent = 0;
      for (const customer of customers.slice(0, 100)) {
        if (customer.email) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: customer.email,
            subject: campaign.email_subject || campaign.name,
            body: campaign.email_body?.replace('{{discount_code}}', discountCode || '') || 
                  `Special offer just for you! ${discountCode ? `Use code ${discountCode} for ${campaign.discount_value}% off!` : ''}`
          });
          emailsSent++;
        }
      }

      // Update campaign status
      await base44.asServiceRole.entities.GrowthExperiment.update(campaign_id, {
        status: 'active',
        executed_at: new Date().toISOString(),
        emails_sent: emailsSent,
        discount_code: discountCode
      });

      return Response.json({
        success: true,
        emails_sent: emailsSent,
        discount_code: discountCode,
        message: `Campaign launched! ${emailsSent} emails sent.`
      });
    }

    // Generate campaign recommendations
    const [segments, orders, products] = await Promise.all([
      base44.asServiceRole.entities.CustomerSegment.filter({ tenant_id, is_ai_generated: true }),
      base44.asServiceRole.entities.Order.filter({ tenant_id }, '-order_date', 500),
      base44.asServiceRole.entities.Product.filter({ tenant_id }, '-created_date', 100)
    ]);

    const totalRevenue = orders.reduce((s, o) => s + (o.total_revenue || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    const campaignPrompt = `
Generate 4-6 AI-powered marketing campaigns based on this data:

CUSTOMER SEGMENTS:
${segments.map(s => `- ${s.name}: ${s.customer_count} customers, Priority: ${s.priority}`).join('\n')}

STORE METRICS:
- Total orders: ${orders.length}
- Total revenue: $${totalRevenue.toFixed(2)}
- Avg order value: $${avgOrderValue.toFixed(2)}
- Top products: ${products.slice(0, 5).map(p => p.name).join(', ')}

Create campaigns with:
1. Campaign name and type (email, discount, bundle, etc.)
2. Target segment
3. Goal and expected outcome
4. Discount/offer details if applicable
5. Email subject and preview
6. Urgency/timing recommendation
7. Expected ROI
`;

    const aiResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: campaignPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          campaigns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["email", "discount", "bundle", "winback", "upsell", "loyalty"] },
                target_segment: { type: "string" },
                goal: { type: "string" },
                discount_value: { type: "number" },
                email_subject: { type: "string" },
                email_preview: { type: "string" },
                urgency: { type: "string", enum: ["immediate", "this_week", "this_month"] },
                expected_roi: { type: "string" },
                expected_revenue: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] }
              }
            }
          },
          overall_strategy: { type: "string" },
          quick_win: { type: "string" }
        }
      }
    });

    // Save campaigns as experiments
    for (const campaign of aiResponse.campaigns || []) {
      await base44.asServiceRole.entities.GrowthExperiment.create({
        tenant_id,
        name: campaign.name,
        experiment_type: campaign.type,
        target_segment: campaign.target_segment,
        hypothesis: campaign.goal,
        discount_value: campaign.discount_value,
        email_subject: campaign.email_subject,
        email_body: campaign.email_preview,
        expected_roi: campaign.expected_roi,
        priority: campaign.priority,
        status: 'draft',
        is_ai_generated: true
      });
    }

    return Response.json({
      success: true,
      campaigns: aiResponse.campaigns,
      overall_strategy: aiResponse.overall_strategy,
      quick_win: aiResponse.quick_win,
      segments_available: segments.length
    });

  } catch (error) {
    console.error('AI Marketing Campaigns error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});