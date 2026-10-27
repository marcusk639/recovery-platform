// The review model's one direct comment per run (a reply to a maintainer's question).
// The model writes the text to <OUT>/reply.md and runs the base-controlled reply.mjs with
// no arguments; this code decides everything else. Repo and PR come from the event file,
// the body only from <OUT>/reply.md (a regular file, never a symlink), so the model cannot
// post a file it names (gh pr comment --body-file .git/config would have). The text is
// refused, never rewritten, if it is secret-shaped or names a security finding's file or
// slug. Reasons carry no reply text.
import { lstatSync, readFileSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from './redact.mjs';
import { validateFindings, isForcedSecurity } from './findings.mjs';
import { securityNeedles, mentions } from './needles.mjs';

export const REPLY_MARKER = '<!-- pr-review:reply -->';
export const REPLY_PREFIX = 'pr-review:';
export const MAX_REPLY_BYTES = 4000;
const MAX_EVENT_BYTES = 5_000_000;
const LOCK_NAME = 'pr-review-reply.lock';
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// Control characters other than tab and newline (carriage returns included).
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f]/;

const refuse = (reason) => ({ posted: false, reason });

// A regular file (not a symlink) of at most max bytes, read as UTF-8; else a reason.
function readRegular(path, max, name, fs) {
  let st;
  try {
    st = fs.lstatSync(path);
  } catch {
    return { error: `${name} is missing` };
  }
  if (st.isSymbolicLink() || !st.isFile()) return { error: `${name} is not a regular file` };
  if (st.size > max) return { error: `${name} is too long (max ${max} bytes)` };
  try {
    return { text: fs.readFileSync(path, 'utf8') };
  } catch {
    return { error: `${name} is unreadable` };
  }
}

function eventTarget(env, fs) {
  if (!env.GITHUB_EVENT_PATH) return { error: 'no event file' };
  const r = readRegular(env.GITHUB_EVENT_PATH, MAX_EVENT_BYTES, 'event file', fs);
  if (r.error) return r;
  let ev;
  try {
    ev = JSON.parse(r.text);
  } catch {
    return { error: 'event file is not valid JSON' };
  }
  const pr = ev?.pull_request?.number;
  const repo = ev?.repository?.full_name;
  if (!Number.isInteger(pr) || pr < 1 || typeof repo !== 'string' || !REPO_RE.test(repo)) {
    return { error: 'event file has no pull request' };
  }
  return { repo, pr };
}

function textProblem(text) {
  if (!text.startsWith(REPLY_PREFIX)) return `reply must start with "${REPLY_PREFIX}"`;
  if (text.includes('<!--') || text.includes('-->')) return 'reply contains an HTML comment';
  if (CONTROL_RE.test(text)) return 'reply contains a control character';
  if (redact(text) !== text) return 'reply contains a secret-shaped value';
  return null;
}

function securityProblem(text, findings) {
  const sec = findings.filter((f) => f?.security || isForcedSecurity(f?.class, f?.slug));
  if (sec.some((f) => typeof f.slug === 'string' && f.slug && text.includes(f.slug))) {
    return 'reply names a security finding';
  }
  const needles = securityNeedles(sec.map((f) => ({ ...f, security: true })));
  if (mentions(text, needles)) return "reply names a security finding's file";
  return null;
}

// deps: argv (must be empty), env (OUT, RUNNER_TEMP, GITHUB_EVENT_PATH), request(method, path,
// body), fs (optional, for tests). Returns { posted, reason }; never throws for bad input.
export async function runReply({ argv = [], env = {}, request, fs = { lstatSync, readFileSync, openSync, closeSync } }) {
  if (argv.length) return refuse('arguments are not accepted; write the text to <OUT>/reply.md');
  if (!env.OUT) return refuse('OUT is not set');
  if (!env.RUNNER_TEMP) return refuse('RUNNER_TEMP is not set');
  const target = eventTarget(env, fs);
  if (target.error) return refuse(target.error);

  const body = readRegular(join(env.OUT, 'reply.md'), MAX_REPLY_BYTES, 'reply.md', fs);
  if (body.error) return refuse(body.error);
  const text = body.text.trim();
  const problem = textProblem(text);
  if (problem) return refuse(problem);

  const f = readRegular(join(env.OUT, 'findings.json'), 2_000_000, 'findings.json', fs);
  if (f.error) return refuse(`${f.error}; write findings.json before replying`);
  const parsed = validateFindings(f.text);
  if (!parsed.ok) return refuse('findings.json is not valid; write it before replying');
  const sec = securityProblem(text, parsed.value.findings);
  if (sec) return refuse(sec);

  // One reply per run, claimed before posting so a failed or repeated call cannot post twice.
  try {
    fs.closeSync(fs.openSync(join(env.RUNNER_TEMP, LOCK_NAME), 'wx'));
  } catch (err) {
    return refuse(err?.code === 'EEXIST' ? 'a reply was already posted this run' : 'cannot claim the reply lock');
  }
  try {
    await request('POST', `/repos/${target.repo}/issues/${target.pr}/comments`, { body: `${text}\n\n${REPLY_MARKER}` });
  } catch (err) {
    return refuse(`posting failed (${err?.status ?? 'error'})`);
  }
  return { posted: true, reason: `posted to #${target.pr}` };
}
