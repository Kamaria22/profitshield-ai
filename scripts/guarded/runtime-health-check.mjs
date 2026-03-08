import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'runtime-health-check.json');

const checks = [
  {
    id: 'layout_mounts_frontend_guardian',
    file: 'src/Layout.jsx',
    tokens: ['<FrontendGuardian', 'ShopifyEmbeddedAuthGate', 'healthAgent.init()'],
    owner_agent: 'runtime_health_ai',
  },
  {
    id: 'embedded_auth_gate_uses_session_exchange',
    file: 'src/components/shopify/ShopifyEmbeddedAuthGate.jsx',
    tokens: ['runAuth', 'getFreshAppBridgeToken'],
    anyTokens: ["base44.functions.invoke('shopifySessionExchange'", "base44.functions.invoke('shopifyAuth'", "action: 'session_exchange'"],
    owner_agent: 'auth_guardian',
  },
  {
    id: 'appbridge_guard_present',
    file: 'src/components/shopify/AppBridgeAuth.jsx',
    tokens: ['hasValidAppBridgeContext', 'decodeHostParam', 'getHostOrigin'],
    owner_agent: 'runtime_guardian',
  },
  {
    id: 'nav_menu_guard_present',
    file: 'src/components/shopify/ShopifyNavMenu.jsx',
    tokens: ['hasValidAppBridgeContext', 'NavigationMenu.create'],
    owner_agent: 'runtime_guardian',
  },
  {
    id: 'embedded_entry_csp_present',
    file: 'functions/embeddedEntryGuard.ts',
    tokens: ['Content-Security-Policy', 'frame-ancestors', "object-src 'none'"],
    owner_agent: 'auth_guardian',
  },
  {
    id: 'home_embedded_dashboard_summary_path',
    file: 'src/pages/Home.jsx',
    tokens: ["action: 'embedded_summary'"],
    anyTokens: ["base44.functions.invoke('dashboardAI'", "invokeWithRetry('dashboardAI'"],
    owner_agent: 'watchdog',
  },
  {
    id: 'home_scan_action_wired',
    file: 'src/pages/Home.jsx',
    tokens: ['syncMutation.mutate()', 'onScan={handleScan}'],
    owner_agent: 'runtime_guardian',
  },
  {
    id: 'self_heal_accepts_incidentbus_publish',
    file: 'functions/selfHeal.ts',
    tokens: ["action === 'publish_incident'", 'issue_code', 'details_json'],
    owner_agent: 'self_healing',
  },
];

const incidents = [];
for (const c of checks) {
  const abs = path.join(ROOT, c.file);
  if (!fs.existsSync(abs)) {
    incidents.push({ severity: 'critical', blocker_type: 'missing_runtime_file', owner_agent: c.owner_agent, check: c.id, file: c.file });
    continue;
  }
  const text = fs.readFileSync(abs, 'utf8');
  const missing = (c.tokens || []).filter((t) => !text.includes(t));
  const anyTokensMissing = c.anyTokens && !c.anyTokens.some((t) => text.includes(t));
  if (anyTokensMissing) {
    missing.push(`one_of:${c.anyTokens.join('|')}`);
  }
  if (missing.length) {
    incidents.push({ severity: 'high', blocker_type: 'runtime_guard_missing', owner_agent: c.owner_agent, check: c.id, file: c.file, missing });
  }
}

const result = {
  ts: new Date().toISOString(),
  ok: incidents.filter((i) => i.severity === 'critical').length === 0,
  incidents,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));

console.log(`[runtime-health-check] incidents=${incidents.length}`);
for (const i of incidents) {
  console.log(`- [${i.severity}] ${i.blocker_type}: ${i.check}`);
}

process.exit(result.ok ? 0 : 2);
