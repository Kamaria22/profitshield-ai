import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * DEMO SCRIPT GENERATOR
 * Generates executive-level demo scripts using AI
 * - 60-second App Store version
 * - 90-second Product Hunt version
 * - 2-minute investor version
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'owner') {
      return Response.json({ error: 'Forbidden: Owner access required' }, { status: 403 });
    }

    const { dataset, version = '90s' } = await req.json();

    if (!dataset) {
      return Response.json({ error: 'dataset required' }, { status: 400 });
    }

    const metrics = dataset.metrics || {};
    const topLeaks = dataset.topLeaks || [];
    const recommendations = dataset.recommendations || [];

    // Define version-specific constraints
    const versions = {
      '60s': {
        duration: '60 seconds',
        target: 'Shopify App Store users',
        focus: 'Quick value proposition, key features, clear CTA',
        maxScenes: 5
      },
      '90s': {
        duration: '90 seconds',
        target: 'Product Hunt audience',
        focus: 'Problem-solution-benefit flow, social proof, innovation',
        maxScenes: 7
      },
      '2m': {
        duration: '2 minutes',
        target: 'Investors and strategic partners',
        focus: 'Market opportunity, technology advantage, growth metrics, vision',
        maxScenes: 10
      }
    };

    const versionConfig = versions[version] || versions['90s'];

    // Build AI prompt
    const prompt = `You are a professional demo video scriptwriter for enterprise SaaS products.

Generate a compelling ${versionConfig.duration} demo video script for ProfitShield AI - an intelligent profit protection platform for e-commerce merchants.

TARGET AUDIENCE: ${versionConfig.target}
FOCUS: ${versionConfig.focus}

REAL DEMO DATA:
- Revenue: $${(metrics.totalRevenue || 0).toFixed(2)}
- Net Profit: $${(metrics.totalProfit || 0).toFixed(2)}
- Profit Margin: ${metrics.margin || 0}%
- Profit Integrity Score: ${metrics.profitIntegrityScore || 85}/100
- Orders: ${metrics.orders || 0}
- Avg Fraud Score: ${metrics.riskMetrics?.avgFraudScore || 0}
- Top Profit Leaks: ${topLeaks.map(l => `${l.type} ($${l.impact}/mo)`).join(', ')}
- AI Recommendations: ${recommendations.length} active

KEY FEATURES TO HIGHLIGHT:
1. Real-time profit integrity monitoring
2. AI-powered fraud detection
3. Margin leak detection
4. Automated risk scoring
5. Predictive analytics
6. One-click remediation

SCRIPT STRUCTURE:
- Hook (3-5 seconds): Attention-grabbing opening
- Problem (10-15 seconds): Pain point
- Solution (20-30 seconds): Show ProfitShield in action
- Benefits (15-20 seconds): Real results from demo data
- CTA (5-10 seconds): Clear next step

OUTPUT FORMAT:
Return a JSON object with:
{
  "title": "Video title",
  "hook": "Opening hook line",
  "scenes": [
    {
      "timestamp": "00:00-00:05",
      "scene": "Scene name",
      "voiceover": "Exact words to speak",
      "visual": "What's shown on screen",
      "duration": 5
    }
  ],
  "totalDuration": 90,
  "callToAction": "Final CTA"
}

Make it compelling, data-driven, and professional. Use the REAL demo data provided above.`;

    // Generate script using AI
    const scriptResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          scenes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                scene: { type: 'string' },
                voiceover: { type: 'string' },
                visual: { type: 'string' },
                duration: { type: 'number' }
              }
            }
          },
          totalDuration: { type: 'number' },
          callToAction: { type: 'string' }
        }
      }
    });

    // Generate captions
    const captionsPrompt = `Convert this demo video script into SRT caption format:

${JSON.stringify(scriptResult, null, 2)}

Output ONLY the SRT format captions with proper timestamps and line breaks.`;

    const captionsResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: captionsPrompt
    });

    return Response.json({
      success: true,
      version,
      script: scriptResult,
      captions: captionsResult,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Script generation error:', error);
    return Response.json({ 
      error: 'Failed to generate script',
      details: error.message 
    }, { status: 500 });
  }
});