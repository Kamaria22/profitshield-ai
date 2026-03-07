import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FUNCTIONS_DIR = path.join(ROOT, 'functions');

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function detectSignature(source) {
  const hasExportDefault = /export\s+default\s+/.test(source);
  const hasDenoServe = /Deno\.serve\(/.test(source);
  if (hasExportDefault && hasDenoServe) return 'deno_serve+export_default';
  if (hasExportDefault) return 'export_default_only';
  if (hasDenoServe) return 'deno_serve_only';
  return 'unknown';
}

function toRoute(name) {
  return `/api/functions/${name}`;
}

function main() {
  if (!fs.existsSync(FUNCTIONS_DIR)) {
    console.log('[function-registry-check] functions/ directory not found');
    process.exit(1);
  }

  const files = fs
    .readdirSync(FUNCTIONS_DIR)
    .filter((f) => /\.(ts|js|tsx|jsx)$/.test(f))
    .sort();

  const report = files.map((file) => {
    const full = path.join(FUNCTIONS_DIR, file);
    const source = readFileSafe(full);
    const name = file.replace(/\.(ts|js|tsx|jsx)$/i, '');
    return {
      file: `functions/${file}`,
      functionName: name,
      route: toRoute(name),
      signature: detectSignature(source),
      hasDenoServe: source.includes('Deno.serve('),
      hasExportDefault: /export\s+default\s+/.test(source),
    };
  });

  console.log('[function-registry-check] detected functions:', report.length);
  for (const row of report) {
    console.log(`- ${row.functionName} -> ${row.route} [${row.signature}]`);
  }
}

main();

