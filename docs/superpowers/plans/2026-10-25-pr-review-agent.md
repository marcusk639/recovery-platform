# Repo-aware PR Review Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-posting `claude-code-review.yml` with an advisory, repo-aware PR reviewer on `anthropics/claude-code-action@v1`. It checks cross-package contracts, repo conventions and recurring bug classes; reviews every push incrementally without duplicates; and keeps security detail out of public surfaces.

**Architecture:** A GitHub Actions job runs in three phases.

1. **Pre-check.** Model-free Node scripts, executed from a base-SHA checkout, compute facts, prior review state and a run tier.
2. **Review.** `claude-code-action` (Opus, subscription token) follows `.claude/pr-review/REVIEW.md`, posts inline comments, and writes `findings.json` and `summary.md` to `$RUNNER_TEMP/pr-review/`.
3. **Publish.** A model-free script merges the findings into a ledger, renders and upserts the single summary comment (security findings as pointers only), and delivers security details to draft repository security advisories.

**Tech Stack:** GitHub Actions; `anthropics/claude-code-action@v1`; Node 22 ESM scripts using built-ins only (`node:test`, `node:assert`, `node:crypto`, `node:child_process`, global `fetch`); Markdown knowledge files.

**Spec:** `docs/superpowers/specs/2026-10-22-pr-review-agent-design.md`

## Global Constraints

- The reviewer is advisory only. Never a required check, never a formal approve or request-changes review.
- Runtime: `anthropics/claude-code-action@v1`, auth `secrets.CLAUDE_CODE_OAUTH_TOKEN`, model Opus. No `github_token` input to the action.
- Workflow permissions are exactly `contents: read`, `pull-requests: write`, `issues: read`, `id-token: write`. Every `actions/checkout` sets `persist-credentials: false`.
- Job guard: skip drafts, skip `e2e-fix/*` heads, skip forks (`head.repo.full_name != github.repository`).
- Scripts the workflow executes come from `./.review-base` (a base-SHA checkout), never from PR head. They use Node built-ins only and install no dependencies.
- New `.ts`/`.js`/`.mjs` files stay ≤ 300 lines (repo pre-commit; `.mjs` is not matched by the hook, but the rule applies).
- Hooks are suppressed via the action's `settings` input. `.claude/settings.json` is not edited. `.mcp.json` servers are kept out via `--strict-mcp-config`.
- The repo is **public**. No secret value, PII, or security-finding detail (file, line, mechanism, fix) appears in any comment, hidden marker, log line or artifact. Never set `show_full_output`. Never upload `$RUNNER_TEMP/pr-review`.
- Security findings get no inline comments. In public they are only `Security-relevant issue (<Severity>) in <package> <area>; details sent privately`.
- Inline comments: Critical and High only, at most 10 per run, each ending with `<!-- pr-review:fp=<slug> -->`.
- Summary comment ≤ 60,000 characters, identified by the first line `<!-- pr-review:summary -->`.
- Commits use type `ci` or `docs` with no product scope (e.g. `ci: …`). Work in a worktree off `origin/main`, one PR per stage. Each stage merges before the next starts.
- Seed knowledge from `/Users/marcusklein/dev/recovery-platform/.git/pr-review-analysis/*.md`. Commit link patterns and counterpart paths only, never the live-mismatch lists from that analysis.

## Shared data contracts (used across tasks)

All files live in `OUT = $RUNNER_TEMP/pr-review/`.

- **`state.json`** (written by pre-check, read by Claude and publish):
  `{ lastReviewedSha: string|null, lastBaseSha: string|null, ledger: LedgerEntry[], linkTypesSeen: string[], inlineSlugs: string[], tier: Tier, maxTurns: number, headSha: string, baseSha: string, pr: number }`
- **`Tier`** = `"none" | "base-drift" | "light" | "incremental" | "incremental-new-links" | "full"`. `maxTurns` per tier: none 0, base-drift 15, light 15, incremental 40, incremental-new-links 60, full 60.
- **`LedgerEntry`**:
  - non-security: `{ id, slug, title, severity, status, security: false, runsSinceResolved }`
  - security: `{ id, severity, status, security: true, runsSinceResolved }`, **with no other keys**
  - `id = sha256(slug).hex.slice(0,16)`; `status ∈ open|resolved|superseded`; `severity ∈ Critical|High|Medium|Low`
- **`findings.json`** (written by Claude):
  `{ reviewedSha, findings: Finding[], resolvedSlugs: string[] }`, where
  `Finding = { slug, class: 1-14, severity, confidence: "high"|"medium"|"low", security: boolean, package, area, title, feature, locations: {file, line, side: "changed"|"counterpart"}[], why, fix, inlinePosted: boolean }`
- **Slug format:** `c<class>:<file>:<symbol-or-anchor>`, e.g. `c5:regroup/mobile/src/services/payments.ts:getPaymentHistory`.
- **`summary.md`** (written by Claude): narrative sections only, namely Features touched, Cross-package impact, Checked and fine, Not reviewed / limits, Map maintenance. Findings are rendered by publish, not by Claude.
- **Ledger marker** in the summary comment: `<!-- pr-review:ledger v1 <base64(JSON {lastReviewedSha,lastBaseSha,linkTypesSeen,ledger})> -->`.

