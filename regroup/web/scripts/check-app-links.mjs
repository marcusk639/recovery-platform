/**
 * Deployed check for the universal-link files.
 *
 *   node scripts/check-app-links.mjs <origin> --project <id>
 *
 * Fetches each well-known URL and requires: 200, no redirect, a JSON content
 * type, and a body equal to what generate-app-links.mjs produces for the project.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './generate-app-links.mjs';

export const URLS = [
  ['/.well-known/apple-app-site-association', 'apple-app-site-association.json'],
  ['/apple-app-site-association', 'apple-app-site-association.json'],
  ['/.well-known/assetlinks.json', 'assetlinks.json'],
];

export async function check(origin, project, fetchImpl = fetch, source) {
  const expected = generate(project, source);
  const results = [];
  for (const [urlPath, file] of URLS) {
    const url = new URL(urlPath, origin).toString();
    const problems = [];
    let status = 'n/a';
    let type = 'n/a';
    try {
      const res = await fetchImpl(url, { redirect: 'manual' });
      status = res.status;
      type = res.headers.get('content-type') || '';
      if (res.status !== 200) problems.push(`status ${res.status}, expected 200 with no redirect`);
      if (!/^application\/json\b/i.test(type)) problems.push(`content-type "${type}"`);
      if (res.status === 200) {
        let body;
        try {
          body = JSON.parse(await res.text());
        } catch {
          problems.push('body is not JSON');
        }
        if (body !== undefined && JSON.stringify(body) !== JSON.stringify(expected[file])) {
          problems.push(`content differs from generated ${file}`);
        }
      }
    } catch (err) {
      problems.push(`fetch failed: ${err.message}`);
    }
    results.push({ url, status, type, ok: problems.length === 0, problems });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const origin = process.argv[2];
  const i = process.argv.indexOf('--project');
  const project = i >= 0 ? process.argv[i + 1] : undefined;
  if (!origin || !project) {
    console.error('usage: check-app-links.mjs <origin> --project <id>');
    process.exit(2);
  }
  let results;
  try {
    results = await check(origin, project);
  } catch (err) {
    console.error(`check-app-links: ${err.message}`);
    process.exit(1);
  }
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.url} status=${r.status} content-type=${r.type}`);
    for (const p of r.problems) console.log(`       ${p}`);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
