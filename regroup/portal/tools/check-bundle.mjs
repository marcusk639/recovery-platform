// Invariants on the built bundle. Exits 1 naming each problem.
//   node tools/check-bundle.mjs [--warn-versions] [--dist <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const portalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const warnVersions = process.argv.includes('--warn-versions');
const problems = [];
const distIndex = process.argv.indexOf('--dist');
const dist = distIndex === -1 ? path.join(portalRoot, 'dist') : process.argv[distIndex + 1];

const { inputs } = readJson(path.join(dist, 'metafile.json'));
const paths = Object.keys(inputs);

const mobilePackages = paths.filter((p) => p.includes('mobile/node_modules/'));
if (mobilePackages.length > 0) {
  problems.push(`Bundled from regroup/mobile/node_modules: ${mobilePackages[0]} and ${mobilePackages.length - 1} more`);
}

const reactCopies = new Set(
  paths.filter((p) => /(^|\/)node_modules\/react\/index\.js$/.test(p)).map((p) => p.split('node_modules/react/')[0]),
);
if (reactCopies.size > 1) problems.push(`More than one copy of react: ${[...reactCopies].join(', ')}`);

const bundle = fs.readFileSync(path.join(dist, 'main.js'), 'utf8');
if (bundle.includes('phoenix-cleanhouse')) problems.push('The bundle contains phoenix-cleanhouse');
if (!readJson(path.join(dist, 'build-report.json')).e2e && bundle.includes('__portalTest')) {
  problems.push('A build not made with --e2e contains test hooks');
}

const portal = readJson(path.join(portalRoot, 'package.json')).dependencies;
const mobilePackage = readJson(path.join(portalRoot, '../mobile/package.json'));
const mobile = { ...mobilePackage.dependencies, ...mobilePackage.devDependencies };
for (const [name, version] of Object.entries(portal)) {
  if (!mobile[name] || mobile[name] === version) continue;
  const message = `${name} differs: portal ${version}, mobile ${mobile[name]}`;
  if (warnVersions) console.warn(`warning: ${message}`);
  else problems.push(message);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-bundle: ${problem}`);
  process.exit(1);
}
console.log(`check-bundle: OK (${paths.length} inputs)`);
