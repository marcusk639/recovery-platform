# Regroup Launch P2: Merge #160 at Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge PR #160 (React Native 0.88.1, branch `chore/regroup-rn-upgrade`) once the app is at parity with today, so every later phase works on one RN version.

**Architecture:** This plan is mostly verification, with code changes only for regressions the upgrade caused. Parity is defined by spec §4.4:

- the 6 flows that pass today also pass on Android;
- an Android baseline is taken from `main` (RN 0.72), so pre-existing failures are recorded rather than fixed in #160;
- the store-build guards pass on 0.88;
- the owner's device pass is recorded;
- Task 17 is done.

**Tech Stack:** RN 0.88.1 / React 19.3, Xcode (iOS `E2EEmulator`), Gradle (Android `e2eEmulator`), Maestro 2.x, Firebase emulators (`demo-regroup-e2e`), Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md`, §3.1, §3.5, §4.4, §5 step 2. Also the decision record on the branch, `regroup/mobile/docs/build/react-native-0.88-upgrade.md`: §7.2 (what ran), §7.3 (the device pass), §7.6.

## Global Constraints

- See `docs/superpowers/plans/2026-11-06-regroup-launch-roadmap.md`.
- **Gate:** P1 tasks 1–2 (the e2e-build guard) are on `main`.
- Only parity work goes into the upgrade branch (spec §6). Feature and bug fixes found here that `main` shows as well are **recorded, not fixed** (spec §4.4).
- Parity flows: `smoke`, `signup`, `guest-home`, `guest-activity-dispute`, `guest-rent-history`, `operator-manual-payment`.
- Simulator builds for flows must be normally signed. A `CODE_SIGNING_ALLOWED=NO` build can't sign in (decision record §7.2).
- Merging is the owner's action: squash merge (repo rule). The `test-change-approved` label is applied only at Task 6, with the intended test changes listed in the PR body.

## Review Focus

1. **A flow that passes only because a step is optional.** Parity counts a flow as passing only if none of its key steps are optional (spec §2 anti-goals). → Task 2 records any `optional: true` in the six.
2. **An Android failure blamed on the upgrade that `main` shows too.** It must go in the baseline, not in a #160 fix. → Task 3 classifies by running both.
3. **The merge of `main` bringing the guard in, and breaking a flow.** The guard subflow runs first, and a wrong `APP_ID` default in a script would fail every flow. → Task 1 runs `smoke` straight after the merge.
4. **Release guards silently passing on 0.88 with a test key.** Release builds must still be refused with a `pk_test_` key. → Task 4 asserts the refusal.
5. **Task 17's revert leaving the opt-in active.** After the revert, verify-diff over the whole branch must run without the opt-in. → Task 6 checks that the diff of `.claude/agent-gates/verify-diff.sh` against `origin/main` is empty.

---

### Task 1: Bring `main` (with the P1 guard) into the upgrade branch

**Files:** the merge commit only; conflict fixes, if any.

- [ ] **Step 1:** In a worktree on `chore/regroup-rn-upgrade`, run `git -C <wt> fetch origin && git -C <wt> merge origin/main`. Resolve conflicts in favour of 0.88 code paths, keeping the guard files from `main` intact.
- [ ] **Step 2:** Run `cd regroup/mobile && npm ci --ignore-scripts && npx jest`. Expected: PASS, with a test count ≥ the PR's last recorded count plus the P1 tests.
- [ ] **Step 3:** Build and install the signed iOS `E2EEmulator` build (per `maestro/README.md`). Start and seed the emulators (`./scripts/test-prep.sh`), then run `maestro/scripts/run-flows.sh smoke`. Expected: the guard passes and smoke passes.
- [ ] **Step 4:** Push the merge, and note in the PR body under "Merges of main" what came in (the P1 guard and matrix).

### Task 2: iOS parity on 0.88

**Files:** Modify `regroup/mobile/docs/build/react-native-0.88-upgrade.md` §7.2 (results line).

- [ ] **Step 1:** Run `maestro/scripts/run-flows.sh <flow>` for each of the 6 parity flows, re-seeding before each (the default). Expected: 6/6 PASS.
- [ ] **Step 2:** Run `grep -n "optional: true" maestro/flows/{smoke,signup,guest-home,guest-activity-dispute,guest-rent-history,operator-manual-payment}.yaml`. Record each hit in §7.2 as a known weakness, for example `guest-activity-dispute`'s optional long-press (spec §3.5). Parity counts the flow, but the matrix row for that action stays `fail` until P6 strengthens it.
- [ ] **Step 3:** Update §7.2 with the date, commit SHA and result table, and commit with `docs(regroup-mobile): iOS parity run on 0.88 after merging main`.

### Task 3: Android parity on 0.88, and the Android baseline on `main`

**Files:** Modify the decision record (a new "Android baseline (RN 0.72 vs 0.88)" subsection under §7.2) and the PR body.

- [ ] **Step 1: Run the flows on 0.88.**
  - Build: `cd regroup/mobile/android && ./gradlew assembleE2eEmulator`.
  - Install: `adb install -r app/build/outputs/apk/e2eEmulator/app-e2eEmulator.apk`. Confirm the APK path with `ls`.
  - Seed, then run each parity flow with the guard: `npm run maestro:android -- maestro/flows/<flow>.yaml`. If the script doesn't take a single flow, run `node maestro/scripts/e2e-build-guard.js --platform android --app-id com.regroup.app.e2e.emu && maestro test -e APP_ID=com.regroup.app.e2e.emu -e E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" maestro/flows/<flow>.yaml`.
  - Record pass or fail per flow.
