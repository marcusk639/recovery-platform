# How the automated PR review works

**Version 2.0.0** · recovery-platform · 2026-10-30 · Scope: `.pr-review/` and `.github/workflows/claude-code-review.yml`

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for authoritative facts.
Read `[NOTE]` only if additional context is needed.
`[?]` blocks are unverified: treat them with lower confidence.

This file explains the review system for maintainers. It lives under `docs/`, outside `.pr-review/`, so it is
**not** one of the reviewer's knowledge files and editing it never triggers a review self-edit finding. The
reviewer model follows the kit's procedure plus `.pr-review/REVIEW.md`, not this document.

---

## 1. What it is

**[SPEC]**

- An **advisory** PR reviewer: one summary comment plus a few inline comments per PR. It never approves, requests
  changes or blocks a merge, and it is never a required check.
- The engine is **pr-review-kit** (`marcusk639/pr-review-kit`), shared with the owner's other repositories. The
  review workflow pins it by full commit SHA in both kit `uses:` lines. Until 2026-10-30 this repository ran its
  own copy of that engine under `.claude/pr-review/checks/`; the kit was extracted from it.
- Everything specific to this repository is in `.pr-review/`, read from each PR's **base commit**, so a PR cannot
  change how it is itself reviewed.
- How the engine works (pipeline, sandbox, ledger, security channels, every module): the kit's
  `docs/how-it-works.md`. Wiring and config keys: the kit's `docs/consumer-guide.md`.

## 2. What lives here

**[SPEC]**

| Path                                       | What                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `.github/workflows/claude-code-review.yml` | The PR Review workflow: checkout, kit `review`, kit `publish` (with the id key and advisory token)  |
| `.pr-review/config.json`                   | Engine settings: packages, the 14 classes, inline and suggestion rules, model tools, Serena, checks |
| `.pr-review/REVIEW.md`                     | This repository's addendum to the kit's review procedure                                            |
| `.pr-review/routing.json`                  | Path globs → link types, counterparts and classes                                                   |
| `.pr-review/contract-map-*.md`             | Contract maps (homegroups, regroup, cross-product), one `## <linkType>` section each                |
| `.pr-review/checklist.md`                  | The 14 bug classes                                                                                  |
| `.pr-review/conventions.md`                | Conventions summary; the product `CLAUDE.md` files hold the detail                                  |
| `.pr-review/false-positives.md`            | What looks like a bug here but is not                                                               |
| `.pr-review/checks/`                       | Project checks: Cloud Function exports and regions, Firestore indexes and rules, twin products      |
| `.pr-review/serena/`                       | Locked-down Serena config for the review job (not the local `.serena/`)                             |
| `.claude/agent-gates/verify-diff.sh`       | Test-tamper gate; the review runs the base copy as `verify-diff.sh <fork point> <head>`             |

## 3. What this repository turns on

**[SPEC]**
All of these are opt-in kit capabilities (kit how-it-works §5.4); they reproduce what the in-repo reviewer did.

