# Regroup Usability & Correctness Audit

**Date:** 2026-07-05
**Scope:** `regroup/mobile/src` (~69.6K lines, 501 files) and `regroup/functions/src` (~11.4K lines, 88 files) — every source file read in full, no sampling.
**Trigger:** while working through the Tier 2 items in `regroup-launch-blockers-2026-07-04.md`, fixing `OrgSetup.tsx`'s "swallows house-creation errors" bug (#38) led to discovering the screen's entire data layer was disconnected — a HOC imported but never applied, Redux thunks defined but never dispatched, and a separate parallel screen (`HouseConfig`) that also turned out to be unreachable. That one bug turning into three raised the obvious question: how many other screens have the same shape of problem? This audit answers that question for the whole product.

## How this was developed

21 parallel subagents, each assigned a bin-packed batch of files (~5,500 lines or ~45 files, whichever came first), read every assigned file in full and searched specifically for the pattern that triggered this investigation: half-finished HOC-to-hook migrations, Redux actions/thunks with no dispatch call site anywhere in the app, screens not registered in any navigator, and parallel/duplicate implementations where only one path is actually live. Every finding below was verified by the reporting agent via repo-wide grep for call sites — not flagged on suspicion alone — and cross-checked against this session's already-completed fixes so nothing already resolved gets re-reported as open.

**Not done:** these findings have not been re-verified by a second independent pass (unlike some earlier reviews in this repo tagged ✅ VERIFIED). Treat HIGH-confidence items as "very likely real," and MEDIUM-confidence items as "worth a five-minute look before acting."

---

## Executive summary

The single biggest thing this audit found: **the entire multi-step house/organization setup wizard (`OrgSetup` → `OperatorSetupWizard` → `ManagerSetup`/`ChoreSetup`/`PhaseConfigSetup`/`GuestSetup`) does not actually save anything it collects.** Every step's "save" action depends on props (`updateHouse`, `submitHouse`, `removeHouse`, `setupHouse`, `startPhaseSetup`) that no caller anywhere in the app ever supplies. This isn't one bug — it's the same missing-wiring gap repeated across five different wizard screens, all stemming from a HOC (`withHouseSetupWizard`) that was migrated to a hook (`useHouseSetupWizard`) for _read_ access but never got an equivalent replacement for the _write_/dispatch side.

Beyond that pattern, this audit found a payment bug more severe than anything in the original Tier 1/2 launch-blockers list: **`RentPaymentScreen.tsx` never actually charges the resident, but always shows a success message** — no Stripe confirmation ever happens, no webhook ever fires, yet the UI says "Payment initiated!" This is a live, reachable, default entry point for the most common resident-facing money flow in the app.

