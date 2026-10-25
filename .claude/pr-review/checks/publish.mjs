import { pathToFileURL } from 'node:url';
import { SUMMARY_MARKER } from './lib/markers.mjs';
import { upsertSummary } from './lib/gh.mjs';

export function renderSkeleton({ headSha, outcome }) {
  const short = String(headSha ?? '').slice(0, 7);
  const status =
    outcome === 'success'
      ? 'reviewer online'
      : 'review did not complete';
  return `${SUMMARY_MARKER}\n## PR review\n\nStatus: ${status} (commit \`${short}\`).\n`;
}

async function main() {
  try {
    const { REPO, PR, HEAD_SHA, ACTION_OUTCOME } = process.env;
    const body = renderSkeleton({ headSha: HEAD_SHA, outcome: ACTION_OUTCOME });
    await upsertSummary(REPO, PR, body);
  } catch (err) {
    // Never log bodies, tokens or messages; status only.
    console.log(`publish failed: ${err?.status ?? 'unknown'}`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
