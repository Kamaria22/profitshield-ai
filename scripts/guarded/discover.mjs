import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'protection-inventory.json');

const SYSTEMS = [
  { id: 'self_heal_engine', path: 'functions/selfHeal.ts', role: 'autonomous_recovery', trigger: "base44.functions.invoke('selfHeal', { action: ... })" },
  { id: 'frontend_guardian_fn', path: 'functions/frontendGuardian.ts', role: 'runtime_guardian', trigger: "base44.functions.invoke('frontendGuardian', { action: 'watchdog'|'report_incident' })" },
  { id: 'frontend_guardian_component', path: 'src/components/FrontendGuardian.jsx', role: 'runtime_watchdog_probe', trigger: 'Mounted in LayoutWithProviders when tenant resolves' },
  { id: 'health_agent', path: 'src/components/health/HealthAgent.jsx', role: 'health_monitor', trigger: 'Initialized in LayoutWithProviders useEffect' },
  { id: 'health_error_boundary', path: 'src/components/health/HealthErrorBoundary.jsx', role: 'runtime_fail_safe', trigger: 'Wraps Layout content' },
  { id: 'incident_bus', path: 'src/components/selfheal/IncidentBus.jsx', role: 'incident_ingest_client', trigger: 'Called by HealthAgent and error capture paths' },
  { id: 'build_guardian', path: 'functions/buildGuardian.ts', role: 'build_time_guardian', trigger: "base44.functions.invoke('buildGuardian', { action: 'run' })" },
  { id: 'stability_agent', path: 'functions/stabilityAgent.ts', role: 'stability_guardian', trigger: "base44.functions.invoke('stabilityAgent', { action: 'watchdog'|'enforce' })" },
  { id: 'feature_guardian', path: 'functions/featureGuardian.ts', role: 'feature_guardian', trigger: "base44.functions.invoke('featureGuardian', { action: 'watchdog'|'fix_feature' })" },
  { id: 'support_watchdog', path: 'functions/supportWatchdog.ts', role: 'support_watchdog', trigger: "base44.functions.invoke('supportWatchdog', { manual: true })" },
  { id: 'support_guardian', path: 'functions/supportGuardian.ts', role: 'support_guardian', trigger: "base44.functions.invoke('supportGuardian', { action: ... })" },
  { id: 'shopify_connection_watchdog', path: 'functions/shopifyConnectionWatchdog.ts', role: 'shopify_runtime_watchdog', trigger: 'Scheduled or admin-triggered invocation' },
  { id: 'profit_alert_watchdog', path: 'functions/profitAlertWatchdog.ts', role: 'tenant_watchdog', trigger: 'Scheduled invocation over tenants' },
  { id: 'app_store_readiness_guardian', path: 'functions/appStoreReadinessGuardian.ts', role: 'publish_guardian', trigger: "base44.functions.invoke('appStoreReadinessGuardian', { action: 'run_all' })" },
  { id: 'agent_runtime_guards', path: 'functions/helpers/agentRuntime.ts', role: 'execution_safety_layer', trigger: 'Imported by guardian functions for rate-limit/circuit/tenant isolation' },
  { id: 'self_healing_center_ui', path: 'src/pages/SelfHealingCenter.jsx', role: 'operator_control_plane', trigger: 'Admin page to run_watchdog/approve patches/ack events' },
  { id: 'system_health_ui', path: 'src/pages/SystemHealth.jsx', role: 'observability_control_plane', trigger: 'Health dashboard and metrics display' },
];

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function usageCount(token) {
  try {
    const out = execSync(`rg -n "${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" src functions`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim() ? out.trim().split('\n').length : 0;
  } catch {
    return 0;
  }
}

function classify(system) {
  if (!exists(system.path)) {
    return { status: 'missing', implemented: false, active: false, notes: ['file not found'] };
  }

  const content = read(system.path);
  const hasHandler = /Deno\.serve\(/.test(content) || /export class/.test(content) || /export default function/.test(content);
  const hasSafetySignals = /allowRole|ensureTenantIsolation|startAgentExecution|run_watchdog|watchdog|heal_|Incident|AuditLog/.test(content);

  const fileName = path.basename(system.path, path.extname(system.path));
  const refCount = usageCount(fileName);

  const implemented = hasHandler;
  const active = refCount > 1 || /run_watchdog|watchdog/.test(content);

  let status = 'partial';
  if (implemented && active) status = 'implemented';
  if (implemented && !active) status = 'disconnected';

  const notes = [];
  if (!hasSafetySignals) notes.push('limited explicit safety markers');
  if (refCount <= 1) notes.push('few runtime references; likely manual/scheduled');

  return { status, implemented, active, refCount, notes };
}

const inventory = SYSTEMS.map((s) => ({ ...s, ...classify(s) }));

const byRole = inventory.reduce((acc, item) => {
  acc[item.role] = acc[item.role] || [];
  acc[item.role].push(item.id);
  return acc;
}, {});

const summary = {
  discovered_at: new Date().toISOString(),
  total: inventory.length,
  implemented: inventory.filter((i) => i.status === 'implemented').length,
  disconnected: inventory.filter((i) => i.status === 'disconnected').length,
  partial: inventory.filter((i) => i.status === 'partial').length,
  missing: inventory.filter((i) => i.status === 'missing').length,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ summary, byRole, inventory }, null, 2));

console.log('[discover] protection inventory written:', path.relative(ROOT, OUT_FILE));
console.log('[discover] summary:', summary);
for (const item of inventory) {
  console.log(`- ${item.id}: ${item.status} (${item.path})`);
}