## Review Focus

1. **Claude's run is cut off by `--max-turns`**, leaving `findings.json` missing or truncated. Publish must report "review did not complete", keep the prior ledger, and not advance `lastReviewedSha`. Owner: Task 8, `publish keeps prior state when findings.json is invalid`.
2. **Claude quotes a secret or a security finding's file in `summary.md` or a finding's text.** Publish must redact secret patterns from all posted text and drop narrative lines naming a security finding's files. Owner: Task 8, `publish redacts secrets and withholds security paths`.
3. **The prior summary comment is hand-edited or its ledger marker is corrupted.** State loading must fall back to "no prior state" (tier `full`), not crash. Owner: Task 9, `loadState tolerates corrupt ledger marker`.
4. **Diffs with renames, deletions, binary files or paths with spaces.** The added-lines parser must not misattribute lines or throw. Owner: Task 3, `parseUnifiedDiff handles rename, delete, binary, spaces`.
5. **A huge PR (>60 files or >5k lines).** `facts.md` stays ≤ 40 KB, listing per-check results with "N more omitted". Owner: Task 6, `facts output is capped`.

---

## Stage 1 — Skeleton (one PR)

### Task 1: Comment library and summary upsert

**Files:**

- Create: `.claude/pr-review/checks/lib/gh.mjs`, `.claude/pr-review/checks/lib/markers.mjs`
- Create: `.claude/pr-review/checks/publish.mjs` (skeleton mode only in this task)
- Test: `.claude/pr-review/checks/test/markers.test.mjs`, `.claude/pr-review/checks/test/publish-skeleton.test.mjs`

**Interfaces:**

- Produces:
  - `gh.mjs`:
    - `ghRequest(method, path, body?, token=process.env.GH_TOKEN): Promise<any>`, using `fetch` against `https://api.github.com`. Throws `Error` with status on non-2xx.
    - `listIssueComments(repo, pr): Promise<{id, body, user:{login}}[]>`, paginated with `per_page=100`.
    - `listReviewComments(repo, pr): Promise<{id, body}[]>`.
    - `upsertSummary(repo, pr, body): Promise<void>`: finds the comment whose body starts with `<!-- pr-review:summary -->` and is authored by `github-actions[bot]`; PATCHes it, otherwise POSTs.
  - `markers.mjs`:
    - `SUMMARY_MARKER = '<!-- pr-review:summary -->'`
    - `encodeLedger(obj): string`, `decodeLedger(body): object|null` (null on any parse failure)
    - `extractInlineSlugs(bodies: string[]): string[]`, matching `/<!-- pr-review:fp=([^ >]+) -->/`
- [ ] **Step 1: Write the failing tests.**
  - `markers.test.mjs`:
    - `decodeLedger(encodeLedger(x))` deep-equals `x`.
    - `decodeLedger('<!-- pr-review:ledger v1 !!!notbase64 -->')` returns `null`.
    - `extractInlineSlugs(['a <!-- pr-review:fp=c5:a.ts:f -->', 'none'])` returns `['c5:a.ts:f']`.
  - `publish-skeleton.test.mjs`: call `renderSkeleton({ headSha: 'abc1234', outcome: 'success' })` and assert the result starts with `SUMMARY_MARKER` and contains `reviewer online` and `abc1234`. Then call it with `outcome: 'failure'` and assert it contains `review did not complete`.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: FAIL (modules not found).
- [ ] **Step 3: Implement `gh.mjs`, `markers.mjs` and `publish.mjs`.**
  - `publish.mjs` exports `renderSkeleton({headSha, outcome})`.
  - When run as main it reads env `REPO`, `PR`, `HEAD_SHA`, `ACTION_OUTCOME`, `GH_TOKEN` and calls `upsertSummary`.
  - The main block wraps everything in try/catch, logs only `publish failed: <status>`, and exits 0.
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Commit.** `git add .claude/pr-review/checks && git commit -m "ci: pr-review comment library and summary upsert"`

### Task 2: Skeleton workflow and CI test job

**Files:**

- Modify (replace contents): `.github/workflows/claude-code-review.yml`
- Modify: `.github/workflows/ci.yml` (add job `pr-review-checks`)

**Interfaces:**

- Consumes: `publish.mjs` (Task 1).
- Produces:
  - A job `review` with step ids `facts` (outputs `tier`, `max_turns`), `review` (the action) and `publish`. Later tasks fill these in.
  - Env `OUT: ${{ runner.temp }}/pr-review`.
