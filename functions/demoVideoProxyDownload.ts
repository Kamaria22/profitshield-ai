import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as jose from 'npm:jose@5.2.0';

/**
 * Proxy download - FIXED
 * - No secrets in error responses
 * - JWT verification with 60s clock skew leeway
 * - Re-fetches job status before deciding URL unavailable
 * - Returns 409 (not 404) when output not ready
 */

Deno.serve(async (req) => {
  const requestId = `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`[${requestId}] ===== PROXY DOWNLOAD REQUEST =====`);
    
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    
    const base44 = createClientFromRequest(req);
    
    let user = null;
    let authMethod = null;
    let shopDomain = null;
    
    // Auth attempt 1: Base44 cookie session
    try {
      user = await base44.auth.me();
      authMethod = 'base44_cookie';
      console.log(`[${requestId}] ✓ Base44 session user: ${user.email}`);
    } catch (e) {
      console.log(`[${requestId}] No Base44 session`);
      user = null;
    }

    // Auth attempt 2: Shopify bearer token (if no Base44 user)
    if (!user && authHeader.startsWith('Bearer ')) {
      console.log(`[${requestId}] Attempting Shopify JWT verification...`);
      
      const apiSecret = Deno.env.get('SHOPIFY_API_SECRET');
      if (!apiSecret) {
        console.error(`[${requestId}] ✗ SHOPIFY_API_SECRET not set`);
        return Response.json({ error: 'Server misconfigured', code: 'MISSING_SECRET' }, { status: 500 });
      }

      try {
        const secret = new TextEncoder().encode(apiSecret);
        
        // CRITICAL: Add 60s clock skew leeway for exp/nbf checks
        const { payload } = await jose.jwtVerify(token, secret, {
          clockTolerance: 60
        });
        
        console.log(`[${requestId}] ✓ JWT verified successfully`);
        
        // Extract shop domain from JWT
        shopDomain = payload.dest?.replace(/^https?:\/\//, '') || 
                     payload.iss?.replace(/^https?:\/\//, '') ||
                     payload.sub?.split('/')[0];
        
        authMethod = 'shopify_bearer';
        console.log(`[${requestId}] ✓ Auth via Shopify bearer, shop=${shopDomain}`);
      } catch (e) {
        console.error(`[${requestId}] ✗ JWT verification FAILED: ${e.message}`);
        
        // SECURITY: NEVER return token or secret in response
        if (e.message.includes('exp') || e.message.includes('expired')) {
          return Response.json({ 
            error: 'Session token expired',
            code: 'TOKEN_EXPIRED'
          }, { status: 401 });
        }
        
        return Response.json({ 
          error: 'Unauthorized',
          code: 'TOKEN_INVALID'
        }, { status: 401 });
      }
    } else if (!user) {
      console.error(`[${requestId}] ✗ No authorization`);
      return Response.json({ error: 'Unauthorized', code: 'NO_AUTH' }, { status: 401 });
    }

    // Check authenticated
    const isAuthenticated = !!user || (authMethod === 'shopify_bearer' && !!shopDomain);
    console.log(`[${requestId}] Auth: method=${authMethod}, authenticated=${isAuthenticated}`);
    
    if (!isAuthenticated) {
      return Response.json({ error: 'Authentication failed', code: 'AUTH_FAILED' }, { status: 401 });
    }

    const { jobId, format } = await req.json();
    
    console.log(`[${requestId}] jobId=${jobId}, format=${format}`);
    
    if (!jobId || !format) {
      return Response.json({ error: 'Missing jobId or format', code: 'MISSING_PARAMS' }, { status: 400 });
    }

    // CRITICAL: Re-fetch job status to get fresh outputs
    console.log(`[${requestId}] Refreshing job status before download...`);
    let job = await base44.asServiceRole.entities.DemoVideoJob.get(jobId);
    
    console.log(`[${requestId}] Job status=${job?.status || 'NOT_FOUND'}`);
    
    if (!job) {
      return Response.json({ error: 'Job not found', code: 'JOB_NOT_FOUND' }, { status: 404 });
    }
    
    // If authenticated via Shopify token, verify job belongs to this shop
    if (shopDomain && job.tenant_id) {
      const tenant = await base44.asServiceRole.entities.Tenant.get(job.tenant_id);
      if (tenant?.shop_domain !== shopDomain) {
        console.log(`[${requestId}] ❌ Tenant mismatch`);
        return Response.json({ error: 'Forbidden', code: 'TENANT_MISMATCH' }, { status: 403 });
      }
    }

    // Map format to URL key
    const urlMap = {
      '1080p': job.outputs?.mp4_1080_url,
      '720p': job.outputs?.mp4_720_url,
      'shopify': job.outputs?.mp4_shopify_url,
      'thumb': job.outputs?.thumbnail_url
    };

    const url = urlMap[format];
    
    console.log(`[${requestId}] Source URL for ${format}:`, url ? 'present' : 'NULL');
    
    // Return 409 (not 404) when output not ready
    if (!url || !url.startsWith('http')) {
      console.log(`[${requestId}] ❌ Output not ready for ${format}`);
      return Response.json({ 
        error: `Video output not ready for ${format}`,
        code: 'OUTPUT_NOT_READY',
        jobStatus: job.status
      }, { status: 409 });
    }

    console.log(`[${requestId}] Fetching from upstream...`);
    
    // Fetch file from upstream
    const upstream = await fetch(url);
    
    console.log(`[${requestId}] Upstream response: ${upstream.status}`);
    
    if (!upstream.ok) {
      console.log(`[${requestId}] ❌ Upstream fetch failed`);
      return Response.json({ 
        error: 'Upstream fetch failed',
        code: 'UPSTREAM_ERROR'
      }, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const contentType = upstream.headers.get('content-type') || (format === 'thumb' ? 'image/jpeg' : 'video/mp4');

    console.log(`[${requestId}] Downloaded ${bytes.length} bytes`);

    // Validate file
    const isVideo = format !== 'thumb';
    const minSize = isVideo ? 1_500_000 : 10_000;
    
    if (bytes.length < minSize) {
      console.log(`[${requestId}] ❌ File too small: ${bytes.length} < ${minSize}`);
      return Response.json({ 
        error: `File too small: ${bytes.length} bytes`,
        code: 'FILE_TOO_SMALL'
      }, { status: 422 });
    }

    if (isVideo) {
      const header = new TextDecoder().decode(bytes.slice(0, 32));
      if (!header.includes('ftyp')) {
        console.log(`[${requestId}] ❌ Invalid MP4 signature`);
        return Response.json({ 
          error: 'Invalid MP4 file',
          code: 'INVALID_MP4'
        }, { status: 422 });
      }
      console.log(`[${requestId}] ✓ Valid MP4 signature`);
    }

    // Return file with proper headers
    const filename = format === '1080p' ? 'ProfitShieldAI-demo-1080p.mp4'
                  : format === '720p' ? 'ProfitShieldAI-demo-720p.mp4'
                  : format === 'shopify' ? 'ProfitShieldAI-app-store.mp4'
                  : 'ProfitShieldAI-thumb.jpg';

    console.log(`[${requestId}] ✓ Returning ${bytes.length} bytes as ${contentType}`);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

  } catch (err) {
    console.error(`[${requestId}] ❌ EXCEPTION:`, err.message);
    console.error(`[${requestId}] Stack:`, err.stack);
    
    // SECURITY: NEVER leak secrets/tokens
    return Response.json({ 
      error: 'Download failed',
      code: 'DOWNLOAD_ERROR'
    }, { status: 500 });
  }
});