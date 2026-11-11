# Regroup Portal P6: Disputes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that every dispute write the portal can make (raise, approve, reject, undo) is the phone's own write. Each must pass or be refused by the real rules exactly as the rules tests say, for every role. No dispute path may touch money.

**Architecture:** The portal already routes the phone's `Disputes` screen and `ActivityScreen` and bundles the phone's services unchanged. The work is evidence, not new screens:

- An e2e-only probe drives the phone's `disputeActivity`, `resolveDispute` and `reopenDispute` through the portal's Firebase adapter as each role. A parity suite then checks the results against the rules-test matrix.
- Browser journeys cover the paths an operator clicks.

Portal code changes are limited to the test hook and the e2e fixtures.

**Tech Stack:** React 19, react-native-web 0.21, esbuild, Playwright on the Firebase emulators (offset ports: firestore 18080, auth 19099, functions 15001, storage 19199, hub 14400, logging 14500, portal 5199), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md` (§2 anti-goals, §5 "Disputes" row, §7 "Disputes", §8 slice 6, §9 tests). The dispute specification itself is `regroup/CLAUDE.md`, "Activity disputes".

## Global Constraints

- "Clients write only the activity, and the server maintains everything else. Reuse the phone's hook and service, and never reconstruct the write. Prove the portal against the rules tests and the emulator, including refusals." (§7)
- "A portal write must match the phone app's write exactly. Disputes are the strictest case." (§2)
- **Disputes never affect money or payments in any way** (owner, 2026-11-10). No dispute action may change any guest's `rentOwed` or `choreFees`, or any `payments` doc.
- Owners, managers and peer leaders may approve, reject and undo. Nobody decides, reopens or raises a dispute on an activity they did (`residentUid`, the guest doc's account, or `loggedBy`).
- No rules change, and no edit to `regroup/mobile/src` or `regroup/functions`. If a journey exposes a phone or server defect, stop and bring it to the owner. Until a fix lands, the test is marked `test.fail` with the issue link.
- No deploys. Don't touch phoenix-cleanhouse or regroup-e2e. Use only the offset emulator ports, and never kill or reuse the default ones.
- New files must be 300 lines or fewer. Commit scope is `regroup-portal`. Use `git -C`, never `cd && git`. Never `--no-verify`. Commit and push only when the owner asks; commits are local to this plan.
- No resident names, contact details or recovery information in logs or test output beyond the seed's fixed test names.

## Review Focus

1. **A refusal shows its own message.** The phone tells refusals apart by `error.code === 'firestore/permission-denied'`, which the portal's adapter must produce, inside transactions too. If it doesn't, an operator sees "Approval not saved" for a dispute they may not decide. The pins are Task 1's exact-message rows and Task 3's exact alert title.
2. **Two operators decide the same dispute.** The second gets "Another admin has already resolved this dispute.", the first decision stands, and one decision is logged. Pinned by Task 3, `a second operator deciding a stale dispute is told it's resolved`.
3. **Undo straight after a decision.** The rules refuse a reopen until the server has logged the decision. The operator gets the "wait a moment" refusal, and the undo works once the decision is logged. Pinned by Task 1, `undo before the decision is logged is refused, then accepted`.
4. **An operator who is the resident or the logger.** They are offered no decision buttons, and if forced, the rules refuse them. Pinned by Task 1's owner-rule rows and Task 3, `a manager who is the resident sees no decision buttons`.
5. **Decisions from older phone builds.** A legacy "delete" (deleted, `disputeResolvedAt == loggedAt`) and a legacy "keep" (resolved with no outcome fields) must still show UNDO DECISION and reopen. Pinned by Task 3, `legacy decisions can be undone`.

Not covered, by decision:

- The "Couldn't load disputes" state. The emulator can't fail one listener without failing them all.
- Open disputes older than the previous week. See Owner question Q1.

## Owner question (ask at handoff, before Task 4's filing step)

**Q1.** The Disputes screen lists only the current and previous week (phone behaviour, `Disputes.tsx` `previousWeekStart`). The open-dispute counts on the home table, the house summary and the resident record come from the server's `house-disputes/{houseId}`, which keeps a dispute until it is decided. So an open dispute older than two weeks is counted, but appears in no list and can't be decided on the portal or the phone.

