/**
 * App Store Screenshot Generator
 * Generates professional Shopify App Store screenshots using canvas
 */
import React, { useRef, useState } from 'react';
import { Download, Image, Loader2, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const SCREENSHOTS = [
  {
    id: 'dashboard',
    label: 'Dashboard Overview',
    bg: 'linear-gradient(135deg, #0a0f1e 0%, #111827 100%)',
    accent: '#6366f1',
    headline: 'Profit Intelligence Dashboard',
    subline: 'Real-time P&L analytics powered by AI',
    mockup: 'dashboard',
  },
  {
    id: 'fraud',
    label: 'Fraud Detection',
    bg: 'linear-gradient(135deg, #0f0a1e 0%, #1a0f2e 100%)',
    accent: '#f43f5e',
    headline: 'Neural Fraud Engine',
    subline: 'Block chargebacks before they happen',
    mockup: 'fraud',
  },
  {
    id: 'analytics',
    label: 'P&L Analytics',
    bg: 'linear-gradient(135deg, #0a1e0f 0%, #0f1a0a 100%)',
    accent: '#10b981',
    headline: 'Live Margin Tracking',
    subline: 'Know your true profit on every order',
    mockup: 'analytics',
  },
  {
    id: 'risk',
    label: 'Risk Intelligence',
    bg: 'linear-gradient(135deg, #1e0a0a 0%, #1a0f0f 100%)',
    accent: '#f59e0b',
    headline: 'Risk Intelligence Center',
    subline: '50+ behavioral signals per order',
    mockup: 'risk',
  },
  {
    id: 'alerts',
    label: 'Smart Alerts',
    bg: 'linear-gradient(135deg, #0a0f1e 0%, #0f111e 100%)',
    accent: '#8b5cf6',
    headline: 'Automated Smart Alerts',
    subline: 'Get notified of profit leaks instantly',
    mockup: 'alerts',
  },
];

function drawDashboardMockup(ctx, w, h, accent) {
  // Panel background
  const panel = (x, y, pw, ph, label, value, color) => {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, pw, ph, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color || '#a5b4fc';
    ctx.font = `bold ${Math.round(pw * 0.22)}px sans-serif`;
    ctx.fillText(value, x + 16, y + ph * 0.52);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `${Math.round(pw * 0.11)}px sans-serif`;
    ctx.fillText(label, x + 16, y + ph * 0.78);
  };

  const cols = 3, rows = 2, gap = 16;
  const cellW = (w * 0.9 - gap * (cols - 1)) / cols;
  const cellH = h * 0.22;
  const startX = w * 0.05;
  const startY = h * 0.12;

  const cards = [
    { label: 'Net Profit', value: '$18,420', color: '#34d399' },
    { label: 'Fraud Blocked', value: '47 orders', color: '#f87171' },
    { label: 'Risk Score', value: '94/100', color: '#a78bfa' },
    { label: 'Margin', value: '38.4%', color: '#fbbf24' },
    { label: 'Active Alerts', value: '3', color: '#f43f5e' },
    { label: 'Profit Score', value: '96', color: '#6ee7b7' },
  ];

  cards.forEach((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    panel(startX + col * (cellW + gap), startY + row * (cellH + gap), cellW, cellH, c.label, c.value, c.color);
  });

  // Mini chart
  const chartX = startX, chartY = startY + 2 * (cellH + gap) + 10;
  const chartW = w * 0.9, chartH = h * 0.25;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, chartX, chartY, chartW, chartH, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = `bold ${Math.round(chartH * 0.15)}px sans-serif`;
  ctx.fillText('Profit Trend — Last 30 Days', chartX + 16, chartY + chartH * 0.3);

  // Draw simple bar chart
  const bars = [40, 55, 35, 70, 60, 80, 50, 90, 75, 88, 65, 95];
  const barW = (chartW - 40) / bars.length * 0.6;
  const barGap = (chartW - 40) / bars.length;
  bars.forEach((v, i) => {
    const bh = (v / 100) * chartH * 0.5;
    const bx = chartX + 20 + i * barGap;
    const by = chartY + chartH - 20 - bh;
    ctx.fillStyle = accent + 'cc';
    roundRect(ctx, bx, by, barW, bh, 3);
    ctx.fill();
  });
}

function drawFraudMockup(ctx, w, h, accent) {
  const rows = [
    { order: '#10291', risk: 94, label: 'HIGH RISK', color: '#f43f5e' },
    { order: '#10287', risk: 32, label: 'LOW RISK', color: '#34d399' },
    { order: '#10285', risk: 71, label: 'HIGH RISK', color: '#f43f5e' },
    { order: '#10280', risk: 58, label: 'MED RISK', color: '#fbbf24' },
    { order: '#10278', risk: 15, label: 'LOW RISK', color: '#34d399' },
  ];

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, w * 0.05, h * 0.1, w * 0.9, h * 0.8, 14);
  ctx.fill(); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `bold ${h * 0.04}px sans-serif`;
  ctx.fillText('Order Risk Analysis', w * 0.08, h * 0.2);

  rows.forEach((r, i) => {
    const y = h * 0.27 + i * h * 0.13;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, w * 0.07, y, w * 0.86, h * 0.1, 8);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `${h * 0.032}px sans-serif`;
    ctx.fillText(r.order, w * 0.1, y + h * 0.063);

    // Risk bar
    const barX = w * 0.38, barY = y + h * 0.035, barW = w * 0.35, barH = h * 0.03;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, barX, barY, barW, barH, 3); ctx.fill();
    ctx.fillStyle = r.color;
    roundRect(ctx, barX, barY, barW * r.risk / 100, barH, 3); ctx.fill();

    ctx.fillStyle = r.color;
    ctx.font = `bold ${h * 0.027}px sans-serif`;
    ctx.fillText(r.label, w * 0.76, y + h * 0.063);
  });
}

