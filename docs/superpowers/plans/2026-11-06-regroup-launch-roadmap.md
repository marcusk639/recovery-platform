# Regroup Launch Reboot: Roadmap of Plans

> **For agentic workers:** this file sequences the sub-plans. It is not executed itself. Execute one sub-plan at a time with superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Each sub-plan lists its own tasks as checkboxes.

**Goal:** Relaunch Regroup on React Native 0.88.1 with every feature working on iOS and Android, proven by an end-to-end suite, through a launch runbook where every irreversible step has a recovery step.

**Architecture:** The work follows the design's §5 order. Each phase is its own plan, written just before the phase starts, against the code as it is then. Line numbers and file layout move once #160 merges, so detailed plans written now would go stale. Only P1 and P2 are written now.

**Spec:** `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` (approved 2026-11-06). Every sub-plan argues from it. Read the spec section a phase names before planning or executing it.

## Global Constraints (apply to every sub-plan)

- Work in a git worktree off `origin/main`, and use `git -C <path>`, never `cd <path> && git`. Commit scopes name the product, e.g. `fix(regroup-mobile):`, `fix(regroup-functions):`, `test(regroup):`, `docs(regroup):`.
- Never `--no-verify`. New files stay ≤ 300 lines. Coverage floors only go up. No deleted or skipped tests, no test-count drops, no `.snap` churn without the `test-change-approved` label and a PR note.
- No PII in logs, fixtures, test data or commits. Nothing in the suite or its tooling touches `phoenix-cleanhouse` (spec §6).
- **Docs stay current:** every PR updates the docs that describe its change (spec §6).
- Serena indexes the main checkout, not the worktree. In a worktree, use Read and Grep on the worktree's paths.
- Production deploys only run in P8. A production regroup functions deploy freeze applies from P4 until P8 (spec §5, prerequisites).
- Money paths get an independent reviewer who reasons from the domain model (spec §6).

## Sub-plans

| #      | Plan                                                                                                                                                                                                     | Spec                                                        | Gate to start                                                                                    | Done when                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| P1     | Start-up: e2e-build guard, CI smoke decision, coverage matrix, exports bucket                                                                                                                            | §5 step 1, §4.3, §6.1                                       | —                                                                                                | `2026-11-06-regroup-launch-p1-startup.md` complete                                                                                      |
| P2     | Merge #160 at parity                                                                                                                                                                                     | §4.4, §5 step 2                                             | P1 tasks 1–2 merged to `main` (the guard must exist before more flows run)                       | #160 squash-merged                                                                                                                      |
| P3     | Staging walking skeleton: staging SSR config and deploy, staging app builds, staging account path, Add Home / admin-state fix, sandbox prices, one subscribe → mobile setup round trip on both platforms | §4.3, §4.2 (Add Home), §4.1 item 3 (sandbox), §5 step 3     | P2 merged                                                                                        | The round trip has run once on iOS and Android and is recorded                                                                          |
| P4     | Billing fixes A1–A2 and the A4 code, A8 sales-open switch, A5 web unit tests in CI, sandbox A7 settings, clean seeder plus legacy fixture                                                                | §3.2, §4.1 items 1, 2, 4, 5, 7, 8; §4.3 fixtures; §5 step 4 | P3 done                                                                                          | Every §3.2 verified defect has a failing-then-passing test. Backfill scripts dry-run cleanly on the legacy fixture. Web specs run in CI |
| P5     | Workstream B features, plus A6 link-out checkout and the deep-link and app-link work                                                                                                                     | §3.3, §4.2, §4.1 item 6, §5 step 5                          | P4 done; owner has supplied store IDs and the Play SHA-256 (spec §8.1)                           | Every B item has its flow written first, then passing. The deep-link rows recorded before the change still pass                         |
| P6     | Coverage: remaining flows, the 10 failing flows, one command per platform with durations, Playwright billing journeys, the remaining staging scenarios                                                   | §4.3, §5 step 6                                             | P5 done                                                                                          | Every coverage-matrix row passes or is validly deferred (`coverage-matrix-check.js --release` exits 0)                                  |
| P7     | Release candidate on staging: full suite on both platforms, owner's staging device pass                                                                                                                  | §4.3 checklist, §5 step 7                                   | P6 done                                                                                          | Both recorded                                                                                                                           |
| P8–P10 | Launch runbook: production backend, store submission, launch day                                                                                                                                         | §5 steps 8–10, §6.1                                         | P7 done; prerequisites in spec §5 met (Connect activated, store-listing items, US-only listings) | Spec §9 all met                                                                                                                         |

P8–P10 is one plan, a runbook rather than TDD tasks. Each step is paired with its spec §6.1 recovery row and an evidence line to fill in.

## Writing the next sub-plan

When a phase's gate is met, write its plan with superpowers:writing-plans:

- Re-verify every file and line the spec cites for that phase. They will have moved.
- Take requirements from the spec sections in the table above.
- Use the coverage matrix (P1) as the list of rows that phase must turn green.
