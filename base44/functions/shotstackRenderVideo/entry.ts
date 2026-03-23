import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
const SHOTSTACK_ENV = Deno.env.get("SHOTSTACK_ENV") || "stage";
const SHOTSTACK_BASE = `https://api.shotstack.io/${SHOTSTACK_ENV}`;

async function fetchMetrics(base44, tenantId, integrationId) {
  const [orders, products] = await Promise.all([
    base44.asServiceRole.entities.Order.filter({ tenant_id: tenantId }).catch(() => []),
    base44.asServiceRole.entities.Product.filter({ tenant_id: tenantId }).catch(() => []),
  ]);

  const revenue = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
  const profit = orders.reduce((sum, o) => sum + (o.profit || 0), 0);
  const avgMargin = profit / (revenue || 1);

  return {
    revenue: revenue.toFixed(0),
    profit: profit.toFixed(0),
    margin: (avgMargin * 100).toFixed(1),
    orders: orders.length,
    products: products.length,
  };
}

function buildShotstackEdit(metrics, version, options) {
  const duration = version === "60s" ? 60 : version === "120s" ? 120 : 90;

  return {
    timeline: {
      soundtrack: options.music ? {
        src: "https://shotstack-assets.s3.amazonaws.com/music/dreams.mp3",
        effect: "fadeInFadeOut",
        volume: 0.3,
      } : undefined,
      tracks: [
        {
          clips: [
            {
              asset: { type: "html", html: `<div style="font-size:80px;color:white;font-family:Arial;text-align:center;padding:100px;">ProfitShield AI<br/><span style="font-size:40px;">Revenue: $${metrics.revenue}</span></div>`, css: "body{background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;}" },
              start: 0,
              length: 5,
              transition: { in: "fade", out: "fade" },
            },
            {
              asset: { type: "html", html: `<div style="font-size:60px;color:white;font-family:Arial;text-align:center;padding:100px;">Profit: $${metrics.profit}<br/>Margin: ${metrics.margin}%</div>`, css: "body{background:#059669;display:flex;align-items:center;justify-content:center;height:100vh;}" },
              start: 5,
              length: 5,
              transition: { in: "fade", out: "fade" },
            },
            {
              asset: { type: "html", html: `<div style="font-size:60px;color:white;font-family:Arial;text-align:center;padding:100px;">${metrics.orders} Orders<br/>${metrics.products} Products</div>`, css: "body{background:#1e40af;display:flex;align-items:center;justify-content:center;height:100vh;}" },
              start: 10,
              length: Math.max(5, duration - 10),
              transition: { in: "fade", out: "fade" },
            },
          ],
        },
      ],
    },
    output: {
      format: "mp4",
      resolution: "1080",
      fps: 30,
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, tenantId, integrationId, version, options } = await req.json();

    if (!jobId) {
      return Response.json({ error: "Missing jobId" }, { status: 400 });
    }

    await base44.asServiceRole.entities.DemoVideoJob.update(jobId, { status: "rendering", progress: 10 });

    const metrics = await fetchMetrics(base44, tenantId, integrationId);
    const edit = buildShotstackEdit(metrics, version, options);

    const res = await fetch(`${SHOTSTACK_BASE}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SHOTSTACK_API_KEY,
      },
      body: JSON.stringify(edit),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Shotstack API error: ${err}`);
    }

    const data = await res.json();
    const renderId = data?.response?.id;

    if (!renderId) {
      throw new Error("No render ID returned from Shotstack");
    }

    await base44.asServiceRole.entities.DemoVideoJob.update(jobId, {
      status: "rendering",
      progress: 20,
      outputs: { shotstack_render_id: renderId },
    });

    // Poll for completion
    setTimeout(() => {
      base44.asServiceRole.functions.invoke("shotstackPollStatus", { jobId, renderId }).catch(console.error);
    }, 5000);

    return Response.json({ success: true, renderId }, { status: 200 });
  } catch (err) {
    console.error("[shotstackRenderVideo] error:", err);
    return Response.json({ error: err?.message || "Render failed" }, { status: 500 });
  }
});