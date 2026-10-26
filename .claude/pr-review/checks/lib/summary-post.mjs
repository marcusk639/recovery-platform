// Upserts the summary comment. A failed update is retried once with a minimal,
// fixed banner that re-emits the previous marker (when known), so the comment
// never keeps claiming an older review silently. Logs status codes only.
import { SUMMARY_MARKER } from './markers.mjs';

const status = (err) => (Number.isInteger(err?.status) ? err.status : 'unknown');

export function minimalBody(headSha, code, previousMarker) {
  const short = String(headSha ?? '').slice(0, 7) || 'unknown';
  const lines = [SUMMARY_MARKER, '## PR review (advisory)', `> ⚠ summary could not be updated for \`${short}\` (status ${code})`];
  if (previousMarker) lines.push(previousMarker);
  return lines.join('\n\n');
}

export async function postSummary(repo, pr, body, upsert, { headSha, previousMarker = null } = {}) {
  try {
    await upsert(repo, pr, body);
    return true;
  } catch (err) {
    const code = status(err);
    console.log(`::warning::pr-review summary update failed (${code})`);
    try {
      await upsert(repo, pr, minimalBody(headSha, code, previousMarker));
    } catch (again) {
      console.log(`publish: minimal summary failed: ${status(again)}`);
    }
    return false;
  }
}