function drawAnalyticsMockup(ctx, w, h, accent) {
  const metrics = [
    { label: 'Revenue', value: '$42,800', pct: '+12%' },
    { label: 'COGS', value: '$18,200', pct: '-3%' },
    { label: 'Net Profit', value: '$18,420', pct: '+18%' },
  ];

  metrics.forEach((m, i) => {
    const x = w * 0.05 + i * (w * 0.3 + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, x, h * 0.1, w * 0.28, h * 0.18, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#34d399';
    ctx.font = `bold ${h * 0.07}px sans-serif`;
    ctx.fillText(m.value, x + 12, h * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `${h * 0.03}px sans-serif`;
    ctx.fillText(m.label, x + 12, h * 0.265);
    ctx.fillStyle = m.pct.startsWith('+') ? '#34d399' : '#f43f5e';
    ctx.font = `bold ${h * 0.028}px sans-serif`;
    ctx.fillText(m.pct, x + w * 0.18, h * 0.22);
  });

  // Line chart
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  roundRect(ctx, w * 0.05, h * 0.34, w * 0.9, h * 0.54, 12);
  ctx.fill(); ctx.stroke();

  const pts = [0.3, 0.45, 0.35, 0.55, 0.5, 0.65, 0.6, 0.75, 0.7, 0.85, 0.78, 0.9];
  const lx = w * 0.07, lw = w * 0.86, ly = h * 0.38, lh = h * 0.42;
  ctx.beginPath();
  ctx.moveTo(lx, ly + lh * (1 - pts[0]));
  pts.forEach((v, i) => ctx.lineTo(lx + (i / (pts.length - 1)) * lw, ly + lh * (1 - v)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Fill under line
  ctx.lineTo(lx + lw, ly + lh);
  ctx.lineTo(lx, ly + lh);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, ly, 0, ly + lh);
  grad.addColorStop(0, accent + '55');
  grad.addColorStop(1, accent + '00');
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawRiskMockup(ctx, w, h, accent) {
  // Big score ring
  const cx = w * 0.5, cy = h * 0.38, r = h * 0.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 18;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.92);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  ctx.font = `bold ${h * 0.1}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('92', cx, cy + h * 0.04);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `${h * 0.033}px sans-serif`;
  ctx.fillText('RISK SCORE', cx, cy + h * 0.1);
  ctx.textAlign = 'left';

  // Signals
  const signals = [
    { label: 'IP Match', val: 'Pass', ok: true },
    { label: 'Address Verify', val: 'Pass', ok: true },
    { label: 'Device Fingerprint', val: 'Warning', ok: false },
    { label: 'Email Age', val: 'Pass', ok: true },
  ];
  signals.forEach((s, i) => {
    const y = h * 0.63 + i * h * 0.09;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, w * 0.07, y, w * 0.86, h * 0.075, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${h * 0.03}px sans-serif`;
    ctx.fillText(s.label, w * 0.12, y + h * 0.047);
    ctx.fillStyle = s.ok ? '#34d399' : '#fbbf24';
    ctx.font = `bold ${h * 0.028}px sans-serif`;
    ctx.fillText(s.val, w * 0.76, y + h * 0.047);
  });
}

function drawAlertsMockup(ctx, w, h, accent) {
  const alerts = [
    { icon: '⚠️', title: 'High Risk Order Detected', sub: 'Order #10291 — Score 94', color: '#f43f5e', time: '2m ago' },
    { icon: '📉', title: 'Margin Below Threshold', sub: 'Product: Wireless Headphones', color: '#fbbf24', time: '15m ago' },
    { icon: '🔒', title: 'Suspicious IP Cluster', sub: '3 orders from same IP', color: '#f43f5e', time: '1h ago' },
    { icon: '✅', title: 'Auto-hold Applied', sub: 'Order #10289 on hold', color: '#34d399', time: '2h ago' },
  ];

  alerts.forEach((a, i) => {
    const y = h * 0.08 + i * (h * 0.2 + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.strokeStyle = a.color + '44';
    ctx.lineWidth = 1.5;
    roundRect(ctx, w * 0.05, y, w * 0.9, h * 0.17, 10);
    ctx.fill(); ctx.stroke();

    // Left accent bar
    ctx.fillStyle = a.color;
    roundRect(ctx, w * 0.05, y, 4, h * 0.17, 10);
    ctx.fill();

    ctx.font = `bold ${h * 0.038}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(a.title, w * 0.1, y + h * 0.07);
    ctx.font = `${h * 0.03}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(a.sub, w * 0.1, y + h * 0.115);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(a.time, w * 0.82, y + h * 0.07);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function ScreenshotCanvas({ screenshot, width = 1280, height = 800 }) {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;

    // Background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    const stops = screenshot.bg.match(/#[0-9a-f]{6}/gi) || ['#0a0f1e', '#111827'];
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[1] || stops[0]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle noise dots
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }

    // Header bar
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, w, h * 0.07);
    ctx.fillStyle = screenshot.accent + 'dd';
    ctx.font = `bold ${h * 0.036}px sans-serif`;
    ctx.fillText('🛡 ProfitShield AI', w * 0.03, h * 0.048);

    // Headline
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `bold ${h * 0.055}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(screenshot.headline, w / 2, h * 0.93);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `${h * 0.03}px sans-serif`;
    ctx.fillText(screenshot.subline, w / 2, h * 0.97);
    ctx.textAlign = 'left';

    // Content area
    const drawFns = { dashboard: drawDashboardMockup, fraud: drawFraudMockup, analytics: drawAnalyticsMockup, risk: drawRiskMockup, alerts: drawAlertsMockup };
    const contentCtx = ctx;
    contentCtx.save();
    contentCtx.translate(0, h * 0.07);
    const scale = 0.81;
    contentCtx.scale(1, scale);
    (drawFns[screenshot.mockup] || drawDashboardMockup)(contentCtx, w, h * 0.82, screenshot.accent);
    contentCtx.restore();

    setRendered(true);
  }, [screenshot]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `profitshield-screenshot-${screenshot.id}.png`;
    a.click();
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded-xl border border-white/10 shadow-xl"
        style={{ aspectRatio: `${width}/${height}` }}
      />
      <Button
        onClick={handleDownload}
        disabled={!rendered}
        size="sm"
        className="w-full gap-2 bg-indigo-600/80 hover:bg-indigo-600"
      >
        <Download className="w-4 h-4" />
        Download {screenshot.label}
      </Button>
    </div>
  );
}

export default function ScreenshotGenerator() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [generating, setGenerating] = useState(false);

  const downloadAll = () => {
    setGenerating(true);
    // Trigger individual downloads via hidden canvases
    SCREENSHOTS.forEach((s, i) => {
      setTimeout(() => {
        const canvas = document.getElementById(`shot-${s.id}`);
        if (!canvas) return;
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `profitshield-screenshot-${i + 1}-${s.id}.png`;
        a.click();
        if (i === SCREENSHOTS.length - 1) setGenerating(false);
      }, i * 600);
    });
  };

  return (
    <Card className="glass-card border-white/5">
      <CardHeader>
        <CardTitle className="text-slate-200 flex items-center gap-2">
          <Image className="w-5 h-5 text-violet-400" />
          App Store Screenshot Generator
          <Badge className="ml-auto bg-violet-500/20 text-violet-300 border-violet-500/30">
            {SCREENSHOTS.length} screenshots
          </Badge>
        </CardTitle>
        <p className="text-sm text-slate-400 mt-1">
          Generate 1280×800px screenshots for Shopify App Store listing. Click a tab to preview, then download.
        </p>
      </CardHeader>
      <CardContent>
        {/* Tab selector */}
        <div className="flex gap-2 flex-wrap mb-4">
          {SCREENSHOTS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeIdx === i
                  ? 'bg-violet-500/25 text-violet-300 border border-violet-500/40'
                  : 'bg-white/5 text-slate-400 border border-white/8 hover:text-slate-200'
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="mb-4">
          <ScreenshotCanvas screenshot={SCREENSHOTS[activeIdx]} />
        </div>

        {/* Navigation + Download All */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveIdx(p => Math.max(0, p - 1))}
            disabled={activeIdx === 0}
            className="border-white/10"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-slate-400 flex-1 text-center">
            {activeIdx + 1} / {SCREENSHOTS.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveIdx(p => Math.min(SCREENSHOTS.length - 1, p + 1))}
            disabled={activeIdx === SCREENSHOTS.length - 1}
            className="border-white/10"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Button
          onClick={downloadAll}
          disabled={generating}
          className="w-full mt-4 gap-2 bg-violet-600 hover:bg-violet-700"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating ? 'Downloading all...' : 'Download All 5 Screenshots'}
        </Button>

        {/* Hidden canvases for bulk download */}
        <div className="hidden">
          {SCREENSHOTS.map(s => (
            <HiddenCanvas key={s.id} screenshot={s} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HiddenCanvas({ screenshot }) {
  const canvasRef = useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = 1280, h = 800;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    const stops = screenshot.bg.match(/#[0-9a-f]{6}/gi) || ['#0a0f1e', '#111827'];
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[1] || stops[0]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, w, h * 0.07);
    ctx.fillStyle = screenshot.accent + 'dd';
    ctx.font = `bold ${h * 0.036}px sans-serif`;
    ctx.fillText('🛡 ProfitShield AI', w * 0.03, h * 0.048);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `bold ${h * 0.055}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(screenshot.headline, w / 2, h * 0.93);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `${h * 0.03}px sans-serif`;
    ctx.fillText(screenshot.subline, w / 2, h * 0.97);
    ctx.textAlign = 'left';
    ctx.save();
    ctx.translate(0, h * 0.07);
    ctx.scale(1, 0.81);
    const drawFns = { dashboard: drawDashboardMockup, fraud: drawFraudMockup, analytics: drawAnalyticsMockup, risk: drawRiskMockup, alerts: drawAlertsMockup };
    (drawFns[screenshot.mockup] || drawDashboardMockup)(ctx, w, h * 0.82, screenshot.accent);
    ctx.restore();
  }, []);

  return <canvas id={`shot-${screenshot.id}`} ref={canvasRef} width={1280} height={800} />;
}