# Mac Migration Notes — 2026-07-14

Status snapshot of `recovery-platform` prepared for closing this session on this machine and resuming from another. Read this first when picking the work back up.

## Repo State

- **Branch:** `main`
- **`origin/main` is fully up to date** — verified `git rev-parse main origin/main` returns identical hashes. A fresh `git clone`/`git pull` on the other machine will have everything below.
- **Working tree is clean** on this machine (see "Stashed WIP" below for the one exception).
- No open PRs — all work this session was pushed straight to `main` (explicit call, not the default).
- No background processes left running (no `jest`, no Firebase emulator).

## What Shipped This Session (regroup launch-readiness)

Worked through Priority 1 (6 items) and Priority 2 (5 grouped, 12 findings) from the last full regroup audit — `docs/plans/2026-07-07-regroup-next-steps.md` and `docs/launch-readiness/regroup-critical-work-2026-07-07.md`. Regroup had been dormant since 2026-07-07 while work focused on homegroups.

All 11 fixes + 1 security-critical rules change are merged to `main`, each independently TDD'd, all verified together:

- **287/287** mobile test suites passing
- **4785/4787** tests passing (2 intentional `todo`s, 0 failures)
- **163/163** Firestore rules tests passing

### Priority 1

- Oxford officer-deactivation wiring + dead code cleanup (`updateVote`, `officers.ts`)
- `dischargeGuest` now revokes Firebase custom claims (was leaving discharged residents with house access indefinitely)
- `DirectChat` gets its own real-time Firestore listener (was silently frozen when opened via deep link/push notification)
- Officer names entered during onboarding now display instead of "Unknown"
- `ManagerSettings` admin-removal now dispatches to Redux (stale list bug)

### Demo account Firestore rule scoping (security-critical)

`demo_user@appdemo.net`'s credentials are hardcoded client-side and reachable via a real UI path in production builds. Added `isDemoAccount()` / `isDemoScopedHouses()` to `regroup/mobile/firebase/firestore.rules`, wired into the `isAdmin`/`isGuest`/`isHouseGuest` helpers that nearly all house-scoped rules funnel through. The demo account can now only read/write houses explicitly flagged `isDemoHouse: true`, regardless of what custom claims it holds. Non-demo accounts are unaffected.

Gotcha worth remembering: Firestore Rules **throws** (not null/undefined, unlike JS) when dot-accessing an absent map key — `isDemoAccount()` had to guard with `'email' in request.auth.token &&` before the equality check, or any token without an email claim would be denied across the entire house-role authorization surface.

### Priority 2

- Treasury report resubmission now preserves the original period instead of reassigning to the current week
- Balance Aging view now matches the cents-precision used elsewhere on the same screen
- `HouseSummary.tsx`'s permission gate vs. Firestore rules mismatch — this turned out to be a **real security gap**, not just a UX inconsistency: regular admins could bypass the UI-only restriction and write financial/ownership fields directly via the rules layer. Rules tightened to match the app's own permission model (superAdmin-only for those fields).
- "Any" gender filter on house search now correctly means "no filter" instead of matching a literal `'any'` value
- EES per-resident billing preview now uses the same divisor (resident count) as actual billing, instead of bed capacity
- Recording a manual payment now invalidates the query backing "Overdue Residents"
- `GuestList` health icon was always showing worst-case (0%) because `weekStats` was never passed to the calculation — fixed
- `EditUserInfoForm` no longer silently swallows profile-update failures
- Dead `sendInviteEmails` Cloud Function callable removed (zero callers)
- PII (guest names) no longer logged via `console.log` in `migrateGuestWeeks.ts`
- FCM push-notification permission result is now checked/handled in `Splash.tsx`
- `StripeSettingsScreen` now refreshes on focus after the Stripe Connect onboarding redirect

## What's NOT Done

