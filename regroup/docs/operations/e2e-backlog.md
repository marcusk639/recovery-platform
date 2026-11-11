# Regroup E2E backlog

Tracks E2E tests that still need to be written or run, so a "E2E not run" note in a PR description does not get lost when the PR merges. Add a row when you ship a change without running its E2E. Move it to **Done** with the date, commit and result once it has run.

Statuses: `to-run` (test exists, not yet run against the change), `to-write` (no test yet), `blocked` (waiting on something listed in the row).

## Open

| ID | Status | What | Needs | How to run | Source |
| --- | --- | --- | --- | --- | --- |
| RENT-012 | blocked, to-run | Paying the same rent amount twice the same UTC day returns `{ alreadyPaid: true }` and charges nothing. The two RENT-012 tests in `rentLedger.server.test.ts` should pass. | #214's tests merged with #230's change (check out #214 with `fix/regroup-payment-suite-gaps` merged in). `regroup/functions/.secret.local` holding the regroup-local sandbox keys (not committed, and not yet created). | `cd regroup/e2e && npm run test:payments -- rentLedger` | #230, closes #214 finding F-fb4660. Plan: `docs/superpowers/plans/2026-11-08-regroup-launch-p6-payment-suites.md`, row RENT-012. |

## Done

| ID | Date | Commit or PR | Result |
| --- | --- | --- | --- |
| (none yet) | | | |

## Notes

- `npm run test:payments` is added by #214. It does not exist on `main` until that PR merges.
- E2E runs use Stripe sandbox keys only. Never put keys in this file or commit `.secret.local`.
- Unit and Jest coverage is not tracked here. This file is for tests that need a real Stripe sandbox or emulator run.