- [ ] **Step 1: Write the workflow.**
  - `on.pull_request.types: [opened, synchronize, ready_for_review, reopened]`.
  - `concurrency: { group: pr-review-${{ github.event.pull_request.number }}, cancel-in-progress: true }`.
  - Job `if`: `!github.event.pull_request.draft && !startsWith(github.head_ref, 'e2e-fix/') && github.event.pull_request.head.repo.full_name == github.repository`.
  - Permissions as in Global Constraints. `timeout-minutes: 30`.
  - Steps:
    1. Checkout head with `fetch-depth: 0`.
    2. Checkout `ref: ${{ github.event.pull_request.base.sha }}` into `path: .review-base`, with `fetch-depth: 1`.
    3. `actions/setup-node` with Node 22.
    4. `facts`: in this stage, `mkdir -p "$OUT"` and write `tier=full` and `max_turns=10` to `$GITHUB_OUTPUT`.
    5. `review`: `anthropics/claude-code-action@v1`, `continue-on-error: true`, with
       - `claude_code_oauth_token`
       - `settings: '{"disableAllHooks": true}'`
       - `prompt`: post exactly one inline comment on the first changed line saying `pr-review skeleton check` followed by `<!-- pr-review:fp=c0:skeleton:check -->`, then write `$OUT/findings.json` as `{"reviewedSha":"<head>","findings":[],"resolvedSlugs":[]}`
       - `claude_args`:
         - `--model opus`
         - `--max-turns ${{ steps.facts.outputs.max_turns }}`
         - `--strict-mcp-config`
         - `--allowedTools "Read,Grep,Glob,Write,mcp__github_inline_comment__create_inline_comment,Bash(git diff:*),Bash(git log:*),Bash(git show:*),Bash(git grep:*)"`
         - `--disallowedTools "Edit,WebFetch,WebSearch"`
    6. `publish` (`if: always()`): `if [ -f .review-base/.claude/pr-review/checks/publish.mjs ]; then node .review-base/.claude/pr-review/checks/publish.mjs; else echo "pr-review scripts not on base yet"; fi`, with env `GH_TOKEN: ${{ github.token }}`, `REPO`, `PR`, `HEAD_SHA`, `ACTION_OUTCOME: ${{ steps.review.outcome }}`.
    7. Cleanup (`if: always()`): `rm -rf "$OUT"`.
- [ ] **Step 2: Add the CI job.** In `ci.yml` add job `pr-review-checks`: checkout, Node 22, then `node --test ".claude/pr-review/checks/test/*.test.mjs"`.
- [ ] **Step 3: Validate the YAML locally.**
      Run: `node -e "require('fs').readFileSync('.github/workflows/claude-code-review.yml','utf8')" && npx --yes @action-validator/cli@0.6.0 .github/workflows/claude-code-review.yml`
      Expected: no errors.
- [ ] **Step 4: Commit, push, open the Stage 1 PR, and merge it once CI is green.** The PR's own review run prints "pr-review scripts not on base yet". That is expected (spec §10, order of testing).
- [ ] **Step 5: Verify on a throwaway test PR off the new `main`** (one-line change in a `.md` file). In the run, confirm:
  - (a) a summary comment exists with `reviewer online`;
  - (b) the inline comment was posted by `claude[bot]`;
  - (c) the action's result shows 0 `permission_denials`;
  - (d) the run log shows no output from the SessionStart/PostToolUse/Stop hooks and no startup of the firebase, context7, stripe, github or sentry MCP servers;
  - (e) the model in the result is Opus.

  If (d) fails, change the hook or MCP mechanism inside the workflow only, and repeat. Close the test PR and record (a)–(e) in the Stage 1 PR description.

## Stage 2 — Knowledge, pre-checks, full review (one PR)

### Task 3: Diff parsing and routing

**Files:**

- Create: `.claude/pr-review/checks/lib/diff.mjs`, `.claude/pr-review/checks/lib/glob.mjs`, `.claude/pr-review/routing.json`, `.claude/pr-review/checks/lib/routing.mjs`
- Test: `.claude/pr-review/checks/test/diff.test.mjs`, `.claude/pr-review/checks/test/routing.test.mjs`

**Interfaces:**

- Produces:
  - `diff.mjs`:
    - `git(args: string[], cwd?): string`, via `execFileSync`, no shell.
    - `parseUnifiedDiff(text): {file, oldFile, status: 'A'|'M'|'D'|'R', binary: boolean, added: {line: number, text: string}[]}[]`
    - `prDiff(baseSha, headSha, cwd)`, equal to `parseUnifiedDiff(git(['diff','-M','--no-color',`${baseSha}...${headSha}`]))`
  - `glob.mjs`: `matches(path, pattern): boolean`, supporting `**`, `*` and `?`.
  - `routing.json`: `[{ linkType: string, paths: string[], counterparts: string[], classes: number[] }]`. It contains at least these link types: `callable`, `firestore-rules`, `firestore-indexes`, `firestore-trigger`, `storage`, `claims`, `push`, `deep-link`, `origins-config`, `http-export`, `recovery-api`, `shared-literals`, `twin-helper`, `config-coupling`, `logging`, `tests`, `review-config`.
  - `routing.mjs`: `route(files: string[]): { packages: string[], linkTypes: string[], classes: number[] }`. Packages are path prefixes: `homegroups/functions`, `homegroups/mobile`, `homegroups/web`, `regroup/functions`, `regroup/mobile`, `regroup/web`, `regroup/e2e`, `recovery-api`, `detox-recovery`, otherwise `repo`. Classes 13 and 14 are always included.