- [ ] **Step 2: Run the same 6 flows on `main` (RN 0.72),** in a second worktree off `origin/main`, with the same commands. Uninstall the 0.88 APK first, since both share `com.regroup.app.e2e.emu`. Record pass or fail per flow.
- [ ] **Step 3: Classify each 0.88 failure:**
  - **Upgrade regression** if `main` passes the flow. It goes to Task 5.
  - **Baseline** if `main` fails it the same way. It is recorded with the failing step, and its matrix row stays `fail` for P6.
- [ ] **Step 4:** Write the subsection with three columns: flow, `main` result, 0.88 result. Also put the table in the PR body. Commit with `docs(regroup-mobile): Android parity and RN 0.72 baseline`.

### Task 4: Store-build guards on 0.88

- [ ] **Step 1:** Run `cd regroup/mobile && npx jest scripts/release-guard.test.js scripts/release-guard-plist.test.js scripts/check-release-env.test.js scripts/bundled-env.test.js`. Expected: PASS.
- [ ] **Step 2:** Build `E2EEmulator`, `E2EStaging` and `Release` (simulator) with the commands in `scripts/verify-ios-variants.sh`'s header, plus `./gradlew assembleE2eEmulator assembleE2eStaging assembleRelease`. Expected:
  - the e2e variants build;
  - `Release` and `assembleRelease` are **refused** by the release guard while the key is `pk_test_` (decision record §7.2);
  - `scripts/verify-ios-variants.sh -d "$DD" -l "$LOGS" E2EEmulator E2EStaging` and `scripts/verify-android-variants.sh e2eEmulator e2eStaging` pass every assertion.

  `E2EStaging` needs `~/.config/regroup-e2e/GoogleService-Info.e2e-staging.plist` and `google-services.e2e-staging.json`, which exist (spec §3.5).

- [ ] **Step 3:** Record the results in decision record §7.1 or §7.2, with the date and SHA.

### Task 5: Fix upgrade regressions found in Task 3 (only if any)

**Files:** per regression, in `regroup/mobile/src/**` or the native projects. This task is empty if Task 3 found none.

For each regression:

- [ ] **Step 1:** Write a failing Jest test that reproduces it where the fault is in JS. Where it is native-only, the failing Maestro flow is the test.
- [ ] **Step 2:** Fix it minimally, in the spirit of the decision record. Add a dated entry to the decision record under §6 naming the cause.
- [ ] **Step 3:** Re-run the flow on Android **and** iOS. Expected: PASS on both.
- [ ] **Step 4:** Commit with `fix(regroup-mobile): <regression> on RN 0.88`.

### Task 6: Owner device pass, then Task 17

- [ ] **Step 1 (owner):** Run decision record §7.3 on real devices, and record each item pass/fail with the date in §7.3. A failure the upgrade caused goes back to Task 5. One `main` shows too is recorded for P5 or P6.

  **Skip for now:** "Store `Release` builds with the live key". It needs the live publishable key, so it moves to the production device pass in P9 (spec §4.3). Record it as moved, not failed.

- [ ] **Step 2:** Revert the temporary opt-in: `git -C <wt> revert --no-edit 335906e1`.
  - Then run `git -C <wt> diff origin/main -- .claude/agent-gates/verify-diff.sh`. Expected: empty.
  - Commit: `chore(platform): revert the temporary approved-snapshot opt-in (Task 17)`.
- [ ] **Step 3:** Run the whole-branch gate: `.claude/agent-gates/verify-diff.sh origin/main`.
  - Expected: it fails only on the 3 owner-approved icon snapshots (spec §3.1), and no other violation.
  - Paste the output in the PR body under "Test changes", listing each intended test change.
- [ ] **Step 4:** Address the 4 open pr-review findings from the github-actions review of 2026-10-30, fixing or answering each in the PR. Then request the final review (`/code-review` or the pr-review job).
- [ ] **Step 5 (owner):**
  - apply `test-change-approved`;
  - mark the PR ready;
  - squash-merge.
- [ ] **Step 6:** Mark the spec's §5 step 2 done with the merge SHA and date, and §3.1 likewise, both in the next PR on `main`.

**Done when:** #160 is squash-merged, with the iOS and Android parity tables, the Android baseline, the device pass and the whole-branch gate output recorded in the PR and in the decision record.
