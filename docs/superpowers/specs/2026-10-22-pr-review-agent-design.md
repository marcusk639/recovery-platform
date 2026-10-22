# Repo-aware PR review agent — design

**Date:** 2026-10-22 · **Status:** draft for approval · **Owner:** Marcus Klein

## 1. Intent

Every PR to `recovery-platform` should get an automated second-pass review that knows _this_ codebase: one that notices when a change in one package silently breaks another (a Cloud Function change that breaks the mobile app, a new query with no index, a renamed field a trigger still reads), names the user-facing features a diff puts at risk, and checks the diff against the repo's own conventions and its history of recurring bugs, on top of ordinary PR-review practice.

Why now:

- **The existing reviewer does nothing.** `.github/workflows/claude-code-review.yml` has run 182 times since #10 and has never posted a review or comment. It has `pull-requests: read` and no tool allowlist, so it cannot post.
- **Cross-package breaks are invisible to everything else.** No package imports another. Every link between packages is a string or a hand-copied type: callable names, collection and field names, indexes, storage paths, push `type` values, deep links, claim shapes, and the recovery-api headers and app ids. CI and the pre-push hook test only the changed package, and every side mocks the other. A pre-design analysis found roughly 30 live cross-package mismatches on `origin/main` that nothing caught.
- **PRs are large and mostly agent-authored.** The median is about 1k lines changed; feature PRs run 3.7k–5.9k. The author already runs several local reviewer agents per PR. This reviewer is an independent pass whose edge is cross-package and repo-history knowledge.

## 2. Decisions made by Marcus

