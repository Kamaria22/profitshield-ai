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

function checkShopifyEnvValidationPresence() {
  const rel = 'functions/shopifySessionExchange.ts';
  if (!fileExists(rel)) return;
  const content = read(rel);
  const requiredKeys = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
  for (const key of requiredKeys) {
    if (!content.includes(key)) {
      addIncident({
        blocker_type: 'missing_env_validation_signal',
        severity: 'high',
        owner_agent: 'auth_guardian',
        file: rel,
        message: `Expected env validation reference for ${key}`,
        healable: true,
      });
    }
  }
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (/\.(jsx?|tsx?)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function checkUnsafeWindowOpen() {
  const files = walkFiles(path.join(ROOT, 'src'));
  for (const abs of files) {
    const rel = path.relative(ROOT, abs);
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (!line.includes('window.open(')) return;
      const opensBlank = line.includes("'_blank'") || line.includes('"_blank"');
      const hasNoopener = /noopener|noreferrer/.test(line);
      if (opensBlank && !hasNoopener) {
        addIncident({
          blocker_type: 'unsafe_window_open',
          severity: 'high',
          owner_agent: 'frontend_guardian_component',
          file: rel,
          line: idx + 1,
          message: 'window.open with _blank is missing noopener/noreferrer',
          healable: true,
        });
      }
    });
  }
}

function checkHardcodedShopifyApiKeyFallback() {
  const rel = 'src/main.jsx';
  if (!fileExists(rel)) return;
  const content = read(rel);
  if (/67be6ef7574f3a32bf9a218ad4582c68/.test(content)) {
    addIncident({
      blocker_type: 'hardcoded_shopify_api_key_fallback',
      severity: 'critical',
      owner_agent: 'auth_guardian',
      file: rel,
      message: 'Hardcoded Shopify API key fallback found in frontend bootstrap',
      healable: true,
    });
  }
}

checkPagesConfigImports();
checkCriticalBase44Path();
checkShopifyEnvValidationPresence();
checkUnsafeWindowOpen();
checkHardcodedShopifyApiKeyFallback();

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify({ ts: new Date().toISOString(), incidents }, null, 2));

const critical = incidents.filter((i) => i.severity === 'critical').length;
const high = incidents.filter((i) => i.severity === 'high').length;
console.log(`[preflight] incidents=${incidents.length} critical=${critical} high=${high}`);
for (const i of incidents) {
  console.log(`- [${i.severity}] ${i.blocker_type}: ${i.message}`);
}

process.exit(critical > 0 ? 2 : 0);
