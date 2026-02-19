import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * GET /demo-video/download?jobId=...&format=...
 * Serves demo video files with proper CORS headers for Shopify iframe
 * 
 * Formats: 1080p, 720p, shopify, thumb
 */
Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    const format = url.searchParams.get('format');

    if (!jobId || !format) {
      return Response.json({
        error: 'MISSING_PARAMS',
        message: 'jobId and format query parameters required'
      }, { status: 400 });
    }

    const job = await base44.entities.DemoVideoJob.get(jobId);
    if (!job) {
      return Response.json({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`
      }, { status: 404 });
    }

    if (job.status !== 'completed') {
      return Response.json({
        error: 'JOB_NOT_READY',
        message: `Job is ${job.status}, not completed`
      }, { status: 412 });
    }

    const outputs = job.outputs || {};
    let fileUrl = null;
    let fileName = 'demo-video';

    switch (format) {
      case '1080p':
        fileUrl = outputs.mp4_1080_url;
        fileName = 'demo-video-1080p.mp4';
        break;
      case '720p':
        fileUrl = outputs.mp4_720_url;
        fileName = 'demo-video-720p.mp4';
        break;
      case 'shopify':
        fileUrl = outputs.mp4_shopify_url;
        fileName = 'demo-video-shopify.mp4';
        break;
      case 'thumb':
        fileUrl = outputs.thumbnail_url;
        fileName = 'demo-video-thumb.jpg';
        break;
      default:
        return Response.json({
          error: 'INVALID_FORMAT',
          message: `Format must be one of: 1080p, 720p, shopify, thumb`
        }, { status: 400 });
    }

    if (!fileUrl) {
      return Response.json({
        error: 'FILE_NOT_FOUND',
        message: `${format} video not available for this job`
      }, { status: 404 });
    }

    // For now: redirect to the file URL with proper headers
    // In production: proxy through and add auth/signing if needed
    return Response.redirect(fileUrl, 302);

  } catch (error) {
    console.error('Download proxy error:', error.message);
    return Response.json({
      error: 'DOWNLOAD_ERROR',
      message: 'Failed to process download request'
    }, { status: 500 });
  }
});