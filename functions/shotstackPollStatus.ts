import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
const SHOTSTACK_ENV = Deno.env.get("SHOTSTACK_ENV") || "stage";
const SHOTSTACK_BASE = `https://api.shotstack.io/${SHOTSTACK_ENV}`;

async function convertToFormats(sourceUrl) {
  // For simplicity, return the same source URL for all formats
  // In production, you'd transcode to different resolutions
  return {
    "1080p": { url: sourceUrl, filename: "ProfitShieldAI-demo-1080p.mp4" },
    "720p": { url: sourceUrl, filename: "ProfitShieldAI-demo-720p.mp4" },
    "shopify": { url: sourceUrl, filename: "ProfitShieldAI-app-store-1600x900.mp4" },
    "thumb": { url: sourceUrl.replace(".mp4", ".jpg"), filename: "ProfitShieldAI-thumb.jpg" },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, renderId } = await req.json();

    if (!jobId || !renderId) {
      return Response.json({ error: "Missing jobId or renderId" }, { status: 400 });
    }

    const res = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
      headers: { "x-api-key": SHOTSTACK_API_KEY },
    });

    if (!res.ok) {
      throw new Error(`Shotstack status check failed: ${res.status}`);
    }

    const data = await res.json();
    const status = data?.response?.status;
    const url = data?.response?.url;

    if (status === "done" && url) {
      const outputs = await convertToFormats(url);

      await base44.asServiceRole.entities.DemoVideoJob.update(jobId, {
        status: "completed",
        progress: 100,
        outputs,
      });

      return Response.json({ success: true, status: "completed" }, { status: 200 });
    } else if (status === "failed") {
      await base44.asServiceRole.entities.DemoVideoJob.update(jobId, {
        status: "failed",
        error_message: "Shotstack render failed",
      });

      return Response.json({ success: false, status: "failed" }, { status: 200 });
    } else if (status === "rendering") {
      const progress = Math.min(90, 20 + Math.floor(Math.random() * 50));

      await base44.asServiceRole.entities.DemoVideoJob.update(jobId, {
        status: "rendering",
        progress,
      });

      // Poll again in 5 seconds
      setTimeout(() => {
        base44.asServiceRole.functions.invoke("shotstackPollStatus", { jobId, renderId }).catch(console.error);
      }, 5000);

      return Response.json({ success: true, status: "rendering" }, { status: 200 });
    }

    return Response.json({ success: true, status: status || "unknown" }, { status: 200 });
  } catch (err) {
    console.error("[shotstackPollStatus] error:", err);
    return Response.json({ error: err?.message || "Poll failed" }, { status: 500 });
  }
});