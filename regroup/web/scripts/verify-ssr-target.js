#!/usr/bin/env node
/**
 * Refuses a bundle that wasn't built for the project it targets.
 *
 *   node scripts/verify-ssr-target.js --expect <projectId> [--root <dir> ...]
 *
 * Runs after build:ssr:e2e-staging (on dist/sapp/*) and as the hosting and
 * functions predeploy in firebase.json (on dist/sapp/browser and
 * functions/dist/sapp/server, the bundles actually deployed).
 *
 * For regroup-e2e each root must contain the project id and the staging web
 * API key, read from src/environments/e2e-staging.generated.ts. Only that
 * generated file carries the staging key, so a half that fell back to
 * environment.ts or environment.prod.ts fails. For any other project each root
 * must contain that project's id and no file may contain regroup-e2e, so a
 * staging build can't be deployed there. Lazy chunks are scanned too.
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

function checkTree(rootDirs, { expect, forbid = [] }) {
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
      for (const x of forbid) {
        if (text.includes(x)) problems.push(`${path.relative(root, f)} (in ${root}) contains ${x}`);
      }
    }
    for (const e of missing) problems.push(`${root}: bundle doesn't contain ${e}`);
  }
  return { ok: problems.length === 0, problems };
}

const STAGING = 'regroup-e2e';
const GENERATED = path.join(WEB, 'src/environments/e2e-staging.generated.ts');

// What a bundle deployed to `project` must and must not contain. Staging needs
// its id and web API key (from the generated config). Any other project needs
// its own id and refuses the staging id, which only a staging build carries.
function identifiersFor(project, readGenerated = () => fs.readFileSync(GENERATED, 'utf8')) {
  if (project !== STAGING) return { expect: [project], forbid: [STAGING] };
  const text = readGenerated();
  const projectId = (text.match(/"projectId":\s*"([^"]+)"/) || [])[1];
  const apiKey = (text.match(/"apiKey":\s*"([^"]+)"/) || [])[1];
  if (projectId !== STAGING) throw new Error(`the generated config is for ${projectId}, not ${STAGING}`);
  if (!apiKey) throw new Error('the generated config has no apiKey');
  return { expect: [projectId, apiKey], forbid: [] };
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
    ids = identifiersFor(expect);
  } catch (err) {
    process.stderr.write(`verify-ssr-target: ${err.message}\n`);
    return 1;
  }
  const dirs = roots.length
    ? roots
    : [path.join(WEB, 'dist/sapp/browser'), path.join(WEB, 'dist/sapp/server')];
  const { ok, problems } = checkTree(dirs, ids);
  if (!ok) {
    process.stderr.write(
      `verify-ssr-target: REFUSED\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `verify-ssr-target: OK (${dirs.length} roots target ${expect}: ${ids.expect.length} identifier(s) present, ${ids.forbid.length} refused)\n`,
  );
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { checkTree, identifiersFor };
