import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

async function uploadToCDN(sourceUrl: string, filename: string, base44: any) {
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Failed to fetch source: ${response.status}`);
    
    const blob = await response.blob();
    const file = new File([blob], filename, { type: blob.type });
    
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    return file_url;
  } catch (err) {
    console.error(`[CDN Upload] Failed for ${filename}:`, err);
    throw err;
  }
}

async function generateThumbnail(videoUrl: string, base44: any) {
  // Use LLM to generate a thumbnail image
  try {
    const { file_url } = await base44.integrations.Core.GenerateImage({
      prompt: "Professional business analytics dashboard with charts and profit metrics, modern tech aesthetic, blue and green gradient",
    });
    return file_url;
  } catch (err) {
    console.warn("[CDN Upload] Thumbnail generation failed:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const { jobId, sourceUrl } = await req.json();

    if (!jobId || !sourceUrl) {
      return Response.json({ error: "Missing jobId or sourceUrl" }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    await base44.asServiceRole.entities.DemoVideoJob.update(jobId, {
      progress: 85,
    });

    // Upload video to CDN
    const cdnUrl = await uploadToCDN(sourceUrl, "ProfitShieldAI-demo.mp4", base44);

    // Generate thumbnail
    const thumbUrl = await generateThumbnail(cdnUrl, base44);

    // Update job with CDN URLs
    const outputs = {
      "1080p": { url: cdnUrl, filename: "ProfitShieldAI-demo-1080p.mp4" },
      "720p": { url: cdnUrl, filename: "ProfitShieldAI-demo-720p.mp4" },
      "shopify": { url: cdnUrl, filename: "ProfitShieldAI-app-store-1600x900.mp4" },
      "thumb": thumbUrl ? { url: thumbUrl, filename: "ProfitShieldAI-thumb.jpg" } : null,
    };

    await base44.asServiceRole.entities.DemoVideoJob.update(jobId, {
      status: "completed",
      progress: 100,
      outputs,
    });

    return Response.json({ success: true, cdnUrl, thumbUrl }, { status: 200 });
  } catch (err) {
    console.error("[demoVideoCDNUpload] error:", err);
    
    // Mark job as failed
    const { jobId } = await req.json().catch(() => ({}));
    if (jobId) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.DemoVideoJob.update(jobId, {
          status: "failed",
          error_message: `CDN upload failed: ${err?.message || "Unknown error"}`,
        });
      } catch {}
    }

    return Response.json({ error: "CDN upload failed" }, { status: 500 });
  }
});