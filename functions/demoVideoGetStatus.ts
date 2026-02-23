import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

/**
 * Get demo video job status - FIXED (robust + consistent)
 * - Accepts { jobId } OR { job_id }
 * - Returns outputs map
 * - Only returns status="completed" when ALL required outputs are valid
 *   (prevents "completed but OUTPUT_NOT_READY" 409s)
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestId = `status_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  try {
    const base44 = createClientFromRequest(req);

    // ✅ Accept both payload shapes (frontend currently sends job_id)
    const body = await req.json().catch(() => ({}));
    const jobId = body?.jobId || body?.job_id || body?.id;

    if (!jobId) {
      return Response.json(
        { error: "Missing jobId", code: "MISSING_JOB_ID" },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] Fetching job ${jobId}`);

    // Always read fresh from DB
    const job = await base44.entities.DemoVideoJob.get(jobId);

    if (!job) {
      console.warn(`[${requestId}] Job ${jobId} not found`);
      return Response.json(
        { error: "Job not found", code: "JOB_NOT_FOUND" },
        { status: 404 }
      );
    }

    // outputs may be null / stringified / wrong shape. Normalize defensively.
    let outputs = job.outputs || {};
    if (typeof outputs === "string") {
      try {
        outputs = JSON.parse(outputs);
      } catch {
        outputs = {};
      }
    }
    if (!outputs || typeof outputs !== "object") outputs = {};

    const requiredFormats = ["1080p", "720p", "shopify", "thumb"];

    const hasValidOutput = (output) => {
      if (!output || typeof output !== "object") return false;

      // Must have url OR (base64 + contentType + filename)
      if (typeof output.url === "string" && output.url.trim().length > 0) return true;

      if (
        typeof output.base64 === "string" &&
        output.base64.length > 50 &&
        typeof output.contentType === "string" &&
        output.contentType.length > 0 &&
        typeof output.filename === "string" &&
        output.filename.length > 0
      ) {
        return true;
      }

      return false;
    };

    const outputsReady = {};
    for (const fmt of requiredFormats) {
      outputsReady[fmt] = hasValidOutput(outputs[fmt]);
    }

    const allReady = requiredFormats.every((fmt) => outputsReady[fmt] === true);
    const anyReady = requiredFormats.some((fmt) => outputsReady[fmt] === true);

    console.log(
      `[${requestId}] Job ${jobId} dbStatus=${job.status} anyReady=${anyReady} allReady=${allReady}`
    );

    // ✅ Status truth: completed ONLY when all outputs exist
    let actualStatus = job.status;

    // If DB says completed but outputs aren’t all ready => finalizing
    if (job.status === "completed" && !allReady) {
      console.warn(
        `[${requestId}] Job ${jobId} marked completed but outputs missing. Returning finalizing.`,
        outputsReady
      );
      actualStatus = "finalizing";
    }

    // If DB says rendering/finalizing but all outputs are ready => treat as completed
    if ((job.status === "rendering" || job.status === "finalizing") && allReady) {
      actualStatus = "completed";
    }

    // If stuck rendering > 2 minutes, mark failed
    if (actualStatus === "rendering" && job.created_date) {
      const ageMs = Date.now() - new Date(job.created_date).getTime();
      if (ageMs > 120000) {
        console.warn(
          `[${requestId}] Job ${jobId} stuck rendering (${Math.round(ageMs / 1000)}s), marking failed`
        );

        await base44.entities.DemoVideoJob.update(jobId, {
          status: "failed",
          error_message: "Rendering timed out after 2 minutes",
        });

        return Response.json(
          {
            jobId: job.id,
            status: "failed",
            progress: 50,
            mode: job.mode,
            version: job.version,
            outputs,
            outputsReady,
            errorMessage: "Rendering timed out after 2 minutes",
          },
          { status: 200 }
        );
      }
    }

    return Response.json(
      {
        jobId: job.id,
        status: actualStatus,
        progress: job.progress || 0,
        mode: job.mode,
        version: job.version,
        outputs,
        outputsReady, // ✅ client can use this to disable buttons per-format if desired
        errorMessage: job.error_message || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(`[${requestId}] Status check error:`, error);
    return Response.json(
      {
        error: "Failed to check job status",
        code: "STATUS_CHECK_ERROR",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
});