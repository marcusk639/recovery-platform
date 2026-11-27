/**
 * Predeploy check: the universal-link files in the build must be the ones the
 * deploy's own project needs. A build made for another project passes
 * verify-ssr-target's other checks but would ship the wrong app IDs.
 *
 *   node scripts/verify-app-links.mjs --project "$GCLOUD_PROJECT" --root <dir> [--root <dir> ...]
 *
 * Regenerates the files for the project and fails if any of the five files
 * under a root is missing or differs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, WELL_KNOWN } from './generate-app-links.mjs';

const text = (body) => JSON.stringify(body, null, 2) + '\n';

/** Pure: returns a list of problems for one hosting root ([] when it is right). */
export function verifyRoot(root, project, source, read = (p) => fs.readFileSync(p, 'utf8')) {
  const expected = generate(project, source);
  const targets = { ...WELL_KNOWN };
  for (const name of Object.keys(expected)) targets[`app-links/${name}`] = name;
  const problems = [];
  for (const [rel, name] of Object.entries(targets)) {
    let actual;
    try {
      actual = read(path.join(root, rel));
    } catch {
      problems.push(`${root}: ${rel} is missing`);
      continue;
    }
    if (actual !== text(expected[name])) problems.push(`${root}: ${rel} differs from the files for ${project}`);
  }
  return problems;
}

export function parseArgs(argv) {
  const roots = [];
  let project;
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--root' && argv[i + 1]) roots.push(argv[i + 1]);
    else if (argv[i] === '--project' && argv[i + 1]) project = argv[i + 1];
    else throw new Error(`bad argument ${argv[i]}`);
  }
  if (!project || roots.length === 0) throw new Error('usage: --project <id> --root <dir> [--root <dir>]');
  return { project, roots };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { project, roots } = parseArgs(process.argv.slice(2));
    const problems = roots.flatMap((r) => verifyRoot(path.resolve(r), project));
    if (problems.length) {
      console.error(`verify-app-links: FAIL\n  ${problems.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`verify-app-links: OK (${roots.length} root(s) for ${project})`);
  } catch (err) {
    console.error(`verify-app-links: ${err.message}`);
    process.exit(1);
  }
}