- [ ] **Step 1: Write the failing tests.**
  - `parseUnifiedDiff handles rename, delete, binary, spaces`, using a fixture diff with:
    - a rename (`similarity index 90%`, `rename from a.ts`, `rename to b.ts`) plus one added line, giving status `R`, `oldFile` `a.ts`, and `added[0].line` matching the hunk header;
    - a deleted file, giving status `D` and `added` `[]`;
    - `Binary files a/x.png and b/x.png differ`, giving `binary: true`;
    - a path `docs/a b.md`, parsed intact.
  - `route`:
    - `route(['regroup/functions/src/callable/payments.ts'])` gives `linkTypes` containing `callable`, and `classes` containing 1, 2, 3, 4, 9, 12, 13 and 14.
    - `route(['homegroups/firestore.indexes.json'])` includes `firestore-indexes` and class 5.
    - `route(['.claude/pr-review/REVIEW.md'])` includes `review-config`.
  - `matches('regroup/mobile/src/x/y.ts','regroup/mobile/src/**/*.ts')` is true. `matches('regroup/web/a.ts','regroup/mobile/**')` is false.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement the modules and `routing.json`.**
  - Take the routing table from spec §7.3.
  - Take `paths`/`counterparts` from the analysis "if X changes, check Y" tables, as globs, e.g. `callable: paths ["*/functions/src/callable/**","*/functions/src/index.ts"], counterparts ["*/mobile/src/**","*/web/src/**","homegroups/mobile/App.tsx"]`.
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Commit.** `ci: pr-review diff parsing and path routing`

### Task 4: Contract heuristic checks

**Files:**

- Create: `.claude/pr-review/checks/contracts.mjs`
- Test: `.claude/pr-review/checks/test/contracts.test.mjs`

**Interfaces:**

- Consumes: the `parseUnifiedDiff` result shape (Task 3).
- Produces: each check has the signature `(files, repoRoot) => Fact[]`, where `Fact = { check: string, file: string, line?: number, note: string }`.
  - `checkExports`: added or removed lines matching `export const (\w+) = (onCall|onRequest|onSchedule|functions\.)`. For each name, the note lists `git grep -l` hits in `*/mobile/src`, `*/web/src` and `homegroups/mobile/App.tsx`.
  - `checkRegion`: added lines matching `region\s*:` or `setGlobalOptions`.
  - `checkQueriesVsIndexes`: added lines with `.where(` and `.orderBy(` within 5 lines in the same file. It extracts the collection name from the nearest `collection(['"](\w[\w-]*)` and reports whether any `firestore.indexes.json` in the product has an index with that `collectionGroup`.
  - `checkStoragePaths`: added `ref(` or `storage().ref(` string literals. It reports whether the product's `storage.rules` has a `match /<first segment>/` line.
  - `checkCollectionsVsRules`: added `collection('X')` literals with no `match /X/` in the product's `firestore.rules`.
  - `checkTwins`: changed file in `TWIN_PAIRS` (exported constant, the 10 identical or drifted pairs from the analysis) gives a note naming its twin.
- [ ] **Step 1: Write the failing tests** against a temp repo fixture built in `before()` (via `mkdtempSync`, write files, `git init`, commit). Assertions:
  - An added `export const foo = onCall(` with `regroup/mobile/src/a.ts` calling `httpsCallable('foo')` gives a fact whose note contains `regroup/mobile/src/a.ts`.
  - An added `.where('a','==',1).orderBy('b')` on `collection('payments')`, with an indexes file lacking `payments`, gives a fact with note containing `no composite index`.
  - An added `ref('chore-evidence/x')` with rules lacking `match /chore-evidence` gives a fact.
  - Changing `homegroups/functions/src/api/api.ts` gives a fact naming `regroup/functions/src/api/api.ts`.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/contracts.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement the six checks in `contracts.mjs`** (≤ 300 lines; split into `contracts-firestore.mjs` if needed).
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/contracts.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Commit.** `ci: pr-review contract heuristic checks`

### Task 5: Hygiene checks and redaction

**Files:**

- Create: `.claude/pr-review/checks/hygiene.mjs`, `.claude/pr-review/checks/lib/redact.mjs`
- Test: `.claude/pr-review/checks/test/hygiene.test.mjs`

**Interfaces:**

