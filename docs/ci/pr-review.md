# How the automated PR review works

**Version 1.2.0** · recovery-platform · 2026-10-27 · Scope: `.claude/pr-review/` and `.github/workflows/claude-code-review.yml`

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for authoritative facts.
Read `[NOTE]` only if additional context is needed.
`[?]` blocks are unverified: treat them with lower confidence.

This file explains the review system for maintainers. It lives under `docs/`, outside `.claude/pr-review/`, so it
is **not** one of the reviewer's knowledge files (§12) and editing it never triggers a review self-edit finding.
The reviewer model follows `REVIEW.md`, not this document.

---

## Contents

1. [What it is](#1-what-it-is)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [The workflow, step by step](#3-the-workflow-step-by-step)
4. [Phase 1: facts (deterministic pre-check)](#4-phase-1-facts-deterministic-pre-check)
5. [Phase 2: the model review](#5-phase-2-the-model-review)
6. [Optional: Serena code navigation](#6-optional-serena-code-navigation)
7. [Phase 3: publish](#7-phase-3-publish)
8. [The findings ledger (state across runs)](#8-the-findings-ledger-state-across-runs)
9. [Security model](#9-security-model)
10. [Failure handling](#10-failure-handling)
11. [Module index (every `.mjs` file)](#11-module-index-every-mjs-file)
12. [Knowledge and config files](#12-knowledge-and-config-files)
13. [Limits and constants](#13-limits-and-constants)
14. [Testing](#14-testing)
15. [Operational pitfalls](#15-operational-pitfalls)
16. [Changelog](#16-changelog)

---

## 1. What it is

**[SPEC]**

- An **advisory** reviewer that runs on every same-repo, non-draft pull request. It is not a required check. It
  never approves and never requests changes.
- Output on the PR:
  - **One summary comment**, updated in place on every run. It carries a hidden ledger of findings.
  - **Inline review comments** for Critical, High and Medium non-security findings, with optional one-click
    suggestions.
  - **Private draft security advisories** for security-relevant findings. The public summary shows only a
    pointer to them.
- The process has three phases: **facts** (deterministic Node script) → **review** (Claude, via
  `anthropics/claude-code-action`) → **publish** (deterministic Node script).
- All scripts are Node 22 ES modules (`.mjs`) with no npm dependencies. They use only `node:` built-ins and
  `fetch`.

**[NOTE]**
The guiding idea is that the model _judges_ and the scripts _act_. The model has no `git`, cannot post an inline comment
and cannot write outside one temp directory. Its only shell is `gh pr view`, `gh pr diff` and one base-controlled reply command,
`node .review-base/.claude/pr-review/checks/reply.mjs`: reading this PR, and at most one checked reply to a maintainer's direct question (§3). Everything else
that touches GitHub, secrets or persistent state happens in code that the PR under review cannot modify. The repository is public, so most of the
machinery exists to keep anything security-relevant out of world-readable text.

---

## 2. Architecture at a glance

**[SPEC]**

```
 pull_request event
        │
        ▼
┌──────────────────┐   .review-base/ (base SHA)    ┌──────────────────────────────┐
│ Phase 1: FACTS   │ ─────────────────────────────▶│ OUT/facts.md   OUT/pr.diff   │
│ checks/facts.mjs │  reads git + GitHub API       │ OUT/state.json OUT/commits.txt│
│ (no secrets but  │                               │ OUT/increment.diff (some tiers)│
│  GH_TOKEN)       │ ─────────────────────────────▶│ STATE_FILE (read-only snapshot)│
└──────────────────┘                               └──────────────────────────────┘
        │ tier, max_turns (step outputs)
        ▼
┌──────────────────┐  reads PR-head working tree + OUT; follows REVIEW.md
│ Phase 2: REVIEW  │  writes ONLY OUT/inline.json, OUT/summary.md, OUT/findings.json
│ Claude (opus)    │  optional: 4 read-only Serena tools (sandboxed user, no network)
└──────────────────┘
        │
        ▼
┌──────────────────┐   .review-publish/ (fresh base checkout, after the model)
│ Phase 3: PUBLISH │   reads OUT outputs + STATE_FILE (never OUT/state.json)
│ checks/publish.mjs│  holds PR_REVIEW_ID_KEY + SECURITY_ADVISORY_TOKEN
└──────────────────┘
        │
        ├──▶ inline review comments (github-actions[bot])
        ├──▶ draft security advisories (advisory PAT)
        └──▶ summary comment + hidden ledger marker (github-actions[bot])
```

**[SPEC]**
Trust boundaries:

| Location                                                  | Contents                                                                           | Who can influence it                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| Workspace root                                            | PR-head checkout. `.claude/pr-review/` is replaced by the base copy                | The PR author (except `.claude/pr-review/`) |
| `.review-base/`                                           | Base-SHA checkout. facts runs from here                                            | Nobody in the PR                            |
| `.review-publish/`                                        | Fresh base-SHA checkout, made **after** the model finishes. publish runs from here | Nobody in the PR or the model               |
| `$RUNNER_TEMP/pr-review` (`OUT`)                          | Material for the model, and the model's three output files                         | facts, then the model                       |
| `$RUNNER_TEMP/prstate-snapshot/state.json` (`STATE_FILE`) | Trusted copy of the state, chmod 444, outside the model's `--add-dir`              | facts only                                  |

---

## 3. The workflow, step by step

**[SPEC]**
File: `.github/workflows/claude-code-review.yml`. Trigger: `pull_request` (`opened`, `synchronize`,
`ready_for_review`, `reopened`). Concurrency group `pr-review-<PR>`, so a newer push cancels an older run.

Job runs only when **all** hold: the PR is not a draft, the head branch is not `e2e-fix/*`, the actor is not
`dependabot[bot]`, and the head repo is this repo (no forks).

| #   | Step                        | What it does                                                                                                                                  |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Run start                   | Exports `RUN_STARTED_AT`, `OUT`, `STATE_FILE` via `GITHUB_ENV`                                                                                |
| 2   | Checkout PR head            | Full history, `persist-credentials: false`                                                                                                    |
| 3   | Clear base checkout path    | `rm -rf .review-base` (a PR could ship one)                                                                                                   |
| 4   | Checkout base               | Base SHA into `.review-base/`                                                                                                                 |
| 5   | setup-node                  | Node 22                                                                                                                                       |
| 6   | **Facts**                   | `node .review-base/.claude/pr-review/checks/facts.mjs`. Emits `tier` and `max_turns`. If the base has no scripts: `tier=none`, review skipped |
| 7   | Restore reviewer knowledge  | Replaces workspace `.claude/pr-review/` with the base copy. Deletes `.claude-pr`                                                              |
| 8–9 | Set up uv / Serena setup    | Only when `vars.PR_REVIEW_SERENA == 'on'`. `continue-on-error`. See §6                                                                        |
| 10  | **Review**                  | `anthropics/claude-code-action@v1`, `--model opus`, `--max-turns <max_turns>`, hooks disabled. `continue-on-error`                            |
| 11  | Stop Serena                 | Kills every `serena-runner` process. Fails (and so blocks Publish) if any survive                                                             |
| 12  | Clear publish checkout path | `rm -rf .review-publish`                                                                                                                      |
| 13  | Checkout base (publish)     | Fresh base SHA into `.review-publish/`                                                                                                        |
| 14  | **Publish**                 | `node --no-warnings .review-publish/.claude/pr-review/checks/publish.mjs`. Runs `always()` unless Stop Serena failed                          |
| 15  | Cleanup                     | Removes `OUT` and the snapshot                                                                                                                |

**[SPEC]**
Model permissions (`claude_args`):

- Allowed: `Read`, `Grep`, `Glob`. `Write`/`Edit` only under `OUT`. `Bash(gh pr diff:*)`,
  `Bash(gh pr view:*)` and the exact command `Bash(node .review-base/.claude/pr-review/checks/reply.mjs)`. Plus the four Serena tools when Serena
  started.
- Denied: `MultiEdit`; `Write`/`Edit` anywhere in the workspace; reads of `/proc/**` and the workspace `.git/**`;
  writes to the runner command files and to the state snapshot.
- `--strict-mcp-config`: no MCP servers other than the Serena config the workflow passes.

**[NOTE]**
The `gh pr` reads and the reply command are an owner decision (2026-10-27). `REVIEW.md` ("Direct PR comments")
allows `gh pr view`/`gh pr diff` only for this PR when `OUT` lacks something. To answer a maintainer's direct
question, the model writes `<OUT>/reply.md` (after `findings.json`) and runs the reply command
(`checks/reply.mjs`, from the base SHA, no arguments). The command enforces the limits in code:
- the repo and PR come from `GITHUB_EVENT_PATH`;
- the body comes only from `<OUT>/reply.md`, which must be a regular file of at most 4,000 bytes;
- the reply must start with `pr-review:`;
- it refuses HTML comments and control characters, any text `redact()` would change, and any mention of a
  security finding's slug or files;
- while the snapshot's ledger (`STATE_FILE`) holds any security entry, or the snapshot or prior state can't be
  read, it refuses any reply naming a file (a path, or a basename with a code/config extension). Earlier
  security files are stored only as keyed `fileIds` and the key is publish-only, so this is the strictest
  check the reply step can make;
- `findings.json` must already exist;
- an exclusive lock allows one post per run.

The command gets its token from the action: `claude-code-action@v1` sets `GH_TOKEN`/`GITHUB_TOKEN` to its
GitHub token (`src/entrypoints/run.ts`) and passes its whole environment to Claude
(`base-action/src/parse-sdk-options.ts`), so `reply.mjs` and `gh pr view/diff` inherit it, as does `STATE_FILE`
(exported through `GITHUB_ENV`). The model can't read `.git/**` or `/proc/**`, so it can't put the action's
token into the reply. This replaced
`Bash(gh pr comment:*)`, whose prefix also admitted `--body-file` (spec
`2026-10-26-pr-review-serena-and-suggestions.md` §4.5). A reply is still posted with the action's token, not by
publish, so it stays outside the ledger, and the inline guard (`github-actions[bot]` review comments only) doesn't
see it.
`NotebookEdit`, `WebFetch`, `WebSearch` and the inline-comment MCP tool are no longer denied explicitly. They stay
unavailable because `--allowedTools` leaves them out.

**[SPEC]**
Secrets and where they live:

| Secret / variable           | Used by        | Purpose                                                                                 |
| --------------------------- | -------------- | --------------------------------------------------------------------------------------- |
| `github.token` (`GH_TOKEN`) | facts, publish | Read the PR and comments. Post the summary and inline comments as `github-actions[bot]` |
| `CLAUDE_CODE_OAUTH_TOKEN`   | Review step    | Model access                                                                            |
| `PR_REVIEW_ID_KEY`          | publish only   | HMAC key for opaque ledger ids (§8)                                                     |
| `SECURITY_ADVISORY_TOKEN`   | publish only   | Fine-grained PAT, "Repository security advisories: read and write"                      |
| `vars.PR_REVIEW_SERENA`     | workflow       | `on` enables Serena                                                                     |

---

## 4. Phase 1: facts (deterministic pre-check)

**[SPEC]**
Entry point: `checks/facts.mjs` → `main()`. Always exits 0. Pipeline:

1. **Paths.** `runPaths()` needs `OUT` and `STATE_FILE`. If either is missing it emits `tier=none`, writes
   nothing and stops (fail closed).
2. **Prior state.** `loadState()` reads the PR's issue comments, finds the bot's summary comment (body starts
   with `<!-- pr-review:summary -->`) and decodes its ledger marker. It also reads review comments to collect
   `inlineSlugs` (fp markers on bot comments) and `acknowledgedSlugs` (bot comments a maintainer replied to).
3. **PR diff.** `readPrDiff(base, head)` runs `git diff base...head` once. It yields the parsed files and the
   RIGHT-side hunk ranges per file. `changedFiles` is capped at 3,000 paths.
4. **Increment.** `computeIncrement()` compares the head to the last reviewed SHA (§4.1).
5. **Tier.** `classify()` picks the tier (§4.1). The checks run over the whole PR on `full` and over the
   increment otherwise.
6. **Checks.** Twelve checks run, each isolated in try/catch (§4.2). A thrown check becomes
   `pre-check unavailable: <name>`.
7. **PR context.** The PR title, plus the description and issue comments **only** from authors with
   association `OWNER`, `MEMBER` or `COLLABORATOR`. Everything is redacted and capped. The bot's own summary is
   excluded.
8. **Material.** `writeMaterial()` writes `OUT/pr.diff`, `OUT/commits.txt` and (increment tiers only)
   `OUT/increment.diff`.
9. **Routing.** `route(paths)` maps the files to packages, link types and checklist classes using
   `routing.json`. Classes 13 and 14 are always included.
10. **Outputs.** It writes `OUT/facts.md` and `OUT/state.json`, then a copy of the state to `STATE_FILE` (made
    read-only), and emits `tier`/`max_turns` to `GITHUB_OUTPUT`.

On any unexpected error facts still writes a `full`-tier state with a `facts` unavailable marker and attempts the
material, so the model runs and the review is labelled **partial**.

### 4.1 Tiers

**[SPEC]**
`lib/tier.mjs` → `classify()`, evaluated in this order:

| Condition                                                                                            | Tier                    | Max turns | Model reviews                                        |
| ---------------------------------------------------------------------------------------------------- | ----------------------- | --------- | ---------------------------------------------------- |
| No prior reviewed SHA, or it is not an ancestor of head (rebase/force-push)                          | `full`                  | 60        | `OUT/pr.diff`, whole procedure                       |
| The PR's increment is empty and the base did not drift into counterparts                             | `none`                  | 0         | Nothing: the model step is skipped                   |
| PR diff unchanged (exact-diff hash) and drifted base files match counterparts of the PR's link types | `base-drift`            | 15        | The PR's link types against the drifted counterparts |
| PR diff unchanged, no relevant drift                                                                 | `none`                  | 0         | Nothing                                              |
| The increment has no routed link types and every file is `.md/.txt/.png/.jpg/.svg` or a lockfile     | `light`                 | 15        | Secrets, PII, PR-text accuracy only                  |
| The increment touches a link type not in `linkTypesSeen`, or ≥ 50% of the PR's files                 | `incremental-new-links` | 60        | Increment plus counterparts of the new link types    |
| Otherwise                                                                                            | `incremental`           | 40        | `OUT/increment.diff` plus counterparts               |

**[NOTE]**
`computeIncrement()` filters `last..head` down to files that belong to this PR (the union of `base...head` and
the previously reviewed `lastBase...last`). A merge from base therefore does not drag other PRs' files into
the increment. The "unchanged" test hashes the exact diff text rather than `git patch-id`, because patch-id
ignores whitespace and would hide a re-indent. Any git failure falls back to the safe side: an unreachable last
SHA means `full`, and an unknown drift is treated as changed.

### 4.2 The pre-checks

**[SPEC]**
Every check returns facts `{check, file, line?, note}`. Facts are **hints for the model**, never verdicts.

| Check                     | Module                    | Flags                                                                                                                                                                                      |
| ------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkExports`            | `contracts.mjs`           | An added/removed `export const X = onCall/onRequest/onSchedule/functions.` and which `*/mobile/src`, `*/web/src` or `homegroups/mobile/App.tsx` files reference `X` (via `git grep -w -F`) |
| `checkRegion`             | `contracts.mjs`           | Added lines with `region:` or `setGlobalOptions`                                                                                                                                           |
| `checkQueriesVsIndexes`   | `contracts-firestore.mjs` | Added `.where(` within 5 lines of an added `.orderBy(` and whether the collection has a composite index in that product's `firestore.indexes.json`                                         |
| `checkStoragePaths`       | `contracts-firestore.mjs` | A storage `ref('<seg>/…')` whose first segment has no `match /<seg>/` in `storage.rules`                                                                                                   |
| `checkCollectionsVsRules` | `contracts-firestore.mjs` | A `collection('<name>')` with no `match /<name>/` in `firestore.rules`                                                                                                                     |
| `checkTwins`              | `contracts.mjs`           | A change to one of the homegroups/regroup duplicate helper/entity pairs (`TWIN_PAIRS`)                                                                                                     |
| `checkSecrets`            | `hygiene.mjs`             | Added lines matching `SECRET_PATTERNS` (the value is never echoed)                                                                                                                         |
| `checkPiiLogs`            | `hygiene.mjs`             | A `logger.`/`console.` call with a PII-named field within 3 lines                                                                                                                          |
| `checkNewFileSize`        | `hygiene.mjs`             | A new code file over 300 lines                                                                                                                                                             |
| `checkTitleScope`         | `hygiene.mjs`             | A PR title scope that is bare `mobile`, `web` or `functions`                                                                                                                               |
| `checkSelfEdit`           | `hygiene.mjs`             | Edits to the review workflow or to `.claude/pr-review/**`                                                                                                                                  |
| `runVerifyDiff`           | `hygiene.mjs`             | Runs `.claude/agent-gates/verify-diff.sh` from the merge-base (test tamper)                                                                                                                |

Firestore checks cover homegroups (`homegroups/…`) and regroup (`regroup/mobile/firebase/…`). They skip tests,
deletions and binaries.

### 4.3 What facts hands the model

**[SPEC]**

| File                 | Contents                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OUT/facts.md`       | Tier note, packages, link types, checklist classes, facts, PR context. ≤ 40,000 bytes                                                                                                                               |
| `OUT/state.json`     | Prior ledger, `linkTypesSeen`, `inlineSlugs`, `acknowledgedSlugs`, `tier`, `maxTurns`, `changedFiles`, `hunkRanges`, SHAs, `prDiffAvailable`/`prDiffTruncated`, `unavailableChecks`, `runLinkTypes`, `runStartedAt` |
| `OUT/pr.diff`        | `git diff base...head`, capped at 1.5 MiB with a truncation note                                                                                                                                                    |
| `OUT/increment.diff` | Increment tiers only: the PR's changes since the last reviewed commit                                                                                                                                               |
| `OUT/commits.txt`    | `<short sha> <subject>` per commit, capped at 200 KiB                                                                                                                                                               |

---

## 5. Phase 2: the model review

**[SPEC]**

- Prompt: "Follow `.claude/pr-review/REVIEW.md`", plus `OUT`, base and head SHAs, and an optional Serena line.
- `REVIEW.md` is the authoritative procedure: per-tier scope, the 9-step pass order (context, facts and diff,
  cross-package, feature impact, repo-specific, general, verification, pre-existing, write), the security
  rules and the output contracts.
- The model reads the knowledge files (§12) from the **base** copy. It sees a PR's edits to them only in
  `OUT/pr.diff`.
- Required writes, in order:

| File                | Contract                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `OUT/inline.json`   | JSON array of `{slug, path, line, side, body, start_line?, suggestion?}`. `[]` when none                   |
| `OUT/summary.md`    | Narrative sections only (features, cross-package table, checked and fine, limits, nearby, map maintenance) |
| `OUT/findings.json` | `{reviewedSha, findings[], resolvedSlugs[], complete: true}`. **Last write**                               |

- Finding fields: `slug` (`c<class>:<file>:<anchor>`), `class` 1–14, `severity`
  (Critical/High/Medium/Low), `confidence`, `security`, `package`, `area`, `title`, `feature`,
  `locations[{file, line, side}]`, `why`, `fix`.

**[NOTE]**
`complete: true` written last is how publish tells a finished review from one cut off by the turn limit. A run
without it, or without `summary.md`, is published as "review did not complete", never as a clean review.

---

## 6. Optional: Serena code navigation

**[SPEC]**

- Enabled by the repo variable `PR_REVIEW_SERENA=on`. Both Serena steps are `continue-on-error`. On any failure
  the review runs without Serena and the model is told to report "code navigation unavailable".
- Versions are pinned: `serena-agent==1.7.0` (Python 3.13 via uv `0.13.6`, `astral-sh/setup-uv` pinned to a
  commit). TypeScript 5.9.3 and typescript-language-server 5.1.3 are pinned in `serena/serena_config.yml`.
- Tools exposed to the model: `find_symbol`, `find_referencing_symbols`, `get_symbols_overview`,
  `search_for_pattern`. The server starts with `--mode editing` (owner decision). `project.yml` sets
  `read_only: true` and `fixed_tools` to the same four, so the mode adds no tools. Mode prompts would arrive only
  through `initial_instructions`, which the review does not allow.
- Config comes from the base copy at `.claude/pr-review/serena/`. Exactly one prompt template must override
  `connection_prompt`, or the setup aborts.

**[SPEC]**
Isolation of the `serena-runner` user (it reads PR-controlled files):

1. Dedicated user with a nologin shell. Its home is `chmod 700`. Every command runs as
   `sudo -u serena-runner env -i -C $SR_HOME` with only `HOME`, `PATH`, `SERENA_HOME` and
   `SERENA_USAGE_REPORTING=false`.
2. Language servers are downloaded **before** the PR code is present, by indexing a throwaway warm-up project.
3. The source it sees is a root-owned, read-only **copy** of the tracked files (`git ls-files`). The copy leaves
   out `.serena/`, `node_modules/`, `public/`, `lib/`, `dist/`, `build/`, `.next/`, `coverage/`, `_legacy/`,
   `.claude/pr-review/` and `.review-*`. The base `.claude/pr-review/` is then copied in. It never sees `.git/`.
4. `chmod 700` is applied to the workspace `.git/` and to `RUNNER_TEMP`. `iptables`/`ip6tables` reject **all**
   outbound traffic from the uid, loopback included (so DNS cannot be used either).
5. Probes must all fail for setup to continue: network access, DNS, reading `.git/config` (absolute and
   relative), listing `RUNNER_TEMP` (absolute and relative), writing the source copy, and any extra environment
   variable.
6. The PR code is indexed offline. The MCP config is written to `$RUNNER_TEMP/serena-mcp.json`.
7. After the review, **Stop Serena** kills every `serena-runner` process (up to 5 rounds) and deletes its files in
   `/tmp`, `/var/tmp` and `/dev/shm`. If any process survives, Publish is skipped.

---

## 7. Phase 3: publish

**[SPEC]**
Entry point: `checks/publish.mjs` → `main()` → `publish()` → `publishRun()`. It runs from `.review-publish/`
(code the model could not touch). It reads the model's files from `OUT` and the state **only** from
`STATE_FILE`. Always exits 0. It writes one status line to `$GITHUB_STEP_SUMMARY`.

Order of operations in `publishRun()`:

| #   | Stage            | Module                           | Behaviour                                                                                                                                                                                                |
| --- | ---------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stale-run check  | `summary-post.mjs` `currentHead` | PR head ≠ `HEAD_SHA` → **nothing posted** ("superseded"). If the head cannot be read, it continues with a warning                                                                                        |
| 2   | Trusted state    | `prior.mjs`                      | No valid snapshot → prior state is taken from the existing summary comment. If that is unreadable and has no carry-over marker → skip                                                                    |
| 3   | Prior resolution | `prior.mjs` `resolvePrior`       | Snapshot flagged `priorUnavailable` → re-read the comment. An undecodable marker is re-emitted verbatim. No marker known, or a marker > 30,000 chars → deliver advisories, post the minimal banner, stop |
| 4   | Inline comments  | `inline-stage.mjs`               | Select and post survivors of `inline.json` as one review, then run the post-hoc guard (§9.4)                                                                                                             |
| 5   | Advisories       | `deliver.mjs` → `advisories.mjs` | Create/update draft advisories. Collect `resolvedIds` for dispositioned ones                                                                                                                             |
| 6   | Compose          | `publish.mjs` `composeBody`      | Decide the outcome, merge the ledger, render the body (§7.1)                                                                                                                                             |
| 7   | Post             | `summary-post.mjs` `postSummary` | Upsert the summary comment. On failure, retry once with a minimal banner that keeps the previous marker                                                                                                  |

### 7.1 Outcome decision (`composeBody`)

**[SPEC]**

| Situation                                        | Rendered as                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot missing or not an object                | Failure banner. Ledger from the comment fallback                                                                                                    |
| `tier: none` and the action outcome is `skipped` | "No new changes since `<sha>`" (or "Base updated…"). Only the SHAs move                                                                             |
| Not completed (`completion()` fails)             | `⚠ review did not complete (<reason>) — will retry on next push`. Reason: `incomplete`, `rate-limited` or `failed`. Prior open findings stay listed |
| Completed                                        | Full summary: headline, tier line, findings by severity, still-open and resolved sections, narrative                                                |

**[SPEC]**
`completion()` = the action outcome is `success` **and** the tier is not `none` **and** `findings.json`
validates **and** `complete === true` **and** `summary.md` exists.
`isPartial()` = `pr.diff` unavailable **or** truncated **or** facts itself failed. A partial review never says
"No issues found".

**[SPEC]**
Summary comment layout:

```
<!-- pr-review:summary -->
## PR review (advisory)
Reviewed `abc1234` (incremental): 2 reported this run (1 High, 1 Medium); 1 still open from earlier reviews (1 Low).
Tier: `incremental`; unavailable pre-checks: none.
_Advisory only: not a required check. Security-relevant findings show only a pointer here._
> fixed notices (inline drops, frozen ledger, …)
### Critical / ### High / ### Medium / ### Low   (this run's findings)
### Still open from earlier reviews
### Resolved since last review
<model narrative from summary.md, security lines withheld>

<!-- pr-review:ledger v1 <base64 JSON> -->
```

- Body cap: 60,000 chars. Trim order when over: narrative → earlier-review sections (last first) → Low findings
  → Medium findings → hard cut. The summary marker always stays the first line.
- Findings new since the last review are tagged `(new)`. Findings that got an inline comment are tagged
  `(inline comment posted)`, based on what publish actually posted.

---

## 8. The findings ledger (state across runs)

**[SPEC]**

- Stored as `<!-- pr-review:ledger v1 <base64 JSON> -->` at the end of the summary comment. Payload:
  `{lastReviewedSha, lastBaseSha, linkTypesSeen, ledger[]}`.
- The marker is public and editable, so every read is sanitized (`sanitizeLedger`). Malformed entries are
  dropped and ids deduplicated.
- Read by facts (`loadState`) into `state.json`. Rewritten by publish on every run.

**[SPEC]**
Entry shapes (`lib/ledger.mjs`):

| Kind     | Fields                                                                   | Id                                  | Created when                                                             |
| -------- | ------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------ |
| Public   | `id, slug, title, severity, status, security:false, runsSinceResolved`   | `sha256(slug)[:16]`, unkeyed        | A non-security finding that names no security file                       |
| Security | `id, severity, status, security:true, runsSinceResolved, fileIds[≤10]`   | `HMAC(PR_REVIEW_ID_KEY, slug)[:16]` | `security: true` (or a forced class). **Only with the key**              |
| Withheld | `id, severity, status, security:false, withheld:true, runsSinceResolved` | Keyed HMAC                          | A non-security finding that names a security file. **Only with the key** |

Statuses: `open`, `resolved`, `superseded`. A resolved entry is shown for 5 runs, counting the one that
resolved it (`runsSinceResolved < VISIBLE_RUNS`). It stays in the marker after that until trimmed.

**[SPEC]**
How an entry gets resolved:

| Kind     | Resolved by                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public   | Its slug is in the model's `resolvedSlugs`, **or** a maintainer (OWNER/MEMBER/COLLABORATOR) replied to its inline comment (`acknowledgedSlugs`) and it was not re-reported this run |
| Security | Its draft advisory was `published`, `closed` or `withdrawn`, no draft with the same id remains, and it was not re-reported                                                          |
| Withheld | Never automatically. Stays listed as open, without detail                                                                                                                           |

A finding re-reported in a run is always `open`, even if its slug is also in `resolvedSlugs`.

**[SPEC]**
`mergeLedger()` rules:

- Tier `none` → the prior ledger is returned unchanged.
- Findings are grouped by slug. A security finding in a group makes the entry security (the most severe one
  wins).
- A prior **public** entry stays public even when re-reported on a security file. Rewriting it as withheld
  would point at the file through the comment's edit history.
- Without the key: security and withheld entries are carried **frozen** (not even aged), no new ones are
  created, and the summary shows `> ledger frozen for security entries: id key unavailable`.

**[SPEC]**
Marker size cap: 30,000 chars. `fitMarker()` trims in this order: closed entries (oldest resolved first) →
non-security titles → lowest-priority entries (resolved, then by severity).

**[NOTE]**
Why keyed ids: slugs are built from file paths and symbol names that anyone can read in the public diff. A plain
hash of a security slug could be brute-forced back to its file and symbol. HMAC with a key that only the publish
step holds closes that. Public entries already show their slug, so their id stays unkeyed. They are matched by
slug, which keeps them stable across a key rotation.

---

## 9. Security model

### 9.1 What counts as security-relevant

**[SPEC]**

- The model sets `security: true` for classes 1, 4, 7, 11 and 14, and for anything involving auth, rules,
  secrets or payment routing.
- **Forced in code:** `isForcedSecurity()` treats a finding as security when its `class`, **or** its slug's
  `c<n>:` prefix, is 1, 4, 7, 11 or 14, whatever the model wrote.
- A security finding's public form is fixed:
  `Security-relevant issue (<sev>) in <package> <area>; details sent privately`. `package` must match
  `name[/name]`. `area` must be at most two lower-case words, otherwise it becomes `general`.

### 9.2 Withholding by "needles"

**[SPEC]**

- **Needles** are the canonical paths of every current security finding's locations, plus any path seen this run
  that hashes to a prior security entry's `fileIds` (`runNeedles`). Prior security files therefore stay
  withheld in later runs without their paths ever being public.
- Where withholding applies:
  - A non-security finding that names a needle (in its locations, slug, title, why, fix or feature) renders as
    `(withheld: touches a security-relevant file)`.
  - Any narrative line naming a needle is dropped, with a `(some narrative withheld: security)` note.
  - Such findings get no inline comment and no suggestion.
- Matching (`lib/needles.mjs`) first undoes disguises: zero-width characters, HTML entities and percent-escapes
  for `.`, `/` and `\` (up to 3 decoding rounds), case, and `\` vs `/`. It then resolves `./`, `..`, `//`,
  absolute and `~/` prefixes and `:line` suffixes. A bare basename matches. A different file sharing the
  basename (`other/index.ts`, `index.tsx`, `index.ts.bak`) does not.

### 9.3 Redaction

**[SPEC]**
`lib/redact.mjs` `redact()` keeps the first 6 chars of a match plus `…`. It is applied to the PR context, facts,
every rendered field, inline bodies, ledger titles/slugs and advisory bodies. Pattern families: Stripe (`whsec_`,
`sk_live_`, `sk_test_`, `rk_live_`), Anthropic (`sk-ant-`), OpenRouter (`sk-or-v1-`), AWS (`AKIA…`), GitHub
(`gh[posur]_`, `github_pat_`), SendGrid (`SG.…`), Resend (`re_…`), Google (`AIza…`) and PEM private keys.
Model text also loses HTML-comment syntax (`<!--` → `&lt;!--`), so it cannot plant a fake marker.

### 9.4 Inline comment guardrails

**[SPEC]**
Pre-filter (`selectInline`), applied per `inline.json` entry, with Critical/High considered before Medium:

| Drop reason           | Rule                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| invalid               | Fails the shape check, or beyond the first 100 entries                                       |
| not-a-finding         | Slug is not in `findings.json`                                                               |
| ineligible            | Security, Low, or touches a security file                                                    |
| already-posted        | A bot comment with this fp marker already exists                                             |
| outside-changed-files | `path` is not in the trusted `changedFiles`                                                  |
| own-fence             | `body` contains a ` ```suggestion ` fence                                                    |
| unsafe                | `unsafeInline()` on the exact body to be posted (security slug/class, secret, security path) |
| over-cap              | More than 15 comments                                                                        |

- Survivors get the `<!-- pr-review:fp=<slug> -->` marker and are posted as **one** `COMMENT` review on the head.
  On a 422 (a line outside the diff), the batch is retried one comment per review. Other errors are not retried,
  to avoid duplicates.
- Critical/High comments lost to malformed entries, wrong paths, own fences or the cap are announced in the
  summary. Medium drops and security drops are not.
- **Post-hoc guard** (`guardInlineComments`): after posting, every `github-actions[bot]` top-level review
  comment from _this run_ (created at or after `RUN_STARTED_AT` **and** `original_commit_id` = head) that
  `unsafeInline()` rejects is deleted. It never touches `claude[bot]` comments or replies.

**[SPEC]**
Suggestion rules (`lib/suggestion.mjs`). A suggestion is dropped (the comment still posts) when any holds:

- Its path is blocked: `*.rules`, `firestore.indexes.json`, `.github/**`, `.claude/**`, `package.json`,
  lockfiles, any path `routing.json` maps to classes 1–7, or a prior security file.
- It is not `RIGHT` side, the range is > 40 lines, or it is not inside one trusted hunk.
- It is > 40 lines or > 4,000 chars, or it contains ` ``` `, a control character other than tab/newline, or an
  HTML comment.
- Redaction would change it, the guard rejects the fenced body, or the body would exceed 4,000 chars.

### 9.5 Private advisories

**[SPEC]**
`checks/advisories.mjs` `deliverAdvisories()`:

- Needs `SECURITY_ADVISORY_TOKEN` and `PR_REVIEW_ID_KEY`. Without either nothing is delivered, and the public
  pointer says so.
- Lists all repo advisories in states `draft`, `published` and `closed` (≤ 10 pages each, deduplicated by
  `ghsa_id`, following only same-repo `next` links).
- Identifies its own advisories by a code-written footer: `Pull request: #N` then `pr-review-id: <id>`,
  optionally followed by `Also touched by #M` lines. Model text is scrubbed of lines that could pose as footer.
- Per security finding (deduplicated by id across the repo):
  - No advisory yet → POST a new draft (`[pr-review] <package> <area> (<severity>)`, ecosystem `other`).
  - A dispositioned one → POST a new draft noting `Reopened: previously <state> advisory GHSA-…`.
  - A draft from another PR → PATCH to append `Also touched by #N`.
- Returns `resolvedIds` for prior open security ids whose advisory is now dispositioned.

### 9.6 Prompt-injection hardening

**[SPEC]**

- Only maintainers' text (OWNER/MEMBER/COLLABORATOR) enters `facts.md`. Other authors' PR descriptions are
  withheld and their comments dropped.
- The model's rules (`REVIEW.md` and the knowledge files) and every script come from the base SHA.
- The model's one posting path is the base-controlled reply command, which enforces its limits in code (see the
  note in §3).
- publish ignores the model's `reviewedSha` and `inlinePosted`, and `OUT/state.json`. It uses the workflow env and
  the read-only snapshot.
- The Publish step sets `NODE_OPTIONS=""` and `BASH_ENV=""`, so nothing exported earlier through `GITHUB_ENV` can
  preload code into the secret-bearing process.
- Logs carry status codes and counts only: never bodies, paths, slugs or tokens.

---

## 10. Failure handling

**[SPEC]**
Design rule: **fail closed, never erase history.** The summary never claims a clean review it did not do, and a
ledger publish could not read is never replaced with an empty one.

| Failure                                                           | Result                                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `OUT`/`STATE_FILE` unset in facts                                 | `tier=none`, no model run                                                                       |
| Base branch has no pr-review scripts                              | Review skipped. Publish prints "scripts not on base yet"                                        |
| A pre-check throws                                                | `pre-check unavailable: <name>` in facts. Listed under "unavailable pre-checks"                 |
| facts itself crashes                                              | `full` tier, review labelled **partial**                                                        |
| `pr.diff` missing or > 1.5 MiB                                    | Review labelled **partial**                                                                     |
| Model hits its turn limit / no `complete: true` / no `summary.md` | "review did not complete (incomplete)". Prior open findings kept                                |
| Rate limit in the last 4,000 chars of the execution log           | "review did not complete (rate-limited)"                                                        |
| PR head moved during the run                                      | Nothing posted ("superseded")                                                                   |
| Snapshot missing                                                  | Failure banner, ledger carried from the existing comment                                        |
| Comments unreadable and no snapshot                               | Nothing posted. The old comment stays                                                           |
| Prior marker undecodable                                          | Old marker re-emitted verbatim, notice `prior review state unavailable…`                        |
| Old marker > 30,000 chars                                         | Minimal banner only. Advisories still delivered                                                 |
| Summary upsert fails                                              | Retried once with a minimal banner that keeps the previous marker                               |
| Advisory API fails / token missing                                | Pointer says `details could not be delivered privately; re-run after fixing the advisory token` |
| Id key missing                                                    | Ledger frozen for security entries. Pointer says `id key unavailable`                           |
| A serena-runner process survives                                  | Publish skipped for that run                                                                    |

---

## 11. Module index (every `.mjs` file)

### 11.1 Entry points and top-level checks (`checks/`)

**[SPEC]**

| File                      | Purpose                                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `facts.mjs`               | Phase 1 entry point. Loads prior state, diffs the PR, picks the tier, runs the pre-checks, gathers trusted PR context, writes `OUT/*` and the read-only state snapshot |
| `publish.mjs`             | Phase 3 entry point. Stale-run check, prior-state resolution, inline stage, advisory delivery, ledger merge (`composeBody`) and summary upsert. Always exits 0         |
| `contracts.mjs`           | Cross-package pre-checks: callable exports vs client references, region changes, homegroups/regroup twin files. Re-exports the Firestore checks                        |
| `contracts-firestore.mjs` | Firestore/Storage pre-checks: where+orderBy vs composite indexes, collections vs `firestore.rules`, storage paths vs `storage.rules`                                   |
| `hygiene.mjs`             | Hygiene pre-checks: added secrets, PII near log calls, new files over 300 lines, bare title scope, reviewer self-edits, `verify-diff.sh` test-tamper                   |
| `advisories.mjs`          | Creates, updates and reopens private draft security advisories. Reports dispositioned ones back as resolved ids                                                        |
| `reply.mjs`               | The model's one reply command (no arguments). Reads `GH_TOKEN`/`GITHUB_TOKEN` and runs `runReply()` from `lib/reply.mjs`; prints `reply posted/refused: <reason>`. Always exits 0 |

### 11.2 Library (`checks/lib/`), grouped by concern

**[SPEC]**
_Git, diffs and routing_

| File            | Purpose                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `diff.mjs`      | `git()` wrapper (argument arrays, no shell), unified-diff parser (renames, deletes, binaries, spaces in paths) and diff-text filtering |
| `hunks.mjs`     | RIGHT-side hunk ranges per file (for suggestion placement), their sanitizer, and facts' single PR-diff read                            |
| `increment.mjs` | Computes the PR's changes since the last reviewed SHA, the exact-diff "unchanged" test, and base drift into counterparts               |
| `tier.mjs`      | `MAX_TURNS` per tier and `classify()`, which picks the review tier                                                                     |
| `routing.mjs`   | Maps changed files to packages, link types and checklist classes via `routing.json`                                                    |
| `glob.mjs`      | Minimal glob matcher (`*`, `?`, `**`) used by routing and drift detection                                                              |
| `material.mjs`  | Writes `OUT/pr.diff`, `OUT/commits.txt` and `OUT/increment.diff` with size caps and "unavailable" stand-ins                            |
| `paths.mjs`     | Reads `OUT` and `STATE_FILE` from the environment. Returns null so callers fail closed                                                 |

_GitHub I/O and prior state_

| File               | Purpose                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `gh.mjs`           | Minimal GitHub REST client (`fetch`), pagination, `next`-link parsing, and summary-comment upsert. Errors carry status only          |
| `state.mjs`        | facts' prior-state loader: finds the bot summary, decodes its ledger, and collects inline fp slugs and maintainer-acknowledged slugs |
| `prior.mjs`        | publish's prior-state handling: sanitized payloads, fallback to the summary comment, and re-emitting an unreadable marker verbatim   |
| `markers.mjs`      | Hidden-marker formats: summary marker, base64 ledger marker (encode/decode/raw) and inline `fp` marker                               |
| `summary-post.mjs` | Summary upsert with a one-shot minimal-banner retry, current-head lookup, and last-resort fallback banner                            |
| `status.mjs`       | `::warning::` annotations and the single job-summary status line                                                                     |

_Findings, ledger and rendering_

| File             | Purpose                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findings.mjs`   | Validates `findings.json`, caps fields and counts, forces security classes, and builds the fixed public security pointer                              |
| `completion.mjs` | Decides whether a run completed, whether it is partial, the failure reason (rate-limited/failed), and the outcome label                               |
| `ledger.mjs`     | Ledger entry shapes, sanitizing, merge across runs, aging/resolution, visibility window, and marker-size fitting                                      |
| `ids.mjs`        | Opaque 16-hex ids: HMAC-SHA256 with the id key, or plain SHA-256 without                                                                              |
| `render.mjs`     | Renders the public summary comment: headline, tier line, findings by severity, carried/resolved sections, narrative withholding, size-capped assembly |

_Security: withholding, redaction, delivery_

| File          | Purpose                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `redact.mjs`  | `SECRET_PATTERNS` and `redact()`, the pure secret scrubber applied to all public text                                         |
| `needles.mjs` | Path normalisation against disguises, and detection of text or findings that name a security file                             |
| `fileids.mjs` | Keyed hashes of security files (`fileIds`), so later runs keep withholding them without public paths                          |
| `deliver.mjs` | publish's adapter to `advisories.mjs`: picks the security findings and prior ids, returns the public clause and `resolvedIds` |
| `reply.mjs` | `runReply()`: the checks on the model's one reply (event target, regular-file body, prefix, secrets, security slugs/files, file names while earlier security entries exist), the one-per-run lock, and the post |

_Inline comments_

| File               | Purpose                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `inline-stage.mjs` | publish's inline stage: select, post, then run the post-hoc guard. Returns the posted slugs and fixed notices                                  |
| `inline-post.mjs`  | Reads and validates `inline.json`, applies eligibility, path, duplicate, guard and cap filters, and posts one review (422 → per-comment retry) |
| `inline-guard.mjs` | `unsafeInline()` predicate, and the post-hoc deletion of this run's unsafe `github-actions[bot]` comments                                      |
| `suggestion.mjs`   | Validates one-click suggestions (blocked paths, side, hunk, size, fences, control chars, HTML comments) and fences them                        |

### 11.3 Tests (`checks/test/`)

**[SPEC]**
Run with `node --test ".claude/pr-review/checks/test/*.test.mjs"` (CI job `pr-review-checks` in `ci.yml`).

| File                                              | Covers                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `advisories.test.mjs`                             | Advisory creation, dedupe, "also touched by" patches, no-token/no-key paths           |
| `advisories-state.test.mjs`                       | State filters and paging, resolution of dispositioned advisories, reopen behaviour    |
| `contracts.test.mjs`                              | Export/region/twin and Firestore/Storage pre-checks                                   |
| `diff.test.mjs`                                   | Unified-diff parsing (renames, deletes, binaries, spaces), `-diff` attribute handling |
| `facts.test.mjs`                                  | `facts.md` size caps and unavailable-check reporting                                  |
| `followups.test.mjs`                              | Withholding of prior security files named by basename in later runs                   |
| `headline.test.mjs`                               | Headline counts for this-run vs carried findings                                      |
| `hunks.test.mjs`                                  | Hunk-range extraction and bounds                                                      |
| `hygiene.test.mjs`                                | Redaction families and the hygiene pre-checks                                         |
| `increment.test.mjs`                              | Increment computation, re-indent detection, merge-from-base filtering, tier inputs    |
| `inline-drops.test.mjs`                           | Drop counting by reason and which drops are announced                                 |
| `inline-post.test.mjs`                            | Inline selection, eligibility, cap and guard ordering                                 |
| `inline-scope.test.mjs`                           | The post-hoc guard's "this run" test (`original_commit_id`, run start)                |
| `inline-suggestions.test.mjs`                     | Suggestion fencing, multi-line ranges and drop rules                                  |
| `knowledge.test.mjs`                              | Knowledge files exist. Every routing link type has exactly one contract-map heading   |
| `ledger.test.mjs`                                 | Entry shapes, merging, resolution and visibility window                               |
| `ledger-carry.test.mjs`                           | Public-entry stability on security files, keyless carry-over                          |
| `ledger-keyless.test.mjs`                         | Unkeyed public ids vs keyed security ids                                              |
| `markers.test.mjs`                                | Ledger marker round-trip and fp extraction                                            |
| `material.test.mjs`                               | `OUT` material files per tier and git-failure stand-ins                               |
| `needle-forms.test.mjs`, `needle-forms2.test.mjs` | Non-canonical and root-level path forms against fileIds                               |
| `prior-state.test.mjs`                            | `priorUnavailable` handling and verbatim marker re-emission                           |
| `publish.test.mjs`                                | End-to-end compose: redaction, withholding, prior-state preservation                  |
| `reply.test.mjs`                                  | Reply command: target, body source, refusals, security slugs/files, file names while earlier security entries exist, one-per-run lock |
| `publish-fallback.test.mjs`                       | Missing/invalid snapshot and unreadable comments fail closed                          |
| `publish-skeleton.test.mjs`                       | Basic success/failure summaries                                                       |
| `publish-status.test.mjs`                         | Completion rules (`complete: true`, `summary.md`) and status lines                    |
| `render.test.mjs`                                 | Security pointer, finding rendering, truncation                                       |
| `routing.test.mjs`                                | Routing of representative paths to link types and classes                             |
| `security-guards.test.mjs`                        | Forced security classes, area whitelist, fileIds-only security entries                |
| `state.test.mjs`                                  | `loadState` with corrupt, missing and valid markers                                   |
| `tier.test.mjs`                                   | Every `classify()` branch                                                             |
| `workflow-config.test.mjs`                        | Workflow invariants (env placement, step order, job skip conditions, permissions)     |
| `workflow-serena.test.mjs`                        | Serena step gating, unchanged arguments when off, the four-tool allowlist             |

---

## 12. Knowledge and config files

**[SPEC]**

| File                                 | Read by               | Purpose                                                                                                                                                |
| ------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REVIEW.md`                          | Model                 | The review procedure and output contracts. Authoritative for model behaviour                                                                           |
| `checklist.md`                       | Model                 | 14 bug classes (e.g. 1 client-supplied IDs trusted, 5 rules/index drift, 13 PR text vs code, 14 cross-product isolation)                               |
| `conventions.md`                     | Model                 | Practised conventions per package (callable auth, errors/logging, money, runtime, TS strictness)                                                       |
| `false-positives.md`                 | Model                 | Known-intentional patterns not to flag, unless the PR changes why they are safe                                                                        |
| `contract-map-homegroups.md`         | Model                 | Link-type owner table, plus callable, firestore-rules/indexes/trigger, storage and claims links                                                        |
| `contract-map-regroup.md`            | Model                 | push, deep-link, origins-config, http-export and shared-literals links                                                                                 |
| `contract-map-cross-product.md`      | Model                 | recovery-api, twin-helper, config-coupling, logging, tests and review-config links                                                                     |
| `routing.json`                       | facts, publish, model | 17 entries `{linkType, paths, counterparts, classes}`. Drives routing, drift detection, suggestion blocking and the link types publish carries forward |
| `serena/project.yml`                 | Serena                | Project config: TS/Markdown/YAML language servers, ignored paths, `read_only`, `fixed_tools`                                                           |
| `serena/serena_config.yml`           | Serena                | Global config: pinned LS versions, `base_modes: []`, no trusted projects, no dashboard                                                                 |
| `serena/prompt_templates/prompt.yml` | Serena                | The single `connection_prompt` override: review-specific guidance for using Serena                                                                     |

**[NOTE]**
Every `## <linkType>` heading must exist in exactly one contract map. `knowledge.test.mjs` enforces this.
Adding a link type to `routing.json` therefore needs a matching contract-map section in the same PR.

---

## 13. Limits and constants

**[SPEC]**

| Constant                     | Value                                                                              | Where             |
| ---------------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| Max turns                    | full 60, incremental-new-links 60, incremental 40, light 15, base-drift 15, none 0 | `tier.mjs`        |
| `facts.md` size              | 40,000 bytes. ≤ 30 facts per check, ≤ 500 chars per fact                           | `facts.mjs`       |
| PR context                   | 12,000 bytes. 2,000 per comment. Title 300                                         | `facts.mjs`       |
| Changed files tracked        | 3,000                                                                              | `facts.mjs`       |
| `pr.diff` / `increment.diff` | 1.5 MiB                                                                            | `material.mjs`    |
| `commits.txt`                | 200 KiB                                                                            | `material.mjs`    |
| Findings kept                | 200 (lowest severities dropped first). ≤ 10 locations each                         | `findings.mjs`    |
| Inline comments              | 15 per run. ≤ 100 entries read. Body ≤ 4,000 chars                                 | `inline-post.mjs` |
| Suggestion                   | ≤ 40 lines, ≤ 4,000 chars, range ≤ 40 lines. Entry read cap 20,000                 | `suggestion.mjs`  |
| Reply                        | 1 per run. `reply.md` ≤ 4,000 bytes                                                | `lib/reply.mjs`   |
| Hunks                        | ≤ 500 per file, ≤ 3,000 files                                                      | `hunks.mjs`       |
| Summary body                 | 60,000 chars. ≤ 50 lines per earlier-review section                                | `render.mjs`      |
| Ledger marker                | 30,000 chars                                                                       | `render.mjs`      |
| Resolved visibility          | 5 runs                                                                             | `ledger.mjs`      |
| `fileIds` per security entry | 10                                                                                 | `fileids.mjs`     |
| Acknowledged slugs           | 200                                                                                | `state.mjs`       |
| Advisory listing             | 10 pages × 100 per state                                                           | `advisories.mjs`  |
| Rate-limit detection window  | last 4,000 chars of the execution log                                              | `completion.mjs`  |
| Job timeout                  | 30 min. Serena setup 10 min. MCP startup 60 s                                      | workflow          |

---

## 14. Testing

**[SPEC]**

- Local: `node --test ".claude/pr-review/checks/test/*.test.mjs"` from the repo root.
- CI: `ci.yml` job `pr-review-checks`.
- Workflow invariants are tested by parsing the YAML text (`workflow-config.test.mjs`,
  `workflow-serena.test.mjs`). A workflow edit that breaks an isolation rule fails CI.
- A PR that edits `.claude/pr-review/**` is reviewed with the **base** copy. It gets a High `self-edit` finding
  (class 13) that asks for a check against the `## review-config` contract-map section.

---

## 15. Operational pitfalls

**[BUG] The first PR that adds or changes the scripts is not reviewed with them**

- **Symptom:** The job logs `pr-review scripts not on base yet; review skipped`, or a script change has no effect
  on its own PR's review.
- **Cause:** facts and publish always run from the base SHA (`.review-base/`, `.review-publish/`), and
  `.claude/pr-review/` is restored from the base.
- **Fix:** Expected behaviour. Merge first. The change applies from the next PR on. Exception: edits to
  `claude-code-review.yml` _do_ apply in their own PR, because `pull_request` runs the PR's workflow file.

**[BUG] Security pointer says "id key unavailable" and the ledger is frozen**

- **Symptom:** The summary shows `> ledger frozen for security entries: id key unavailable`, and security
  findings show `details could not be delivered privately; id key unavailable`.
- **Cause:** The `PR_REVIEW_ID_KEY` secret is missing or empty.
- **Fix:** Set the secret and re-run. Rotating it orphans the matching of existing security/withheld entries
  (public entries still match by slug).

**[BUG] Security details "could not be delivered privately"**

- **Symptom:** The pointer says `re-run after fixing the advisory token`, and the job warns
  `security advisories not delivered`.
- **Cause:** `SECURITY_ADVISORY_TOKEN` is missing, expired, or lacks "Repository security advisories: read and
  write". The job log shows `advisories failed: <status>`.
- **Fix:** Regenerate the fine-grained PAT with that permission on this repo, update the secret, re-run.

**[BUG] Publish skipped after a Serena run**

- **Symptom:** The Stop Serena step fails with `serena-runner processes survived; Publish is skipped`. No
  summary update.
- **Cause:** A `serena-runner` process outlived 5 kill rounds. It could tamper with the publish checkout.
- **Fix:** Re-run the job. If it recurs, set `PR_REVIEW_SERENA` to anything but `on` until it is investigated.

**[BUG] "review did not complete" on a large PR**

- **Symptom:** Banner `⚠ review did not complete (incomplete)` or `(failed)`.
- **Cause:** The model hit `--max-turns` before writing `findings.json` with `complete: true`, or the action
  failed. `(rate-limited)` means the log tail mentioned a rate or usage limit.
- **Fix:** Push again (it retries on the next push), or split the PR. Prior open findings remain listed
  meanwhile.

**[BUG] Inline comment not posted for a High finding**

- **Symptom:** The summary notice says `N inline comment(s) for Critical or High findings were not posted`.
- **Cause:** The entry's `path` was not a changed file, its body contained its own suggestion fence, it was
  malformed, or the 15-comment cap was reached. The job log line `inline select:` gives counts per reason.
- **Fix:** None needed for correctness. The finding is still listed in the summary.

---

## 16. Changelog

**[SPEC]**

| Version | Date       | Change                                                                                                                                                      |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2.0   | 2026-10-27 | Module index adds `reply.mjs`, `lib/reply.mjs` and `reply.test.mjs`. The reply command refuses file names while earlier security entries exist. Records where the reply's token comes from |
| 1.1.0   | 2026-10-27 | Moved from `.claude/pr-review/HOW-IT-WORKS.md` to `docs/ci/pr-review.md`. Documents the `gh pr` read permissions, the base-controlled reply command that replaced `gh pr comment`, Serena `--mode editing`, and the exact resolved-visibility window |
| 1.0.0   | 2026-10-27 | First version. Documents facts/review/publish, the ledger, the security model, Serena isolation and every `.mjs` module, as of branch `ci/pr-review-serena` |
