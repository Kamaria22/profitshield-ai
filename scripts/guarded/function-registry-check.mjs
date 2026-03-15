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

function isRoutable(signature) {
  return signature === 'deno_serve_only' || signature === 'deno_serve+export_default' || signature === 'export_default_only';
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
    const signature = detectSignature(source);
    const routable = isRoutable(signature);
    return {
      file: `functions/${file}`,
      functionName: name,
      route: routable ? toRoute(name) : null,
      signature,
      routable,
      hasDenoServe: source.includes('Deno.serve('),
      hasExportDefault: /export\s+default\s+/.test(source),
    };
  });

  const routableCount = report.filter((r) => r.routable).length;
  const nonRoutable = report.filter((r) => !r.routable);
  console.log('[function-registry-check] detected routable functions:', routableCount);
  if (nonRoutable.length > 0) {
    console.log('[function-registry-check] non-routable helper modules:', nonRoutable.length);
  }
  for (const row of report) {
    if (row.routable) {
      console.log(`- ${row.functionName} -> ${row.route} [${row.signature}]`);
    } else {
      console.log(`- ${row.functionName} -> (helper module) [${row.signature}]`);
    }
  }
}

main();
