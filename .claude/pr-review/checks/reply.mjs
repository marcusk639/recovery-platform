#!/usr/bin/env node
// Posts the review model's one reply per run: `node .review-base/.claude/pr-review/checks/reply.mjs`,
// no arguments (the Review step allows exactly this command). See lib/reply.mjs.
import { pathToFileURL } from 'node:url';
import { ghRequest } from './lib/gh.mjs';
import { runReply } from './lib/reply.mjs';

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    process.stdout.write('reply refused: no GitHub token in the environment\n');
    return;
  }
  const result = await runReply({
    argv: process.argv.slice(2),
    env: process.env,
    request: (method, path, body) => ghRequest(method, path, body, token),
  });
  process.stdout.write(`reply ${result.posted ? 'posted' : 'refused'}: ${result.reason}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => process.stdout.write('reply failed: Error\n')).finally(() => { process.exitCode = 0; });
}
