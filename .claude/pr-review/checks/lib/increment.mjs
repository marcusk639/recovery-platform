import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { git, parseUnifiedDiff } from './diff.mjs';
import { matches } from './glob.mjs';
import { route } from './routing.mjs';

const TABLE = JSON.parse(readFileSync(new URL('../../routing.json', import.meta.url), 'utf8'));
const SHA_RE = /^[0-9a-f]{40}$/;
const lines = (s) => s.split('\n').filter(Boolean);

function patchId(diffArgs, cwd) {
  try {
    const diff = git(diffArgs, cwd);
    if (!diff) return null;
    const out = execFileSync('git', ['patch-id', '--stable'], { cwd, input: diff, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out.trim().split(/\s+/)[0] || null;
  } catch {
    return null;
  }
}

function baseDriftChanged(lastBaseSha, baseSha, prLinkTypes, cwd) {
  if (!lastBaseSha || lastBaseSha === baseSha) return false;
  try {
    const patterns = TABLE.filter((e) => prLinkTypes.includes(e.linkType)).flatMap((e) => e.counterparts ?? []);
    const drift = lines(git(['diff', '--name-only', lastBaseSha, baseSha], cwd));
    return drift.filter((f) => patterns.some((p) => matches(f, p)));
  } catch {
    return true; // cannot tell: treat as changed
  }
}

// Every git failure degrades safely: unreachable -> full; patch-id/drift failure -> treated as changed.
export function computeIncrement({ lastReviewedSha, lastBaseSha, baseSha, headSha, prPaths, cwd }) {
  const last = SHA_RE.test(lastReviewedSha ?? '') ? lastReviewedSha : null;
  const lastBase = SHA_RE.test(lastBaseSha ?? '') ? lastBaseSha : null;
  const none = { reachable: false, incrementFiles: [], incrementDiff: [], incrementLinkTypes: [], prPatchIdUnchanged: false, baseDriftCounterpartsChanged: false, driftFiles: [] };
  if (!last) return none;
  try {
    git(['merge-base', '--is-ancestor', last, headSha], cwd);
  } catch {
    return none;
  }
  try {
    const incrementFiles = lines(git(['diff', '--name-only', `${last}..${headSha}`], cwd));
    const incrementDiff = parseUnifiedDiff(git(['diff', '-M', '--no-color', `${last}..${headSha}`], cwd));
    const before = lastBase ? patchId(['diff', `${lastBase}...${last}`], cwd) : null;
    const after = before ? patchId(['diff', `${baseSha}...${headSha}`], cwd) : null;
    const drift = baseDriftChanged(lastBase, baseSha, route(prPaths).linkTypes, cwd);
    return {
      reachable: true,
      incrementFiles,
      incrementDiff,
      incrementLinkTypes: route(incrementFiles).linkTypes,
      prPatchIdUnchanged: Boolean(before && after && before === after),
      baseDriftCounterpartsChanged: drift === true || (Array.isArray(drift) && drift.length > 0),
      driftFiles: Array.isArray(drift) ? drift : [],
    };
  } catch {
    return none;
  }
}
