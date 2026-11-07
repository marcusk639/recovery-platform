#!/usr/bin/env node
/**
 * Refuses a bundle that wasn't built for the project it is deployed to.
 *
 *   node scripts/verify-ssr-target.js --expect <projectId> [--root <dir> ...]
 *                                     [--identical <fileA> <fileB>]
 *
 * Runs after build:ssr:e2e-staging (on dist/sapp/*), and as the hosting and
 * functions predeploy in firebase.json on everything that ships: the hosted
 * dist/sapp/browser and the function's functions/dist/sapp/{browser,server}.
 * There, --identical requires the function's SSR template to be the hosted
 * index.html, so the server never renders pages pointing at other chunks.
 *
 * Every .js file under each root is scanned (lazy chunks and symlinked
 * directories included). What each root must and must not contain:
 * - regroup-e2e: the project id and the staging web API key, read from
 *   src/environments/e2e-staging.generated.ts; never the placeholder Stripe
 *   key. Only the generated file carries the staging key, so a half that fell
 *   back to another environment, or an e2e-emulator build, fails.
 * - phoenix-cleanhouse: the project id and production's pk_live_ Stripe key,
 *   read from environment.prod.ts, so a dev-mode build (environment.ts) fails;
 *   never regroup-e2e, so a staging build fails.
 * - any other project: its id; never regroup-e2e.
 *
 * A staging bundle legitimately contains production's whole environment:
 * e2e-staging-guard.ts imports environment.prod.ts to refuse its values. That
 * is why production identifiers can't be a deny-list for staging.
 * Exit 0 = clean, 1 = problems (listed). Key values are never printed.
 */
const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '..');
const STAGING = 'regroup-e2e';
const PRODUCTION = 'phoenix-cleanhouse';
const PLACEHOLDER = 'pk_test_PLACEHOLDER_NO_CHECKOUT';
const FILES = {
  readGenerated: () =>
    fs.readFileSync(path.join(WEB, 'src/environments/e2e-staging.generated.ts'), 'utf8'),
  readProd: () => fs.readFileSync(path.join(WEB, 'src/environments/environment.prod.ts'), 'utf8'),
};

const id = (x) => (typeof x === 'string' ? { label: x, value: x } : x);

function jsFiles(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) return jsFiles(p);
    return name.endsWith('.js') ? [p] : [];
  });
}

function checkTree(rootDirs, { expect, forbid = [] }) {
  const problems = [];
  for (const root of rootDirs) {
    let files;
    try {
      files = fs.statSync(root).isDirectory() ? jsFiles(root) : [];
    } catch (err) {
      files = [];
      if (err.code !== 'ENOENT') problems.push(`${root}: unreadable (${err.code || err.message})`);
    }
    if (files.length === 0) {
      problems.push(`${root}: no .js files (build missing?)`);
      continue;
    }
    const missing = new Set(expect.map(id));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const e of missing) if (text.includes(e.value)) missing.delete(e);
      for (const x of forbid.map(id)) {
        if (text.includes(x.value))
          problems.push(`${path.relative(root, f)} (in ${root}) contains ${x.label}`);
      }
    }
    for (const e of missing) problems.push(`${root}: bundle doesn't contain ${e.label}`);
  }
  return { ok: problems.length === 0, problems };
}

function field(text, name) {
  const m = text.match(new RegExp(`["']?${name}["']?\\s*:\\s*["']([^"']+)["']`));
  return m && m[1];
}

function identifiersFor(project, readers = FILES) {
  const notStaging = { label: 'the staging project id (regroup-e2e)', value: STAGING };
  if (project === STAGING) {
    const text = readers.readGenerated();
    const projectId = field(text, 'projectId');
    const apiKey = field(text, 'apiKey');
    if (projectId !== STAGING)
      throw new Error(`the generated config is for ${projectId}, not ${STAGING}`);
    if (!apiKey) throw new Error('the generated config has no apiKey');
    return {
      expect: [STAGING, { label: 'the staging web API key', value: apiKey }],
      forbid: [
        {
          label: 'the placeholder Stripe key (run gen:e2e-staging with the key file)',
          value: PLACEHOLDER,
        },
      ],
    };
  }
  if (project === PRODUCTION) {
    const key = field(readers.readProd(), 'stripePublishableKey');
    if (!key || !key.startsWith('pk_live_'))
      throw new Error('environment.prod.ts has no pk_live_ Stripe key');
    return {
      expect: [PRODUCTION, { label: 'the production Stripe key', value: key }],
      forbid: [notStaging],
    };
  }
  return { expect: [project], forbid: [notStaging] };
}

function identicalProblem([a, b]) {
  try {
    if (fs.readFileSync(a).equals(fs.readFileSync(b))) return null;
    return `${b} differs from ${a}: copy the build to functions (npm run build:copy-to-functions)`;
  } catch (err) {
    return `can't compare ${a} and ${b} (${err.code || err.message})`;
  }
}

function verify({ project, roots, identical, readers = FILES }) {
  let ids;
  try {
    ids = identifiersFor(project, readers);
  } catch (err) {
    return { ok: false, problems: [err.message] };
  }
  const { problems } = checkTree(roots, ids);
  const pairProblem = identical && identicalProblem(identical);
  if (pairProblem) problems.push(pairProblem);
  return { ok: problems.length === 0, problems };
}

function parseArgs(argv) {
  const out = { expect: '', roots: [] };
  const value = (i, flag) => {
    if (!argv[i] || argv[i].startsWith('--')) throw new Error(`${flag} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--expect') out.expect = value(++i, flag);
    else if (flag === '--root') out.roots.push(path.resolve(value(++i, flag)));
    else if (flag === '--identical') {
      out.identical = [path.resolve(value(++i, flag)), path.resolve(value(++i, flag))];
    } else throw new Error(`unknown argument ${flag}`);
  }
  if (!out.expect) throw new Error('--expect <projectId> is required');
  return out;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`verify-ssr-target: ${err.message}\n`);
    return 1;
  }
  const roots = args.roots.length
    ? args.roots
    : [path.join(WEB, 'dist/sapp/browser'), path.join(WEB, 'dist/sapp/server')];
  const { ok, problems } = verify({ project: args.expect, roots, identical: args.identical });
  if (!ok) {
    process.stderr.write(
      `verify-ssr-target: REFUSED for ${args.expect}\n${problems.map((p) => `  ${p}`).join('\n')}\n`,
    );
    return 1;
  }
  process.stdout.write(`verify-ssr-target: OK (${roots.length} roots built for ${args.expect})\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { checkTree, identifiersFor, verify, parseArgs, PLACEHOLDER };