- Produces:
  - `redact.mjs`:
    - `SECRET_PATTERNS: RegExp[]`, covering `whsec_`, `sk_live_`, `sk_test_`, `rk_live_`, `sk-ant-`, `sk-or-v1-`, `AKIA[0-9A-Z]{16}`, `gh[posu]_[A-Za-z0-9]{20,}`, `SG\.[\w-]{20,}\.[\w-]{20,}`, `re_[A-Za-z0-9]{20,}`, `AIza[0-9A-Za-z_-]{35}`, and `-----BEGIN [A-Z ]*PRIVATE KEY-----`.
    - `redact(text): string`, which replaces each match with its first 6 characters plus `…`.
  - `hygiene.mjs` exports `checkSecrets`, `checkPiiLogs`, `checkNewFileSize`, `checkTitleScope(title)`, `checkSelfEdit` and `runVerifyDiff(baseSha, repoRoot, scriptPath)`. All return `Fact[]`, with notes always passed through `redact`.
    - `checkPiiLogs`: added `logger.` or `console.` lines whose same or next 3 lines contain `email|clientEmail|clientName|displayName|phone|sobrietyDate|address|request\.data|req\.body`.
    - `checkNewFileSize`: status `A`, `.ts|.tsx|.js|.jsx|.mjs`, over 300 lines (read from the working tree).
    - `checkTitleScope`: fails when the scope is exactly `mobile|web|functions`.
    - `checkSelfEdit`: any file matching `.github/workflows/claude-code-review.yml` or `.claude/pr-review/**`.
    - `runVerifyDiff`: runs `bash <scriptPath> <baseSha>` with `cwd=repoRoot`. Exit 1 yields its stdout lines as facts; a missing script yields `[]`.
- [ ] **Step 1: Write the failing tests.**
  - `redact('k=' + FAKE_WHSEC)` equals `'k=whsec_…'`, where `FAKE_WHSEC = 'whsec' + '_' + 'A'.repeat(16)` is built at runtime. The repo's pre-commit secret scan blocks literal fixture secrets, so build every secret-shaped fixture this way in all test files.
  - `checkSecrets` on an added line containing `sk_test_` plus 24 characters returns one fact whose note contains no more than 6 characters of the key.
  - `checkPiiLogs` on `logger.info("x", { email })` returns one fact.
  - `checkTitleScope('fix(mobile): x')` returns one fact; `checkTitleScope('fix(regroup-mobile): x')` returns `[]`.
  - `checkSelfEdit` on `.claude/pr-review/REVIEW.md` returns one fact.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/hygiene.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement `redact.mjs` and `hygiene.mjs`.**
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/hygiene.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Commit.** `ci: pr-review hygiene checks and redaction`

### Task 6: Facts orchestrator

**Files:**

- Create: `.claude/pr-review/checks/facts.mjs`
- Test: `.claude/pr-review/checks/test/facts.test.mjs`

**Interfaces:**

- Consumes: `prDiff`, `route` (Task 3); contracts checks (Task 4); hygiene checks (Task 5); `gh.mjs` (Task 1).
- Produces:
  - `buildFacts({files, routeResult, results: {check, facts?, error?}[], prContext}): string`, the `facts.md` text.
  - CLI main:
    - reads env `REPO`, `PR`, `BASE_SHA`, `HEAD_SHA`, `OUT`, `PR_TITLE`, `GH_TOKEN`;
    - fetches PR body and issue comments (excluding the bot summary) into a "PR context" section;
    - runs every check in its own try/catch, so a thrown check gives the fact `pre-check unavailable: <check>`;
    - writes `OUT/facts.md` and, in this stage, `OUT/state.json` with `tier: 'full'` and `maxTurns: 60`;
    - writes `tier` and `max_turns` to `$GITHUB_OUTPUT`;
    - prints nothing else.
- [ ] **Step 1: Write the failing tests.**
  - `facts output is capped`: given 500 facts for one check, the output is ≤ 40,000 bytes and contains `more omitted`.
  - Given `results: [{check:'checkRegion', error: new Error('x')}]`, the output contains `pre-check unavailable: checkRegion`.
  - The output contains headings `## Packages`, `## Link types`, `## Checklist classes`, `## Facts` and `## PR context`.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/facts.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement `facts.mjs`.** Cap each check at 30 facts and the total at 40,000 bytes.
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/facts.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Commit.** `ci: pr-review facts orchestrator`

### Task 7: Knowledge files

**Files:**

- Create in `.claude/pr-review/`: `contract-map-homegroups.md`, `contract-map-regroup.md`, `contract-map-cross-product.md`, `checklist.md`, `conventions.md`, `false-positives.md`
- Test: `.claude/pr-review/checks/test/knowledge.test.mjs`

**Interfaces:**

- Consumes: `routing.json` link-type names (Task 3). Each contract map has one `## <linkType>` section per link type it covers, using the exact names.
- Produces: files read by `REVIEW.md` (Task 8).
- [ ] **Step 1: Write the failing test `knowledge paths exist`.**
  - For every backticked token in the six files matching `^[\w.-]+/[\w./ -]+\.\w+(:\d+(-\d+)?)?$`, strip `:line` and assert `existsSync(join(repoRoot, path))`.
  - Assert every `routing.json` `linkType` appears as a `## <linkType>` heading in exactly one contract map.
- [ ] **Step 2: Run the test and confirm it fails.**
      Run: `node --test ".claude/pr-review/checks/test/knowledge.test.mjs"`
      Expected: FAIL (files missing).
