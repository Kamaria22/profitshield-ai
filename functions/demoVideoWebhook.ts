import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const WEBHOOK_SECRET = Deno.env.get("DEMO_VIDEO_WEBHOOK_SECRET") || "default-secret";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const secret = req.headers.get("x-webhook-secret");
    if (secret !== WEBHOOK_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const { jobId, status, progress, url, error } = await req.json();

    if (!jobId) {
      return Response.json({ error: "Missing jobId" }, { status: 400 });
    }

    const updates: any = {};
    if (status) updates.status = status;
    if (typeof progress === "number") updates.progress = progress;
    if (error) updates.error_message = error;

    if (status === "completed" && url) {
      updates.outputs = {
        "1080p": { url, filename: "ProfitShieldAI-demo-1080p.mp4" },
        "720p": { url, filename: "ProfitShieldAI-demo-720p.mp4" },
        "shopify": { url, filename: "ProfitShieldAI-app-store-1600x900.mp4" },
        "thumb": { url: url.replace(".mp4", ".jpg"), filename: "ProfitShieldAI-thumb.jpg" },
      };
    }

    await base44.asServiceRole.entities.DemoVideoJob.update(jobId, updates);

    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[demoVideoWebhook] error:", err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
});