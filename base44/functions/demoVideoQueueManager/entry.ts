import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const MAX_CONCURRENT = 3;
const RETRY_LIMIT = 3;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { action } = await req.json();

    if (action === "process") {
      const rendering = await base44.asServiceRole.entities.DemoVideoJob.filter({
        status: "rendering",
      });

      if (rendering.length >= MAX_CONCURRENT) {
        return Response.json({ message: "Queue full", rendering: rendering.length }, { status: 200 });
      }

      const queued = await base44.asServiceRole.entities.DemoVideoJob.filter(
        { status: "queued" },
        "-created_date",
        MAX_CONCURRENT - rendering.length
      );

      for (const job of queued) {
        if (job.mode === "real") {
          base44.asServiceRole.functions.invoke("shotstackRenderVideo", {
            jobId: job.id,
            tenantId: job.tenant_id,
            integrationId: job.integration_id,
            version: job.version,
            options: job.options,
          }).catch(console.error);
        }
      }

      return Response.json({ processed: queued.length }, { status: 200 });
    }

    if (action === "retry-failed") {
      const failed = await base44.asServiceRole.entities.DemoVideoJob.filter({
        status: "failed",
      });

      let retried = 0;
      for (const job of failed) {
        const retryCount = job.retry_count || 0;
        if (retryCount < RETRY_LIMIT) {
          await base44.asServiceRole.entities.DemoVideoJob.update(job.id, {
            status: "queued",
            retry_count: retryCount + 1,
            error_message: null,
          });
          retried++;
        }
      }

      return Response.json({ retried }, { status: 200 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[demoVideoQueueManager] error:", err);
    return Response.json({ error: "Queue management failed" }, { status: 500 });
  }
});