import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, '.guard');
const OUT_FILE = path.join(OUT_DIR, 'incidents-preflight.json');

const incidents = [];

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function addIncident(incident) {
  incidents.push({
    id: `inc_${incidents.length + 1}`,
    ts: new Date().toISOString(),
    ...incident,
  });
}

function checkPagesConfigImports() {
  const rel = 'src/pages.config.js';
  if (!fileExists(rel)) {
    addIncident({ blocker_type: 'missing_file', severity: 'critical', owner_agent: 'build_guardian', file: rel, message: 'pages.config.js not found', healable: false });
    return;
  }

  const content = read(rel);
  const importRegex = /^import\s+\w+\s+from\s+'(\.\/pages\/[^']+)';$/gm;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    const baseRel = `src/${importPath.replace(/^\.\//, '')}`;
    const candidates = [
      `${baseRel}.js`,
      `${baseRel}.jsx`,
      `${baseRel}.ts`,
      `${baseRel}.tsx`,
      `${baseRel}/index.js`,
      `${baseRel}/index.jsx`,
    ];

    const found = candidates.find((p) => fileExists(p));
    if (!found) {
      let suggestedPath = null;
      try {
        const pagesDir = path.join(ROOT, 'src/pages');
        const targetBase = path.basename(importPath);
        const files = fs.readdirSync(pagesDir);
        const matched = files.find((f) => f.toLowerCase() === `${targetBase}.jsx`.toLowerCase() || f.toLowerCase() === `${targetBase}.tsx`.toLowerCase() || f.toLowerCase() === `${targetBase}.js`.toLowerCase());
        if (matched) {
          suggestedPath = `./pages/${matched.replace(/\.(jsx|tsx|js|ts)$/i, '')}`;
        }
      } catch {}
      addIncident({
        blocker_type: 'missing_import_target',
        severity: 'critical',
        owner_agent: 'build_guardian',
        file: rel,
        import_path: importPath,
        message: `Import target not found for ${importPath}`,
        healable: !!suggestedPath,
        suggested_path: suggestedPath,
      });
    }
  }
}

function checkCriticalBase44Path() {
  const required = [
    'functions/embeddedEntryGuard.ts',
    'functions/shopifySessionExchange.ts',
    'functions/shopifyAuth.ts',
    'src/components/shopify/AppBridgeAuth.jsx',
    'src/components/shopify/ShopifyEmbeddedAuthGate.jsx',
    'src/components/shopify/ShopifyNavMenu.jsx',
    'src/pages/ShopifyAuth.jsx',
    'src/pages/ShopifyCallback.jsx',
    'src/main.jsx',
    'src/App.jsx',
  ];

  for (const rel of required) {
    if (!fileExists(rel)) {
      addIncident({ blocker_type: 'missing_critical_file', severity: 'critical', owner_agent: 'stability_agent', file: rel, message: `${rel} missing`, healable: false });
    }
  }
}

checkPagesConfigImports();
checkCriticalBase44Path();

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ ts: new Date().toISOString(), incidents }, null, 2));

const critical = incidents.filter((i) => i.severity === 'critical').length;
const high = incidents.filter((i) => i.severity === 'high').length;
console.log(`[preflight] incidents=${incidents.length} critical=${critical} high=${high}`);
for (const i of incidents) {
  console.log(`- [${i.severity}] ${i.blocker_type}: ${i.message}`);
}

process.exit(critical > 0 ? 2 : 0);
