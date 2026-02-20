import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Load most recent demo video job for current user
 * - Helps restore state after page refresh
 * - Returns job with outputs if available
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ 
        ok: false, 
        message: 'Not authenticated' 
      });
    }

    console.log('[demoVideoLoadRecent] Loading recent job for user:', user.email);

    // Query recent jobs, sorted by creation date
    const jobs = await base44.entities.DemoVideoJob.list('-created_date', 1);

    if (!jobs || jobs.length === 0) {
      console.log('[demoVideoLoadRecent] No recent jobs found');
      return Response.json({ 
        ok: true,
        job: null
      });
    }

    const job = jobs[0];
    console.log('[demoVideoLoadRecent] Found job:', job.id, 'status:', job.status);

    return Response.json({
      ok: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress || 0,
        outputs: job.outputs || {},
        version: job.version,
        created_date: job.created_date
      }
    });

  } catch (error) {
    console.error('[demoVideoLoadRecent] Error:', error.message);
    return Response.json({ 
      ok: false, 
      message: error.message 
    });
  }
});