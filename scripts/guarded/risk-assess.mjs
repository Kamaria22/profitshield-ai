import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'risk-assessment.json');

function changedFiles() {
  try {
    const out = execSync('git diff --name-only', { encoding: 'utf8' }).trim();
    if (!out) return [];
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function classify(file) {
  if (/^functions\/(shopifyAuth|shopifySessionExchange|embeddedEntryGuard|shopifyWebhook|shopifyBilling)/.test(file)) {
    return { level: 'critical', reason: 'shopify_auth_or_billing_or_webhook_path' };
  }
  if (/^src\/(components\/shopify|pages\/Shopify|main\.jsx|App\.jsx|Layout\.jsx)/.test(file)) {
    return { level: 'high', reason: 'embedded_runtime_frontend_path' };
  }
  if (/^functions\/(selfHeal|frontendGuardian|stabilityAgent|buildGuardian|featureGuardian|supportGuardian|supportWatchdog)/.test(file)) {
    return { level: 'high', reason: 'protection_stack_module' };
  }
  return { level: 'normal', reason: 'non_critical_path' };
}

const files = changedFiles();
const assessed = files.map((file) => ({ file, ...classify(file) }));

const summary = {
  changed_files: files.length,
  critical: assessed.filter((a) => a.level === 'critical').length,
  high: assessed.filter((a) => a.level === 'high').length,
  normal: assessed.filter((a) => a.level === 'normal').length,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ ts: new Date().toISOString(), summary, assessed }, null, 2));

console.log('[risk] summary:', summary);
for (const row of assessed) {
  console.log(`- [${row.level}] ${row.file} (${row.reason})`);
}
