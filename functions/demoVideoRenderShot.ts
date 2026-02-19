import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Render video using Shotstack API
 * Returns jobId for polling + async rendering
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId, script, demoData } = await req.json();
    if (!jobId || !script) {
      return Response.json({ error: 'Missing jobId or script' }, { status: 400 });
    }

    // Get job to update status
    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Update job to rendering state
    await base44.entities.DemoVideoJob.update(jobId, {
      status: 'rendering',
      progress: 10,
      error_message: null
    });

    // Build Shotstack timeline
    const timeline = buildTimeline(script, demoData);

    // Call Shotstack API
    const shotStackKey = Deno.env.get('SHOTSTACK_API_KEY');
    const shotStackEnv = Deno.env.get('SHOTSTACK_ENV') || 'prod';
    const apiUrl = shotStackEnv === 'sandbox' 
      ? 'https://api.shotstack.io/stage'
      : 'https://api.shotstack.io/v1';

    if (!shotStackKey) {
      throw new Error('SHOTSTACK_API_KEY not set');
    }

    const shotStackResponse = await fetch(`${apiUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': shotStackKey
      },
      body: JSON.stringify({
        timeline: timeline,
        output: {
          format: 'mp4',
          resolution: '1080p',
          fps: 30,
          quality: 'high',
          h264_profile: 'baseline'  // For QuickTime compatibility
        },
        callback: `${Deno.env.get('BASE44_APP_URL') || 'https://app.profitshieldai.com'}/webhook/shotstack`
      })
    });

    if (!shotStackResponse.ok) {
      const error = await shotStackResponse.text();
      throw new Error(`Shotstack API error: ${shotStackResponse.status} - ${error}`);
    }

    const shotStackData = await shotStackResponse.json();
    const renderID = shotStackData.response?.id;

    if (!renderID) {
      throw new Error('No render ID returned from Shotstack');
    }

    // Update job with Shotstack render ID
    await base44.entities.DemoVideoJob.update(jobId, {
      request_id: renderID,
      progress: 20
    });

    return Response.json({
      ok: true,
      jobId,
      renderID,
      status: 'rendering'
    });

  } catch (error) {
    console.error('[DemoVideoRenderShot]', error.message);
    return Response.json({
      error: error.message,
      ok: false
    }, { status: 500 });
  }
});

/**
 * Build Shotstack timeline from script
 */
function buildTimeline(script, demoData) {
  const clips = [];
  
  // Add title clip
  clips.push({
    type: 'text',
    text: 'ProfitShield AI',
    duration: 2,
    font: 'Montserrat',
    fontSize: 80,
    color: '#ffffff',
    background: '#10b981'
  });

  // Add script clips (in 5-second segments)
  const lines = script.split('\n').filter(l => l.trim());
  let offset = 2;
  
  lines.forEach((line, idx) => {
    clips.push({
      type: 'text',
      text: line,
      duration: 4,
      offset,
      font: 'Montserrat',
      fontSize: 48,
      color: '#ffffff',
      background: '#1f2937'
    });
    offset += 4.5;
  });

  // Add demo data visualization
  if (demoData) {
    clips.push({
      type: 'text',
      text: `Recover up to $${demoData.estimatedMonthlyLeaks || 'X'}`,
      duration: 3,
      offset,
      fontSize: 60,
      color: '#10b981',
      background: '#ffffff'
    });
  }

  // Add CTA
  clips.push({
    type: 'text',
    text: 'Get Started Free →',
    duration: 3,
    offset: offset + 3,
    fontSize: 48,
    color: '#ffffff',
    background: '#10b981'
  });

  return {
    background: '#ffffff',
    clips: clips,
    duration: offset + 6
  };
}