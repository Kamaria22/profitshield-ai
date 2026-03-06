import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'incidents-runtime.json');

const checks = [
  {
    id: 'embedded_entry_has_csp_header',
    file: 'functions/embeddedEntryGuard.ts',
    mustInclude: ['Content-Security-Policy', 'frame-ancestors', "object-src 'none'"],
    owner_agent: 'auth_runtime_guardian',
  },
  {
    id: 'session_exchange_has_frame_ancestors',
    file: 'functions/shopifySessionExchange.ts',
    mustInclude: ['frame-ancestors', 'Content-Security-Policy'],
    owner_agent: 'auth_runtime_guardian',
  },
  {
    id: 'app_bridge_context_guard_exists',
    file: 'src/components/shopify/AppBridgeAuth.jsx',
    mustInclude: ['hasValidAppBridgeContext', 'getHostOrigin', 'decodeHostParam'],
    owner_agent: 'frontend_guardian_fn',
  },
  {
    id: 'embedded_gate_session_exchange_path',
    file: 'src/components/shopify/ShopifyEmbeddedAuthGate.jsx',
    mustInclude: ['/api/functions/shopifySessionExchange', 'getFreshAppBridgeToken'],
    owner_agent: 'auth_runtime_guardian',
  },
  {
    id: 'nav_menu_guarded_init',
    file: 'src/components/shopify/ShopifyNavMenu.jsx',
    mustInclude: ['hasValidAppBridgeContext', 'NavigationMenu.create'],
    owner_agent: 'frontend_guardian_fn',
  },
];

const incidents = [];

for (const c of checks) {
  const abs = path.join(ROOT, c.file);
  if (!fs.existsSync(abs)) {
    incidents.push({ blocker_type: 'missing_runtime_file', severity: 'critical', owner_agent: c.owner_agent, file: c.file, message: `${c.file} missing` });
    continue;
  }

  const text = fs.readFileSync(abs, 'utf8');
  const missing = c.mustInclude.filter((token) => !text.includes(token));
  if (missing.length > 0) {
    incidents.push({
      blocker_type: 'runtime_guard_missing',
      severity: 'high',
      owner_agent: c.owner_agent,
      file: c.file,
      check_id: c.id,
      missing,
      message: `${c.id} missing required markers: ${missing.join(', ')}`,
    });
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ ts: new Date().toISOString(), incidents }, null, 2));

const critical = incidents.filter((i) => i.severity === 'critical').length;
const high = incidents.filter((i) => i.severity === 'high').length;
console.log(`[runtime-verify] incidents=${incidents.length} critical=${critical} high=${high}`);
for (const i of incidents) {
  console.log(`- [${i.severity}] ${i.blocker_type}: ${i.message}`);
}

process.exit(critical > 0 ? 2 : 0);
