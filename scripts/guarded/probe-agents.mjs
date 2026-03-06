import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'agent-probe.json');

const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

const probes = [
  { id: 'selfHeal', path: '/api/functions/selfHeal', body: { action: 'get_flags' } },
  { id: 'stabilityAgent', path: '/api/functions/stabilityAgent', body: { action: 'prove_live' } },
  { id: 'appStoreReadinessGuardian', path: '/api/functions/appStoreReadinessGuardian', body: { action: 'prove_live' } },
  { id: 'supportGuardian', path: '/api/functions/supportGuardian', body: { action: 'run_watchdog' } },
  { id: 'buildGuardian', path: '/api/functions/buildGuardian', body: { action: 'run' } },
  { id: 'shopifyConnectionWatchdog', path: '/api/functions/shopifyConnectionWatchdog', body: {} },
];

async function run() {
  if (!APP_URL) {
    const skipped = { ok: false, skipped: true, reason: 'APP_URL env not set; remote probe skipped' };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify({ ts: new Date().toISOString(), skipped, results: [] }, null, 2));
    console.log('[probe-agents] skipped: APP_URL env not set');
    return;
  }

  const results = [];
  for (const p of probes) {
    const url = `${APP_URL}${p.path}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(p.body),
      });
      const data = await res.json().catch(() => ({}));
      results.push({ id: p.id, url, status: res.status, ok: res.ok && data?.ok !== false, data_preview: data?.version || data?.function || data?.error || null });
    } catch (e) {
      results.push({ id: p.id, url, status: 0, ok: false, error: e.message });
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ ts: new Date().toISOString(), app_url: APP_URL, results }, null, 2));

  const failed = results.filter((r) => !r.ok).length;
  console.log(`[probe-agents] app_url=${APP_URL} total=${results.length} failed=${failed}`);
  for (const r of results) {
    console.log(`- ${r.id}: ${r.ok ? 'ok' : 'fail'} (${r.status})`);
  }

  process.exit(failed > 0 ? 2 : 0);
}

run();
