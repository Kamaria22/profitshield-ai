import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'agent-probe.json');

const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const APP_ID = process.env.APP_ID || '69921553e99437d437b39bf3';
const FALLBACK_COVERED_PROBES = new Set(['selfHeal', 'supportGuardian']);

const probes = [
  { id: 'selfHeal', fn: 'selfHeal', body: { action: 'get_flags' } },
  { id: 'stabilityAgent', fn: 'stabilityAgent', body: { action: 'prove_live' } },
  { id: 'appStoreReadinessGuardian', fn: 'appStoreReadinessGuardian', body: { action: 'prove_live' } },
  { id: 'supportGuardian', fn: 'supportGuardian', body: { action: 'run_watchdog' } },
  { id: 'buildGuardian', fn: 'buildGuardian', body: { action: 'run' } },
  { id: 'shopifyConnectionWatchdog', fn: 'shopifyConnectionWatchdog', body: {} },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postProbe(url, body, maxAttempts = 3) {
  let lastStatus = 0;
  let lastData = {};
  let rateLimited = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      lastStatus = res.status;
      lastData = data;
      if (res.status === 429) {
        rateLimited = true;
        if (attempt < maxAttempts) {
          await delay(Math.min(5000, 600 * 2 ** (attempt - 1)));
          continue;
        }
      }
      return { status: res.status, data, rateLimited };
    } catch (error) {
      lastStatus = 0;
      lastData = { error: error.message };
      if (attempt < maxAttempts) {
        await delay(Math.min(3000, 400 * 2 ** (attempt - 1)));
        continue;
      }
    }
  }
  return { status: lastStatus, data: lastData, rateLimited };
}

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
    const candidates = [
      `${APP_URL}/api/functions/${p.fn}`,
      `${APP_URL}/api/apps/${APP_ID}/functions/${p.fn}`,
    ];
    try {
      let probe = null;
      let url = candidates[0];
      for (const candidate of candidates) {
        const next = await postProbe(candidate, p.body, 3);
        probe = next;
        url = candidate;
        // stop at first non-404 response
        if (next.status !== 404) break;
      }
      const ok = probe.status >= 200 && probe.status < 300 && probe.data?.ok !== false;
      const missingCovered = FALLBACK_COVERED_PROBES.has(p.id) && (probe.status === 404 || probe.status === 503);
      const degraded = !ok && (probe.rateLimited || probe.status === 429 || missingCovered);
      results.push({
        id: p.id,
        url,
        status: probe.status,
        ok,
        degraded,
        data_preview: probe.data?.version || probe.data?.function || probe.data?.error || null
      });
      await delay(250);
    } catch (e) {
      results.push({ id: p.id, url, status: 0, ok: false, error: e.message });
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ ts: new Date().toISOString(), app_url: APP_URL, results }, null, 2));

  const failed = results.filter((r) => !r.ok && !r.degraded).length;
  console.log(`[probe-agents] app_url=${APP_URL} total=${results.length} failed=${failed}`);
  for (const r of results) {
    const statusText = r.ok ? 'ok' : (r.degraded ? 'degraded' : 'fail');
    console.log(`- ${r.id}: ${statusText} (${r.status})`);
  }

  process.exit(failed > 0 ? 2 : 0);
}

run();