| Decision          | Choice                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Effect on merging | **Advisory only.** It leaves comments for Marcus to weigh. It never blocks a merge and is never a required check.                      |
| Runtime           | **`anthropics/claude-code-action@v1`** in GitHub Actions.                                                                              |
| Auth and model    | **The existing `CLAUDE_CODE_OAUTH_TOKEN` (Marcus's subscription) with Opus.** No separate API key.                                     |
| Security findings | **Public comments carry only a vague pointer.** Details go to a private channel (§7.9).                                                |
| Review frequency  | **Every push**, without duplicating earlier results. Each run sizes its own scope from the diff since the last reviewed commit (§7.8). |

## 3. Goals

- **G1. Cross-package break detection.** For every link type a diff touches, the reviewer opens the _other side_ and reports concrete breaks, citing `file:line` on both sides.
- **G2. Feature-impact awareness.** Each finding names the product feature at risk in plain words (e.g. "Regroup: resident rent payment history"). The summary lists the features the PR touches.
- **G3. Repo-specific review.** It checks the diff against each package's conventions as actually practised, and against the recurring bug classes mined from this repo's history (§7.3).
- **G4. General PR-review practice.** It covers correctness, error handling and silent failures, security, tests that can't fail, PII in logs, secrets, and PR text that claims things the code doesn't do.
- **G5. Signal over volume.** It actually posts. It posts few, verified, high-value findings and skips what the PR body or earlier review rounds already address.

## 4. Non-goals

- Blocking merges, setting a required status, or approving or requesting changes as a formal GitHub review state.
- Editing code, pushing commits or opening PRs.
- Running the PR's code: no `npm install`/`npm ci` of PR dependencies, no tests, no builds.
- Fixing the live mismatches the analysis found, or closing the CI gaps (regroup rules tests not in CI, unenforced coverage floors, no lint, no mobile/web typecheck). These are follow-ups (§11).
- Reviewing `e2e-fix/*` branches or PRs from forks.
- Replacing the `@claude` workflow (`claude.yml`). It stays as is.

## 5. Anti-goals (failure even if it "works")

- **Noise:** generic style nits, restating the diff, re-raising items the PR body already dispositions, or dozens of inline comments.
- **Confident wrong claims:** a cross-package finding whose "other side" the reviewer didn't actually open, or a `file:line` that doesn't exist.
- **Leaking sensitive data in public:** the repo is **public**. Comments and workflow logs are world-readable. The reviewer must never quote a secret value (redact to a prefix plus `…`) or PII. `show_full_output` must stay off except for a deliberate one-off debug run. Security findings follow §7.9 in every posted surface: summary, inline comments, "noticed nearby" and map-maintenance notes.
- **Duplicate results:** re-raising, on a later push, a finding already posted for the same code. That applies whether or not Marcus has responded to it.
- **Publishing a vulnerability catalogue:** committed knowledge files describe link _patterns_ and checks. They must not list currently-exploitable weaknesses on `main`.
- **Letting a PR edit the rules it is judged by:** all reviewer knowledge and every script the workflow executes must come from the base branch, never the PR head.
- **Eating Marcus's subscription:** an unbounded run on a huge PR.

## 6. Constraints

- `anthropics/claude-code-action@v1`. Workflow permissions: `contents: read`, `pull-requests: write` (needed to post), `issues: read`, `id-token: write`. The checkout uses `persist-credentials: false`. Keep the existing `if: !startsWith(github.head_ref, 'e2e-fix/')`, and add a same-repo guard (`github.event.pull_request.head.repo.full_name == github.repository`), because forks don't receive secrets.
- On PRs the action restores `.claude/`, `.mcp.json`, `CLAUDE.md` and related files from the base branch, and puts the PR's copies under `.claude-pr/`. Everything else stays at PR head. Consequences:
  - Reviewer knowledge lives under `.claude/` so it is base-branch-controlled. A PR that edits it is reviewed with the old version, which is intended. The reviewer may read `.claude-pr/` to comment on such edits.
  - The base-branch `.claude/settings.json` defines `SessionStart`, `PostToolUse` and `Stop` hooks written for Marcus's machine. **They must not run in the review job.** The builder chooses the mechanism and must verify it in a real run.
  - `.mcp.json` declares servers (firebase, context7, stripe, github, sentry) that must not start in CI. Use `--strict-mcp-config` so only the action's own servers (for example the inline-comment server) load.
- Any deterministic pre-check script runs from a **base-branch checkout** (a second `actions/checkout` of the base SHA into a separate directory). It reads the PR diff as text. It uses Node built-ins or POSIX tools only, with no dependency install.
- `fetch-depth` must allow `git diff <base>...<head>` locally. The current `fetch-depth: 1` does not.
- Repo rules for the change itself:
  - New `.ts`/`.js` files stay within 300 lines (pre-commit).
  - Commit messages follow the repo's commit-msg hook. The builder checks how a `ci:` change is accepted; #108 landed as a bare `ci:`.
  - Work in a worktree off `origin/main`.
- Scale: about 2,300 tracked source files; regroup/mobile alone is 165k lines. The reviewer cannot read the repo per run. It reads the diff, the knowledge files and the specific counterpart files the map points to.

## 7. Design

### 7.1 Workflow (`.github/workflows/claude-code-review.yml`, replaced in place)

- **Triggers:** `pull_request` `opened`, `synchronize`, `ready_for_review`, `reopened`. _My call:_ skip draft PRs (review once they're marked ready).
- **Concurrency:** one group per PR with `cancel-in-progress: true`, so a new push supersedes a running review.
- **Steps:**
  1. Checkout PR head at full depth, `persist-credentials: false`.
  2. Checkout the base SHA into `./.review-base`.
  3. Run the pre-checks from `./.review-base` against the PR diff, writing a facts file (§7.4).
  4. Run `claude-code-action@v1` with:
     - `claude_code_oauth_token`
     - a short `prompt` pointing at `.claude/pr-review/REVIEW.md` and the facts file
     - `claude_args`: `--model` for Opus, `--max-turns` (_my call:_ start around 60 and tune from real runs), `--strict-mcp-config`, and an explicit `--allowedTools` list (§7.6).
- **Limits:** a job `timeout-minutes` cap (_my call:_ 30). For PRs over about 60 changed files or 5k lines, the reviewer prioritises high-risk paths (§7.3 routing) and states in the summary what it did not review.

### 7.2 Knowledge files (`.claude/pr-review/`, committed, base-branch-controlled)

| File                                                          | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REVIEW.md`                                                   | The procedure in §7.5, output rules (§7.7), severity and confidence definitions, redaction rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `contract-map.md` (may be split per product to stay readable) | "If X changes, check Y" tables per link type, both directions, with the counterpart file paths. Covers: callables (name, region, request/response keys) ↔ mobile/web call sites; Firestore writes ↔ rules ↔ trigger field reads ↔ indexes; storage paths ↔ `storage.rules`; custom claims (writers ↔ rules, storage rules and clients); push `type`/payload ↔ mobile handlers and Android channel ids; deep-link schemes and routes ↔ native registration, linking config and web routes; `APP_BASE_URL`/`WEB_ORIGIN`/return-origin allowlists ↔ launch config and hosting rewrites; HTTP export names tied to external config (Stripe webhook endpoints, `stripeConnectReturn`/`Reauth` hosting rewrites); recovery-api endpoints, auth headers and app registry ↔ the homegroups, regroup and detox consumers; shared literal unions (roles, statuses, meeting types, tiers); duplicated helper pairs between `homegroups/functions/src/utils` and `regroup/functions/src/util`; config coupling (firebase.json/.firebaserc, regions, emulator ports, env-var names, dependency majors); nested `*/.github/workflows` that GitHub never runs. |
| `checklist.md`                                                | The recurring bug classes (§7.3), each with what to look for, the paths that trigger it, and one or two historical PR numbers as evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `conventions.md`                                              | Per-package practised conventions: homegroups `requireAuth`/`validateData`; regroup inline auth check + `parseInput`; recovery-api `requireServiceAuth`; `logger` with IDs only; `HttpsError` with fixed messages; integer cents with branded types; v1 Firestore triggers kept deliberately in homegroups; TS strictness differences. Links to the package `CLAUDE.md` files rather than copying them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `false-positives.md`                                          | Known-intentional patterns not to flag: regroup's "deliberately not gated" callables; detox's silent-200 honeypot; the Firebase web API key in `environment.ts`; no rules file in regroup/web; the two public homegroups callables; facts the repo can't verify (APNs, signing, mailboxes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Seeding: the builder writes these from the pre-design analysis stored at `.git/pr-review-analysis/*.md` in the main checkout (deliberately untracked; it contains live-vulnerability detail that must stay out of the public repo). Every map entry is re-verified against `origin/main` while writing it. Only patterns and counterpart paths are committed, not the live-mismatch lists.

**The map is guidance, not truth.** The reviewer always confirms a link by grep or read before reporting on it. When a PR adds a new link, or moves one the map lists, the summary includes a short "map maintenance" note naming the entry to update. _My call:_ there is no automated map regeneration in this project.

### 7.3 Bug-class checklist and path routing

The classes, mined from merged PRs and fix commits:

1. Client-supplied IDs trusted for authorisation or money routing.
2. Money paths not exactly-once: idempotency keys, events marked done before the work, non-transactional increments.
3. Dollars vs cents across the wire.
4. Plan-cap or entitlement bypass by resetting state, and client-only paywalls.
5. Firestore rules or index drift, and list queries the rules can't satisfy.
6. Callable region mismatch, including the v1/v2 `onCall` trap.
7. Overly permissive rules, and PII exposed through data.
8. PII in logs.
9. Silent failure reported as success, including errors swallowed to `[]`.
10. Tests that can't fail: mocks that hide a revert, fixtures production never produces.
11. Config and environment mistakes: production allowlists, ambient project, test webhooks pointed at prod, committed secrets.
12. Unbounded reads and fan-out.
13. PR text that claims things the code doesn't do.
14. Cross-product isolation violations.

Routing, so each run applies only what's relevant:

| Paths touched                                                        | Classes applied |
| -------------------------------------------------------------------- | --------------- |
| callables, webhooks, scheduled functions                             | 1–4, 9, 12      |
| `firestore.rules`, `storage.rules`, indexes, new `.where`/`.orderBy` | 5, 7            |
| `region`/`setGlobalOptions`                                          | 6               |
| logging                                                              | 8               |
| tests                                                                | 10              |
| config/env                                                           | 11              |
| any                                                                  | 13, 14          |

### 7.4 Deterministic pre-checks (facts file)

Scripts (_my call:_ under `.claude/pr-review/checks/`, so they're base-controlled and restored) produce one markdown facts file the reviewer reads first. Each fact is a hint the reviewer must confirm, not a verdict:

- changed files grouped by package, and which contract-map link types the paths trigger
- `.claude/agent-gates/verify-diff.sh <base>` output (deleted, disabled or hollow tests; test-count drop)
- added or removed callable/HTTP exports, plus grep hits for their names in the client packages
- `region`/`setGlobalOptions` edits
- new `.where`/`.orderBy` chains, and whether a matching composite index entry exists (heuristic)
- new client storage paths, and whether a `storage.rules` match exists (heuristic)
- new client collection paths, and whether a rules block exists (heuristic)
- edits to one file of a known duplicate pair
- a secret-pattern scan of added lines, including `.md` and env-style files. It uses a wider set than the pre-commit hook (adds `whsec_`, `sk_test_`, `rk_live_`, `re_`, `SG.`, `gh[osu]_`). Values are redacted in the facts file itself.
- PII-in-log heuristics on added `logger.*`/`console.*` calls
- new `.ts`/`.js` files over 300 lines
- the PR title's conventional-commit scope (PRs squash-merge, so the title is the commit)

Pre-check failures must not fail the job. A broken script yields a "pre-check unavailable" fact, and the review proceeds.

### 7.5 Review procedure (in `REVIEW.md`)

1. Read the PR title, body and existing comments, including Marcus's "Review round N" posts and any prior summary by this bot. Note what is already dispositioned.
2. Read the facts file, then the diff (`gh pr diff` / `git diff base...head`).
3. **Cross-package pass:** for each link type touched, use the contract map to find the counterparts. Open them, compare shapes and strings, and record a break only with both sides cited.
4. **Feature-impact pass:** name the user-facing features each changed area serves.
5. **Repo-specific pass:** apply the routed checklist classes and the conventions, honouring `false-positives.md`.
6. **General pass:** correctness, edge cases, error handling, security, test quality, PR-text accuracy.
7. **Verification pass:** before posting, re-open every cited location to confirm it exists and says what the finding claims. Drop or downgrade anything unconfirmed. Assign each surviving finding a severity (Critical/High/Medium/Low) and a confidence (high/medium/low).
8. **Pre-existing problems:** report one only when the diff touches it or makes it worse. Otherwise allow at most a short "noticed nearby" list of up to 3 one-liners.
9. Post (§7.7).

### 7.6 Tools allowed

- `Read`, `Grep`, `Glob`.
- `Bash` restricted to read-only commands: `gh pr view`, `gh pr diff`, `gh api` GETs for PR comments and reviews, `git diff`/`log`/`show`/`grep`, and reading the facts file.
- The action's inline-comment tool.
- The minimum write commands needed to create or update the one summary comment.

No `Edit`/`Write` to the repo, no `WebFetch`/`WebSearch`, no package managers. The builder confirms in a real run that nothing posts as `permission_denied`. That was the old bot's silent failure.

### 7.7 Output

- **One summary comment per PR, updated in place on each run.** The builder picks the mechanism: the action's sticky-comment option if it exists in v1, otherwise find-and-edit the bot's prior comment. The comment contains:
  - an advisory headline: findings by severity, or "no issues found"
  - **Features touched**
  - **Cross-package impact:** a table of link → other side → status (ok / broken / unverified)
  - **Findings by severity:** each with confidence, both-side `file:line`, why it breaks, a suggested fix, and the feature at risk
  - **Checked and fine:** link types touched and verified, so silence is informative
  - **Not reviewed / limits** (large PRs, unavailable pre-checks)
  - **Map maintenance** notes
- **Inline comments:** only for Critical/High findings, at most 10 per run. Never re-post a finding already in the ledger (§7.8).

### 7.8 Every push, without duplication

**State.** The summary comment carries a hidden, machine-readable block (for example an HTML comment holding JSON) with:

- the last reviewed head SHA
- a **findings ledger**: one entry per finding with a stable fingerprint (rule/class, file, symbol or hunk anchor, short claim), severity, status (`open`, `resolved`, `superseded`) and the IDs of any inline comments posted for it

Existing inline review threads, including Marcus's replies and resolved state, are read too. A finding Marcus has resolved or replied to is never re-raised unless new code makes it materially worse.

**Sizing each run.** The pre-check step computes the increment from the last reviewed SHA to the new head and classifies it:

| Increment                                                                                                                     | Run                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No effective change: an empty diff, or only a merge/rebase from `main` whose PR-vs-base diff is unchanged (compare patch-ids) | No model run. Update the SHA in the summary ("no new changes since `<sha>`").                                                                            |
| Only docs, comments, formatting or lockfiles, with no link-type triggers                                                      | Light pass over the increment only, mainly secrets, PII and PR-text accuracy. Low turn cap.                                                              |
| Code changes that don't touch new link types                                                                                  | Review the increment's hunks and the code they call or are called by. Re-check open ledger findings whose files changed and mark them resolved if fixed. |
| Code changes that touch link types not seen in earlier runs, or a large share of the PR                                       | Full review of the increment plus the cross-package pass for the newly touched links.                                                                    |
| First run, a force-push that rewrote history so the last SHA is unreachable, or no prior state                                | Full review of the whole PR against base. Deduplicate against existing comments by fingerprint.                                                          |

Thresholds and per-tier turn caps are the builder's to set and tune. The tier chosen is shown in the summary's "Not reviewed / limits" section.

**Updating output.** Each run rewrites the summary from the ledger. Open findings stay listed, fixed ones move to "Resolved since last review", and new ones are marked new. Inline comments are posted only for new ledger entries.

### 7.9 Security findings: public pointer, private details

A finding counts as security-relevant if it is in classes 1, 4, 7, 11 or 14, if it involves auth, rules, secrets or payment routing, or if it touches any pre-existing security weakness. For these:

- Public surfaces show only a pointer with severity and package or area, e.g. "Security-relevant issue (High) in `regroup/functions` payments area; details sent privately". No `file:line`, mechanism, exploit path or suggested fix. Secret values are never posted anywhere.
- Full details go to a private channel only Marcus can read.
  - _My call:_ a **draft GitHub repository security advisory** per finding (deduplicated by ledger fingerprint), created through the REST API. This probably needs a token with repository-advisory write permission. The builder confirms whether the action's app token or `GITHUB_TOKEN` can do it. If not, Marcus adds a fine-grained PAT as a repo secret, and the builder documents the exact permission.
  - If no private channel is available in a run, the pointer says so, and the details are not written to logs either.
- Replay PRs for security classes are judged on whether the pointer appears and the advisory contains the correct both-side detail.
- No secret values and no PII anywhere in posted text.

## 8. Acceptance criteria

1. On a fresh test PR the workflow posts a summary comment, and inline comments where warranted, with zero permission denials in the run summary.
2. **Replay set:** run the reviewer against branches that re-introduce known historical bugs and confirm it flags each with the correct other side. At minimum:
   - a callable moved to a non-default region with its clients unchanged (the 2026-08-01 outage class)
   - a new client query with no index
   - a client-supplied `houseId` used for payment routing (#72 class)
   - a dollars/cents mismatch on a payment field (#86/#88 class)
   - a recovery-api header or app-id change with its consumers unchanged
   - a fix applied to one copy of a duplicated helper only

   The builder constructs these on throwaway branches and closes them afterwards.

3. A clean, non-trivial PR produces no Critical/High findings.
4. Local hooks and project MCP servers demonstrably don't run in the job.
5. Same-repo, non-draft, non-`e2e-fix/*` PRs are reviewed. Forks and `e2e-fix/*` are skipped.
6. A run on a ~1k-line PR finishes within the turn and time caps. The builder reports observed turns and duration so the caps can be tuned.

## 9. Left to the builder

- The exact mechanisms for hook suppression and the sticky comment.
- The Opus model identifier to pass.
- Final turn and timeout caps.
- The pre-check script structure (within the 300-line limit per new file).
- How `contract-map.md` is split.
- Wording of `REVIEW.md`.
- Building the replay branches.

## 10. Calls made by Claude (please check)

- Skip draft PRs.
- Cancel in-progress reviews on a new push.
- Inline comments only for Critical/High, capped at 10.
- Starting caps: ~60 turns, 30 minutes.
- Pre-checks are hints the reviewer must confirm, not verdicts, and never fail the job.
- Knowledge files are hand-maintained, with "map maintenance" nudges; no auto-regeneration.
- The pre-design analysis stays out of the repo (in `.git/pr-review-analysis/`) because the repo is public.
- The same-repo guard is added because forks can't use the token.
- **The workflow file can be edited by the PR under review.** For `pull_request` events GitHub runs the workflow from the PR. The threat model is accidental edits by Marcus's own agents, not adversarial PRs: forks are excluded and only collaborators push branches. So this gap is accepted rather than redesigned around `pull_request_target`. The reviewer flags, as a High finding, any PR that touches `.github/workflows/claude-code-review.yml` or the files under `.claude/pr-review/` (visible via `.claude-pr/`).
- **Order of testing.** The PR that introduces `.claude/pr-review/` is reviewed without those files, because the action loads `.claude/` from base. It is merged first, then acceptance criteria 1–2 (including the replay set) run against `main`.
- Security details go to draft repository security advisories (§7.9).
- Re-runs are tiered by the size and kind of the increment, with the review state kept in a hidden block in the summary comment (§7.8).

## 11. Follow-ups outside this project

- **Rotate the two Stripe webhook signing secrets** committed in #99 (public repo). Removal is on branch `fix/regroup-remove-committed-webhook-secrets`, not yet pushed.
- File the ~30 live cross-package mismatches from the analysis as issues. Several are security-relevant and should be filed thoughtfully, given the repo is public.
- Close CI gaps: regroup rules tests, coverage enforcement, lint, mobile/web typecheck, running regroup/web specs.
- Shared contract fixtures between recovery-api and its consumers, so one-sided drift fails CI.
- Retire the dead nested workflows under `*/.github/workflows`.
