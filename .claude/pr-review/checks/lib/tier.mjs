export const MAX_TURNS = {
  none: 0,
  'base-drift': 15,
  light: 15,
  incremental: 40,
  'incremental-new-links': 60,
  full: 60,
};

const LIGHT_RE = /\.(md|txt|png|jpg|svg)$/;
const LOCKFILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);

const isLight = (f) => LIGHT_RE.test(f) || LOCKFILES.has(String(f).split('/').pop());

export function classify({
  lastReviewedSha,
  reachable,
  incrementFiles = [],
  incrementLinkTypes = [],
  linkTypesSeen = [],
  prDiffUnchanged,
  prFileCount = 0,
  baseDriftCounterpartsChanged,
}) {
  if (!lastReviewedSha || !reachable) return 'full';
  // A merge from base leaves this PR's own increment empty yet can still need base-drift.
  if (incrementFiles.length === 0 && !(prDiffUnchanged && baseDriftCounterpartsChanged)) return 'none';
  if (prDiffUnchanged) return baseDriftCounterpartsChanged ? 'base-drift' : 'none';
  if (incrementLinkTypes.length === 0 && incrementFiles.every(isLight)) return 'light';
  const unseen = incrementLinkTypes.some((t) => !linkTypesSeen.includes(t));
  if (unseen || incrementFiles.length >= 0.5 * prFileCount) return 'incremental-new-links';
  return 'incremental';
}
