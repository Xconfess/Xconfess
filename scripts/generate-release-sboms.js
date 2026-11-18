#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts/sbom');
fs.mkdirSync(outDir, { recursive: true });

const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function licenseFor(name) {
  const candidates = [
    path.join(root, 'node_modules', name, 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (pkg.license) return typeof pkg.license === 'string' ? pkg.license : (pkg.license.type || 'UNKNOWN');
    } catch (_) {}
  }
  return 'UNKNOWN';
}

for (const workspace of ['xconfess-backend', 'xconfess-frontend']) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, workspace, 'package.json'), 'utf8'));
  const directNames = new Set(Object.keys(packageJson.dependencies || {}));
  const components = [];
  const seen = new Set();

  for (const [lockPath, info] of Object.entries(lock.packages || {})) {
    if (!lockPath.startsWith('node_modules/') || !info.version || info.dev) continue;
    const name = lockPath.slice('node_modules/'.length).replace(/^.*node_modules\//, '');
    if (!name || seen.has(`${name}@${info.version}`)) continue;
    seen.add(`${name}@${info.version}`);
    const license = licenseFor(name);
    components.push({
      type: 'library',
      'bom-ref': `pkg:npm/${name}@${info.version}`,
      name,
      version: info.version,
      scope: directNames.has(name) ? 'required' : 'excluded',
      licenses: [{ license: license === 'UNKNOWN' ? { name: 'UNKNOWN' } : { id: license } }]
    });
  }

  const sbom = {
    bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
    metadata: { timestamp: new Date().toISOString(), component: { type: 'application', name: packageJson.name, version: packageJson.version || '0.0.0' } },
    components: components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  };
  const out = path.join(outDir, `${workspace}.cyclonedx.json`);
  fs.writeFileSync(out, JSON.stringify(sbom, null, 2) + '\n');
  console.log(`Wrote ${path.relative(root, out)} (${components.length} runtime components)`);
}
