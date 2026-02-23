import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function originFromReq(req) {
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://profit-shield-ai.base44.app";
  }
}

function buildDemoOutputs(origin) {
  // You will place these files in /public/demo/ (instructions below)
  return {
    "1080p": {
      url: `${origin}/demo/ProfitShieldAI-demo-1080p.mp4`,
      filename: "ProfitShieldAI-demo-1080p.mp4",
      contentType: "video/mp4",
    },
    "720p": {
      url: `${origin}/demo/ProfitShieldAI-demo-720p.mp4`,
      filename: "ProfitShieldAI-demo-720p.mp4",
      contentType: "video/mp4",
    },
    "shopify": {
      url: `${origin}/demo/ProfitShieldAI-app-store-1600x900.mp4`,
      filename: "ProfitShieldAI-app-store-1600x900.mp4",
      contentType: "video/mp4",
    },
    "thumb": {
      url: `${origin}/demo/ProfitShieldAI-thumb.jpg`,
      filename: "ProfitShieldAI-thumb.jpg",
      contentType: "image/jpeg",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const tenant_id = body?.tenant_id ?? null;
    const mode = body?.mode || "demo";
    const version = body?.version || "90s";

    // Create job
    const job = await base44.asServiceRole.entities.DemoVideoJob.create({
      tenant_id,
      mode,
      version,
      status: "queued",
      progress: 0,
      outputs: {},
      error_message: null,
    });

    // ✅ FAST PATH: demo mode completes immediately using static assets
    if (mode === "demo") {
      const origin = originFromReq(req);
      const outputs = buildDemoOutputs(origin);

      await base44.asServiceRole.entities.DemoVideoJob.update(job.id, {
        status: "completed",
        progress: 100,
        outputs,
        error_message: null,
      });

      console.log(`[${requestId}] Demo job completed immediately`, {
        jobId: job.id,
        origin,
        keys: Object.keys(outputs),
      });

      return Response.json(
        { jobId: job.id, status: "completed" },
        { status: 200 }
      );
    }

    // REAL mode (leave queued for now; you can wire real renderer later)
    console.log(`[${requestId}] Real job created (renderer not wired)`, {
      jobId: job.id,
      tenant_id,
      version,
    });

    return Response.json({ jobId: job.id, status: "queued" }, { status: 200 });
  } catch (err) {
    console.error(`[demoVideoGenerator] error:`, err);
    return Response.json(
      { error: "Failed to start generation", code: "GENERATOR_ERROR" },
      { status: 500 }
    );
  }
});