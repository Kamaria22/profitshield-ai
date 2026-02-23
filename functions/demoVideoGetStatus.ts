import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function isValidOutput(o) {
  return !!(o && typeof o.url === "string" && o.url.startsWith("http"));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { jobId } = await req.json();

    if (!jobId) {
      return Response.json({ error: "Missing jobId", code: "MISSING_JOB_ID" }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const outputs = job.outputs || {};
    const outputsReady = {
      "1080p": isValidOutput(outputs["1080p"]),
      "720p": isValidOutput(outputs["720p"]),
      "shopify": isValidOutput(outputs["shopify"]),
      "thumb": isValidOutput(outputs["thumb"]),
    };

    // If job says completed but nothing ready, treat as finalizing (prevents false "completed" UI)
    let status = job.status || "unknown";
    if (status === "completed" && !Object.values(outputsReady).some(Boolean)) {
      status = "finalizing";
    }

    return Response.json({
      jobId: job.id,
      status,
      progress: job.progress || 0,
      mode: job.mode,
      version: job.version,
      outputs,
      outputsReady,
      errorMessage: job.error_message || null,
    }, { status: 200 });
  } catch (err) {
    console.error("[demoVideoGetStatus] error:", err);
    return Response.json({ error: "Failed to check job status", code: "STATUS_ERROR" }, { status: 500 });
  }
});