- [ ] **Step 3: Write the six files from the analysis**, re-verifying each path against the worktree.
  - Contract maps: "if X changes, check Y" tables per link type, both directions, with counterpart paths.
  - `checklist.md`: the 14 classes from spec §7.3, each with "look for", trigger paths and 1–2 evidence PR numbers.
  - `conventions.md`: per-package practised conventions per spec §7.2, linking to the package `CLAUDE.md` files.
  - `false-positives.md`: the spec §7.2 list.
  - **Exclude** every item from the analysis "live mismatches" lists and any description of a current exploitable weakness.
- [ ] **Step 4: Run the test and confirm it passes.**
      Run: `node --test ".claude/pr-review/checks/test/knowledge.test.mjs"`
      Expected: PASS. Then grep the six files for each live-mismatch identifier in the analysis (e.g. `guestUserId`, `chore-evidence`, `recoveryconnect://`) and confirm none appear as a reported problem.
- [ ] **Step 5: Commit.** `docs: pr-review knowledge files`

### Task 8: Review procedure, findings rendering and the full workflow

**Files:**

- Create: `.claude/pr-review/REVIEW.md`, `.claude/pr-review/checks/lib/render.mjs`
- Modify: `.claude/pr-review/checks/publish.mjs`
- Modify: `.github/workflows/claude-code-review.yml` (`facts` step runs `facts.mjs`; `review` prompt switches to the real procedure)
- Test: `.claude/pr-review/checks/test/render.test.mjs`, `.claude/pr-review/checks/test/publish.test.mjs`

**Interfaces:**

