import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'layer-inventory.json');

function legacyToBase44(rel) {
  if (rel === 'functions/helpers/agentRuntime.ts') return 'base44/functions/helpers/agentRuntime/entry.ts';
  if (!rel.startsWith('functions/') || !rel.endsWith('.ts')) return rel;
  const name = path.basename(rel, '.ts');
  return `base44/functions/${name}/entry.ts`;
}

function resolveExistingPath(rel) {
  const candidates = [rel, legacyToBase44(rel)];
  return candidates.find((candidate) => fs.existsSync(path.join(ROOT, candidate))) || rel;
}

const LAYERS = {
  watchdog: [
    'functions/shopifyConnectionWatchdog.ts',
    'functions/supportWatchdog.ts',
    'functions/vulnerabilityWatchdog.ts',
    'functions/profitAlertWatchdog.ts',
    'functions/appStoreReadinessGuardian.ts',
    'src/components/FrontendGuardian.jsx',
  ],
  guardian: [
    'functions/buildGuardian.ts',
    'functions/featureGuardian.ts',
    'functions/supportGuardian.ts',
    'functions/stabilityAgent.ts',
    'functions/helpers/agentRuntime.ts',
  ],
  builder_agent: [
    'functions/buildGuardian.ts',
    'functions/autonomousDebugBot.ts',
    'scripts/guarded/preflight.mjs',
    'scripts/guarded/builder-action.mjs',
  ],
  self_healing: [
    'functions/selfHeal.ts',
    'src/components/selfheal/IncidentBus.jsx',
    'src/pages/SelfHealingCenter.jsx',
    'scripts/guarded/self-heal.mjs',
  ],
  runtime_health_ai: [
    'src/components/health/HealthAgent.jsx',
    'src/components/health/HealthErrorBoundary.jsx',
    'src/components/health/AutonomousHealthDashboard.jsx',
    'functions/stabilityAgent.ts',
    'scripts/guarded/runtime-health-check.mjs',
  ],
};

function classify(rel) {
  const resolved = resolveExistingPath(rel);
  const abs = path.join(ROOT, resolved);
  if (!fs.existsSync(abs)) return { file: rel, resolved_file: resolved, status: 'missing', weak: true, note: 'file not found' };
  const content = fs.readFileSync(abs, 'utf8');
  const hasCore = /Deno\.serve\(|export default function|export class|watchdog|guardian|heal|health|incident|risk|build/i.test(content);
  return { file: rel, resolved_file: resolved, status: hasCore ? 'active_or_usable' : 'partial', weak: !hasCore, note: hasCore ? '' : 'low signal in file body' };
}

const layers = {};
for (const [name, files] of Object.entries(LAYERS)) {
  layers[name] = files.map(classify);
}

const missingOrWeak = Object.entries(layers)
  .flatMap(([layer, entries]) => entries.filter((e) => e.weak || e.status === 'missing').map((e) => ({ layer, ...e })));

const summary = {
  generated_at: new Date().toISOString(),
  layers: Object.keys(LAYERS).length,
  total_modules: Object.values(LAYERS).reduce((n, arr) => n + arr.length, 0),
  weak_or_missing: missingOrWeak.length,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ summary, layers, weak_or_missing: missingOrWeak }, null, 2));

console.log('[layer-inventory] written:', path.relative(ROOT, OUT_FILE));
console.log('[layer-inventory] summary:', summary);
if (missingOrWeak.length) {
  for (const item of missingOrWeak) {
    console.log(`- [${item.layer}] ${item.file}: ${item.status}`);
  }
}