Recommended: file it as a phone issue, with no portal change in P6.

## Files

- Modify: `regroup/portal/src/app/test-hooks.ts`, adding `disputes` to `window.__portalTest`. The file is e2e-only; `check-bundle` already refuses it in normal builds.
- Create: `regroup/portal/e2e/dispute-fixtures.ts`, the dispute test data and probes.
- Create: `regroup/portal/e2e/dispute-rules.spec.ts` (Task 1), `dispute-raise.spec.ts` (Task 2), `dispute-roles.spec.ts` (Task 3) and `dispute-money.spec.ts` (Task 4).
- Modify: `regroup/portal/e2e/disputes.spec.ts`. Its `moveOffUtcSunday` moves to the fixtures, and its refusal test asserts the exact alert.
- Modify: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md` (P6 Done), plus the ledger.

---

### Task 0: Integration branch and rules baseline

**Files:** none in git; a local branch only.

- [ ] **Step 1:** Create `p6-integration` from `p5-integration`, then merge in `feat/regroup-operator-portal` (it is ahead only by docs):
      `git -C ~/dev/rp-regroup-portal switch -c p6-integration p5-integration && git -C ~/dev/rp-regroup-portal merge --no-edit feat/regroup-operator-portal`
      Expected: a clean merge. `git -C ~/dev/rp-regroup-portal diff feat/regroup-operator-portal p6-integration --stat -- regroup/portal docs` is empty.
- [ ] **Step 2:** Confirm the rules under test are the launch-fix rules:
      `git -C ~/dev/rp-regroup-portal diff p6-integration fix/regroup-launch-access -- regroup/mobile/firebase/firestore.rules | wc -l`
      Expected: `0`. If not, ledger the difference and use the integration branch's rules as the ones under test.
- [ ] **Step 3:** Run the rules suites:
      `scratchpad/rules-lf/run.sh firestore "dispute ownActivityDispute peerDispute noDeleteAfterDispute activityIntegrity activities"`
      Expected: all pass. Ledger the count. This is the matrix Task 1 mirrors.
- [ ] **Step 4:** Baseline the current dispute journeys:
      `scratchpad/e2e-run.sh e2e/disputes.spec.ts e2e/activities.spec.ts`
      Expected: all pass.

All later work is committed on `p6-integration` and cherry-picked onto `feat/regroup-operator-portal`, as in P5. At the end, the `regroup/portal` and `docs` trees must be identical on both branches.

### Task 1: Rules parity suite through the portal

**Files:**

- Modify: `regroup/portal/src/app/test-hooks.ts`
- Create: `regroup/portal/e2e/dispute-fixtures.ts`
- Create: `regroup/portal/e2e/dispute-rules.spec.ts`
- Modify: `regroup/portal/e2e/disputes.spec.ts` (import `moveOffUtcSunday` from the fixtures)

**Interfaces:**

- Produces, in `test-hooks.ts`:
  ```ts
  type ProbeResult = { ok: true } | { ok: false; message: string; code?: string };
  __portalTest.disputes: {
    raise(activityId: string, reason: string): Promise<ProbeResult>;
    decide(activityId: string, outcome: 'approve' | 'reject'): Promise<ProbeResult>;
    reopen(activityId: string): Promise<ProbeResult>;
    decideThenReopen(activityId: string): Promise<[ProbeResult, ProbeResult]>; // back to back, no wait
  }
  ```
  Each method calls the phone's own function unchanged: `disputeActivity(id, reason, uid)` and `resolveDispute(id, uid, outcome)` from `@mobile/services/activity`, and `reopenDispute(id, uid)` from `@mobile/services/reopenDispute`. `uid` is `store.getState().user.user.id`, the value the phone's hook passes. `message` is `error.message`, and `code` is `error.code ?? error.cause?.code`.
- Produces, in `dispute-fixtures.ts`:
  - `DISPUTED = 'test-activity-123'`: the seed's activity, guest-a's chore, disputed by guest-b.
  - `ACTIVE = 'test-activity-b1'`: guest-b's active chore.
  - `OP_LOGGED = 'p6-operator-logged'`: guest-b's chore with `loggedBy: 'e2e-manager'`, disputed by `e2e-guest-a`.
  - `OP_LOGGED_ACTIVE = 'p6-operator-logged-active'`: the same, still active.
  - `putActivity(id: string, fields: object): Promise<void>`: copies the seed's `test-activity-b1` doc, applies `fields`, and moves the timestamp off a UTC Sunday.
  - `moveOffUtcSunday(id: string): Promise<void>`.
  - `activityData(id: string): Promise<DocumentData>`.
  - `decisionIds(id: string, sinceMs: number): Promise<string[]>`: as in `disputes.spec.ts`, filtered by the time in the id.
  - `probe(page: Page, op: 'raise' | 'decide' | 'reopen' | 'decideThenReopen', ...args): Promise<ProbeResult | ProbeResult[]>`: waits for `__portalTest.uid()`, then evaluates.
  - `moneySnapshot(houseId = 'test-house-123'): Promise<{ guests: Record<string, { rentOwed?: number; choreFees?: number }>; payments: Record<string, DocumentData> }>`.

- [ ] **Step 1: Write `dispute-rules.spec.ts`**

  Each row runs on a fresh `reseed()`. It signs in the named actor, calls the probe, and asserts the result. On a refusal it also asserts that `activityData(id)` deep-equals the snapshot taken just before the call, and that `decisionIds(id, startedAt)` is unchanged.

  | Test                                                           | Actor (how)                                                                             | Call                                                                                       | Expected                                                                                                                                                                      |
  | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `the owner decides another resident's dispute`                 | `signInAs(page, 'manager')` (superAdmin, uid `e2e-manager`)                             | `decide(DISPUTED, 'approve')`                                                              | `{ ok: true }`; the doc matches `disputes.spec.ts`'s approve shape with `disputeResolvedBy: 'e2e-manager'`                                                                    |
  | `an invited manager rejects`                                   | `addInvitedManager(browser)`, then `signInAsRaw` with its email                         | `decide(DISPUTED, 'reject')`                                                               | ok; `disputeResolvedBy` = the invited uid                                                                                                                                     |
  | `a peer leader approves`                                       | `makePeerLeader('manager')`, then `signInAs(page, 'manager')`                           | `decide(DISPUTED, 'approve')`                                                              | ok                                                                                                                                                                            |
  | `the logger may not decide`                                    | owner                                                                                   | `decide(OP_LOGGED, 'approve')`                                                             | `{ ok: false, message: 'Not allowed to decide this dispute' }`                                                                                                                |
  | `another admin decides what the owner logged`                  | invited manager                                                                         | `decide(OP_LOGGED, 'approve')`                                                             | ok                                                                                                                                                                            |
  | `a manager who is the resident may not decide`                 | `makeResidentAManager('e2e-guest-a')`, `signInAsRaw(page, 'test-guest-a@rats-e2e.com')` | `decide(DISPUTED, 'reject')`                                                               | `Not allowed to decide this dispute`                                                                                                                                          |
  | `an admin of another house may not decide`                     | `signInAs(page, 'oxford-operator')`                                                     | `decide(DISPUTED, 'approve')`                                                              | `Not allowed to decide this dispute`                                                                                                                                          |
  | `a decided dispute can't be decided again`                     | owner, after an approve                                                                 | `decide(DISPUTED, 'reject')`                                                               | `Dispute already resolved`; still `disputed: 'successful'`                                                                                                                    |
  | `an undisputed activity can't be decided`                      | owner                                                                                   | `decide(ACTIVE, 'approve')`                                                                | `Activity is not disputed`                                                                                                                                                    |
  | `undo before the decision is logged is refused, then accepted` | owner                                                                                   | `decideThenReopen(DISPUTED)`, then poll `decisionIds` to length 1, then `reopen(DISPUTED)` | `[{ ok: true }, { ok: false, message: 'Not allowed to undo this decision' }]`, then ok; the doc then matches `disputes.spec.ts`'s undo shape with `reopenedBy: 'e2e-manager'` |
  | `a second undo is refused`                                     | owner, after the accepted undo                                                          | `reopen(DISPUTED)`                                                                         | `Dispute already reopened`                                                                                                                                                    |
  | `nothing to undo on an active activity`                        | owner                                                                                   | `reopen(ACTIVE)`                                                                           | `No decision to undo`                                                                                                                                                         |
  | `the logger may not undo`                                      | the invited manager decides `OP_LOGGED` and the log lands; then the owner               | `reopen(OP_LOGGED)`                                                                        | `Not allowed to undo this decision`                                                                                                                                           |
  | `an operator raises a dispute on someone else's activity`      | owner                                                                                   | `raise(ACTIVE, 'Not done')`                                                                | ok; `status: 'disputed'`, `disputeReason: 'Not done'`, `disputedBy` and `disputeResolvedBy` both `'e2e-manager'`, `disputedAt` set, `loggedAt` equal to before                |
  | `the logger may not raise a dispute`                           | owner                                                                                   | `raise(OP_LOGGED_ACTIVE, 'x')`                                                             | `ok: false`, and the doc unchanged                                                                                                                                            |
  | `a disputed activity can't be disputed again`                  | invited manager                                                                         | `raise(DISPUTED, 'x')`                                                                     | `ok: false`, and the doc unchanged                                                                                                                                            |

  Put rows in separate tests named as above; no loops over a table. That way one failing row names itself.