- Consumes: `state.json`, `findings.json`, `summary.md` contracts; `markers.mjs`, `redact.mjs`, `gh.mjs`.
- Produces:
  - `render.mjs`:
    - `validateFindings(json): {ok: boolean, value?, error?}`, checking the `findings.json` contract.
    - `renderSummary({state, findings, narrative, outcome, ledger}): string`, which:
      - starts with `SUMMARY_MARKER`;
      - opens with an advisory headline (counts per severity, or `No issues found`);
      - renders findings by severity: non-security ones in full (confidence, both-side `file:line`, why, fix, feature), security ones as the exact pointer text from Global Constraints;
      - includes the narrative (redacted, with lines containing any security finding's `locations[].file` removed and the note `(some narrative withheld: security)`);
      - ends with the ledger marker;
      - stays ≤ 60,000 characters by truncating narrative first, then Low, then Medium findings, adding `(truncated)`.
  - `publish.mjs` main:
    - `ACTION_OUTCOME !== 'success'` or invalid findings: post the prior summary with a banner `⚠ review did not complete (<reason>) — will retry on next push`, keeping prior ledger and `lastReviewedSha`.
    - `reason` is `rate-limited` if the file at env `EXECUTION_FILE` matches `/rate.?limit|usage limit/i`, otherwise `failed`.
    - Otherwise renders and upserts.
  - `REVIEW.md`: the spec §7.5 procedure, plus these rules:
    - read `$OUT/facts.md`, `$OUT/state.json` and the knowledge files first;
    - post inline comments only for non-security Critical/High findings whose slug is not in `state.inlineSlugs` or the ledger, at most 10, each ending with the fp marker;
    - write `$OUT/findings.json` and `$OUT/summary.md` per the contracts;
    - flag a `review-config` self-edit as High;
    - never quote secrets;
    - write security details only into `findings.json`.
- [ ] **Step 1: Write the failing tests.**
  - `render.test.mjs`:
    - A security finding with file `regroup/functions/src/callable/payments.ts` renders `Security-relevant issue (High) in regroup/functions payments` and the body does not contain `payments.ts`.
    - A 200-finding input renders ≤ 60,000 characters and contains `(truncated)`.
  - `publish redacts secrets and withholds security paths`: a narrative containing `FAKE_WHSEC` (runtime-built, as in Task 5) and a line naming the security finding's file renders with `whsec_…`, without that file, and with `narrative withheld`.
  - `publish keeps prior state when findings.json is invalid`: with prior ledger L and `lastReviewedSha` `old`, plus truncated findings text, the rendered body contains `review did not complete (failed)`, and `decodeLedger` of it equals L with `lastReviewedSha` still `old`.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement `render.mjs` and the `publish.mjs` main path.** Write `REVIEW.md`.
- [ ] **Step 4: Update the workflow.**
  - The `facts` step runs `node .review-base/.claude/pr-review/checks/facts.mjs`, guarded like publish.
  - The review prompt becomes: `Follow .claude/pr-review/REVIEW.md. OUT=${{ runner.temp }}/pr-review. Base ${{ github.event.pull_request.base.sha }}, head ${{ github.event.pull_request.head.sha }}.`
  - `publish` gets env `EXECUTION_FILE: ${{ steps.review.outputs.execution_file }}`.
- [ ] **Step 5: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: PASS.
- [ ] **Step 6: Commit, push, and open the Stage 2 PR.** Merge when CI is green. Then, on a throwaway PR adding a client `.where().orderBy()` on a collection with no index, confirm the summary lists a High or Medium finding citing both the query and the indexes file. Close the throwaway PR.

## Stage 3 — Incremental runs (one PR)

### Task 9: State loading and tier classification

**Files:**

- Create: `.claude/pr-review/checks/lib/state.mjs`, `.claude/pr-review/checks/lib/tier.mjs`
- Modify: `.claude/pr-review/checks/facts.mjs` (writes the real `state.json`, `tier` and `max_turns`)
- Modify: `.github/workflows/claude-code-review.yml` (the `review` step gains `if: steps.facts.outputs.tier != 'none'`)
- Test: `.claude/pr-review/checks/test/state.test.mjs`, `.claude/pr-review/checks/test/tier.test.mjs`

**Interfaces:**

- Consumes: `markers.mjs`, `gh.mjs`, `route`, `git`.
- Produces:
  - `loadState(repo, pr): Promise<{lastReviewedSha, lastBaseSha, ledger, linkTypesSeen, inlineSlugs}>`, using defaults (null and `[]`) when there is no summary or the marker is undecodable.
  - `classify({lastReviewedSha, reachable, incrementFiles, incrementLinkTypes, linkTypesSeen, prPatchIdUnchanged, prFileCount, baseDriftCounterpartsChanged}): Tier`, with rules in this order:
    1. no `lastReviewedSha` or not reachable gives `full`;
    2. `incrementFiles` empty gives `none`;
    3. `prPatchIdUnchanged` gives `base-drift` if `baseDriftCounterpartsChanged`, else `none`;
    4. all increment files match `\.(md|txt|png|jpg|svg)$` or lockfiles, with no link types, gives `light`;
    5. any increment link type not in `linkTypesSeen`, or `incrementFiles.length >= 0.5 * prFileCount`, gives `incremental-new-links`;
    6. otherwise `incremental`.
  - `MAX_TURNS: Record<Tier, number>` as in Shared data contracts.
  - `facts.mjs` computes:
    - `reachable` via `git merge-base --is-ancestor <last> <head>`;
    - `prPatchIdUnchanged` by comparing `git patch-id --stable` of `git diff <lastBase>...<last>` against `<base>...<head>`;
    - `baseDriftCounterpartsChanged` as any file in `git diff --name-only <lastBase> <base>` matching the PR link types' `counterparts`.

    For incremental tiers, `facts.md` lists only increment files, and states the tier.
- [ ] **Step 1: Write the failing tests.**
  - `loadState tolerates corrupt ledger marker`: a mocked `listIssueComments` returning a summary with a garbage marker gives `lastReviewedSha: null` and `ledger: []`.
  - `tier.test.mjs` has one test per rule, in order. For example:
    - no last SHA gives `full`;
    - `incrementFiles: []` gives `none`;
    - patch-id unchanged with no counterpart change gives `none`, and with one gives `base-drift`;
    - `['README.md']` gives `light`;
    - a new link type gives `incremental-new-links`;
    - a known link type with 1 of 10 files gives `incremental`.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement `state.mjs` and `tier.mjs`, and wire `facts.mjs`.** Inject `listIssueComments` and `listReviewComments` as parameters so the tests can mock them.
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Commit.** `ci: pr-review incremental tiers`

### Task 10: Ledger merge, pruning and the tier-none path

**Files:**

- Create: `.claude/pr-review/checks/lib/ledger.mjs`
- Modify: `.claude/pr-review/checks/publish.mjs`
- Test: `.claude/pr-review/checks/test/ledger.test.mjs`

**Interfaces:**

- Consumes: `LedgerEntry` and `Finding` contracts.
- Produces:
  - `opaqueId(slug): string`, as sha256 hex `.slice(0,16)`.
  - `mergeLedger(prior: LedgerEntry[], findings: Finding[], resolvedSlugs: string[], tier): LedgerEntry[]`:
    - a new slug is added as `open`;
    - a matching `id` keeps its status unless the slug is in `resolvedSlugs` (becomes `resolved` with `runsSinceResolved: 0`);
    - `resolved` entries get `runsSinceResolved += 1`;
    - security entries are stripped to `{id, severity, status, security, runsSinceResolved}`.
  - `visibleEntries(ledger)` excludes `resolved` entries with `runsSinceResolved >= 5`.
  - For tier `none`, publish updates only `lastReviewedSha`, `lastBaseSha` and a line `No new changes since <short sha>` (or `Base updated; no counterpart changes`).
  - `linkTypesSeen` is the union with the run's link types.
- [ ] **Step 1: Write the failing tests.**
  - A security finding produces a ledger entry whose `Object.keys` are exactly `id, severity, status, security, runsSinceResolved`.
  - The same slug on two runs yields one entry.
  - `resolvedSlugs` flips an entry to `resolved`. After 5 more merges it is absent from `visibleEntries` but still present in the ledger.
  - Publish for tier `none` leaves ledger entries unchanged and sets `lastReviewedSha` to the new head.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/ledger.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement `ledger.mjs` and wire it into `publish.mjs`.** `renderSummary` gets a "Resolved since last review" section and marks new findings `(new)`.
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Commit, push, open the Stage 3 PR, and merge when green.** Then run acceptance criterion 7 on a throwaway PR with three pushes: a fix for an open finding, a docs-only change, and a merge from `main`. Then cancel a run mid-review (push twice quickly) and confirm no duplicate inline comment. Record the observed tiers and turn counts in the PR description. Close the throwaway PR.

## Stage 4 — Private security channel (one PR; needs Marcus's PAT)

### Task 11: Advisory delivery

**Files:**

- Create: `.claude/pr-review/checks/advisories.mjs`
- Modify: `.claude/pr-review/checks/publish.mjs` (deliver before rendering, so the pointer reflects delivery)
- Modify: `.github/workflows/claude-code-review.yml` (`publish` env gains `ADVISORY_TOKEN: ${{ secrets.SECURITY_ADVISORY_TOKEN }}`)
- Test: `.claude/pr-review/checks/test/advisories.test.mjs`

**Interfaces:**

- Consumes: `Finding` (security ones), `opaqueId`, `ghRequest`.
- Produces: `deliverAdvisories(repo, pr, securityFindings, token, request=ghRequest): Promise<{delivered: boolean, reason?: string}>`.
  - No token gives `{delivered:false, reason:'no-token'}`.
  - Otherwise it GETs `/repos/{repo}/security-advisories?state=draft&per_page=100`.
  - For each finding it looks for an advisory whose `description` contains `pr-review-id: <id>`:
    - If found, it PATCHes `description` to append `\n\nAlso touched by #<pr>` (once per PR).
    - Otherwise it POSTs with `summary: "[pr-review] <package> <area> (<severity>)"`, `description` (full detail plus `pr-review-id: <id>`), `severity` lower-cased, and `vulnerabilities: [{ package: { ecosystem: "other", name: "recovery-platform/<package>" } }]`.
  - Any error gives `{delivered:false, reason:'api-error'}` and logs only the status code.
  - When `delivered` is false, the pointer ends `details could not be delivered privately; re-run after fixing the advisory token` instead of `details sent privately`.
- [ ] **Step 1: Write the failing tests** using an injected `request` mock:
  - No token gives `no-token` and zero requests.
  - An existing advisory with a matching id gives one PATCH and no POST.
  - A new id gives one POST whose body `severity` is `high`.
  - The mock throwing gives `api-error`, and `console.log` output (captured) contains no finding text.
- [ ] **Step 2: Run the tests and confirm they fail.**
      Run: `node --test ".claude/pr-review/checks/test/advisories.test.mjs"`
      Expected: FAIL.
- [ ] **Step 3: Implement and wire into publish.**
- [ ] **Step 4: Run the tests and confirm they pass.**
      Run: `node --test ".claude/pr-review/checks/test/*.test.mjs"`
      Expected: PASS.
- [ ] **Step 5: Document the PAT.** In the Stage 4 PR description, write the steps for Marcus: a fine-grained PAT scoped to `marcusk639/recovery-platform` with only "Repository security advisories: Read and write", saved as repo secret `SECURITY_ADVISORY_TOKEN`.
- [ ] **Step 6: Commit, push, open the PR, and merge after Marcus adds the secret.** Then prove the path on a throwaway PR with a harmless planted test finding (`// pr-review-test: fake auth bypass` in a new scratch file). Confirm:
  - one draft advisory exists;
  - the public summary shows only the pointer;
  - the ledger marker's entry has only opaque keys;
  - the job log contains no finding text.

  Delete the test advisory and close the PR.

## Stage 5 — Acceptance

### Task 12: Replay set and trial

**Files:**

- Modify: `docs/superpowers/specs/2026-10-22-pr-review-agent-design.md` (append a short "Acceptance results" section)

**Interfaces:**

- Consumes: the full workflow (Tasks 1–11).
- Produces: recorded results for spec §8 criteria 2, 3, 5, 6 and 8.
- [ ] **Step 1: Create the replay branches and PRs** (non-draft), each off `main`, named `pr-review-replay/<n>`:
  1. a homegroups callable gets `region: "us-west1"` with clients unchanged;
  2. a regroup mobile query with no index;
  3. a callable that trusts a client `houseId` for payment routing (planted, clearly labelled);
  4. a payment amount sent in dollars where the counterpart expects cents;
  5. the recovery-api `X-App-Id` header renamed with consumers unchanged;
  6. a fix applied to `homegroups/functions/src/utils/location.ts` only.

  Replays 3 and any other security-class replay must use fake, labelled code.

- [ ] **Step 2: For each replay, confirm the finding is present.** Expected: a finding (or, for security classes, a pointer plus an advisory) citing the correct other side. Record pass or fail per replay.
- [ ] **Step 3: Run a clean, non-trivial recent change** (re-open a copy of a merged PR's diff on `pr-review-replay/clean`). Expected: no Critical/High findings.
- [ ] **Step 4: Confirm skips.** A draft PR and an `e2e-fix/test` branch get no review run.
- [ ] **Step 5: Close all replay PRs, delete the branches, and delete the test advisories.** Append the results table to the spec and commit (`docs: pr-review acceptance results`).
- [ ] **Step 6: Start the two-week 👍/👎 trial** (spec §8 criterion 9). It is owned by Marcus; tuning changes go through new PRs.
