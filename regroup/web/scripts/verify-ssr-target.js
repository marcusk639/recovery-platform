#!/usr/bin/env node
/**
 * Refuses a staging build whose browser or server half was not built against staging.
 *
 *   node scripts/verify-ssr-target.js --expect regroup-e2e [--root <dir> ...]
 *
 * Each root (default dist/sapp/browser and dist/sapp/server) must contain
 * every staging identifier: the project id and the staging web API key, read
 * from src/environments/e2e-staging.generated.ts. Only that generated file
 * carries the staging key, so a half that fell back to environment.ts or
 * environment.prod.ts fails. Lazy chunks are scanned too.
 *
 * It is an allow-list, not a deny-list, because e2e-staging-guard.ts embeds
 * production's identifiers in every staging bundle as the values it refuses.
 * Exit 0 = clean, 1 = problems (listed).
 */
const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '..');

function jsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

function checkTree(rootDirs, { expect }) {
  const problems = [];
  for (const root of rootDirs) {
    const files = jsFiles(root);
    if (files.length === 0) {
      problems.push(`${root}: no .js files (build missing?)`);
      continue;
    }
    const missing = new Set(expect);
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const e of missing) if (text.includes(e)) missing.delete(e);
      if (missing.size === 0) break;
    }
    for (const e of missing) problems.push(`${root}: bundle doesn't contain ${e}`);
  }
  return { ok: problems.length === 0, problems };
}

function stagingIdentifiers(project) {
  const file = path.join(WEB, 'src/environments/e2e-staging.generated.ts');
  if (!fs.existsSync(file)) throw new Error(`missing ${file}; run npm run gen:e2e-staging`);
  const text = fs.readFileSync(file, 'utf8');
  const projectId = (text.match(/"projectId":\s*"([^"]+)"/) || [])[1];
  const apiKey = (text.match(/"apiKey":\s*"([^"]+)"/) || [])[1];
  if (projectId !== project) throw new Error(`${file} is for ${projectId}, not ${project}`);
  if (!apiKey) throw new Error(`${file} has no apiKey`);
  return [projectId, apiKey];
}

function main(argv) {
  let expect = '';
  const roots = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--expect') expect = argv[++i] || '';
    else if (argv[i] === '--root') roots.push(path.resolve(argv[++i] || ''));
    else {
      process.stderr.write(`unknown argument ${argv[i]}\n`);
      return 1;
    }
  }
  if (!expect) {
    process.stderr.write('--expect <projectId> is required\n');
    return 1;
  }
  let ids;
  try {
    ids = stagingIdentifiers(expect);
  } catch (err) {
    process.stderr.write(`verify-ssr-target: ${err.message}\n`);
    return 1;
  }
  const dirs = roots.length
    ? roots
    : [path.join(WEB, 'dist/sapp/browser'), path.join(WEB, 'dist/sapp/server')];
  const { ok, problems } = checkTree(dirs, { expect: ids });
  if (!ok) {
    process.stderr.write(
      `verify-ssr-target: REFUSED\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `verify-ssr-target: OK (${dirs.length} roots carry the ${expect} project id and web API key)\n`,
  );
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { checkTree };
