import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'guarded-workflow-report.json');

function run(cmd, options = {}) {
  const step = { cmd, ok: true, output: '' };
  try {
    step.output = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout ?? 180000,
      ...options
    });
  } catch (e) {
    step.ok = false;
    const timedOut = e?.signal === 'SIGTERM' || /timed out/i.test(String(e?.message || ''));
    const detail = `${e.stdout || ''}${e.stderr || ''}`.trim();
    step.output = timedOut ? `${detail}\n[guarded-workflow] step_timeout` : detail;
  }
  return step;
}

function readJson(file) {
  const abs = path.join(OUT_DIR, file);
  if (!fs.existsSync(abs)) return null;
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch { return null; }
}

const report = {
  ts: new Date().toISOString(),
  layers: {
    watchdog: ['preflight', 'runtime_health'],
    guardian: ['risk_assessment', 'guardian_review'],
    builder_agent: ['builder_action'],
    self_healing: ['self_heal', 'simulate_heal'],
    runtime_health_ai: ['runtime_verify', 'runtime_health'],
  },
  chain: [
    'layer_inventory',
    'preflight',
    'risk_assessment',
    'guardian_review',
    'builder_action',
    'runtime_verify',
    'runtime_health',
    'self_heal',
    'simulate_heal',
    'post_change_verifier',
  ],
  steps: [],
  incidents: [],
  final_status: 'unknown',
};

const runSimulateHeal = process.env.GUARD_RUN_SIMULATE_HEAL === '1';

report.steps.push({ name: 'layer_inventory', ...run('node scripts/guarded/layer-inventory.mjs') });
report.steps.push({ name: 'discovery', ...run('node scripts/guarded/discover.mjs') });

const preflight = { name: 'preflight', ...run('node scripts/guarded/preflight.mjs') };
report.steps.push(preflight);
report.steps.push({ name: 'risk_assessment', ...run('node scripts/guarded/risk-assess.mjs') });

const guardian = { name: 'guardian_review', ...run('node scripts/guarded/guardian-review.mjs') };
report.steps.push(guardian);

const builder = { name: 'builder_action', ...run('node scripts/guarded/builder-action.mjs') };
report.steps.push(builder);

const runtimeVerify = { name: 'runtime_verify', ...run('node scripts/guarded/runtime-verify.mjs') };
report.steps.push(runtimeVerify);
const runtimeHealth = { name: 'runtime_health', ...run('node scripts/guarded/runtime-health-check.mjs') };
report.steps.push(runtimeHealth);

if (!preflight.ok || !guardian.ok || !builder.ok || !runtimeVerify.ok || !runtimeHealth.ok) {
  report.steps.push({ name: 'self_heal', ...run('node scripts/guarded/self-heal.mjs') });
  report.steps.push({ name: 'preflight_post_heal', ...run('node scripts/guarded/preflight.mjs') });
  report.steps.push({ name: 'runtime_post_heal', ...run('node scripts/guarded/runtime-health-check.mjs') });
}

if (runSimulateHeal) {
  const simHeal = { name: 'simulate_heal', ...run('node scripts/guarded/simulate-heal.mjs') };
  report.steps.push(simHeal);
}

// post-change verifier (lightweight, non-recursive verification)
report.steps.push({ name: 'post_change_verifier', ...run('node scripts/guarded/runtime-verify.mjs') });

const pre = readJson('incidents-preflight.json');
const runtime = readJson('incidents-runtime.json');
const runtimeHealthJson = readJson('runtime-health-check.json');
report.incidents = [
  ...(pre?.incidents || []),
  ...(runtime?.incidents || []),
  ...((runtimeHealthJson?.incidents) || []),
];

const failed = report.steps.filter((s) => !s.ok).map((s) => s.name);
report.final_status = failed.length ? 'blocked' : 'pass';
report.failed_steps = failed;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

console.log('[guarded-workflow] final_status:', report.final_status);
if (failed.length) console.log('[guarded-workflow] failed_steps:', failed.join(', '));
console.log('[guarded-workflow] report:', path.relative(ROOT, OUT_FILE));

process.exit(report.final_status === 'pass' ? 0 : 2);
