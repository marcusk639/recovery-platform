/**
 * Generates the universal-link files from the one checked-in source,
 * regroup/app-links.json.
 *
 *   node scripts/generate-app-links.mjs --project <id> --out <dir> [--root <hosting public dir>]
 *
 * Writes <dir>/apple-app-site-association.json and <dir>/assetlinks.json.
 * With --root it also writes the same bodies at the exact well-known paths
 * (<root>/.well-known/assetlinks.json, <root>/.well-known/apple-app-site-association,
 * <root>/apple-app-site-association). Firebase Hosting answers those three paths
 * itself (an empty assetlinks and AASA) and ahead of any rewrite, so only a real
 * file at the exact path replaces them; firebase.json's ignore list therefore
 * keeps `.well-known`.
 * Refuses an unknown project, and any Android fingerprint that is not a real
 * SHA-256 (the production placeholder stays until the owner supplies the Play
 * app-signing key, so a production web build fails loudly until then).
 * firebase.json rewrites the well-known paths to the files in <dir>; <dir> is
 * dot-free because hosting ignores `**` + `/.*`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SOURCE = path.resolve(HERE, '../../app-links.json');
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
// Paths that must never be claimed: the marketing and account pages stay in the browser.
export const NEVER_CLAIMED = ['/', '/pricing', '/signup', '/my-account', '/login', '*', '/*'];

export function loadSource(file = SOURCE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function generate(project, source = loadSource()) {
  const env = source.environments && source.environments[project];
  if (!env) {
    const known = Object.keys(source.environments || {}).join(', ');
    throw new Error(`unknown project "${project}" (known: ${known})`);
  }
  for (const p of source.paths) {
    if (NEVER_CLAIMED.includes(p)) throw new Error(`path "${p}" must never be claimed`);
  }
  for (const app of env.android) {
    for (const fp of app.sha256) {
      if (!FINGERPRINT.test(fp)) {
        throw new Error(
          `${project}: ${app.package} has no usable SHA-256 fingerprint (${fp}); ` +
            'the owner must add it to regroup/app-links.json',
        );
      }
    }
  }
  const apple = {
    applinks: {
      details: [
        {
          appIDs: env.iosAppIds,
          components: source.paths.map((p) => ({ '/': p })),
        },
      ],
    },
  };
  const assetlinks = env.android.map((app) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: app.package,
      sha256_cert_fingerprints: app.sha256,
    },
  }));
  return { 'apple-app-site-association.json': apple, 'assetlinks.json': assetlinks };
}

// Exact public paths (relative to the hosting root) -> generated file.
export const WELL_KNOWN = {
  '.well-known/apple-app-site-association': 'apple-app-site-association.json',
  'apple-app-site-association': 'apple-app-site-association.json',
  '.well-known/assetlinks.json': 'assetlinks.json',
};

export function writeFiles(project, outDir, source, rootDir) {
  const files = generate(project, source);
  const text = (body) => JSON.stringify(body, null, 2) + '\n';
  fs.mkdirSync(outDir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), text(body));
  }
  if (rootDir) {
    for (const [rel, name] of Object.entries(WELL_KNOWN)) {
      const dest = path.join(rootDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text(files[name]));
    }
  }
  return Object.keys(files);
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const project = arg(process.argv, '--project');
  const out = arg(process.argv, '--out');
  if (!project || !out) {
    console.error('usage: generate-app-links.mjs --project <id> --out <dir>');
    process.exit(2);
  }
  try {
    const root = arg(process.argv, '--root');
    const names = writeFiles(project, path.resolve(out), undefined, root && path.resolve(root));
    console.log(`app-links: wrote ${names.join(', ')} for ${project} to ${out}`);
  } catch (err) {
    console.error(`app-links: ${err.message}`);
    process.exit(1);
  }
}
