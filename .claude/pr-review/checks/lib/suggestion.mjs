// Suggested changes on inline comments (spec addendum §4.2). The model writes
// only the replacement text; publish checks it here and adds the fence itself.
// A failing suggestion is dropped and its comment still posts.
import { insideOneHunk } from './hunks.mjs';
import { route } from './routing.mjs';

export const MAX_SUGGESTION_LINES = 40;
export const MAX_SUGGESTION_CHARS = 4000;
export const MAX_RANGE_LINES = 40;
// The longest suggestion inline.json may carry at all; longer entries are invalid.
export const MAX_SUGGESTION_READ = 20000;

// A ``` fence whose info string starts with "suggestion": only publish writes one.
const FENCE_RE = /```[ \t]*suggestion/i;
// Control characters other than tab and newline (a CR included).
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/;

export const hasSuggestionFence = (body) => FENCE_RE.test(String(body ?? ''));

export const fenced = (suggestion) => `\`\`\`suggestion\n${suggestion}\n\`\`\``;

// The [start, end] range an entry covers: start_line..line, or line alone.
export const rangeOf = (e) => [Number.isInteger(e.start_line) ? e.start_line : e.line, e.line];

// Files a one-click suggestion must never touch: a suggestion can carry code
// that prompt injection in the PR steered the model to write, and maintainers
// tend to trust suggestions. Paths routed to checklist classes 1–7 (callables,
// webhooks, rules, indexes, auth and claims, payments, region config), rules
// and index files, CI and reviewer config, manifests and lockfiles.
const BLOCKED = [
  /\.rules$/,
  /(^|\/)firestore\.indexes\.json$/,
  /^\.github\//,
  /^\.claude\//,
  /(^|\/)package\.json$/,
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|Podfile\.lock|Gemfile\.lock)$/,
];
export function suggestionPathBlocked(path, isSecurityPath = () => false) {
  const p = String(path ?? '');
  if (BLOCKED.some((re) => re.test(p))) return true;
  if (route([p]).classes.some((c) => c >= 1 && c <= 7)) return true;
  return Boolean(isSecurityPath(p));
}

// Why the suggestion cannot be posted, or null when it can. ranges: this
// file's trusted hunk ranges.
export function suggestionProblem(e, ranges, isSecurityPath) {
  const s = e.suggestion;
  if (suggestionPathBlocked(e.path, isSecurityPath)) return 'security path';
  const [start, end] = rangeOf(e);
  if (e.side !== 'RIGHT') return 'side';
  if (end - start + 1 > MAX_RANGE_LINES) return 'range';
  if (!insideOneHunk(ranges, start, end)) return 'hunk';
  if (s.length > MAX_SUGGESTION_CHARS || s.split('\n').length > MAX_SUGGESTION_LINES) return 'size';
  if (s.includes('```')) return 'fence';
  if (CONTROL_RE.test(s)) return 'control';
  // No HTML comment: it could plant an fp marker, and neutralising it would change the code.
  if (s.includes('<!--') || s.includes('-->')) return 'comment';
  return null;
}

// A plain (suggestion-free) multi-line comment keeps its range only inside one
// hunk; otherwise it falls back to a single-line comment on `line`.
export const keepsRange = (e, ranges) => Number.isInteger(e.start_line) && e.start_line < e.line && e.side === 'RIGHT' && insideOneHunk(ranges, e.start_line, e.line);
