import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import * as jose from "npm:jose@5.2.0";

function filenameFor(format) {
  if (format === "1080p") return "ProfitShieldAI-demo-1080p.mp4";
  if (format === "720p") return "ProfitShieldAI-demo-720p.mp4";
  if (format === "shopify") return "ProfitShieldAI-app-store-1600x900.mp4";
  return "ProfitShieldAI-thumb.jpg";
}

Deno.serve(async (req) => {
  const requestId = `proxy_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  try {
    const base44 = createClientFromRequest(req);

    // Auth: try Base44 session first
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {}

    // If no Base44 user, allow Shopify bearer token
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!user && authHeader.startsWith("Bearer ")) {
      const apiSecret = Deno.env.get("SHOPIFY_API_SECRET");
      if (!apiSecret) {
        return Response.json({ error: "Server misconfigured", code: "MISSING_SECRET" }, { status: 500 });
      }

      try {
        const secret = new TextEncoder().encode(apiSecret);
        await jose.jwtVerify(token, secret, { clockTolerance: 60 });
      } catch (e) {
        if (String(e?.message || "").includes("exp")) {
          return Response.json({ error: "Session token expired", code: "TOKEN_EXPIRED" }, { status: 401 });
        }
        return Response.json({ error: "Unauthorized", code: "TOKEN_INVALID" }, { status: 401 });
      }
    } else if (!user && !authHeader.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized", code: "NO_AUTH" }, { status: 401 });
    }

    const { jobId, format } = await req.json();

    if (!jobId || !format) {
      return Response.json({ error: "Missing jobId or format", code: "MISSING_PARAMS" }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });
    }

    const out = job.outputs?.[format];
    const url = out?.url;

    if (!url || !url.startsWith("http")) {
      return Response.json({
        error: `Video output not ready for ${format}`,
        code: "OUTPUT_NOT_READY",
        jobStatus: job.status,
      }, { status: 409 });
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return Response.json({ error: "Upstream fetch failed", code: "UPSTREAM_ERROR" }, { status: 502 });
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const contentType =
      upstream.headers.get("content-type") ||
      (format === "thumb" ? "image/jpeg" : "video/mp4");

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${filenameFor(format)}"`,
      },
    });
  } catch (err) {
    console.error(`[${requestId}] error:`, err);
    return Response.json({ error: "Download failed", code: "DOWNLOAD_ERROR" }, { status: 500 });
  }
});