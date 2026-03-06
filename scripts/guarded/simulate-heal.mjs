import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const GUARD_DIR = path.join(ROOT, '.guard');
const TMP_FILE = path.join(GUARD_DIR, 'tmp-import-sim.js');
const SIM_INCIDENT_FILE = path.join(GUARD_DIR, 'incidents-simulated.json');
const OUT_FILE = path.join(GUARD_DIR, 'simulate-heal-report.json');

fs.mkdirSync(GUARD_DIR, { recursive: true });

// Failure scenario
fs.writeFileSync(TMP_FILE, "import Page from './pages/WrongPath';\nexport default Page;\n");
fs.writeFileSync(SIM_INCIDENT_FILE, JSON.stringify({
  ts: new Date().toISOString(),
  incidents: [
    {
      id: 'sim_1',
      blocker_type: 'missing_import_target',
      severity: 'critical',
      owner_agent: 'build_guardian',
      file: '.guard/tmp-import-sim.js',
      import_path: './pages/WrongPath',
      suggested_path: './pages/CorrectPath',
      healable: true,
      message: 'simulated import failure',
    }
  ],
}, null, 2));

let healOk = false;
let healedContent = '';
try {
  execSync('node scripts/guarded/self-heal.mjs', {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GUARD_INCIDENT_FILE: '.guard/incidents-simulated.json'
    }
  });
  healedContent = fs.readFileSync(TMP_FILE, 'utf8');
  healOk = healedContent.includes("'./pages/CorrectPath'");
} catch {
  healOk = false;
}

const report = {
  ts: new Date().toISOString(),
  failure_scenario: 'missing_import_target simulated in .guard/tmp-import-sim.js',
  recovery_expected: "import path rewritten to './pages/CorrectPath'",
  recovery_observed: healOk,
  healed_content: healedContent,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
console.log('[simulate-heal] recovery_observed:', healOk);

process.exit(healOk ? 0 : 2);
