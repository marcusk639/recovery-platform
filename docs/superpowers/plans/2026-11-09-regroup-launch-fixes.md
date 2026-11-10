# Regroup Phone Launch Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the phone bugs that would hurt a successful Regroup launch, each as its own small PR, so the operator portal's P5 can reuse the fixed payment screens.

**Architecture:** Each task is one branch and one PR, cut from `origin/chore/regroup-rn-upgrade` (#160) because #160 rewrites most of these files. When #160 merges, each PR is retargeted to `main`. Two tasks depend on an earlier one: Task 8 on Task 7, and Task 14 on Task 4. The others are independent. Every fix starts with a test that fails on the current code.

**Tech Stack:** React Native 0.88 (regroup/mobile), Jest, `@firebase/rules-unit-testing` against the emulator, Firebase Functions v2 (regroup/functions), Jest.

**Spec:** The GitHub issues named in each task are the spec: #183 (items 6 and 7), #189 to #198, #208, #217, #218, #221. Root causes were mapped by reading the code on `chore/regroup-rn-upgrade` on 2026-11-09. Line numbers are from that branch and will drift.

## Global Constraints

- No deploys of rules, indexes, functions or apps. Index and rules changes ship with the release, not with these PRs.
- Never touch `phoenix-cleanhouse` or `regroup-e2e`. Run rules tests only on offset emulator ports (the `rules-emu` config: firestore 18080, auth 19099, storage 19199). Never kill or reuse emulators on the default ports.
- One worktree per branch, off `origin/chore/regroup-rn-upgrade`. Use `git -C`. In zsh, write `"${B}:path"`.
- Commit scopes: `fix(regroup-mobile):` or `fix(regroup-functions):`. Never `--no-verify`. New files are 300 lines or fewer. No `.skip`, `.only`, or test-count drops.
- Never log PII. Errors shown to users are written messages, never raw error text.
- Don't change behaviour outside the issue. Out-of-scope bugs found along the way get filed, not fixed.
- Leave #182, #183 items 1 to 5 and 8, #174, and #222 to #225 to their owners (launch roadmap P2.5 and P4). #212 changes `firestore.rules` in other blocks; rebase rather than merge-resolve if it lands first.
- Pushing and opening PRs needs the owner's yes for each batch.

## Review Focus

1. **A payment recorded while the balance form is open** (#198). The saved balance must keep that payment, not overwrite it. Covered in Task 9.
2. **Stripe sends `charge.refunded` twice, or refunds in parts** (#198). The balance goes back up once per refunded cent. Covered in Task 10.
3. **A guest whose phase has no rules, or who has no week summary yet** (#208). No rules: they're left out of the house average. No summary: they count as 0%. Covered in Task 3.
4. **A resident holding credit (negative `rentOwed`)** (#191, #192). Outstanding never goes below 0 per resident, and Balance Details never shows "Current" for someone who owes. Covered in Task 8.
5. **A request made before the house loads, then repeated once it has** (#193, #197). No hooks crash, and no query runs without `houseId`. Covered in Tasks 1 and 5.

---

### Task 1: Disputes renders before the house loads (#193)

**Files:** Modify `regroup/mobile/src/screens/Disputes/Disputes.tsx` (guard at ~:130, `renderHelp` ~:134, `openFilters` ~:141). Test `screens/Disputes/__tests__/Disputes.test.tsx`.

- [ ] **Step 1:** Add the test `renders without a house, then with one, without a hooks error`. Mock `useSelectedHouse` as `{house: null}`, render, switch the mock to a house, call `rerender`, and expect no throw. Also expect the disputes list testID to be present.
- [ ] **Step 2:** Run `npx jest src/screens/Disputes`. Expected: FAIL with "Rendered more hooks than during the previous render".
- [ ] **Step 3:** Move the `if (!house || !user?.id) return null` guard below `openFilters`, ahead of `filterActivitiesByType`. Nothing else changes.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit `fix(regroup-mobile): Disputes no longer crashes when it renders before the house loads (#193)`.

### Task 2: The medication summary always crashes (#194)

**Files:** Modify `regroup/mobile/src/util/display.tsx` (`STAT_MAP`, ~:55-130). Test `util/__tests__/display.test.ts`.

- [ ] **Step 1:** Add the test `STAT_MAP has an entry for every Stat`. Loop over `stats` from `entities/Guest`, and for each `s` expect `STAT_MAP[s].label` to be a non-empty string. Also add a test that renders the real `StatSummaryScreen` with `stat="medication"` (no `util/display` mock) and expects the label "Medications".
- [ ] **Step 2:** Run `npx jest src/util/__tests__/display`. Expected: FAIL on `medication`.
- [ ] **Step 3:** Add a `medication` key: label "Medications", the cobalt colour that `medications` uses, activityLabel "Medication taken", and icon `pills` if the icon set has it, otherwise `medications`' icon. Leave `medications`, `work` and `PRIMARY_SUPPORTER` as they are.
- [ ] **Step 4:** Run `npx jest src/util src/screens/GuestMedicationOverview src/screens/Activity`. Expected: PASS. Fix any test that asserted the old missing-key fallback for medication rows, and note it in the PR.
- [ ] **Step 5:** Commit `fix(regroup-mobile): the medication summary opens instead of crashing (#194)`.

### Task 3: The house health score always shows 0% (#208)

**Files:** Modify `regroup/mobile/src/util/house.tsx` (`getHousePercentage`, ~:142), `src/screens/HouseSummary/HouseSummary.tsx` (~:186). Add `getHouseWeekSummaries` to the week-summary service that `reportingService.ts:108-114` already queries, and `useHouseWeekSummaries` to `src/state/queries/activityQueries.ts`. Test `util/__tests__/house.test.ts`.

**Interfaces:**

- Produces `getHouseWeekSummaries(houseId: string, weekStart: string): Promise<Record<guestId, WeekStats>>`, which queries `week-summaries` with `where('houseId','==',houseId)` and `where('startDate','==',weekStart)`.
- Produces `useHouseWeekSummaries(houseId?: string, weekStart?: string)`, with query key `['week-summaries','house',houseId,weekStart]` and `enabled: !!houseId && !!weekStart`.
- Changes `getHousePercentage(house, guests, summaries: Record<string, WeekStats>): number`.

- [ ] **Step 1:** Add tests for `getHousePercentage`. Use fixtures for a house with phase rules and four guests: A meets every rule (100), B meets half (50), C has no summary doc (counts as 0), and D is discharged (left out). Expect `50` (the average of 100, 50 and 0, rounded). Add a guest E whose phase has no rules and expect the result to stay 50. Add an archived guest and expect it to be left out.
- [ ] **Step 2:** Run `npx jest src/util/__tests__/house`. Expected: FAIL (the current function returns 0).
- [ ] **Step 3:** Implement. Leave out guests with `status` `discharged` or `archived`, and guests for whom `hasPhaseRules(house, guest)` is false (export that helper from `util/guest.tsx`). Pass a zeroed `WeekStats` for a guest with no summary. Use `Math.round`, to match `GuestList`. HouseSummary calls `useHouseWeekSummaries(house.id, useCurrentWeek(house.timezone).startDate)`. While that query is loading, show the existing loading state, not 0%.
- [ ] **Step 4:** Add an oplog test for the service: the query's constraints are exactly the two equality filters. Check that `useCurrentWeek(...).startDate` and `getSundayAnchoredWeekStart` give the same string for one fixed date in two timezones. If they differ, rule on which one matches the doc ids written by the server, and record the ruling in the ledger.
- [ ] **Step 5:** Run `npx jest src/util src/services src/screens/HouseSummary`. Expected: PASS.
- [ ] **Step 6:** Commit `fix(regroup-mobile): the house health score reads this week's summaries (#208)`.

### Task 4: Every document upload is refused (#195)

**Files:** Modify `regroup/mobile/firebase/storage.rules` (above the catch-all at ~:143). Test `regroup/mobile/firebase/__tests__/storage.rules.test.ts`.

- [ ] **Step 1:** Add rules tests for both `houses/{h}/documents/{doc}` and `houses/{h}/guests/{g}/documents/{doc}`:
  - An admin of house h can write a 1 MB PDF, read it and delete it.
  - The resident g, an admin of another house, and an unauthenticated user can't write or read.
  - An admin can't write a 26 MB file, and can't write `application/x-msdownload`.
- [ ] **Step 2:** Run the storage rules suite on the offset emulator (`rules-emu/run.sh`). Expected: the allow cases FAIL.
- [ ] **Step 3:** Add both matches: `allow read, write: if isHouseAdmin(houseId) && isValidSizedWrite(25 * 1024 * 1024) && <content type is application/pdf or image/* when request.resource != null>`.
- [ ] **Step 4:** Run the same suite. Expected: PASS, and the existing storage tests still pass.
- [ ] **Step 5:** Commit `fix(regroup-mobile): storage rules allow house admins to upload documents (#195)`.

### Task 5: Drug test history and house summary permission errors (#197)

**Files:**

- `src/services/drugTests.ts`: `getDrugTestsForGuest` ~:38 and `getPositiveTestCount` ~:78.
- `src/state/queries/drugTestQueries.ts`: ~:20-45.
- `src/screens/DrugTests/DrugTestHistory.tsx`: ~:81.
- `regroup/mobile/firebase/firestore.indexes.json`.
- `src/screens/HouseSummary/HouseSummary.tsx`: ~:121, `useHouseApplications`.
- Tests: `src/services/__tests__/drugTests.oplog.test.ts` and `firebase/__tests__/firestore.rules.test.ts`.

- [ ] **Step 1:** Add tests:
  - **Oplog:** both service functions send `where('houseId','==',h)`.
  - **Rules:** an admin of house A querying `drug-tests` on `guestId` only is denied, and with `houseId`+`guestId` is allowed. This shows the old query really is refused.
  - **Screen:** HouseSummary for a non-admin resident doesn't call `getHouseApplications`.
- [ ] **Step 2:** Run them. Expected: the oplog and HouseSummary tests FAIL. The rules test passes, which is evidence for the fix's premise.
- [ ] **Step 3:** Implement:
  - Add a `houseId` parameter first in both functions.
  - Thread `houseId` from `useSelectedHouse` through the hooks, into the query keys and into `enabled: !!houseId`.
  - Add the indexes `houseId ASC, guestId ASC, testDate DESC` and `houseId ASC, guestId ASC, result ASC, testDate ASC`.
  - Gate `useHouseApplications` with `enabled` on `hasFullHouseView` or the existing admin role check that the screen already uses.
- [ ] **Step 4:** Run `npx jest src/services src/state src/screens/DrugTests src/screens/HouseSummary` and the rules suite. Expected: PASS.
- [ ] **Step 5:** Commit `fix(regroup-mobile): drug test queries are scoped to the house, and residents don't query applications (#197)`.

### Task 6: Removing an admin fails, and the paywall switch can't be read (#196, remainder)

staffNotes already landed in #211. Chore rotations, organizations and device tokens are dead code. Their denied reads cause noise but don't break anything, so this task leaves them alone and lists them in the PR.

**Owner decision (2026-11-09):** stop copying. `deleteAdmin` deletes the admin record without archiving it. No `admin-archive` rule is added. The server-side scrub in `F/accountDeletion/houseRecords.ts:105` stays, since older archive docs may exist.

**Files:** `regroup/mobile/firebase/firestore.rules`, `firebase/__tests__/firestore.rules.test.ts`, `src/services/admin.tsx` (`deleteAdmin`, ~:40, and the now-unused `adminArchive` collection ref). Test `src/services/__tests__/admin.test.ts`.

- [ ] **Step 1:** Add tests:
  - **Rules:** any signed-in user can read `paywall/config`. Nobody can write it, and an anonymous user can't read it.
  - **Service:** `deleteAdmin` deletes the admin doc and writes nothing to `admin-archive`. It still resolves when the admin doc doesn't exist.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Add the `paywall/{doc}` read rule. Remove the archive write and the unused ref from `deleteAdmin`.
- [ ] **Step 4:** Run the rules suite and `npx jest src/services`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(regroup-mobile): removing an admin no longer fails, and the paywall switch is readable (#196)`.

### Task 7: The manual payment amount and double submit (#189, #190)

**Files:** `src/screens/HouseSettings/PaymentDashboard.tsx` (`ManualPaymentModal` ~:543-719, `handleRecord` ~:557, the Record button ~:696), `src/services/payments.ts` (`recordManualPayment`). Test `screens/HouseSettings/__tests__/PaymentDashboard.test.tsx` and `services/__tests__/payments.test.ts`.

**Interfaces:** `recordManualPayment` takes an optional `paymentId?: string`, which the modal creates once each time it opens. It enforces `MAX_PAYMENT_CENTS` and rejects amounts that aren't positive integers.

- [ ] **Step 1:** Add tests:
  - `"1,500.00"` records 150000 cents.
  - `"1e3"`, `"5OO"` and `"12abc"` don't call `recordManualPayment`, and show the parse error.
  - Pressing Record twice before the promise resolves calls it once.
  - After a rejected call, Record works again.
  - **Service:** 10000001 cents throws. Two calls with the same `paymentId` use the same doc ref.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - Use `parseDollarsField` (`util/money.ts:146`) and show its error message.
  - Add a `useRef` lock, set before the first `await`, plus `submitting` state that disables the button.
  - Create the doc id once when the modal opens.
  - Enforce `MAX_PAYMENT_CENTS` in `recordManualPayment`.
- [ ] **Step 4:** Run `npx jest src/screens/HouseSettings src/services`. Expected: PASS. On the emulator, check that a second `batch.set` to the same id is refused (`payments` has `allow update: false`). If it isn't refused, record a ruling and rely on the lock alone.
- [ ] **Step 5:** Commit `fix(regroup-mobile): manual payments read the amount exactly and record once (#189, #190)`.

### Task 8: The dashboard and balances read the payment records (#191, #192, #183 items 6 and 7)

Depends on Task 7. Branch from Task 7's branch, since both edit `PaymentDashboard.tsx`.

**Files:** `src/state/queries/paymentQueries.ts` (`useGuestBalances` ~:146-179), `src/screens/HouseSettings/PaymentDashboard.tsx` (~:92, ~:213-237), the Balance Details screen that reads `useGuestBalances`, and `src/services/payments.ts`. Test `state/queries/__tests__/paymentQueries.test.ts` and `PaymentDashboard.test.tsx`.

**Interfaces:**

- Produces `getHousePaymentRecords(houseId: string): Promise<HousePaymentRecord[]>`, which queries Firestore `payments` with `where('houseId','==',houseId)` and sorts on the client by `createdAt` descending. Amounts are read with the same `dollarsToCents(asDollars(...))` normalisation as `getGuestPayments` (~:342).
- Produces `useHousePaymentRecords(houseId?)`.
- Changes `useGuestBalances` to `balance = rentOwed + choreFees`. It no longer subtracts `totalPaid`.

- [ ] **Step 1:** Add tests:
  - A resident with `rentOwed` 15000 and an earlier $150 Stripe payment shows a balance of 15000 and is not "Current". This is the #192 case.
  - Dashboard Collected includes a manual payment's record, and nets `refundedAmountCents`.
  - Outstanding is the sum of `max(0, rentOwed + choreFees)` over active residents. With residents at 15000, 0 and -5000, expect 15000.
  - Collection rate doesn't show 100% while Outstanding is above 0.
  - The dashboard list shows the resident's name, not "Unknown", for a record with a `guestId` in the house.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Collected, the list, the chart and the CSV come from `useHousePaymentRecords`, and Outstanding comes from the guests. Leave `useFailedPayments` on `listHousePayments` and say so in the PR, because failed-charge detection needs Stripe data. Don't delete `listPayments` or `listHousePayments`; the portal and `useFailedPayments` still reference them.
- [ ] **Step 4:** Item 7: confirm with a test that Pay Rent and Payment History read the same Firestore source on this branch. If they do, close item 7 in the PR as already fixed by #160. If they don't, point both at `getGuestPayments`.
- [ ] **Step 5:** Run `npx jest src/state src/screens/HouseSettings src/services`. Expected: PASS.
- [ ] **Step 6:** Commit `fix(regroup-mobile): the payment dashboard and balances read the payment records (#191, #192, #183)`.

### Task 9: Balance edits can't erase a payment, and flags can be cleared (#198 part 1)

This also fixes a bug found while mapping #198: removing a manager leaves `isAdmin: true` on the guest doc, because `mergeGuestStats` ORs boolean flags. File that issue before starting.

**Files:** `src/services/guest.tsx` (`updateGuest` ~:66-128, `mergeGuestStats` ~:144-206), `src/screens/GuestUpdate/guestFormValues.ts` (~:86-88), `GuestUpdateForm.tsx` (~:67). Test `services/__tests__/guest.test.ts` and `screens/GuestUpdate/__tests__/guestFormValues.test.ts`.

**Interfaces:**

- `guestMoneyUpdate` returns `{rentOwedDeltaCents, choreFeesDeltaCents}`, each `typedCents - storedCentsWhenFormOpened`.
- `updateGuest` accepts `moneyDeltas?: {rentOwed?: number; choreFees?: number}` and applies `increment(delta)` inside its transaction.
- `mergeGuestStats` never writes `rentOwed` or `choreFees`.
- `authoritativeFields` may name a boolean flag. When it does, the caller's value is written as is.

- [ ] **Step 1:** Add tests:
  - The form opened at `rentOwed` 30000, and a 15000 payment lands, so the doc holds 15000. The operator types $250, so the delta is -5000, and the stored result is 10000. Assert an `increment(-5000)` and no absolute `rentOwed` write.
  - A profile save sending a stale `rentOwed` 30000 doesn't change `rentOwed`.
  - `ManagerSettings` removal, which sends `isAdmin: false` as authoritative, writes `false`.
  - `step` keeps its max-merge.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Remove `rentOwed` and `choreFees` from the generic merge and from the spread written by `updateGuest`. Apply deltas only when they aren't zero. Make `ManagerSettings` pass `authoritativeFields: ['isAdmin']`.
- [ ] **Step 4:** Find every caller of `updateGuest` and `useUpdateGuest` that sends `rentOwed` or `choreFees` (`find_referencing_symbols`, plus a grep for the field names). Each one either moves to deltas or stops sending them. List them in the PR.
- [ ] **Step 5:** Run `npx jest src/services src/screens/GuestUpdate src/screens/HouseSettings src/screens/Profile`. Expected: PASS.
- [ ] **Step 6:** Commit `fix(regroup-mobile): balance edits apply the change, not a stale total, and a manager can be removed (#198)`.

### Task 10: A refund restores the balance (#198 part 2)

**Owner decision (2026-11-09):** add it back. The refunded amount goes back on `rentOwed` once, including for partial and repeated refund events, and only for payments that lowered rent (`rentApplied === true`). Owner decision (2026-11-10): disputes have no effect on money or payments, so nothing here or later restores a balance on a dispute.

**Files:** `regroup/functions/src/webhooks/stripeWebhook.ts` (`handleChargeRefunded` ~:822-855, using the `rentApplied` transaction pattern from ~:573-591). Test it in the existing `stripeWebhook` test file.

- [ ] **Step 1:** Add tests:
  - A $150 rent payment with `rentApplied: true` is fully refunded: `rentOwed` goes up by 15000 and `refundRestoredCents` is 15000.
  - The same event is delivered twice: `rentOwed` goes up once.
  - A partial refund of 5000, then a cumulative refund of 15000: the increments are 5000, then 10000.
  - A payment without `rentApplied`, such as a subscription charge: `rentOwed` is unchanged.
  - The refund arrives before the payment doc exists: the restore is skipped, the event is logged by event id only, and nothing throws.
- [ ] **Step 2:** Run `npx jest src/__tests__/<webhook test>` in `regroup/functions`. Expected: FAIL.
- [ ] **Step 3:** Implement. Inside a transaction, read `payments/{pi}` and compute `delta = amount_refunded - (refundRestoredCents ?? 0)`. If `delta > 0`, `rentApplied === true` and the doc has a `guestId`, increment `guests/{guestId}.rentOwed` by `delta` and set `refundRestoredCents`. The existing `refundedAmountCents` write and the transfer reversal stay as they are.
- [ ] **Step 4:** Run `npm test` in `regroup/functions`. Expected: PASS, and the coverage floor holds.
- [ ] **Step 5:** Commit `fix(regroup-functions): a refunded rent payment puts the amount back on the balance (#198)`.

### Task 11: A double-click on Submit admits the resident twice (#217)

**Files:** `src/screens/ResidentIntake/IntakeFormScreen.tsx` (`handleSubmit` ~:118, button ~:346). Test `__tests__/IntakeFormScreen.test.tsx`.

- [ ] **Step 1:** Add the tests `pressing Submit twice before create resolves creates one guest` and `after a failed create, Submit works again`.
- [ ] **Step 2:** Run. Expected: the first test FAILS (create is called twice).
- [ ] **Step 3:** Implement. Add a `useRef` lock, set before the first `await` and cleared in `finally`. Also create the guest id once per form, so a retry overwrites instead of duplicating.
- [ ] **Step 4:** Run `npx jest src/screens/ResidentIntake`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(regroup-mobile): intake admits a resident once, however many times Submit is pressed (#217)`.

### Task 12: Phase Customization goes back as if saved (#218)

**Files:** `src/screens/Profile/PhaseCustomization.tsx` (`save` ~:251-264). Test `screens/Profile/__tests__/PhaseCustomization.test.tsx`.

- [ ] **Step 1:** Add the test `a failed save shows an alert and stays on the screen`: `updateGuestAsync` rejects, `Alert.alert` is called with "Couldn't save the phase", and `goBack` isn't called. Also add the test `a successful save goes back`.
- [ ] **Step 2:** Run. Expected: the first test FAILS.
- [ ] **Step 3:** Move `navigation.goBack()` into the success path. In `catch`, show the alert "Couldn't save the phase. Check your connection and try again."
- [ ] **Step 4:** Run `npx jest src/screens/Profile`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(regroup-mobile): Phase Customization stays open and says so when the save fails (#218)`.

### Task 13: Discharge says "please try again" when retrying can't help (#221)

**Files:** `src/screens/Profile/DischargeGuestModal.tsx` (`handleConfirm` ~:33-47), and `src/services/guest.tsx` (`dischargeGuest` ~:296-328) only if it needs a typed error. Test `__tests__/DischargeGuestModal.test.tsx`.

- [ ] **Step 1:** Add tests:
  - A `permission-denied` rejection shows "You can't discharge this resident. A manager or the owner can." and doesn't call `onSuccess`.
  - The revocation failure, where the status was written, calls `onSuccess` and shows the service's message.
  - Any other error still shows the generic retry text.
- [ ] **Step 2:** Run. Expected: the first two tests FAIL.
- [ ] **Step 3:** Implement. `dischargeGuest` throws a `DischargeRevokeError` (or another typed marker) after the status write succeeds. The modal branches on that marker and on `code === 'permission-denied'`. It never shows raw error text.
- [ ] **Step 4:** Run `npx jest src/screens/Profile src/services`. Expected: PASS.
- [ ] **Step 5:** Commit `fix(regroup-mobile): Discharge says why it failed, and says so when it worked (#221)`.

### Task 14: Documents open through short-lived links

**Owner decision (2026-11-09):** fix before launch. Today `uploadDocument` stores a permanent token link (`getDownloadURL`) in `documents/{id}.storageUrl`, so anyone holding the link can open the file, whatever the rules say. Firebase's client SDK can only produce permanent token links. A short-lived link has to be signed on the server.

Depends on Task 4. Branch from Task 4's branch.

**Files:**

- Create `regroup/functions/src/callable/documentLinks.ts`, export it from `regroup/functions/src/index.ts`, and test it in `regroup/functions/src/__tests__/documentLinks.test.ts`. Follow the `regroup-new-callable` skill.
- Modify `regroup/mobile/src/services/documents.ts` (`uploadDocument` ~:110-150), `src/entities/Document.ts` (`storageUrl`), `src/screens/Documents/DocumentListScreen.tsx` (~:75), and `regroup/mobile/firebase/firestore.rules` (`documents` create, ~:1056).
- Tests: `src/services/__tests__/documents.test.ts`, `DocumentListScreen` tests and `firebase/__tests__/firestore.rules.test.ts`.

**Interfaces:**

- Produces the callable `getDocumentLink({documentId: string}) → {url: string, expiresAt: string}`.
  - It reads `documents/{documentId}` with the Admin SDK.
  - The caller must hold `admin` or `superAdmin` for that doc's `houseId`, checked with `holds(liveClaims(uid), role, houseId)` as `myHouseTiers` does. A missing doc and a refused caller both get `not-found`, so ids can't be probed.
  - It returns a v4 signed read URL for `storagePath` that expires after 15 minutes.
- Produces the mobile service `getDocumentLink(documentId): Promise<string>`. It uses the same `httpsCallable` and functions region helper as the existing callables, so the region can't mismatch.
- `HouseDocument.storageUrl` becomes optional, is never written, and is never read.

- [ ] **Step 1:** Add tests:
  - **Callable:** unauthenticated callers get `unauthenticated`. An admin of another house gets `not-found`, and so does an unknown id. An admin of the doc's house gets a URL from the mocked `bucket.file(storagePath).getSignedUrl`, called with `{version:'v4', action:'read'}` and an `expires` 15 minutes ahead.
  - **Service:** `uploadDocument` doesn't call `getDownloadURL`, and the written record has no `storageUrl`.
  - **Screen:** opening a document calls `getDocumentLink`, then `Linking.openURL` with its URL. When the link can't be fetched, it shows "Couldn't open the document. Try again." and doesn't open anything.
  - **Rules:** a `documents` create that includes `storageUrl` is denied, and one without it is allowed.
- [ ] **Step 2:** Run `npm test -- documentLinks` in `regroup/functions`, `npx jest src/services src/screens/Documents` in `regroup/mobile`, and the rules suite. Expected: FAIL.
- [ ] **Step 3:** Implement the callable, the service change, the screen change and the rule (add `!('storageUrl' in request.resource.data)` to the create rule).
- [ ] **Step 4:** Run the same commands, plus the full `npm test` in both packages. Expected: PASS, and the functions coverage floor holds.
- [ ] **Step 5:** Commit `fix(regroup-mobile): documents open through short-lived links, not permanent ones`. Make it two commits, one scoped `regroup-functions` for the callable, if the commit-msg hook wants one scope per commit.

**Release notes for the PR, not done here:**

- The functions service account needs permission to sign URLs (`iam.serviceAccounts.signBlob`, "Service Account Token Creator" on itself).
- Links already stored on older document records stay valid until their tokens are revoked. List any such records before launch; pre-launch there should be none outside test data.
- The portal (P8) will use the same callable.

---

## After the tasks

- **Before each PR:** run the full `npm test` in `regroup/mobile`, and in `regroup/functions` for Task 10.
- **Final review:** one fresh reviewer on the most capable model checks every branch's diff. Tasks 7 to 10 also get the independent money review the repo rules ask for, done by a reviewer who reasons from the ledger, not from the tests.
- **Portal proof:** rebase the portal branch onto the fixed branches locally. The 6 pinned payment tests and the intake double-submit test in `regroup/portal/e2e` should pass. That run belongs to P5, the portal reuse plan, which comes next.
- **Roadmap update:** mark these issues as fixed by their PRs.