- [ ] **Step 2: Run it before the hook exists**
      Run: `scratchpad/e2e-run.sh e2e/dispute-rules.spec.ts`
      Expected: FAIL. Every row errors on `__portalTest.disputes` being undefined.
- [ ] **Step 3: Add `disputes` to `test-hooks.ts`, and write `dispute-fixtures.ts`**, both per the Interfaces block.
- [ ] **Step 4: Run it**
      Run: `scratchpad/e2e-run.sh e2e/dispute-rules.spec.ts e2e/disputes.spec.ts`
      Expected: all pass. A row that fails because the phone or server behaves differently from `regroup/CLAUDE.md` is a finding: stop and take it to the owner (Global Constraints). A wrong expectation in this plan gets a ledgered ruling.
- [ ] **Step 5: Prove the suite can fail**
      Temporarily make `decide` pass `'someone-else'` as the uid. Expected: the three "decides/rejects/approves" rows fail as refusals. Revert, and ledger the result.
- [ ] **Step 6: Run the unit and bundle gates**
      Run: `(cd ~/dev/rp-regroup-portal/regroup/portal && npm test && npm run typecheck && npm run build && node tools/check-bundle.mjs)`
      Expected: pass, and the normal build contains 0 test hooks.
- [ ] **Step 7: Commit** on `p6-integration`:
      `test(regroup-portal): dispute writes through the portal against the rules`

