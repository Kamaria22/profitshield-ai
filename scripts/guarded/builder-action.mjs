import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'builder-action.json');

const out = {
  ts: new Date().toISOString(),
  action: 'builder_guard_ready',
  ok: true,
  blocker_type: null,
  owner_agent: 'build_guardian',
  output: 'Builder guard prepared. Compile validation runs in post_change_verifier.',
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

console.log('[builder-action] ok:', out.ok);
if (!out.ok) console.log('[builder-action] blocker_type:', out.blocker_type);

process.exit(out.ok ? 0 : 2);