- **Priority 3** (~15 low-priority cleanup items, none launch-blocking) from the same 2026-07-07 audit — untouched this session. Start here next time regroup work resumes; no need to re-audit from scratch.
- **Decision B** from the audit (`withHouseSetupWizard` HOC/hook duality) — deferred tech debt, not touched.
- A stray docs-only commit (`27807a4`, "docs: add accumulated launch-readiness plans, reviews, and research notes") landed on `main` mid-session from a **concurrent peer Claude session**, not from this work. Planning/audit markdown only, no code — left as-is.

## Stashed WIP (local to this machine only)

Pre-existing uncommitted changes that predate this session and are unrelated to the regroup work above were stashed rather than committed or discarded:

```
stash@{0}: pre-existing unrelated WIP (detox-recovery, doc reviews, Podfile.lock, IDE prefs) - stashed before machine switch 2026-07-14
```

Files covered: `detox-recovery/__tests__/pages/resources.test.tsx`, `detox-recovery/app/resources/page.tsx`, `detox-recovery/docs/go-to-market/founder-manual-launch-guide.md`, `detox-recovery/lib/products-data.ts`, `docs/reviews/dead-code-audit-2026-07-04.md`, `docs/reviews/regroup-launch-blockers-2026-07-04.md`, `docs/reviews/regroup-manual-qa-plan-2026-07-04.md`, `homegroups/mobile/android/.settings/org.eclipse.buildship.core.prefs`, `homegroups/mobile/ios/Podfile.lock`.

**This stash will NOT appear on another machine** — it was never pushed anywhere (stashes are local-only by default). If that WIP is needed elsewhere, it has to be recovered from this machine specifically (`git stash show -p stash@{0}` here) and reapplied there, or redone.

There's also a second, older stash already present from a prior session:

```
stash@{1}: On feat/detox-recovery-launch-readiness: unrelated WIP: mobile configs, package-locks, CreateGuestForm/house.tsx, e2e scripts (parked — belongs on test/e2e-launch-prep)
```

Same caveat applies — local to this machine.

## Environment Gotcha: regroup/mobile Worktree Config Files

If doing more worktree-isolated regroup/mobile work on the new machine: `regroup/.gitignore` has a `**/*.js` pattern that gitignores regroup/mobile's own build config files — `babel.config.js`, `jest.config.js`, `jest.config.integration.js`, `jest.config.rules.js`, `jest.setup.js`, `jest.setup.integration.js`, `metro.config.js`. These exist in the main checkout (untracked) but a fresh `git worktree add` never copies untracked/ignored files, so **every new worktree is missing them and Jest silently breaks** — hangs indefinitely, or throws `Preset react-native not found` / `Module <rootDir>/jest.setup.js ... was not found`, neither of which points obviously at the real cause.

Fix each time: copy the 7 files above from the main checkout's `regroup/mobile/` into the worktree's `regroup/mobile/` before running any jest command. Prefer symlinking `node_modules` from the main checkout rather than a fresh `npm install` if disk space is tight.

The `regroup/mobile/firebase/__tests__/firestore.rules.test.ts` suite additionally needs the Firestore emulator running on `:8080`. The machine's default Java (17) is too old for current `firebase-tools` — use a Java 21+ install (e.g. `/opt/homebrew/opt/openjdk@23/bin/java`) via `PATH` override when starting the emulator.

Worth fixing at the `.gitignore` level eventually so this stops recurring.

## Local-Only State That Won't Follow You

- **Claude Code memory/session state** lives under this machine's `~/.claude/`. Two memory notes were written there this session (regroup P1/P2 shipped status, the gitignored-config-files gotcha above) — they'll surface automatically in a future session _on this machine_, but won't follow unless `~/.claude` is synced separately.
- **Disk space**: this machine was down to ~12GB free at one point during this session (5+ parallel git worktrees each carrying an 800MB+ `node_modules`). Worth checking headroom on the new machine before spinning up multiple worktree-isolated agents at once.