### Task 2: Raising a dispute from the portal

**Files:**

- Create: `regroup/portal/e2e/dispute-raise.spec.ts`

**Interfaces:**

- Consumes: from Task 1, `ACTIVE`, `OP_LOGGED_ACTIVE`, `putActivity`, `activityData`, `moveOffUtcSunday`.

Background: `ActivityScreen` shows staff a DISPUTE button (`dispute-activity-button-<id>`) on an active, disputable activity that isn't their own. It opens the phone's dispute modal, and on submit `handleDisputeSubmission` calls `disputeActivity`.

- [ ] **Step 1: Write the tests.** All run as the owner, on guest-b's chores page `/houses/test-house-123/residents/guest-b/chores`.
  - `an operator disputes a resident's chore`: click `dispute-activity-button-test-activity-b1`, type `Kitchen not cleaned` into the modal's reason field, and submit. Expected:
    - the success notice "Successfully disputed activity" shows;
    - `activityData(ACTIVE)` has `status: 'disputed'`, `disputeReason: 'Kitchen not cleaned'`, and `disputedBy` and `disputeResolvedBy` both `'e2e-manager'`, with `loggedAt` unchanged;
    - `house-disputes/test-house-123` gains an entry for `test-activity-b1` (poll up to 15 s; that's the server mirror);
    - on the Disputes tab, `resolve-dispute-button-test-activity-b1` is visible;
    - the house summary's Open disputes figure is 2.
  - `an empty reason saves nothing`: open the modal and submit with no text. Expected: the modal stays open or shows its validation error, and `activityData(ACTIVE).status` is still `'active'`.
  - `an operator gets no DISPUTE on an activity they logged`: `putActivity(OP_LOGGED_ACTIVE, …)`, open the page, wait for `dispute-activity-button-test-activity-b1` to be visible as the control, then expect `dispute-activity-button-p6-operator-logged-active` to have count 0.
  - `a refused dispute says so and saves nothing`: open the modal, call `revokeClaimsAndRefresh(page, 'manager')`, and submit. Expected: the alert "Dispute not saved" is visible, and the status is still `'active'`.
- [ ] **Step 2: Run them**
      Run: `scratchpad/e2e-run.sh e2e/dispute-raise.spec.ts`
      Expected: pass. These are proof tests of reused code, so passing first time is expected; ledger it. A failure is either a web defect in the reused modal or a phone defect, and goes through the same finding rule as Task 1.
- [ ] **Step 3: Prove the suite can fail.** Change the expected `disputedBy` to `'e2e-guest-b'`, see the test fail, then revert.
- [ ] **Step 4: Commit:** `test(regroup-portal): raising a dispute from the portal`

### Task 3: Deciding by role, stale screens and legacy decisions

**Files:**

- Create: `regroup/portal/e2e/dispute-roles.spec.ts`
- Modify: `regroup/portal/e2e/disputes.spec.ts` (the refusal test)

**Interfaces:**

- Consumes: from Task 1, `DISPUTED`, `putActivity`, `activityData`, `decisionIds`, `probe`. From `fixtures.ts`: `makePeerLeader`, `addInvitedManager`, `makeResidentAManager`.

- [ ] **Step 1: Write the tests**
  - `a peer leader approves from the Disputes tab`: `makePeerLeader('manager')`, open the Disputes tab, click APPROVE and confirm. Expected: UNDO DECISION shows, and the doc has `disputed: 'successful'` and `disputeResolvedBy: 'e2e-manager'`.
  - `an invited manager rejects and undoes`: as the invited manager, REJECT, confirm, wait for the decision log, then UNDO DECISION and confirm. Expected: APPROVE shows again, and `reopenedBy` is the invited uid.
  - `a manager who is the resident sees no decision buttons`: `makeResidentAManager('e2e-guest-a')`, sign in as `test-guest-a@rats-e2e.com`, and open the Disputes tab. Expected: the row for `test-activity-123` is visible (find it by the text `Kitchen was not cleaned.`), and `resolve-dispute-button-test-activity-123` and `reject-dispute-button-test-activity-123` have count 0.
  - `a second operator deciding a stale dispute is told it's resolved`: page A (the owner) opens the Disputes tab. Page B, a second context as the invited manager, runs `probe(pageB, 'decide', DISPUTED, 'reject')`. Then page A clicks APPROVE and confirms. Expected:
    - page A shows the alert "Dispute already resolved" with "Another admin has already resolved this dispute.";
    - the doc keeps `disputed: 'rejected'` and B's uid;
    - after 15 s, `decisionIds` has length 1.
  - `legacy decisions can be undone`, two tests:
    - legacy delete: `putActivity('p6-legacy-delete', …)` with the "delete" shape `isLegacyUpheld` accepts (read `regroup/mobile/src/entities/ActivityModel.ts`);
    - legacy keep: `putActivity('p6-legacy-keep', …)` as `status: 'resolved'` with `disputeResolvedBy` and `disputeResolvedAt` set and no `disputed`, `incomplete`, `disputeResult` or `disputeOutcome`.

    For each: wait until the server has logged the decision (`decisionIds` length ≥ 1, 15 s). If the server never logs a legacy decision, that is a finding (Task 1's rule). Then open the Disputes tab, click `undo-dispute-decision-button-<id>`, and confirm. Expected: `resolve-dispute-button-<id>` shows, and the doc has `status: 'disputed'`.

  - `the open-dispute count follows decisions`: approve on the Disputes tab, then open the Summary tab. Expected: Open disputes is `0` (poll 15 s). Wait for the decision log, then UNDO DECISION, then Summary again. Expected: `1`.
  - `search finds a dispute by its reason`: type `Kitchen` in "Search disputes...". Expected: the `test-activity-123` row is visible. Type `zzzz`. Expected: it is gone. Then open filters (the button beside the search box). Expected: the phone's `ActivityFilterForm` opens in the portal's modal and closes again without writing anything.
- [ ] **Step 2: Make the existing refusal test strict.** In `disputes.spec.ts`, `a decision the rules refuse shows an error and changes nothing` now expects the prompt to contain `Can't decide this dispute`, not only "not 'Approve dispute?'".
- [ ] **Step 3: Run them**
      Run: `scratchpad/e2e-run.sh e2e/dispute-roles.spec.ts e2e/disputes.spec.ts`
      Expected: pass, with the finding rule for anything that doesn't.
- [ ] **Step 4: Prove the suite can fail.** In the stale-screen test, expect `disputed: 'successful'`, see it fail, then revert.
- [ ] **Step 5: Commit:** `test(regroup-portal): dispute decisions by role, stale screens and old builds`

### Task 4: Money stays untouched, full run, roadmap

**Files:**

- Create: `regroup/portal/e2e/dispute-money.spec.ts`
- Modify: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md`

**Interfaces:**

- Consumes: from Task 1, `moneySnapshot`, `probe`, `decisionIds`, `ACTIVE` and `DISPUTED`.

- [ ] **Step 1: Write `disputes never change money`.** It runs as the owner:
  1. Take `before = moneySnapshot()`.
  2. `raise(ACTIVE)`, then `decide(ACTIVE, 'approve')`.
  3. Wait for the log, then `reopen(ACTIVE)`, then `decide(ACTIVE, 'reject')`.
  4. `decide(DISPUTED, 'approve')`.
  5. Wait until `decisionIds` for both activities have stopped growing for 5 s, so the server's dispute triggers have run.

  Expected: `moneySnapshot()` deep-equals `before`. The seed's 3 payments and both guests' `rentOwed` and `choreFees` are all unchanged.

- [ ] **Step 2: Write `the payments page reads the same after a decision`.** It runs as the owner:
  1. Open Payments and read the Collected and Outstanding figures.
  2. Approve `DISPUTED` on the Disputes tab.
  3. Return to Payments.

  Expected: the same two figures.

- [ ] **Step 3: Run them**
      Run: `scratchpad/e2e-run.sh e2e/dispute-money.spec.ts`
      Expected: pass. A change in money is a stop: take it to the owner.
- [ ] **Step 4: Prove the money test can fail.** Have the test itself add 1 cent to guest-a's `choreFees` between the snapshots, see it fail, then remove that line.
- [ ] **Step 5: Full run on a fresh clone.** Copy `scratchpad/fresh-p4.sh` with `sed 's/fresh-p4/fresh-p6/g'`, pointing at `p6-integration`, and run it.
      Expected: unit, typecheck, build, check-bundle (0 hooks in the normal build) and the whole e2e suite all pass. Ledger the counts (P5 ended at 190 unit and 191 e2e).
- [ ] **Step 6: Update the roadmap.**
  - Row P6 becomes `Done (lands after #231, #232, #233)`.
  - Notes gain: "P6: disputes are proven through the phone's services against the rules, for every role; Q1 (open disputes older than the previous week) went to the owner."
- [ ] **Step 7: Commit:** `test(regroup-portal): disputes never change money` and `docs(regroup-portal): P6 done`. Then cherry-pick every P6 commit onto `feat/regroup-operator-portal`. Expected: `git -C ~/dev/rp-regroup-portal diff feat/regroup-operator-portal p6-integration -- regroup/portal docs` is empty.
- [ ] **Step 8: Q1.** With the owner's answer, file the phone issue if they agree. Ledger the issue number. Nothing is pushed until the owner says so.

### Final review

A fresh reviewer on the most capable model reviews the P6 branch range against this plan, the spec and `regroup/CLAUDE.md` "Activity disputes", with the Review Focus list verbatim. P6 changes no money code, so no separate money review is needed. The money test is the evidence, and the reviewer checks that test can't pass vacuously.