| Setting                                               | Value                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `trust.contextAssociations`                           | OWNER, MEMBER, COLLABORATOR: their PR description and comments reach the model                                   |
| `inline`                                              | Up to 15 per run; Critical, High and Medium; Critical/High placed first                                          |
| `inline.suggestions`                                  | On; never on paths routed to classes 1–7, `*.rules`, `firestore.indexes.json` (plus the kit's built-in blocks)   |
| `model.ghRead`, `model.reply`                         | On: `gh pr view` / `gh pr diff`, and one checked reply per run to a maintainer's question                        |
| Serena (input `serena: ${{ vars.PR_REVIEW_SERENA }}`) | On when the repository variable `PR_REVIEW_SERENA` is `on`; excludes `lib/`, `public/`, build output, `_legacy/` |
| `referenceFiles`                                      | `**/CLAUDE.md`, `**/AGENTS.md`, `**/.claude/rules/**`, copied from the base commit as data                       |
| `checks.timeoutMs`                                    | 60000 (the export check greps the whole repository per export)                                                   |
| `checks.verifyDiff`                                   | `.claude/agent-gates/verify-diff.sh`                                                                             |
| `securityChannel`                                     | `advisory`: security findings go to draft repository security advisories                                         |

Secrets (unchanged): `CLAUDE_CODE_OAUTH_TOKEN`, `PR_REVIEW_ID_KEY`, `SECURITY_ADVISORY_TOKEN`. Repository variable:
`PR_REVIEW_SERENA`.

## 4. What changed for maintainers when the kit took over

**[SPEC]**

- **Acknowledging an inline comment** now needs a reply in its thread whose first own line starts with
  `review:` (from the repository owner, not edited). A plain reply no longer counts. A 👎 from the owner also
  marks a finding rejected. Critical and security findings are never resolved by feedback.
- **Feedback on any finding**: every non-security finding shows a handle `F-xxxxxx`; a PR comment line
  `review: F-xxxxxx <text>` corrects it.
- **Edited comments** are no longer passed to the model as PR context.
- **More secret shapes** are redacted and flagged: JWTs, `Bearer` tokens, Slack tokens.
- **No review on the PR that first adds a config**: the project is read from the base commit, so a base without a
  valid `.pr-review/config.json` gets no review and no comment (the in-repo reviewer posted a failure banner).
- The summary's impact table is still `## Cross-package impact` (the addendum keeps the old heading).
- Facts now runs on a neutralized PR head: `CLAUDE.md`, `.claude/` directories and git control files are set
  aside as `*.pr-head`, and symlinks become placeholders. The model reads the PR's changes to them from the diff,
  and the base copies from `<OUT>/reference/`.

**[NOTE]**
Behaviour the in-repo reviewer had and the kit keeps: tiers, the ledger marker (existing summaries carry over),
security pointers and draft advisories, needle withholding, the inline guard, the contract checks, the reply
command's refusal rules, Serena's isolation.

## 5. Operations

**[SPEC]**

- **Updating the kit:** change the SHA in both kit `uses:` lines of `claude-code-review.yml` to a commit on the
  kit's `main`, then run `validate` (below). The PR that does it is reviewed by the **new** pin (the workflow comes
  from the PR head) and gets a High self-edit finding; check it against `## review-config` in
  `.pr-review/contract-map-cross-product.md`.
- **Validate locally:** with the kit cloned next to this repository,
  `node ../pr-review-kit/bin/pr-review.mjs validate` from the repository root. CI runs the same check from the
  pinned kit commit (job `pr-review-checks` in `ci.yml`).
- **Dry run locally:** `node ../pr-review-kit/bin/pr-review.mjs local --base <sha> --head <sha>` prints what the
  review would post, without posting.
- **Project check tests:** `node --test ".pr-review/checks/test/*.test.mjs"` (also in CI).
- **Turning Serena off:** set the repository variable `PR_REVIEW_SERENA` to anything but `on`.

## 6. Planned: the learning loop

**[?]**
Not enabled yet; to be done in the near future. The kit can learn from maintainers' 👍/👎 and `review:` replies
through a weekly `pr-review-learn.yml` workflow that opens one learning PR (lessons in managed blocks of the
knowledge files and `.pr-review/learned/`) for a human to merge, edit or close. Enabling it here needs:

1. Copy the kit's `examples/consumer/.github/workflows/pr-review-learn.yml` with the same kit SHA as the review
   workflow.
2. Settings → Actions → "Allow GitHub Actions to create and approve pull requests" (the propose job's token).
3. Optionally set `learning.commands` (e.g. a format check) and `learning.forbidden` in `config.json`.
4. Run `validate`, then dispatch the workflow once by hand and review the first learning PR.

## 7. Operational pitfalls

**[BUG] A config change has no effect on its own PR**
Cause: `.pr-review/` is read from the base commit. Fix: intended; it applies from the next PR after merge.

**[BUG] `validate` says the kit pin is not reachable from the kit's main branch**
Cause: the pin is a kit commit that is not (yet) on `main`, e.g. a kit PR that has not merged, or a pre-squash
branch commit. Fix: pin the commit the kit PR landed as on `main`.

**[BUG] The summary says "review did not complete"**
Cause: a usage limit, the turn cap, or a model error. Fix: push again or re-run the job; the prior ledger is kept.

## 8. Changelog

| Version | Date       | Change                                                                                    |
| ------- | ---------- | ----------------------------------------------------------------------------------------- |
| 2.0.0   | 2026-10-30 | The reviewer is pr-review-kit; this repository keeps `.pr-review/`. Rewritten for the kit |
| 1.2.0   | 2026-10-27 | (In-repo reviewer) reply command, Serena, suggestions                                     |
| 1.1.0   | 2026-10-27 | Moved from `.claude/pr-review/HOW-IT-WORKS.md` to `docs/ci/pr-review.md`                  |
| 1.0.0   | 2026-10-27 | First version                                                                             |
