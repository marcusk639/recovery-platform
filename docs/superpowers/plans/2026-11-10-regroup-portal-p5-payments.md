# Regroup Operator Portal P5: Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operators do their payment desk work in the portal on the fixed phone screens: house and resident payment history, balances and aging, recording a manual payment, and CSV export. The numbers match the phone's.

**Architecture:** The portal reuses `PaymentDashboard`, `BalanceDashboard` and `PaymentHistory` from `regroup/mobile/src` as they are after the launch fixes (#231, #232, #233). P5 adds only portal code:

- a browser-download replacement for React Native's `Share`;
- a Balances tab;
- browser journeys run against the emulators and the real rules.

The phone fixes stay in their own PRs. P5 commits go to #210, as P1 to P4 did. They're tested on a local integration branch: #210 plus the three fix branches, merged. The portal has to pass against the code that will ship.

**Tech Stack:** React 19, react-native-web 0.21, esbuild, and Vitest and Playwright in `regroup/portal`. Emulators run under `demo-regroup-e2e` on the offset ports: firestore 18080, auth 19099, functions 15001, storage 19199.

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md`:

- §5: the Payments row, and the role rules from 2026-11-09.
- §7: Money, Alert, and "file actions need browser downloads".
- §8.5.

The roadmap's notes for P5 add two things:

- Decide what a direct `/payments` URL does for a peer leader.
- Check a real invited manager against `listHousePayments`.

## Global Constraints

- Everything from P1 to P4 still holds:
  - No deploys.
  - Never touch `phoenix-cleanhouse` or `regroup-e2e`.
  - Emulators only on the offset ports. Never kill or reuse emulators on the default ports.
  - Never `--no-verify`.
  - New files are 300 lines or fewer.
  - The commit scope is `regroup-portal`.
- Don't edit `regroup/mobile/src` or `regroup/functions` from P5. A phone or server defect gets filed, or fixed in the launch-fix PR it belongs to, after the owner agrees.
- Peer leaders see no house money totals, no Balance column, and no Payments or Balances, by URL or otherwise. They may open a resident's payment history, as on the phone.
- Disputes never affect money (owner, 2026-11-10). Stripe chargebacks keep their current behaviour.
- Money is integer cents end to end. A number is never shown as $0.00 while it's loading or after an error.
- The house sections stay a tab strip (owner, 2026-11-09). Balances is a tab (owner, 2026-11-10).

## Review Focus

1. **A real invited manager opens Payments.** This is a manager made by the invitation callables, not the seeded owner. Every figure loads, or a refusal shows as one. Covered in Task 1.
2. **CSV export on a desktop browser.** A file downloads with the same rows as the phone. Other `Share` callers get a sensible file, not a broken one. Covered in Task 3.
3. **A peer leader types `/payments` or `/payments/balances`.** They see the "managers and owners only" message. The payment screens never mount, and no payment callable is called. Covered in Task 4.
4. **A manual payment recorded in the portal reads the same on the phone's screens.** That means the same amount, the same balance change and the same description. Covered in Task 2.
5. **A refunded payment, a non-dollar record, a resident in credit, and a refused write that's then retried.** These match the phone's definitions and record exactly once. Covered in Task 2.

---

### Task 0: Integration branch and baseline

**Files:** none are committed. This task builds the local branch `p5-integration` and records a baseline in the ledger.

- [ ] **Step 1:** Create `p5-integration` from `feat/regroup-operator-portal`. Merge `fix/regroup-launch-screens`, `fix/regroup-launch-access` and `fix/regroup-launch-money`, in that order.
  - Expected: no conflicts. The three merge cleanly with each other. #210's cherry-picked staffNotes rule (#211) and #232's rules are in different blocks.
  - If there is a conflict, resolve it on `p5-integration` only and record it.
- [ ] **Step 2:** Install, then run the whole portal suite: unit tests, typecheck, production build, `check-bundle`, and every browser spec (`e2e-run.sh`).
- [ ] **Step 3:** Compare the result with P4's last run: 181 unit tests, 177 browser tests, 7 expected failures. For each test that changed:
  - **Expected:** the 6 payment tests and the intake double-submit test now pass. The `test.fail()` markers on them now show as "unexpectedly passed".
  - **Caused by a fix PR** (for example, the drug test history route now needs `houseId`; the document records lose `storageUrl`; admin removal now goes through the callable): record which PR and what the portal must change. It's fixed in the task that owns that area, or in a Task 0 Step 4 commit if it's portal glue.
  - **Unexplained:** stop and debug before Task 1.
- [ ] **Step 4:** Commit only the portal changes needed for the integration branch to run the same as before. Use the message `fix(regroup-portal): run against the launch-fix phone code`, and list each change in the body. Expected: the baseline is green, apart from the now-passing `test.fail()` markers.

### Task 1: Can a real invited manager use the payment callables?

`isHouseAdmin` (`regroup/functions/src/util/houseAuth.ts`) compares the caller's uid with `adminId`, `adminIds`, `superAdminIds` and `ownerId`. `adminIds` and `superAdminIds` hold admins doc ids, and invitations don't add to them. The e2e seed puts the owner's uid in `adminIds` and `ownerId`, and `makeManager` promotes that same owner account. So every payment test so far has passed through `ownerId`.

**Files:**

- `regroup/portal/e2e/fixtures.ts`: add `addInvitedManager()`.
- `regroup/portal/e2e/payments-roles.spec.ts`: new.

**Interfaces:** `addInvitedManager(houseId = 'test-house-123'): Promise<{ email: string; password: string; uid: string }>`. It creates a new Auth user, then runs the real `createInvitation` callable as the seeded owner and `redeemInvitation` as the new user, on the functions emulator. That gives the user the claims, house-roles record and admins doc that an invitation produces, and nothing more.

- [ ] **Step 1:** Write the journey `an invited manager's payment views`:
  - **Precondition:** read `houses/test-house-123`. Expect the manager's uid not to be in `ownerId`, `adminIds` or `superAdminIds`, and `house-roles/test-house-123_<uid>.tier` to be `manager`.
  - Sign in as the manager and open Payments. Expect `payment-stats-card` to show and "Failed to load payment data." to be absent.
  - As the manager, call `listHousePayments` through `__portalTest.callable({ houseId: 'test-house-123', limit: 100 })`. Record whether it returns data or `permission-denied`. This is the question the task answers.
  - Expect no error or alert dialog on the page, whatever the callable returned. The failed-payment banner may be empty, but the screen must not break.
- [ ] **Step 2:** Run it on `p5-integration`: `e2e-run.sh payments-roles`.
- [ ] **Step 3:** If the callable returns `permission-denied`, **stop and bring it to the owner** (see "Decisions this plan may need"). Write the result into the spec as an explicit assertion, `expect(code).toBe('permission-denied')`, with a comment naming the issue. That pins the finding until the owner decides and the server PR lands.
- [ ] **Step 4:** Commit `test(regroup-portal): payment views for a real invited manager`.

### Task 2: The payment journeys on the fixed screens

**Files:** `regroup/portal/e2e/payments.spec.ts` (rewritten), and `e2e/fixtures.ts` (`addPaymentRecord`).

**Interfaces:** `addPaymentRecord(fields: { id: string; guestId: string; amount?: number; status: string; createdAt?: string; refundedAmountCents?: number; amountMinorUnits?: number; description?: string; currency?: string })`. It writes `payments/{id}` with the Admin SDK, using `houseId: 'test-house-123'` and the guest's `guestUserId`.

- [ ] **Step 1:** Restructure the spec.
  - Only the tests that call the Stripe callable require `E2E_STRIPE_ACCOUNT_ID`. Move that requirement out of the shared `beforeEach` into those tests, so the Firestore-only journeys run anywhere.
  - Drop `Collected shows the real callable's dollars`. The dashboard no longer reads the callable.
  - Remove `test.fail()` from the tests the phone fixes now pass:
    - the three typed amounts;
    - double-clicking RECORD;
    - "a manual payment appears in the dashboard";
    - "Outstanding counts rent that is overdue".
- [ ] **Step 2:** Add the journeys:
  - **`Collected is the house's payment records, net of refunds`.** Seed:
    - a $200 manual record;
    - a $100 succeeded record refunded by $40;
    - a $500 failed record;
    - a succeeded record with `amountMinorUnits: 900`, `currency: 'eur'` and no `amount`.

    On All Time, expect Collected `$260.00`, and the page never to contain `NaN`.

  - **`Outstanding is what current residents owe`.**
    - Seed the residents' balances: 15000, 0, a 5000 credit, and a discharged resident owing 9000.
    - Expect Outstanding `$150.00`.
    - Expect the collection rate not to read `100%`.
  - **`a stale pending record shows the stale-payments banner`.** A pending record created 2 days ago shows `stale-pending-banner`. The dashboard derives it from the Firestore records.
  - **`a payment recorded here reads the same on the resident's record and history`.**
    - Record $50 for guest-a.
    - The resident record shows Rent owed `$100.00`.
    - Their Payment history lists `$50.00` with `Manual Payment — Cash`.
    - The dashboard's `payment-row-<id>` names the resident.
  - **`a refused write, then a retry, records once with the same id`.**
    - Open the modal and fill in $50 for guest-a.
    - Save and then delete `guests/guest-a`, so the batch's balance write fails.
    - Press RECORD. Expect the "Failed to record payment" dialog, and dismiss it.
    - Restore the guest doc and press RECORD again.
    - Expect exactly one `payments` doc for guest-a at 5000 cents, and `rentOwed` lowered once.
- [ ] **Step 3:** Run `e2e-run.sh payments` on `p5-integration`. Expected: all pass.
- [ ] **Step 4:** Commit `test(regroup-portal): payment journeys on the fixed phone screens`.

### Task 3: `Share` downloads a file in the browser

React Native's `Share` becomes `navigator.share` on react-native-web. Most desktop browsers lack it, so "Export CSV" on the dashboard and in Payment history fails silently today. The phone also calls `Share.share` from:

- `GuestHome`;
- `services/receiptService.ts`;
- `services/treasuryReport.ts`;
- `components/SimpleDebugLogViewer.tsx`.

So the replacement must also do something sensible for text that isn't CSV.

**Files:**

- Create: `regroup/portal/src/adapter/share.ts`.
- Modify: `regroup/portal/src/adapter/react-native.ts`, to re-export `Share` from it. Also `tools/replacements.mjs` if the replacement list needs an entry.
- Tests: `regroup/portal/tests/share.test.ts` and `e2e/payments-export.spec.ts`.

**Interfaces:**

- `Share.share({ message, title?, url? }): Promise<{ action: 'sharedAction' }>`. It always downloads `message` as a file. A desktop `navigator.share` opens an OS sheet, not a file, so it isn't used.
- The file name comes from the title:
  - If the title ends in an extension, use it as is.
  - Otherwise, slug the title (lower case, hyphens) and add `.csv` when the message looks like CSV, or `.txt` when it doesn't.
  - The message looks like CSV when it has at least two lines and every line has the same number of commas, at least one.
  - With no title, the name is `export`.

- [ ] **Step 1:** Write the unit tests:
  - `{ message: 'a,b\n1,2', title: 'payments-2026-11-10.csv' }` downloads `payments-2026-11-10.csv` with exactly that text.
  - `title: 'Payment History Export'` with CSV text downloads `payment-history-export.csv`.
  - `title: 'Receipt'` with prose downloads `receipt.txt`.
  - No title downloads `export.txt` (or `export.csv` for CSV text).
  - Every case resolves `{ action: 'sharedAction' }` and revokes the object URL.
- [ ] **Step 2:** Run `npx vitest run tests/share.test.ts`. Expected: FAIL, because the module doesn't exist.
- [ ] **Step 3:** Implement it with `Blob`, `URL.createObjectURL`, a temporary anchor with `download`, then `revokeObjectURL`.
- [ ] **Step 4:** Add the journeys:
  - **`the dashboard's CSV export downloads the period's rows`.** Use Playwright `waitForEvent('download')`. Expect the file name `payments-<today>.csv`, the header `Date,Guest Name,Amount,Status,Type`, and one row per record in the period.
  - **`a resident's payment history exports`.** From the record, open Payment history and export. Expect `payment-history-export.csv` containing the resident's records.
- [ ] **Step 5:** Run the unit tests, the export spec and `check-bundle`. Expected: PASS.
- [ ] **Step 6:** Commit `fix(regroup-portal): Share downloads a file in the browser`.

### Task 4: Balances tab, and what a peer leader gets by URL

`BalanceDashboard` has no link in the phone, but the spec lists it under Payments. It reads the house from `useData().currentHouse`, which the portal's `DataAfterSelection` supplies.

**Files:**

- `regroup/portal/src/app/urls.ts`: a `balances` section, path `houses/:houseId/payments/balances`, label "Balances", route `Routes.BalanceDashboard`, placed right after Payments.
- `src/app/houses/areas.ts`: add `balances` to `FULL_VIEW_SECTIONS`.
- `src/app/HouseTabs.tsx`, if its layout needs it.
- Tests: `tests/urls.test.ts`, `tests/areas.test.ts` and `e2e/payments-roles.spec.ts`.

- [ ] **Step 1:** Write the unit tests:
  - `sectionForRoute(Routes.BalanceDashboard)` is `'balances'`.
  - `pathFor('balances', 'h1')` is `houses/h1/payments/balances`.
  - `sectionsFor(limited)` leaves out `payments` and `balances`.
  - In the tab order, Balances comes right after Payments.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement the section. The route is already registered, and already in `FULL_VIEW_ROUTES`.
- [ ] **Step 4:** Write the journeys:
  - **`Balance Details shows what each resident owes`.**
    - Seed three residents:
      - one owing 15000, who has an earlier $150 succeeded record;
      - one owing 0;
      - one with a 5000 credit.
    - Open the Balances tab. Expect `$150.00` Overdue, `$0.00` Current and `$0.00` Current.
  - **`the Balances tab fits the strip`.** At 1280 px, every tab is visible in one row, with no horizontal scroll. Take a screenshot for the P5 report.
  - **`a peer leader sees no payment money by URL`.**
    - Sign in with `makePeerLeader('manager')` set up as in P3.
    - Visit `/houses/<id>/payments`, then `/houses/<id>/payments/balances`. Each shows the full-view message.
    - Neither the Payments nor the Balances tab appears.
    - None of `payment-stats-card`, `manual-payment-fab` or the balance list's test ids is in the page.
    - No request to the functions emulator's `listHousePayments` is made: record it with `page.on('request')`.
    - The resident record's Payment history still opens.
- [ ] **Step 5:** Run them. Expected: PASS.
- [ ] **Step 6:** Commit `feat(regroup-portal): Balances tab, managers and owners only`.

### Task 5: Intake admits once (#217)

- [ ] **Step 1:** In `e2e/applications.spec.ts`, remove `test.fail()` from `double-submitting intake admits one resident`. #231 fixed it.
- [ ] **Step 2:** Run `e2e-run.sh applications` on `p5-integration`. Expected: PASS.
- [ ] **Step 3:** Commit `test(regroup-portal): intake double-submit now passes (#217)`.

---

## After the tasks

- **Full run** on `p5-integration`: unit tests, typecheck, production build, `check-bundle`, and the whole browser suite. Expected: green, with Task 1's finding pinned as an assertion if managers are refused.
- **Independent money review.** This is the repo rule for money paths. A fresh reviewer reasons from the domain model over:
  - the portal's money journeys;
  - the Share adapter;
  - the Balances gating.

  It also compares two stale-pending figures that can disagree:
  - `useStalePendingPayments` reads the Stripe callable.
  - The dashboard derives its own from the Firestore records.

- **Final whole-branch review** on the most capable model.
- **Push** P5's commits (not the integration merges) to #210.
  - Update #210's description: it lands after #231, #232 and #233. On its own it shows the former `test.fail()` tests failing.
  - Update the roadmap: P5 done, P6 next.

## Decisions this plan may need

- **If Task 1 shows the payment callables refuse managers,** choose one fix:
  - (a) `isHouseAdmin` accepts the caller's live house-roles tier, owner or manager but not peer leader. This matches the owner's rule for who sees house money.
  - (b) Map the caller's uid to their admins doc ids before checking `adminIds`.

  Both are functions changes, so the fix goes in a new phone-side PR, and it affects the phone too. I recommend (a): peer leaders hold the same admin claim, and they must stay out.