Everything else falls into three buckets: real data-loss bugs (guests/admins silently not saved, "remove" functions that don't remove anything), inert-but-visible UI (blank modals, non-functional search bars, a time picker with its picker commented out), and a large amount of confirmed-dead code (whole Redux slices, HOCs, screens, Cloud Functions callables) that's safe to clean up but not urgent.

---

## Part 1 — The central pattern: half-wired setup/config flows

This is the throughline of the whole audit. Each of these is a distinct screen with the same shape of bug: a prop or Redux action the screen's logic depends on is never actually supplied or dispatched by anything that renders it.

### 1.1 `OrgSetup.tsx` — the finding that started this audit (task #38, in progress)

`regroup/mobile/src/screens/SetupWizards/OrgSetup.tsx` imports `withHouseSetupWizard` but never calls it (`OrgSetupForm = withFormik(...)(OrgSetupFormView)` only wraps with Formik). Registered in `navigators.tsx:208` as a bare `component={OrgSetup as any}` with no props injected. Result: `houses`, `submitting`, `submittingSuccessful`, `submittingFailed`, `startHouseSetup`, `removeHouse`, `setupHouse` are all `undefined` at runtime.

**Even applying the HOC wouldn't fix it.** `withHouseSetupWizard.tsx` and its hook replacement `useHouseSetupWizard.ts` only ever supplied **read-only** state — neither ever exposed `startHouseSetup`/`removeHouse`/`setupHouse`/`submitHouse` as dispatchable actions. And of those, only `startHouseSetup` exists as a real Redux action at all; `removeHouse`, `setupHouse`, and `submitHouse` were never implemented anywhere in `setupSlice.ts`.

Concretely: "ADD HOUSE" calls `setupHouse?.(new House())` — a silent no-op via optional chaining — then navigates to `OperatorSetupWizard` anyway, so the house being configured is never linked to `state.setup.houses`. "COMPLETE SETUP" is permanently disabled (`disabled={isEmpty(houses)}`, `houses` always `undefined`). The `withFormik` `handleSubmit`'s empty `catch { // continue }` (the originally-scoped bug) never even reaches a failure case worth swallowing, since `formikBag.props.submitHouse` is also always `undefined` — it silently skips straight to `navigateToMainTab`.

### 1.2 `ManagerSetup.tsx` — manager assignments during house setup never persist

Only ever rendered from `OperatorSetupWizard.tsx:168-174` as `<ManagerSetup {...props} focused={...} onPrevPress={goBack} onNextPress={goNext} />`, where `props` is just `{navigation}`. The component's own Save/Next button only renders when `forSettings` is true — the wizard never passes it. The button the user actually taps is the wizard's shared bottom bar, which just calls `goNext()` to flip the page without touching this step's Formik state at all. Even if triggered, `handleSubmit` guards on `if (!selectedHouse) return;` — always true here. The completely separate `ManagerSettings.tsx` (used from House Settings, not the setup wizard) manages admins independently via Redux and never touches this component. **Net: manager type/emails entered during initial house setup are silently dropped, and the entire submit path is dead, unreachable code.**

### 1.3 `ChoreSetup.tsx` — "ADD CHORE" is a no-op on any house with zero chores

Requires an `updateHouse` prop to add/remove chores. Repo-wide grep for `updateHouse=` as a JSX prop: **zero matches anywhere in `mobile/src`.** Rendered from `OperatorSetupWizard.tsx` (no `updateHouse` supplied) and from `HouseSettings.tsx` via `setupProps()` (supplies several props, but not `updateHouse` either). When a house's chore list is empty — true for every newly created house — "ADD CHORE" branches directly into `addChore`, which guards on `selectedHouse && updateHouse`; since `updateHouse` is always `undefined`, the guard fails silently: no modal, no chore, no error, nothing. (Editing _existing_ chores in Settings mode still works, because the final "Save" button there uses a separately-wired `handleChoreSubmit` — only the empty-list "ADD CHORE" path is fully dead-ended.)

### 1.4 `PhaseConfigSetup.tsx` — phase customizations silently don't persist

Same root cause as 1.1: `withHouseSetupWizard.tsx` never supplies `updateHouse` or `startPhaseSetup`, which this screen expects. Both real render paths (`navigators.tsx:326-327` and `HouseSettings.tsx`'s `setupProps()`) leave those undefined. Every Add/Delete/Edit-phase action in `usePhaseSetup.ts` opens/closes its modal looking successful but never mutates `selectedHouse.phases` — the real Save button then persists the same, never-updated state. Operator's phase customizations are silently dropped.

### 1.5 `HouseConfigForm.tsx` — even where wiring exists, admin data is discarded

Unlike the above, this screen's Redux/React-Query wiring is real — but `createAdmin` (from `useCreateAdmin()`) is destructured and passed as a prop, then **never called** anywhere in `handleSubmit`. The wrapper's `createHouse` prop signature takes an `admins: Admin[]` parameter and **silently discards it** (`(house, _admins) => createHouse(house)`). Whatever admins/officers the user entered during setup never reach any mutation call — only the house document itself gets created.

### 1.6 `HouseConfig` / `CreateGuest` / `GuestUpdate` — orphaned parallel screens, not just broken wiring

Beyond broken wiring, three entire screen modules are **completely unreachable** — confirmed via exhaustive grep of `navigators.tsx` and every other screen, not just the barrel exports:

- **`HouseConfig.tsx`/`HouseConfigForm.tsx`** (and its whole state layer, including the `updateHouseConfig` thunk) — zero references anywhere outside its own test file. A fully-built, fully-tested feature nobody can ever open.
- **`CreateGuest.tsx`/`CreateGuestForm.tsx`** — also unreachable; the real guest-creation flow today is `ResidentIntake`/`IntakeFormScreen.tsx`, which calls `useCreateGuest` directly. (This is the screen with the hardcoded house-ID bug from the original launch-blockers list — already fixed today as a landmine-removal measure, but worth knowing the screen may not even be reachable.)
- **`GuestUpdate.tsx`** — same story; only `GuestUpdateFormView`/`GuestUpdateForm` survive as shared pieces reused by the (also-unreachable) `CreateGuestForm`.

### 1.7 Other confirmed-orphaned features in this same family

- **`setOxfordEnabled`** Cloud Function (its own doc comment calls it "the single source of truth for Oxford billing state") has **zero callers anywhere** in mobile or web. Oxford House mode can only be turned on by someone manually editing Firestore/Stripe outside the app — the toggle every other Oxford feature depends on (`useOxfordGate`, `OxfordDashboard`) has no UI path to flip it.
- **`complianceExport`** Cloud Function — fully implemented, tested, documented as a paid tier differentiator (RG-SPEC-09) — zero client callers anywhere.
- **`sendInviteEmails`** Cloud Function — superseded by `createInvitation`, zero callers.
- **`EnhancedAuthService`** — beyond the already-fixed `signInWithEmail` rate-limiting (see `regroup-launch-blockers-2026-07-04.md` #51), the **entire rest of the class is dead**: `signUpWithEmail`, `sendPasswordResetEmail`, `signInAnonymously`, `signOut`, and all the status-check methods are referenced only by the class's own tests. The live sign-up and password-reset flows bypass `SimpleValidationService`'s stronger password rules and rate-limiting entirely — only sign-in got wired in today.
- **`setupSlice.ts`** — of ~15 exported actions/thunks, only 4 have any real dispatch site anywhere in the app, and those 4 belong to unrelated House Settings screens, not the setup wizard the slice is nominally for. `createOrganization`, `createHouse`, `updateHouseConfig`, `completeSetup` (the actual persistence thunks) and 7 more simple reducers are dispatched only in tests.
- **`services/setup-wizard.ts`'s `initializeHouses`** — a complete, well-built batch-house-creation pipeline (grants admin claims, uploads photos, sends invites) with zero callers anywhere — fully superseded by (the also-broken) `setupSlice.ts` thunks.
- **`house.tsx`'s `createHouseBatch` and `updateHouseBatch`** — two large, substantial functions with zero callers outside their own tests.

**Why this matters as a group, not just individually:** an operator going through initial house setup today can fill out managers, chores, and phase customization, tap through every step successfully, and end up with a house record that has none of that data — with zero error messages anywhere in the flow, because every failure point here is a silent no-op, not a thrown error.

---

## Part 2 — Payment / money-integrity bugs (highest real-world severity)

**Status: 2.1–2.3 fixed 2026-07-05.** Fixing 2.1 required also fixing an even more severe bug discovered in the process (2.1a below) — had the "doesn't charge" bug been fixed without it, every resident would have been charged 100x their real balance. See `regroup-launch-blockers-2026-07-04.md`-style task tracking for the exact diffs; summarized here for completeness.

### 2.1 `RentPaymentScreen.tsx` never actually charges the resident — confirmed false success (CRITICAL) — FIXED

`handlePayNow` → `useCreateRentPayment` → `createRentPaymentIntent` → Cloud Function `createPaymentIntent`, which returns **only** `{ clientSecret }` — never `paymentUrl` (the field the mobile code branches on; `services/payments.ts` itself documents `paymentUrl`/`paymentIntentId` as `@deprecated — server does not return this field`). Since `result.paymentUrl` is always `undefined`, the screen always took the "else" branch: no WebView navigation, no `usePaymentSheet`/`confirmPayment` call anywhere, no Stripe confirmation of any kind — and showed **"Payment initiated! Your balance will update once confirmed."** No charge occurred, no webhook ever fired.

This was the default, most prominent "Pay Rent" entry point from `GuestHome.tsx`. The sibling screen `ResidentPayment.tsx` (a separate "Make a Payment" entry point) already did this correctly via `usePaymentSheet().initPaymentSheet`/`presentPaymentSheet` — this was a duplicate implementation where the more commonly used path was the broken one.

**Fix:** `RentPaymentScreen.tsx` now wires in `usePaymentSheet` directly, matching `ResidentPayment.tsx`'s proven pattern — create intent → `initPaymentSheet` → `presentPaymentSheet` → record the confirmed payment. Cancels behind of a card decline surface a real error banner; a user-cancelled sheet shows neither error nor false success.

### 2.1a `guest.rentOwed`/`guest.choreFees` displayed as dollars when they're actually integer cents (CRITICAL, found while fixing 2.1) — FIXED

Confirmed via four independent sources: `functions/src/callable/analytics.ts`'s explicit type comment (`// integer CENTS (live balance)`), `functions/src/scheduled/scheduledRentCollection.ts`'s comment, the historical `functions/src/scripts/migrateBalanceToCents.ts` migration script (proof the field was deliberately converted from dollars to cents at some point), and the Stripe webhook's own `// Atomically decrement guest rentOwed (integer cents)` comment. `ResidentPayment.tsx` (the working reference screen) already divides by 100 correctly.

But `RentPaymentScreen.tsx`, `GuestHome.tsx`'s "Pay Rent" summary card, and `PaymentDashboard.tsx`'s per-resident overdue list all formatted `rentOwed`/`choreFees` with the dollars-only `formatCurrency` helper — displaying a balance **100x too large** (e.g. "$50,000.00" for an actual $500 balance) to residents, on the guest home screen, and to operators. `RentPaymentScreen.tsx` additionally _multiplied by 100 again_ when constructing the Stripe charge amount — meaning fixing 2.1 without also fixing this would have charged every resident 100x their real balance.

**Fix:** all three display sites now use (or newly use) `formatCentsAsCurrency`; the Stripe amount calculation no longer double-converts. `house.monthlyRent`/`weeklyRent` were confirmed to be genuinely in dollars (via `HouseInfo.tsx`/`IntroHouseSummary.tsx`) and were left unchanged.

### 2.2 Manual/offline rent payments never clear the resident's balance — FIXED

`recordManualPayment` (cash/check/Venmo/Zelle, via the "+ Record Payment" FAB in `PaymentDashboard.tsx`) wrote a `payments` doc with `status: 'succeeded'` but **never touched `guests.rentOwed`**. Confirmed via repo-wide grep: the only `rentOwed` decrement site anywhere was the Stripe webhook handler. A resident whose cash payment was recorded by staff stayed permanently listed under "Overdue Residents."

**Fix:** `recordManualPayment` now also does `guests/{guestId}.update({ rentOwed: FieldValue.increment(-amountInCents) })`, matching the Stripe webhook's exact convention (rentOwed only, not choreFees — consistent with how the existing Stripe path already treats a single combined charge).

### 2.3 `stripePaymentIntentId` always written as `undefined`, breaking webhook reconciliation — FIXED

`useCreateRentPayment` passed `intentResult.paymentIntentId` into `recordRentPayment` — but that field is the same one documented as `@deprecated — server does not return this field` (§2.1). Every optimistic pending-payment record got `stripePaymentIntentId: undefined`, so nothing could link a Stripe webhook event back to its Firestore record.

**Fix:** the real PaymentIntent ID is now extracted from the `clientSecret` (Stripe's client secrets are always `{paymentIntentId}_secret_{secret}` — a stable, documented format) via a new `paymentIntentIdFromClientSecret` helper, and `recordRentPayment` now writes to `payments/{stripePaymentIntentId}` instead of a random auto-ID **when an ID is available**. This means the webhook's `upsertPaymentDoc(paymentIntent.id, ..., {merge: true})` lands on this exact same document and correctly transitions it from `pending` to `succeeded`, instead of creating a second, permanently-orphaned "pending" document that never reconciles with the real one.

### 2.4 Dollars-vs-cents unit mismatch — resolved, more precisely than originally scoped

Confirmed with hard evidence (not just suspected): `functions/src/webhooks/stripeWebhook.ts`'s `upsertPaymentDoc` writes `amount: paymentIntent.amount / 100` (dollars) for webhook-created records, while `services/payments.ts` writes `amount: amountInCents` (cents) for both `recordRentPayment` and `recordManualPayment`. Given `upsertPaymentDoc` always writes to `payments/{paymentIntentId}` with `{merge: true}`, and the fix in §2.3 now makes the client's optimistic record land on that same document ID, the webhook's later write naturally overwrites the temporary cents value with the authoritative dollars value — the documents converge correctly, they just show a wrong `amount` for the brief window between the optimistic write and the webhook firing. This narrow, real inconsistency is a lower-priority follow-up (display-only, self-correcting within the webhook's normal latency) rather than the broader "everything might be off by 100x" risk originally flagged — the more severe version of this bug turned out to be §2.1a (`guest.rentOwed`), which is fixed.

### 2.5 "Reject" button on financial records is a complete no-op on Android

`FinancialRecordDetail.tsx`'s `handleReject` uses `Alert.prompt(...)` to collect a rejection reason. React Native's `Alert.prompt` is gated `if (Platform.OS === 'ios')` with **no Android branch at all** — confirmed by reading the RN source directly. The entire rejection logic lives inside that callback, so the admin-only "Reject" button silently does nothing on Android.

---

## Part 3 — Data-loss and silent-failure bugs (not payment-related)

- **`AddManager.tsx` "Promote a Guest" to manager never persists.** Dispatches `setGuests(guests)` — a plain `setupSlice` reducer with zero Firestore side effect, and that slice resets on app restart. The guest immediately _looks_ promoted in the list (since `ManagerSettings.tsx` also reads from `state.setup`), but the change evaporates on reload.
- **`ManagerSettings.tsx` "Remove" on a Guest Administrator is a no-op.** Clones the guest, sets `guest.isAdmin = false` on the clone, then never uses that variable — only dispatches an _unchanged_ house clone. No error, no revert; the guest stays admin forever.
- **`NewAccountForm.tsx` missing `.unwrap()` on an RTK dispatch — guests routed to the wrong tab, guest record can be corrupted.** `dispatch(updateUserRTK(...))` (no `.unwrap()`) resolves to the raw action envelope, not the `User`. Every field read off "the updated user" downstream is `undefined`, including `isGuest` — so **every user completing New Account setup lands on `Routes.House`, including guests who should land on `Routes.Guest`.** The Firestore guest-record patch built from this same undefined-riddled object risks blanking real guest fields on every completed signup. The identical missing-`.unwrap()` pattern also exists in `SignUpForm.tsx:285` (flagged, not fixed, in that batch).
- **`complaints.ts`'s `removeComplaint`** and **`issues.ts`'s `removeIssue`** both rewrite the record back instead of deleting it (`batch.set(...)` where it should be `batch.delete(...)`). "Remove" disappears the item from the house's embedded list view, but the underlying document persists untouched in the standalone collection — an orphaned-record data-integrity issue. `removeIssue`'s house-update call also blind-writes the entire house object from a client snapshot, risking clobbering concurrent edits from other admins.
- **Push notification tokens are never persisted, at all, on any device.** `Splash.tsx`'s `updateTokenIfNecessary` has both branches commented out, with a stale "should be imported if available" note — the real dispatch action exists and works, it's just never called. Confirmed: no other write site for `messagingToken` exists anywhere. Push notifications silently cannot reach any user.
- **Subscription status never set for the auto-login path.** `autoLogin.fulfilled` never dispatches `setSubscriptionStatus` (only the explicit email/password `login` thunk does) — so `state.user.subscriptionStatus` stays `null` for virtually every returning user until they explicitly log out and back in. Any paywall-gated UI reading this field misbehaves for most sessions.
- **`functions/src/util/house.ts`'s `getOverallPercentage` throws for every migrated guest, silently, every week.** Reads a legacy embedded `guest.currentWeek.days` field that no longer exists on the current Guest model (migrated to `currentWeekId`/`currentWeekStartDate`). Called from the `weeklyTransfers` scheduled function (runs every Sunday) via `calculateWeeklyHealth`; the throw is caught by an inner try/catch that only `logger.warn`s and continues. House "health" scores silently stop updating every week for every house, while the rest of the weekly transfer proceeds normally — easy to miss since nothing surfaces as an operator-visible error.

---

## Part 4 — Broken or inert UI reachable by real users

- **`Beds.tsx` search/filter UI is fully decorative** — `executeSearch`/`openFilters` are both `useCallback(() => {}, [])` no-ops; `renderRooms()` never references `searchTerm`/filters at all. The **identical copy-pasted no-op pattern** was independently confirmed in `Complaints.tsx`, `ContactScreen.tsx`, and `Issues.tsx` — a repeated stub, not a one-off.
- **`ContactScreen.tsx`'s entire search/filter feature is built but never rendered** — `renderSearch()` is defined, wired to real state and a real filter form, but never called anywhere in the component's return.
- **`DirectChat.tsx` clears the composed message text before the async send is confirmed** — a failed send loses the user's typed message, which they must retype from memory.
- **`GuestMedicationSummary.tsx`'s "UPDATE MEDICATION" and "LOG MEDICATION" buttons both open a blank modal** (`showFormModal(<View />, ...)`) — no way to actually log or update medication through this screen.
- **`weekday-with-time.tsx`'s time picker is inert** — the only `<DateTimePicker/>` is commented out, and `onChange` is destructured but never used. Affects curfew-per-weekday setup (`PhaseConfigForm.tsx`) and meeting day/time entry (`NewMeeting.tsx`) — both real, reachable call sites get a read-only label with no way to actually pick a time.
- **`RatsImage`'s operator-precedence bug discards every custom style a caller passes.** `style={imageStyles || props.style}` — `imageStyles` is a plain object literal, always truthy, so `props.style` is dead on arrival for every caller. Confirmed causing a **visibly broken full-bleed header image** in `image-header/index.tsx` (renders as a fixed 45×45px image instead), and also affects `rats-avatar/index.tsx`'s custom sizing.
- **Notification Preferences toggles in `Notifications.tsx` are local-only** — four real-looking Switch toggles backed by `useState` only, with a code comment acknowledging they're not persisted. Resets silently on next app launch.
- **`Personal.tsx`'s four modal forms** (file complaint, house maintenance, report bug, send feedback) **never await their submit call before dismissing the modal**, and the matching failure-state check (`updatingFailed`) only reads legacy Redux error fields, never the real mutation's `isError` flag — so none of the four ever surface a failure to the user. The identical pattern was independently found in `MiscellaneousForm.tsx` (used for the same category of forms), confirming it's systemic, not a single oversight.
- **`SignUpFormView.tsx` is missing its terms-of-service checkbox and confirm-password field entirely** — both are seeded in form state and imported (`RatsCheckBox`) but never actually rendered. Signup still submits fine, but with no confirm-password entry and no affirmative terms acceptance — a UX/compliance gap, not a crash.
- **`InitialLandingForm.tsx`'s "Use the demo" link is dead** (already tracked, confirmed still present) — routes to plain Login, identical to the Sign In button beside it.
- **`IntroHouseSummary.tsx`'s "Certified" badge is still `Math.round(Math.random())`** and the "Apply" button still always returns `null` (already tracked, confirmed still present).
- **`logException()`'s optional `message` parameter is silently dropped** before ever reaching Sentry — it's accepted but never passed through. Given this function is documented as the app's _only_ error sink, this quietly degrades production error triage at every call site that relies on the message for context (e.g. `SubscriptionUpdateModal.tsx`'s `logException(error, 'Error signing out')`).
- **`NewAccount.tsx`'s sign-out callback has a literal empty catch block** (`// do something`) — failures are invisible to both user and log.
- **`GuestInvites.tsx`** catches an invite-send error but never passes it to `logException` — no diagnostic trail for a real operator-facing failure.
- **`functions/src/util/invite.ts`'s `notifyAdminsIfTheyExist`** wraps its entire admin-notification loop in one try/catch — one bad lookup aborts notifying every admin later in the array, with nothing surfaced anywhere.

---

## Part 5 — Deep linking: definitively resolved (task #48)

**`navigation/linking.ts`'s `linkingConfig` is never passed to `NavigationContainer`.** The container (`mobile/index.js:40-46`) is instantiated with no `linking` prop at all, and `linkingConfig` is imported nowhere else in the app. **Deep linking does not function at runtime, full stop** — this supersedes the original finding (`regroup://` vs `regroup-app://` scheme mismatch), which is moot once nothing processes either scheme in-app. Separately confirmed: the native URL schemes themselves **are** correctly registered in both `ios/rats/Info.plist` and the Android manifest, so the OS will hand a tapped link to the app — the app just never routes it anywhere once received.

## Part 6 — EES dual-schema conflict: confirmed both sides (task #53)

`oxford/index.ts` writes an `EESTransaction` shape; `oxford/ees.ts` writes a distinctly different `EESRecord` shape (`guestId, amount, paid, paidAt?, weekStart, houseId`) — into the **same** `ees-records` Firestore collection. Any reader on one side gets undefined/garbage fields for documents written by the other side. Both write paths are live and both have real callers — this is an active schema conflict, not dead code on either side.

---

## Part 7 — Cloud Functions callable inventory (cross-referenced against every mobile call site)

Full export list from `functions/src/index.ts`, assembled from the audit batches:

**Callable:** `addGuestAuthorization`, `addAdminAuthorization`, `deleteAdminAuthorization`, `promoteGuestsToAdmin`, `removePrivilegesForGuests`, `verifyUserEmail`, `givePotentialSuperAdminPrivilege`, `findMeetings`, `userIsAtMeeting`, `createPaymentIntent`, `listPayments`, `listHousePayments`, `getPaymentMethod`, `updatePaymentInfo`, `connectStripeAccount`, `disconnectStripeAccount`, `getStripeAccountStatus`, `createOperatorSubscription`, `reactivateOperatorSubscription`, `cancelUserSubscription`, `updateSubscriptionGuests`, `updateSubscriptionHouses`, `applyBundleDiscount`, `createBillingPortalSession`, `sendInviteEmails`, `sendConfirmationEmail`, `setOxfordEnabled`, `complianceExport`, `rentRoiMetrics`, `createInvitation`, `peekInvitation`, `redeemInvitation`.

**HTTP:** `stripeConnectReauth`, `stripeConnectReturn`, `universal`.

**Webhooks:** `stripeWebhook` (deployed as `stripeEvents`), `handleStripeConnectWebhook`.

**Firestore triggers:** `notify`, `notifyNewHouseCreated`, `sendContactEmail`, `sendSubscriptionUpdateEmail`, `reportBug`, `submitFeedback`, `onGuestWrite`, `notifyOperatorOnApplication`.

**Scheduled:** `scheduledRentCollection`, `officerTermReminder`, `overdueRentNotification`, `updateDisputes`, `weeklyTransfers`, `warmWebsite`.

**Confirmed zero mobile/web callers (orphaned):** `sendInviteEmails`, `complianceExport`, `setOxfordEnabled` (see Part 1.7 for detail).

**Confirmed web-only, not mobile (expected, not a bug):** `createOperatorSubscription`, `reactivateOperatorSubscription`, `cancelUserSubscription`, `createBillingPortalSession`, `sendConfirmationEmail`, `getPaymentMethod`, `updatePaymentInfo`.

**All other callable-name references from mobile were verified correct** — no string-name typos or signature mismatches found anywhere in this audit.

---

## Part 8 — Dead code inventory (lower priority — safe to schedule, not urgent)

These don't break anything today because nothing reaches them, but they're either landmines (could get accidentally wired up wrong) or straightforward cleanup. Full disposition (REUSE/DELETE/ARCHIVE) can follow the same process as `dead-code-audit-2026-07-04.md`.

**Status: actioned 2026-07-06**, except the one item explicitly flagged below for a product decision. Every deletion was re-verified against a fresh monorepo-wide grep immediately before removal (not just trusted from this doc's 2026-07-05 findings) — one item (`authSlice.ts`, flagged dead in `dead-code-audit-2026-07-04.md`) turned out to have since become live again via real `dispatch(login(...))`/`dispatch(logout())` call sites and was correctly left alone.

- **Entirely dead Redux slices:** `uiSlice.ts` (all 7 actions, zero dispatch sites), `notificationsSlice.ts`'s five thunks (superseded by React Query), `themeSlice.ts`'s `setTheme`, `navigationSlice.ts`'s `setTitle`/`setModalShowing`. — **DONE.** `uiSlice.ts` and `navigationSlice.ts` were deleted entirely (zero reads too, not just zero dispatches) along with their store registration and ~40 test files' local store setups that included them defensively. The 5 notification thunks were removed from `notificationsSlice.ts` (slice itself kept — `setFcmToken`/`addNotification`/etc. are still live). `setTheme` was removed from `themeSlice.ts` (slice kept — `state.theme.theme` is still read by `appSelectors.ts`).
- **Duplicate HOC implementations:** `rats-hoc.tsx` (flat file) and `rats-hoc/withRats.tsx` + its barrel are byte-identical; all 5 real importers resolve to the flat file, making the directory version dead. `withTimePicker` (in the `weekdays` barrel) is imported/re-exported but never applied anywhere. — **DONE.** Deleted `rats-hoc/withRats.tsx` + `rats-hoc/index.tsx` (kept `withNotifier.tsx`/`withPopover.tsx`/`withStatUpdateModal.tsx`/`withLoadingModal.tsx` — those ARE individually imported via explicit sub-paths and are live). Deleted `weekdays/withTimePicker.tsx` and its barrel re-export.
- **~30 dead barrel `index.ts` files** across `screens/` and `components/` — **PARTIALLY DONE 2026-07-06.** A scripted sweep (matching every import specifier ending exactly at each barrel directory's bare name, monorepo-wide, excluding the barrel's own directory) found 16 barrels with **zero** production or test consumers of the bare path; 15 were confirmed pure re-export files and deleted (`filters`, `summary-list-item`, `tab-bar`, `Activity`, `Contacts`, `CreateGuest`, `GuestUpdate`, `HouseConfig`, `Landing`, `Profile`, `SetupWizards`, `SetupWizards/PhaseSetup`, `Splash`, `StatUpdates`, `SubscriptionUpdateModal`). **One near-miss caught before it shipped:** `keyboard-view/index.tsx` matched the "zero consumers" heuristic but turned out to be the actual component implementation (no sibling concrete file) rather than a re-export barrel — restored immediately via `git checkout`. Three sibling test files (`tab-bar`, `summary-list-item`, and the restored `keyboard-view`'s own) imported via `'../index'`, which the bare-path heuristic doesn't catch (it doesn't end in the directory name) — found via a second, targeted grep and fixed to import the concrete file directly. Full suite re-verified green (283/283) after each step, plus a `tsc --noEmit` pass with zero new "cannot find module" errors. **Remaining scope:** ~15-20 more barrels have exactly 1-2 real consumers (mix of production and test-only) — lower confidence, would require redirecting each consumer to the concrete file before deleting, and the keyboard-view near-miss argues for checking each individually rather than batching. Left for a follow-up pass.
- **Unreachable, fully-built screens with test coverage:** `ChoreRotationSetupScreen.tsx`, `HouseChoreSummary.tsx` (chore-rotation ordering and completion dashboard — both wired to real hooks, neither registered in any navigator). — **FLAGGED FOR PRODUCT DECISION, not actioned.** Re-confirmed 2026-07-06 both are still fully unreachable (no navigator/route-type references). User explicitly chose not to guess at wiring these in or delete them — needs a product call on where (if anywhere) they should be linked from before any code changes.
- **`types/navigation.ts`** — an orphaned, incomplete duplicate of the real `navigation/types.ts` (4 routes vs. the full enum); zero importers. — **DONE**, deleted.
- **`mobile/src/screens/StatUpdates/MeetingSearch/index.ts`** re-exports a `const` (`MEETING_DESCRIPTION_TEXT`) via `export type` — Babel's type-stripping erases it at runtime. Currently dormant (no live consumer), but a landmine for whoever imports it next. — **DONE**, split into a real value export + `export type` for the actual type (`WeekDay`).
- **`util/notification.ts`'s `createNewMeetingNotifications`/`createAdminNotifications`** — zero production callers; may be superseded by a server-side Firestore trigger, not fully confirmed. — **DONE.** Re-confirmed zero callers monorepo-wide; deleted (the whole file, since these were its only two exports) along with its test file.
- **Already-known, reconfirmed still dead:** `Invites.tsx` (100% commented out), `CreateGuestStyles.tsx` (empty file). — **DONE**, both deleted.

---

## Suggested next steps

This is a lot to act on — the volume itself is the headline finding (the same wiring gap repeated across 5+ screens is a process problem, not five unrelated bugs). Suggested triage:

1. ~~**`RentPaymentScreen.tsx` (Part 2.1)**~~ **Done 2026-07-05**, along with the more severe cents/dollars display bug found while fixing it (2.1a), the manual-payment `rentOwed` decrement (2.2), and `stripePaymentIntentId` propagation (2.3). This was the single highest-priority item in this document — a resident-facing "pay rent" flow that never charges anyone while claiming success, compounded by a bug that would have caused 100x overcharges had the first bug been fixed alone.
2. **The setup-wizard family (Part 1)** needs a single, coordinated fix rather than five separate patches — likely: finish the HOC→hook migration properly by adding the missing dispatch functions to `useHouseSetupWizard` (or a paired `useHouseSetupWizardActions` hook), and decide whether `HouseConfig`/`CreateGuest`/`GuestUpdate` should be deleted (superseded) or reconnected. This is now the top remaining priority.
3. **Push notifications (Part 3) and deep linking (Part 5)** are both "the whole feature doesn't work, for everyone" findings — worth confirming urgency with product before scheduling, since they're not data-integrity risks but are complete feature failures.
4. Everything in **Part 4** is real but independently fixable — good candidates for a batch of small, low-risk PRs.
5. **Part 8** can wait for a dedicated cleanup pass alongside the existing `dead-code-audit-2026-07-04.md` disposition work.
