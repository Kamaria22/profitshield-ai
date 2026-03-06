import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'guardian-review.json');

function readJson(name) {
  const p = path.join(OUT_DIR, name);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const pre = readJson('incidents-preflight.json');
const runtime = readJson('incidents-runtime.json');
const risk = readJson('risk-assessment.json');

const incidents = [
  ...((pre?.incidents) || []),
  ...((runtime?.incidents) || []),
];

const critical = incidents.filter((i) => i.severity === 'critical');
const high = incidents.filter((i) => i.severity === 'high');
const riskCritical = (risk?.summary?.critical || 0) > 0;

let decision = 'approve';
let reason = 'no critical blockers';
if (critical.length > 0) {
  decision = 'block';
  reason = 'critical incidents detected';
} else if (high.length > 0 && riskCritical) {
  decision = 'approve_with_guardrails';
  reason = 'high incidents + critical risk path; require self-heal and post-check';
}

const result = {
  ts: new Date().toISOString(),
  decision,
  reason,
  counts: {
    incidents: incidents.length,
    critical: critical.length,
    high: high.length,
    risk_critical: risk?.summary?.critical || 0,
  },
  owners: [...new Set(incidents.map((i) => i.owner_agent).filter(Boolean))],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));

console.log('[guardian-review] decision:', decision);
console.log('[guardian-review] reason:', reason);

process.exit(decision === 'block' ? 2 : 0);
