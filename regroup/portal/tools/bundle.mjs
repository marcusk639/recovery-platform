// Bundles the portal and the mobile code it imports in place.
//   node tools/bundle.mjs [--production]
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './replacements.mjs';

const portalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileRoot = path.resolve(portalRoot, '../mobile');
const mobileSrc = path.join(mobileRoot, 'src');
const dist = path.join(portalRoot, 'dist');
const production = process.argv.includes('--production');
const e2e = process.argv.includes('--e2e');
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};
// Tests bundle a small fixture instead of the portal.
const entry = argument('--entry') ?? 'src/app/main.tsx';
const outfile = argument('--outfile') ?? 'dist/main.js';

const isBare = (p) => !p.startsWith('.') && !path.isAbsolute(p);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'integration') walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// esbuild refuses a named import a module doesn't export, so a generated module
// must export every name mobile code imports from that specifier.
function scanNamedImports() {
  const named = new Map();
  const pattern = /(?:import|export)\s+(type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  for (const file of walk(mobileSrc)) {
    for (const match of fs.readFileSync(file, 'utf8').matchAll(pattern)) {
      if (match[1]) continue;
      const names = named.get(match[3]) ?? new Set();
      for (const raw of match[2].split(',')) {
        const name = raw.trim();
        if (name && !name.startsWith('type ')) names.add(name.split(/\s+as\s+/)[0]);
      }
      named.set(match[3], names);
    }
  }
  return named;
}

const named = scanNamedImports();
const report = { replaced: new Set(), deferred: new Set(), inert: new Map() };
const unknown = new Map();

function generatedModule(specifier, factory) {
  const names = [...(named.get(specifier) ?? [])].filter((n) => n !== 'default');
  const lines = names.map((n) => `export const ${n} = ${factory}(${JSON.stringify(`${specifier}#${n}`)});`);
  return [
    `import { ${factory} } from ${JSON.stringify(path.join(portalRoot, 'src/adapter/deferred.tsx'))};`,
    `export default ${factory}(${JSON.stringify(specifier)});`,
    ...lines,
  ].join('\n');
}

const portalPlugin = {
  name: 'portal',
  setup(build) {
    build.onResolve({ filter: /^@mobile\// }, (args) =>
      build.resolve(path.join(mobileSrc, args.path.slice('@mobile/'.length)), {
        resolveDir: portalRoot,
        kind: args.kind,
      }),
    );

    build.onResolve({ filter: /(^|\/)firebase-setup$/ }, (args) => {
      if (!args.importer.startsWith(mobileRoot)) return undefined;
      return { path: path.join(portalRoot, 'src/adapter/firebase-setup.ts') };
    });

    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.pluginData?.resolved || !isBare(args.path)) return undefined;
      const result = classify(args.path);
      if (result.kind === 'unknown') {
        unknown.set(args.path, args.importer);
        return { path: args.path, external: true };
      }
      if (result.kind === 'deferred' || result.kind === 'inert') {
        if (result.kind === 'deferred') report.deferred.add(args.path);
        else report.inert.set(args.path, result.reason);
        // A require reads properties straight off the module, so it needs the stand-in
        // itself as module.exports, not an ES namespace of the names the scan found.
        const required = args.kind === 'require-call' ? '-required' : '';
        return { path: args.path, namespace: `${result.kind}${required}` };
      }
      if (result.kind === 'replace') {
        report.replaced.add(args.path);
        if (result.target.startsWith('src/')) return { path: path.join(portalRoot, result.target) };
        return build.resolve(result.target, {
          resolveDir: portalRoot,
          kind: args.kind,
          pluginData: { resolved: true },
        });
      }
      // Bare imports from mobile code use the portal's packages, never
      // regroup/mobile/node_modules, which holds the native builds.
      if (args.importer.startsWith(mobileRoot)) {
        return build.resolve(args.path, {
          resolveDir: portalRoot,
          kind: args.kind,
          pluginData: { resolved: true },
        });
      }
      return undefined;
    });

    for (const factory of ['deferred', 'inert']) {
      build.onLoad({ filter: /.*/, namespace: `${factory}-required` }, (args) => ({
        contents: [
          `const { ${factory} } = require(${JSON.stringify(path.join(portalRoot, 'src/adapter/deferred.tsx'))});`,
          `module.exports = ${factory}(${JSON.stringify(args.path)});`,
        ].join('\n'),
        resolveDir: portalRoot,
        loader: 'js',
      }));
    }

    for (const [namespace, factory] of [
      ['deferred', 'deferred'],
      ['inert', 'inert'],
    ]) {
      build.onLoad({ filter: /.*/, namespace }, (args) => ({
        contents: generatedModule(args.path, factory),
        resolveDir: portalRoot,
        loader: 'js',
      }));
    }
  },
};

const extensions = ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'];

let result;
try {
  result = await esbuild.build({
    absWorkingDir: portalRoot,
    entryPoints: [entry],
    bundle: true,
    outfile,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    minify: production,
    metafile: true,
    logLevel: 'silent',
    resolveExtensions: extensions,
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser'],
    define: {
      __DEV__: String(!production),
      __E2E__: String(e2e),
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
      'process.env': '{}',
    },
    loader: {
      '.js': 'jsx',
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.gif': 'dataurl',
      '.svg': 'dataurl',
      '.ttf': 'dataurl',
    },
    plugins: [portalPlugin],
  });
} catch (error) {
  console.error('Build failed:');
  for (const e of error.errors ?? [error]) {
    console.error(`  ${e.location?.file ?? ''}:${e.location?.line ?? ''} ${e.text ?? e.message}`);
  }
  if (unknown.size > 0) printUnknown();
  process.exit(1);
}

function printUnknown() {
  console.error('Native imports with no entry in tools/replacements.mjs:');
  for (const [specifier, importer] of unknown) {
    console.error(`  ${specifier}  (from ${path.relative(portalRoot, importer)})`);
  }
}

if (unknown.size > 0) {
  printUnknown();
  process.exit(1);
}

if (argument('--outfile')) process.exit(0);

fs.copyFileSync(path.join(portalRoot, 'index.html'), path.join(dist, 'index.html'));
fs.writeFileSync(path.join(dist, 'metafile.json'), JSON.stringify(result.metafile));
const sizeBytes = fs.statSync(path.join(dist, 'main.js')).size;
fs.writeFileSync(
  path.join(dist, 'build-report.json'),
  JSON.stringify(
    {
      replaced: [...report.replaced].sort(),
      deferred: [...report.deferred].sort(),
      inert: [...report.inert].map(([name, reason]) => ({ name, reason })),
      sizeBytes,
      e2e,
    },
    null,
    2,
  ),
);
console.log(`Built ${production ? 'production' : 'development'} bundle: ${(sizeBytes / 1e6).toFixed(1)} MB`);
