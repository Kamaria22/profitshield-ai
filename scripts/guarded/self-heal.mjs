import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const PRE_FILE = path.join(OUT_DIR, 'incidents-preflight.json');
const OUT_FILE = path.join(OUT_DIR, 'self-heal-report.json');
const INCIDENT_FILE = process.env.GUARD_INCIDENT_FILE
  ? path.resolve(ROOT, process.env.GUARD_INCIDENT_FILE)
  : PRE_FILE;

function loadIncidents() {
  if (!fs.existsSync(INCIDENT_FILE)) return [];
  const json = JSON.parse(fs.readFileSync(INCIDENT_FILE, 'utf8'));
  return Array.isArray(json.incidents) ? json.incidents : [];
}

function healImportPath(incident, report) {
  const file = incident.file;
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    report.actions.push({ incident_id: incident.id, action: 'skip_missing_file', ok: false });
    return;
  }

  let text = fs.readFileSync(abs, 'utf8');
  const from = `'${incident.import_path}'`;
  const to = `'${incident.suggested_path}'`;

  if (!text.includes(from)) {
    report.actions.push({ incident_id: incident.id, action: 'skip_import_not_found', ok: false, import_path: incident.import_path });
    return;
  }

  text = text.replaceAll(from, to);
  fs.writeFileSync(abs, text);
  report.actions.push({
    incident_id: incident.id,
    action: 'rewrite_import_path',
    ok: true,
    file,
    from: incident.import_path,
    to: incident.suggested_path,
  });
}

const incidents = loadIncidents();
const report = {
  ts: new Date().toISOString(),
  applied: 0,
  skipped: 0,
  actions: [],
};

for (const incident of incidents) {
  if (!incident.healable) {
    report.skipped += 1;
    continue;
  }

  if (incident.blocker_type === 'missing_import_target' && incident.suggested_path) {
    healImportPath(incident, report);
    continue;
  }

  report.actions.push({ incident_id: incident.id, action: 'unhandled_healable_incident', ok: false, blocker_type: incident.blocker_type });
}

report.applied = report.actions.filter((a) => a.ok).length;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

console.log(`[self-heal] applied=${report.applied} actions=${report.actions.length}`);
for (const a of report.actions) {
  console.log(`- ${a.ok ? 'APPLIED' : 'SKIPPED'} ${a.action}${a.file ? ` (${a.file})` : ''}`);
}
