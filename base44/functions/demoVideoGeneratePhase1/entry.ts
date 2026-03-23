import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Phase 1: Fast (< 2s) generation of script, storyboard, and demo data
 * Returns 202 Accepted with jobId for async Phase 2 rendering
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { tenantId = null, version = '90s', includeVoiceover = true, includeMusic = true, useDemoData = false } = payload;

    // Validate version
    const validVersions = ['60s', '90s', '120s'];
    if (!validVersions.includes(version)) {
      return Response.json({
        ok: false,
        error: 'INVALID_VERSION',
        message: `Version must be one of: ${validVersions.join(', ')}`
      }, { status: 400 });
    }

    const isDemoMode = !tenantId || useDemoData;
    const mode = isDemoMode ? 'demo' : 'real';

    console.log(`[${requestId}] Phase 1 started:`, { mode, version, isDemoMode });

    // Generate demo data immediately (fast)
    const dataset = {
      tenant: {
        shop_name: isDemoMode ? 'Demo Store' : 'Your Store',
        shop_domain: isDemoMode ? 'demo-store.myshopify.com' : 'store.example.com',
        platform: 'shopify',
        profit_integrity_score: isDemoMode ? 87 : 82
      },
      metrics: {
        totalRevenue: 245680,
        totalProfit: 89340,
        totalCost: 156340,
        margin: 36.4,
        orderCount: 1247,
        avgOrderValue: 197,
        avgFraudScore: 12,
        avgReturnRisk: 8,
        avgChargebackRisk: 3
      },
      leaks: [
        { type: 'shipping', title: 'Shipping cost variance', monthlyImpact: -2340 },
        { type: 'discount', title: 'Over-discounting patterns', monthlyImpact: -1890 }
      ],
      recommendations: [
        'Optimize shipping carrier selection',
        'Review discount strategy',
        'Implement dynamic pricing'
      ]
    };

    // Generate simple script structure (fast)
    const durationMap = { '60s': 60, '90s': 90, '120s': 120 };
    const duration = durationMap[version] || 90;
    const sceneCount = Math.ceil(duration / 15);

    const script = {
      title: isDemoMode ? 'Demo Store Performance Review' : 'Your Store Performance Review',
      totalDuration: duration,
      scenes: Array.from({ length: sceneCount }, (_, i) => ({
        id: `scene_${i + 1}`,
        duration: i === sceneCount - 1 ? duration - (15 * (sceneCount - 1)) : 15,
        title: `Scene ${i + 1}`,
        narration: `This is scene ${i + 1} of your video.`,
        voiceover: includeVoiceover,
        music: includeMusic
      }))
    };

    // Create DemoVideoJob record (fast DB write)
    const job = await base44.entities.DemoVideoJob.create({
      tenant_id: tenantId,
      mode,
      version,
      options: { voiceover: includeVoiceover, music: includeMusic },
      status: 'queued',
      progress: 0,
      request_id: requestId,
      outputs: {}
    });

    console.log(`[${requestId}] Job created: ${job.id}`);

    // Return immediately (202 Accepted) - Phase 1 complete
    return new Response(JSON.stringify({
      ok: true,
      jobId: job.id,
      requestId,
      status: 'queued',
      message: 'Job created. Script and demo data available immediately. MP4 rendering in progress.',
      hasScript: true,
      hasData: true,
      hasMp4: false,
      phase1Data: {
        script,
        dataset,
        mode,
        version,
        durationSec: duration,
        sceneCount
      }
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[${requestId}] Phase 1 error:`, error.message);
    return Response.json({
      ok: false,
      error: 'GENERATION_ERROR',
      message: 'Failed to create generation job',
      requestId
    }, { status: 500 });
  }
});