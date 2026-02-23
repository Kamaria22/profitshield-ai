import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import * as jose from "npm:jose@5.2.0";

/**
 * demoVideoProxyDownload - FIXED (outputs map + base64 support)
 * - No secrets in error responses
 * - JWT verification with 60s clock skew leeway
 * - Always re-fetches job fresh (service role)
 * - Uses outputs[format] shape:
 *     outputs[format] = { url } OR { base64, contentType, filename }
 * - Returns 409 when output not ready
 */
Deno.serve(async (req) => {
  const requestId = `proxy_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    console.log(`[${requestId}] ===== PROXY DOWNLOAD REQUEST =====`);

    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    const base44 = createClientFromRequest(req);

    let user = null;
    let authMethod = null;
    let shopDomain = null;

    // Auth attempt 1: Base44 cookie session
    try {
      user = await base44.auth.me();
      authMethod = "base44_cookie";
      console.log(`[${requestId}] ✓ Base44 session user: ${user?.email || "unknown"}`);
    } catch {
      console.log(`[${requestId}] No Base44 session`);
      user = null;
    }

    // Auth attempt 2: Shopify bearer token (if no Base44 user)
    if (!user && authHeader.toLowerCase().startsWith("bearer ")) {
      console.log(`[${requestId}] Attempting Shopify JWT verification...`);

      const apiSecret = Deno.env.get("SHOPIFY_API_SECRET");
      if (!apiSecret) {
        console.error(`[${requestId}] ✗ SHOPIFY_API_SECRET not set`);
        return Response.json(
          { error: "Server misconfigured", code: "MISSING_SECRET" },
          { status: 500 }
        );
      }

      try {
        const secret = new TextEncoder().encode(apiSecret);

        // ✅ clockTolerance prevents false exp/nbf failures due to clock skew
        const { payload } = await jose.jwtVerify(bearerToken, secret, {
          clockTolerance: 60,
        });

        console.log(`[${requestId}] ✓ JWT verified successfully`);

        shopDomain =
          payload?.dest?.replace(/^https?:\/\//, "") ||
          payload?.iss?.replace(/^https?:\/\//, "") ||
          (typeof payload?.sub === "string" ? payload.sub.split("/")[0] : null);

        authMethod = "shopify_bearer";
        console.log(`[${requestId}] ✓ Auth via Shopify bearer, shop=${shopDomain || "unknown"}`);
      } catch (e) {
        console.error(`[${requestId}] ✗ JWT verification FAILED: ${e?.message || e}`);

        // SECURITY: NEVER return token or secret
        if (String(e?.message || "").includes("exp") || String(e?.message || "").includes("expired")) {
          return Response.json(
            { error: "Session token expired", code: "TOKEN_EXPIRED" },
            { status: 401 }
          );
        }

        return Response.json(
          { error: "Unauthorized", code: "TOKEN_INVALID" },
          { status: 401 }
        );
      }
    } else if (!user) {
      console.error(`[${requestId}] ✗ No authorization`);
      return Response.json({ error: "Unauthorized", code: "NO_AUTH" }, { status: 401 });
    }

    const isAuthenticated = !!user || (authMethod === "shopify_bearer" && !!shopDomain);
    console.log(`[${requestId}] Auth: method=${authMethod}, authenticated=${isAuthenticated}`);

    if (!isAuthenticated) {
      return Response.json({ error: "Authentication failed", code: "AUTH_FAILED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const jobId = body?.jobId || body?.job_id;
    const format = body?.format;

    console.log(`[${requestId}] jobId=${jobId}, format=${format}`);

    if (!jobId || !format) {
      return Response.json(
        { error: "Missing jobId or format", code: "MISSING_PARAMS" },
        { status: 400 }
      );
    }

    // Always re-fetch job fresh using service role (downloads must work even without cookie session)
    console.log(`[${requestId}] Fetching job fresh (service role)...`);
    const job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId);

    if (!job) {
      console.log(`[${requestId}] ❌ Job not found`);
      return Response.json({ error: "Job not found", code: "JOB_NOT_FOUND" }, { status: 404 });
    }

    console.log(`[${requestId}] Job status=${job.status || "unknown"}`);

    // If authenticated via Shopify token, verify job belongs to this shop (best-effort)
    if (shopDomain && job.tenant_id) {
      try {
        const tenant = await base44.asServiceRole.entities.Tenant.get(job.tenant_id);
        const tenantShop =
          tenant?.shop_domain ||
          tenant?.store_key || // some schemas use store_key
          tenant?.shopDomain ||
          null;

        if (tenantShop && tenantShop !== shopDomain) {
          console.log(`[${requestId}] ❌ Tenant mismatch tenantShop=${tenantShop} vs shopDomain=${shopDomain}`);
          return Response.json({ error: "Forbidden", code: "TENANT_MISMATCH" }, { status: 403 });
        }
      } catch (e) {
        // If tenant lookup fails, do not break downloads unnecessarily.
        console.warn(`[${requestId}] Tenant lookup warning:`, e?.message || e);
      }
    }

    // Normalize outputs defensively
    let outputs = job.outputs || {};
    if (typeof outputs === "string") {
      try {
        outputs = JSON.parse(outputs);
      } catch {
        outputs = {};
      }
    }
    if (!outputs || typeof outputs !== "object") outputs = {};

    const output = outputs?.[format];
    const hasUrl = typeof output?.url === "string" && output.url.startsWith("http");
    const hasBase64 =
      typeof output?.base64 === "string" &&
      output.base64.length > 50 &&
      typeof output?.contentType === "string" &&
      output.contentType.length > 0;

    console.log(
      `[${requestId}] Output present=${!!output} hasUrl=${hasUrl} hasBase64=${hasBase64}`
    );

    // Return 409 when output not ready
    if (!hasUrl && !hasBase64) {
      console.log(`[${requestId}] ❌ Output not ready for ${format}`);
      return Response.json(
        {
          error: `Video output not ready for ${format}`,
          code: "OUTPUT_NOT_READY",
          jobStatus: job.status || "unknown",
        },
        { status: 409 }
      );
    }

    // Build bytes + contentType + filename either from base64 or from upstream url
    let bytes;
    let contentType =
      (format === "thumb" ? "image/jpeg" : "video/mp4");
    let filename =
      format === "1080p"
        ? "ProfitShieldAI-demo-1080p.mp4"
        : format === "720p"
        ? "ProfitShieldAI-demo-720p.mp4"
        : format === "shopify"
        ? "ProfitShieldAI-app-store.mp4"
        : "ProfitShieldAI-thumb.jpg";

    // Prefer base64 if present (no upstream dependency)
    if (hasBase64) {
      console.log(`[${requestId}] Using base64 payload (no upstream fetch)`);
      try {
        const b64 = output.base64;

        // Remove optional data URL prefix if present
        const cleaned = b64.includes(",") ? b64.split(",").pop() : b64;

        const bin = atob(cleaned);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);

        bytes = arr;
        contentType = output.contentType || contentType;
        filename = output.filename || filename;
      } catch (e) {
        console.error(`[${requestId}] ❌ Base64 decode failed:`, e?.message || e);
        return Response.json(
          { error: "Invalid base64 output", code: "BASE64_DECODE_FAILED" },
          { status: 422 }
        );
      }
    } else {
      // Otherwise fetch upstream from URL
      const url = output.url;

      console.log(`[${requestId}] Fetching from upstream...`);
      const upstream = await fetch(url);

      console.log(`[${requestId}] Upstream response: ${upstream.status}`);

      if (!upstream.ok) {
        console.log(`[${requestId}] ❌ Upstream fetch failed`);
        return Response.json(
          { error: "Upstream fetch failed", code: "UPSTREAM_ERROR" },
          { status: 502 }
        );
      }

      const buffer = await upstream.arrayBuffer();
      bytes = new Uint8Array(buffer);
      contentType =
        upstream.headers.get("content-type") ||
        output.contentType ||
        contentType;

      // allow upstream-provided filename but keep safe default
      filename = output.filename || filename;
    }

    console.log(`[${requestId}] Downloaded ${bytes.length} bytes`);

    // Validate file
    const isVideo = format !== "thumb";

    // Keep these low enough to not false-fail, but high enough to avoid empty files.
    const minSize = isVideo ? 50_000 : 2_000;

    if (bytes.length < minSize) {
      console.log(`[${requestId}] ❌ File too small: ${bytes.length} < ${minSize}`);
      return Response.json(
        { error: `File too small: ${bytes.length} bytes`, code: "FILE_TOO_SMALL" },
        { status: 422 }
      );
    }

    if (isVideo) {
      const header = new TextDecoder().decode(bytes.slice(0, 64));
      if (!header.includes("ftyp")) {
        console.log(`[${requestId}] ❌ Invalid MP4 signature`);
        return Response.json({ error: "Invalid MP4 file", code: "INVALID_MP4" }, { status: 422 });
      }
      console.log(`[${requestId}] ✓ Valid MP4 signature`);
    }

    console.log(`[${requestId}] ✓ Returning ${bytes.length} bytes as ${contentType}`);

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(`[${requestId}] ❌ EXCEPTION:`, err?.message || err);
    console.error(`[${requestId}] Stack:`, err?.stack || "no-stack");

    // SECURITY: NEVER leak secrets/tokens
    return Response.json({ error: "Download failed", code: "DOWNLOAD_ERROR" }, { status: 500 });
  }
});