import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

async function sendCompletionEmail(base44: any, job: any, userEmail: string) {
  const downloadLinks = Object.entries(job.outputs || {})
    .filter(([_, output]: any) => output?.url)
    .map(([format, output]: any) => `<li><a href="${output.url}" style="color: #10b981;">${format}</a></li>`)
    .join('');

  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">Video Ready! 🎬</h1>
      </div>
      <div style="padding: 30px; background: #f8fafc;">
        <p style="font-size: 16px; color: #334155;">Your video has been generated successfully!</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #64748b; margin: 0 0 10px 0;">Job ID: <strong>${job.id.slice(0, 8)}</strong></p>
          <p style="color: #64748b; margin: 0 0 10px 0;">Version: <strong>${job.version}</strong></p>
          <p style="color: #64748b; margin: 0;">Mode: <strong>${job.mode}</strong></p>
        </div>
        <h3 style="color: #1e293b;">Download Your Video:</h3>
        <ul style="list-style: none; padding: 0;">
          ${downloadLinks}
        </ul>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://profit-shield-ai.base44.app/VideoJobs" 
             style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View All Jobs
          </a>
        </div>
      </div>
      <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p>ProfitShield AI - Video Generation System</p>
      </div>
    </div>
  `;

  await base44.integrations.Core.SendEmail({
    to: userEmail,
    subject: `✅ Video Job #${job.id.slice(0, 8)} Complete`,
    body,
  });
}

async function sendFailureEmail(base44: any, job: any, userEmail: string) {
  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">Video Generation Failed ⚠️</h1>
      </div>
      <div style="padding: 30px; background: #f8fafc;">
        <p style="font-size: 16px; color: #334155;">Unfortunately, your video job encountered an error.</p>
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <p style="color: #64748b; margin: 0 0 10px 0;">Job ID: <strong>${job.id.slice(0, 8)}</strong></p>
          <p style="color: #64748b; margin: 0 0 10px 0;">Version: <strong>${job.version}</strong></p>
          <p style="color: #dc2626; margin: 10px 0 0 0;"><strong>Error:</strong> ${job.error_message || 'Unknown error'}</p>
        </div>
        <p style="color: #64748b;">The system will automatically retry this job. You can also manually retry from the dashboard.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://profit-shield-ai.base44.app/VideoJobs" 
             style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Jobs & Retry
          </a>
        </div>
      </div>
      <div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
        <p>ProfitShield AI - Video Generation System</p>
      </div>
    </div>
  `;

  await base44.integrations.Core.SendEmail({
    to: userEmail,
    subject: `❌ Video Job #${job.id.slice(0, 8)} Failed`,
    body,
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data, old_data } = await req.json();

    if (event.type !== "update" || !data || !old_data) {
      return Response.json({ message: "Not an update event" }, { status: 200 });
    }

    const job = data;
    const oldJob = old_data;

    // Only notify on status changes
    if (job.status === oldJob.status) {
      return Response.json({ message: "No status change" }, { status: 200 });
    }

    // Get owner email (the founder)
    const ownerEmail = "rohan.a.roberts@gmail.com";

    if (job.status === "completed") {
      await sendCompletionEmail(base44, job, ownerEmail);
    } else if (job.status === "failed") {
      await sendFailureEmail(base44, job, ownerEmail);
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[videoJobNotifier] error:", err);
    return Response.json({ error: err?.message || "Notification failed" }, { status: 500 });
  }
});