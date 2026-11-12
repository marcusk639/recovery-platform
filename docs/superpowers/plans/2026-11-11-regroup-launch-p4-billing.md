# Regroup Launch P4a: Server-Side Billing Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the subscription webhooks and checkout correct on the server, so the payment suite's remaining red subscription rows (`SUB-003`, `021`, `030`, `031`, `041`, `042`, `048`, `050`) pass.

**Architecture:** Every subscription webhook re-reads the subscription from Stripe and acts on its current state, so late, retried or out-of-order events can't move it backwards (owner decision, 2026-11-11). The operator record (`users/{uid}.subscriptionMetadata.status`) follows Stripe as the houses do. Grace is measured from the failed invoice's `finalized_at`, read from the event, since an invoice's `finalized_at` never changes. Two server switches, the paywall kill switch and a new sales-open switch, change without a deploy.

**Tech Stack:** Firebase Functions v2 (TypeScript, Node 22), Firestore Admin SDK, Stripe Node SDK (API `2026-01-28.clover`), Jest, Firestore rules tests on the emulator.

**Spec:** `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md`: §3.2 items 1–4, §4.1 items 1, 4 and 8, §6.1. Test expectations come from `docs/superpowers/plans/2026-11-08-regroup-launch-p6-payment-suites.md` (the `SUB-*` catalog) and the tests in `regroup/e2e/src/payments/__tests__/`.

**Scope (owner decision, 2026-11-11):** server code, rules and scripts only. P4b, written when #160 merges and P3 is done, takes the rest of P4: mobile grace and catalog reads, the web copy and "coming soon" state, the web unit tests in CI (A5), the sandbox Portal and retry settings (A7; Regroup has its own Stripe account, separate from Homegroups, owner 2026-11-11), the live webhook event list, the clean seeder, the legacy fixture and the backfills, correcting the `entitlement.ts:46-54` comment, and verifying, then fixing if real, two defects §3.2 item 4 reports: `useOxfordGate` reading the wrong user's `oxfordEnabled`, and the orphan `users` doc a failed checkout leaves behind.

## Global Constraints

- Work in `/Users/marcusklein/dev/rp-p4` (branch off `origin/main`). Use `git -C <path>`, never `cd <path> && git`.
- Commit scopes name the product: `fix(regroup-functions):`, `fix(regroup):` for rules, `docs(regroup):`, `test(regroup):`.
- Never `--no-verify`. New files are ≤ 300 lines. `stripeWebhook.ts` (1926 lines) is legacy-oversized: put new logic in new modules and keep its edits to wiring.
- No PII in logs, test data or commits. Scripts log counts and document or Stripe IDs only.
- **Deploy freeze:** nothing in this plan is deployed. Functions, rules and indexes deploy in P8. Writing to any live or staging Firestore or Stripe needs the owner's yes.
- **Money paths:** the PR gets an independent reviewer who reasons from the domain model, not from the tests (spec §6).
- **Grace rule (owner):** 7 days from the first failed invoice's `finalized_at`. Retries and late delivery don't restart it. A successful payment ends it. When Stripe cancels, access ends.
- **Trial length (owner):** `TRIAL_PERIOD_DAYS` in `functions/src/api/stripe.ts` is the only definition.
- Existing tests that change are listed in the PR body, which carries the `test-change-approved` label.

## Review Focus

1. **`customer.subscription.updated` (past due) arriving before `invoice.payment_failed`.** Stripe sends both, in no fixed order. A house set to `past_due` with no deadline is denied at once (`evaluateEntitlement`, `util/entitlement.ts:60-66`; the mobile gate does the same). So the update handler sets the deadline too, from the subscription's latest invoice, and both handlers produce the same deadline. Task 1 tests it.
2. **A stale deadline left on a house** (a success event was missed months ago) must not cut short a new grace. Only a deadline later than the new invoice's `finalized_at` counts as "already in grace". Task 1 tests it.
3. **A Stripe read failing mid-handler** must fail the event, so the webhook answers 500 and Stripe redelivers. It must never be logged and marked done. `handleInvoicePaymentSucceeded` swallows errors today. The tests throw a plain `Error`: a `PermanentWebhookError` is marked done by design (`isPermanent`, `stripeWebhook.ts:1354`). Tasks 1 and 2 test it.
4. **A status houses don't know** (`incomplete`, `incomplete_expired`, `paused`) leaves the houses unchanged and records Stripe's value on the operator, so `createHouses` refuses. Task 1 tests it.
5. **A missing or malformed `config/sales` doc** means closed, for checkout and for the catalog alike. Task 4 tests it.
6. **Reactivating a canceled legacy subscription** (stored metadata without a `tier`) must not recreate the legacy shape. It is refused, and the operator buys a tier through checkout. Task 3 tests it.

---

### Task 1: Subscription events apply Stripe's current state to the subscription, houses and operator

**Files:**

- Create: `regroup/functions/src/webhooks/subscriptionState.ts`, `regroup/functions/src/util/grace.ts`
- Modify: `regroup/functions/src/webhooks/stripeWebhook.ts`: `updateHouseSubscriptionStatus` (`:240`), `handleSubscriptionUpdated` (`:1122`), `handleSubscriptionDeleted` (`:1067`), the event switch (`:1673-1685`)
- Test: `regroup/functions/src/__tests__/webhooks/subscriptionState.test.ts` and `regroup/functions/src/__tests__/util/grace.test.ts` (new; the first uses the mocks of `__tests__/webhooks/syncOperatorTier.test.ts`); add cases to `__tests__/webhooks/stripeWebhook.test.ts` in the `customer.subscription.updated` (`:475`) and `customer.subscription.deleted` (`:1460`) blocks

**Interfaces:**

- Consumes: `periodEndSeconds(sub)` from `util/subscriptionPeriod.ts`; `operatorStatusToHouseStatus(status)` from `util/entitlement.ts`; `syncOperatorTier` unchanged.
- Produces:
  - `operatorStatusFromStripe(sub: Stripe.Subscription): string`
    - Returns `"cancelling"` when `sub.cancel_at_period_end` is true and `sub.status` is `active` or `trialing`. That flag is how both the Customer Portal (API `2026-01-28.clover`) and `cancelUserSubscription` mark a pending cancel; nothing sets `cancel_at`.
    - Otherwise returns `sub.status`. This keeps the meaning that `cancelUserSubscription` and `reactivateOperatorSubscription` already give `cancelling`.
  - In `util/grace.ts`:
    - `GRACE_PERIOD_DAYS = 7`
    - `invoiceFinalizedAt(invoice: Stripe.Invoice): number`: returns `status_transitions.finalized_at`, in seconds. It falls back to `invoice.created`, and the caller logs a warning when it does.
    - `graceDeadline(existing: unknown, finalizedAtSeconds: number): string`
      - Computes `candidate` = `finalizedAtSeconds + 7 days`.
      - Returns the ISO string of the earlier of `candidate` and `existing`. `existing` only counts when it parses and is later than `finalizedAtSeconds`; otherwise the result is `candidate`.
  - `updateHouseSubscriptionStatus`'s 4th parameter becomes `grace?: { finalizedAt: number } | "clear"`.
    - `{finalizedAt}` writes `graceDeadline(doc.get("guestGraceEndsAt"), finalizedAt)` to each house.
    - `"clear"` writes `FieldValue.delete()`.
  - `syncOperatorStatus(operatorUid: string, fresh: Stripe.Subscription): Promise<"updated" | "other subscription">`
    - Runs in a transaction, and only when `subscriptionMetadata.subscriptionId === fresh.id`.
    - Writes `subscriptionMetadata.status` = `operatorStatusFromStripe(fresh)` and `subscriptionMetadata.lastUpdatedAt` (ISO).
    - Writes `subscriptionMetadata.currentPeriodEnd` = `periodEndSeconds(fresh) * 1000`, only when that isn't null.

- [ ] **Step 1: Write the failing unit tests** in `subscriptionState.test.ts`:
  - `operatorStatusFromStripe`: `{status:'trialing', cancel_at_period_end:true}` → `'cancelling'`; `{status:'active', cancel_at_period_end:false}` → `'active'`; `{status:'past_due', cancel_at_period_end:true}` → `'past_due'`; `{status:'incomplete'}` → `'incomplete'`.
  - In `grace.test.ts`:
    - `graceDeadline(undefined, 1767225600)` → `'2026-01-08T00:00:00.000Z'`.
    - An existing `'2026-01-05T00:00:00.000Z'` with finalized `1767225600` (Jan 1) → kept.
    - An existing `'2026-01-20T00:00:00.000Z'` → replaced by Jan 8.
    - An existing `'2025-10-01T00:00:00.000Z'`, earlier than the finalized time, → ignored, giving Jan 8 (Review Focus 2).
    - An existing `'garbage'` → Jan 8.
    - `invoiceFinalizedAt({status_transitions:{finalized_at:null}, created:1767000000})` → `1767000000`.
  - `syncOperatorStatus` writes `status: 'canceled'` and `currentPeriodEnd: 1767225600000` for a fresh `{id:'sub_1', status:'canceled'}` whose item has `current_period_end: 1767225600`, and returns `'updated'`.
  - It returns `'other subscription'` and writes nothing when the operator's `subscriptionId` is `'sub_2'`.
  - It leaves `currentPeriodEnd` unset when the item has no `current_period_end`.
- [ ] **Step 2: Write the failing handler tests** in `stripeWebhook.test.ts`:
  - `customer.subscription.updated` with payload `status:'active'`, while `subscriptions.retrieve` resolves `status:'canceled'` → the `subscriptions` doc update has `status:'canceled'`, every house gets `subscriptionStatus:'canceled'`, and the operator record has `status:'canceled'` (SUB-041).
  - `customer.subscription.created` gets the same handling as `updated` (one case: it calls `subscriptions.retrieve` and writes the retrieved status).
  - `updated`, retrieved as `{status:'trialing', cancel_at_period_end:true}` → houses `trialing`, operator `cancelling` (SUB-030).
  - `updated`, retrieved as `status:'past_due'` with `latest_invoice.status_transitions.finalized_at: 1767225600`, and no failure event yet → houses `past_due` with `guestGraceEndsAt:'2026-01-08T00:00:00.000Z'` (Review Focus 1). `subscriptions.retrieve` is called with `expand: ['latest_invoice']`.
  - `updated`, retrieved as `status:'active'`, for a house with a deadline → the deadline is deleted.
  - `updated`, retrieved as `status:'incomplete'` → no house is written, operator `incomplete`.
  - `updated` when `subscriptions.retrieve` rejects with a plain `Error` → the response is 500 and the event marker is `failed`.
  - **A subscription Regroup has no record of** (made outside checkout, e.g. in the Dashboard): `updated`, `created` and `deleted` for a subscription with no `subscriptions` doc and no `userId` metadata → 200, marker `done`, `subscriptions.retrieve` not called, and no Firestore write or push.
  - `customer.subscription.deleted` → operator `status:'canceled'` (SUB-031). The past-due and canceled pushes go to `sendFcmToUser(operatorUid, …)`, not `sendFcmToHouseAdmins("")`.
- [ ] **Step 3: Run them and see them fail**
      Run: `cd regroup/functions && npx jest src/__tests__/webhooks/subscriptionState.test.ts src/__tests__/util/grace.test.ts src/__tests__/webhooks/stripeWebhook.test.ts`
      Expected: FAIL (modules not found; the handler writes the payload's status).
- [ ] **Step 4: Implement `subscriptionState.ts` and `grace.ts`, change `updateHouseSubscriptionStatus`'s grace parameter, then rewire the handlers.**
  - Every subscription and invoice handler keeps its `subscriptions` doc lookup first, and returns before any Stripe read or push when there is none. A subscription made outside checkout has no doc, and costs no Stripe call.
  - `handleSubscriptionUpdated` then retrieves `fresh`, with `expand: ['latest_invoice']`, and takes the status, period end, plan and guest count from `fresh`.
    - Houses get `operatorStatusToHouseStatus(fresh.status)`. When that is null, log a warning with the status and skip the houses.
    - Grace: `{finalizedAt: invoiceFinalizedAt(fresh.latest_invoice)}` when `fresh.status` is `past_due` and the latest invoice was expanded; `"clear"` when it is `active` or `trialing`; nothing otherwise.
    - Then `syncOperatorStatus(operatorUid, fresh)`, then `syncOperatorTier` as now.
  - Route `customer.subscription.created` to `handleSubscriptionUpdated`.
  - `handleSubscriptionDeleted` uses the payload (deletion is terminal) and adds `syncOperatorStatus(operatorUid, subscription)`.
  - Both handlers push to the operator through `sendFcmToUser`, with the uid from `resolveOperatorUid`.
- [ ] **Step 5: Run the tests and see them pass,** then the whole package: `cd regroup/functions && npx tsc --noEmit && npm test`. Expected: all pass.
- [ ] **Step 6: Add one line to `regroup/functions/CLAUDE.md` under "Webhook security".** It says subscription events re-read the subscription from Stripe and write its status to the `subscriptions` doc, the houses and `users.subscriptionMetadata.status`, and that `cancelling` means set to cancel at period end.
- [ ] **Step 7: Commit:** `fix(regroup-functions): subscription events apply Stripe's current state to houses and the operator`

### Task 2: Invoice events: grace from the invoice, stale failures ignored

**Files:**

- Modify: `stripeWebhook.ts`: `handleInvoicePaymentSucceeded` (`:910`), `handleInvoicePaymentFailed` (`:986`), and its switch case (`:1669`), which now passes `getStripe()`
- Test: cases in `stripeWebhook.test.ts` in the `invoice.payment_succeeded` (`:1378`) and B8 (`:2029`) blocks

**Interfaces:**

- Consumes from Task 1: `syncOperatorStatus`, `operatorStatusToHouseStatus`, `invoiceFinalizedAt`, and `updateHouseSubscriptionStatus`'s `grace` parameter.

- [ ] **Step 1: Write the failing handler tests:**
  - **First failure:** `invoice.payment_failed` with `finalized_at: 1767225600`, retrieved as `status:'past_due'` → houses `past_due` with `guestGraceEndsAt:'2026-01-08T00:00:00.000Z'` (SUB-021, SUB-048), and the operator is `past_due`.
  - **Retry:** the same event for a house that already has that deadline → deadline unchanged.
  - **Stale failure:** retrieved as `status:'active'` → no house, `subscriptions` doc or operator write, and no push (SUB-042).
  - **Unpaid:** retrieved as `status:'unpaid'` → houses `unpaid` with no grace field written.
  - **Success, Stripe still past due:** `invoice.payment_succeeded`, retrieved as `status:'past_due'` → houses stay `past_due` and the deadline isn't deleted. Retrieved as `active` → houses `active` and the deadline is deleted.
  - **Read failure:** `invoice.payment_succeeded` when `subscriptions.retrieve` rejects with a plain `Error` → 500, marker `failed` (Review Focus 3).
  - **Same deadline both ways:** an `updated` (past due) event and then a `payment_failed` event for the same invoice leave one deadline, `finalized_at` + 7 days.
  - **Push target:** the failure push goes to `sendFcmToUser` with the subscription doc's `userId`.
  - **Existing tests:** change the shared `mockSubscriptionsRetrieve` default to include `status:'active'`, and set `past_due` in the existing failure tests (`:2192` and its neighbours). List this in the PR body.
- [ ] **Step 2: Run them and see them fail:** `cd regroup/functions && npx jest src/__tests__/webhooks/stripeWebhook.test.ts`. Expected: FAIL, because the deadline is `now + 48h`.
- [ ] **Step 3: Implement.** Both invoice handlers take `stripeClient`, retrieve `fresh` before writing anything, and let errors propagate (remove the `try/catch` in the success handler).
  - **Failed:** if `fresh.status` is neither `past_due` nor `unpaid`, log `invoice.payment_failed: already resolved in Stripe` with the IDs and return.
    - Otherwise write `fresh.status` to the `subscriptions` doc and to the houses.
    - Pass grace `{finalizedAt: invoiceFinalizedAt(invoice)}` only for `past_due`.
    - Then `syncOperatorStatus`, and push to the operator.
    - Remove the `attempt_count` status guess.
  - **Succeeded:** write `fresh.status` to the `subscriptions` doc and the houses. Pass `"clear"` only when it is `active` or `trialing`. Then `syncOperatorStatus`.
- [ ] **Step 4: Run the tests and see them pass,** then `npx tsc --noEmit && npm test`.
- [ ] **Step 5: Update the grace line in `regroup/functions/CLAUDE.md`, and the house-status entry in `.pr-review/contract-map-regroup.md`.** The new text: grace = the first failed invoice's `finalized_at` + 7 days, kept across retries, cleared by a success that Stripe confirms.
- [ ] **Step 6: Commit:** `fix(regroup-functions): grace runs 7 days from the failed invoice, and stale invoice events change nothing`

### Task 3: Checkout and reactivation refuse the legacy shape

**Files:**

- Modify: `regroup/functions/src/callable/subscriptions.ts`: `createOperatorSubscription` (the refusal goes before the tier lookup, ~`:185`), and `reactivateOperatorSubscription`'s `canceled` branch (~`:367`)
- Test: `regroup/functions/src/__tests__/callable/subscriptions.test.ts`

**Interfaces:**

- Consumes: `isTierBillingEnabled()` from `config.ts`.
- Produces: refusals with `HttpsError("failed-precondition", …)` that don't touch Stripe.

- [ ] **Step 1: Write the failing tests:**
  - With `TIER_BILLING_ENABLED` unset, `createOperatorSubscription` rejects with `failed-precondition`, and no Stripe `customers.create` or `subscriptions.create` mock is called (SUB-003).
  - `reactivateOperatorSubscription` for a `canceled` operator whose stored metadata has no `tier` rejects with `failed-precondition` and creates nothing (Review Focus 5).
  - With billing off, the canceled branch also rejects.
  - Rewrite the two legacy-path tests at `:394` ("grants the claim after a successful legacy subscription…") and `:469` ("writes a legacy subscription through writeOperatorSubscription"). Each now asserts the refusal, so the test count stays the same. List both in the PR body.
- [ ] **Step 2: Run them and see them fail:** `cd regroup/functions && npx jest src/__tests__/callable/subscriptions.test.ts`.
- [ ] **Step 3: Implement.** Messages:
  - Billing off: `"New subscriptions are not available right now"`.
  - Legacy reactivation: `"This plan is no longer offered. Choose a plan to subscribe again."`
  - The legacy code path itself stays (spec §4.1 item 4: removing it is post-launch cleanup).
- [ ] **Step 4: Run the tests and see them pass,** then `npx tsc --noEmit && npm test`.
- [ ] **Step 5: Commit:** `fix(regroup-functions): checkout refuses when tier billing is off, with no legacy fallback`

### Task 4: Sales-open switch, and the catalog reports it with the trial length

**Files:**

- Create: `regroup/functions/src/util/salesSwitch.ts`
- Modify:
  - `regroup/functions/src/callable/subscriptions.ts`: both entry points from Task 3, after its checks.
  - `regroup/functions/src/callable/getTierCatalog.ts`: `TierCatalogResponse` (`:40`) and the handler (`:128`).
  - `regroup/functions/src/api/firestore.ts`: add `salesConfigRef` next to `rentConfigRef` (`:49`).
  - `regroup/e2e/jest.payments.config.js`: add `globalSetup` pointing at a new `regroup/e2e/src/payments/harness/openSales.ts`. The suite has no setup hook today. Its default export writes `config/sales` = `{open: true}` to the emulator through the harness's Firestore REST helpers (`firestoreRest.ts`), after `assertSafeTarget()`.
  - Callers that subscribe and need sales open: the payment suite (above), and the staging operator automation (`regroup/e2e/src/stagingOperator/run.ts`), which needs the staging doc (Task 8, Step 5).
- Test: `regroup/functions/src/__tests__/util/salesSwitch.test.ts` (new); cases in `__tests__/callable/subscriptions.test.ts` and `__tests__/callable/getTierCatalog.test.ts`

**Interfaces:**

- Produces:
  - `salesConfigRef = () => configCollection.doc("sales")`
  - `isSalesOpen(): Promise<boolean>`
    - Reads `config/sales.open` with the Admin SDK, uncached, so closing it stops checkout at once (spec §6.1).
    - Returns `true` only for a boolean `true`. A missing doc, a missing or non-boolean field, or a read error gives `false`. Log `salesSwitch.read_failed` on an error.
  - `TierCatalogResponse` gains `salesOpen: boolean` and `trialDays: number`.
    - `trialDays` is `TRIAL_PERIOD_DAYS`.
    - `salesOpen` is cached for 60 seconds, apart from the hour-long price cache. `getTierCatalog` is public and unauthenticated, so an uncached read would cost one Firestore read per call. Checkout itself reads the switch uncached, which is what "stops at once" (spec §6.1) needs.

- [ ] **Step 1: Write the failing tests:**
  - `isSalesOpen` → `true` for `{open:true}`. It is `false` for each of: no doc, `{open:'true'}`, `{}`, and a rejected read (Review Focus 4).
  - `createOperatorSubscription`, with billing on and sales closed, rejects with `failed-precondition` and the message `"Subscriptions open when the new Regroup app is released"`. Stripe is not called.
  - The reactivation canceled branch, with sales closed, rejects the same way.
  - `getTierCatalog` returns `trialDays: 7`. After the doc closes, it still returns `salesOpen: true` within 60 seconds and `false` after 61 (fake timers), while prices keep their hour-long cache.
- [ ] **Step 2: Run them and see them fail:** `cd regroup/functions && npx jest src/__tests__/util/salesSwitch.test.ts src/__tests__/callable/subscriptions.test.ts src/__tests__/callable/getTierCatalog.test.ts`.
- [ ] **Step 3: Implement,** and add the e2e `globalSetup`. The existing unit tests that subscribe mock `isSalesOpen` to `true`; list them in the PR body.
- [ ] **Step 4: Run the tests and see them pass,** then `npx tsc --noEmit && npm test`, and `cd regroup/e2e && npx tsc --noEmit`.
- [ ] **Step 5: Add a "Sales-open switch" line to `regroup/functions/CLAUDE.md`, next to the rent stop switch.** It says the switch is `config/sales.open`, missing means closed, it's set with Task 5's script, it's closed in production until launch step 10.5, and it's open on staging and the emulators.
- [ ] **Step 6: Commit:** `feat(regroup-functions): a server-enforced sales-open switch, reported by the tier catalog with the trial length`

### Task 5: The paywall kill switch works, and both switches have a script

**Files:**

- Modify: `regroup/mobile/firebase/firestore.rules`: add the match next to `match /config/{configId}` (`:677`)
- Create: `regroup/mobile/firebase/__tests__/paywallConfig.rules.test.ts` (follow `billingIds.rules.test.ts`)
- Create: `regroup/functions/src/scripts/setServerSwitch.ts`, plus `"switch:set"` in `regroup/functions/package.json`
- Test: `regroup/functions/src/__tests__/scripts/setServerSwitch.test.ts` (new)

**Interfaces:**

- Rules: `match /paywall/config { allow read: if request.auth != null; allow write: if false; }`
  - Mobile's `useSubscriptionGate` already treats `enabled === false` as off and anything else as on. Server `isPaywallEnabled` does the same, so nothing else changes.
- Script: `npm run switch:set -- --switch=paywall|sales --value=true|false [--apply]`
  - Built on `scriptBootstrap`, so the target project is logged.
  - The dry run prints the current and intended value. `--apply` writes `paywall/config.enabled` or `config/sales.open` and prints the value read back.
  - Exports `parseSwitchArgs(argv: string[]): { path: string; field: string; value: boolean; apply: boolean }`. It throws on an unknown switch or a value other than `true` or `false`.

- [ ] **Step 1: Write the failing rules tests:**
  - A signed-in user can read `paywall/config`; an unauthenticated user cannot (SUB-050).
  - A signed-in user cannot write it.
  - `paywall/other` is denied.
- [ ] **Step 2: Write the failing script tests:**
  - `parseSwitchArgs(['--switch=sales','--value=false'])` → `{path:'config/sales', field:'open', value:false, apply:false}`.
  - `--switch=paywall --value=true --apply` → `{path:'paywall/config', field:'enabled', value:true, apply:true}`.
  - `--value=yes` throws, and `--switch=rent` throws.
- [ ] **Step 3: Run them and see them fail.**
  - Rules: `cd regroup/mobile && npm run test:rules -- paywallConfig`, with the Firestore emulator up as `regroup/mobile/CLAUDE.md` describes.
  - Script: `cd regroup/functions && npx jest src/__tests__/scripts/setServerSwitch.test.ts`.
- [ ] **Step 4: Implement the rule and the script.**
- [ ] **Step 5: Run the rules suite and the functions suite and see them pass.**
  - Rules: `cd regroup/mobile && npm run test:rules`. Expected: every suite passes, the new one included.
  - Functions: `cd regroup/functions && npm test`.
- [ ] **Step 6: Document both switches and the script in `regroup/docs/operations/data-recovery.md`, under a new "Server switches" heading.** Cover:
  - `paywall/config.enabled=false` lets every house in without a deploy. Use it to undo a launch-day paywall mistake.
  - `config/sales.open`, from Task 4.
  - Each command, run with the dry run first.
- [ ] **Step 7: Commit:** `fix(regroup): the paywall kill switch is readable when signed in, and both server switches have a script`

### Task 6: The rest of the subscription events, and the launch-cancellation marker

**Files:**

- Create: `regroup/functions/src/webhooks/subscriptionNotices.ts`
- Modify: the `stripeWebhook.ts` event switch; `handleSubscriptionDeleted`
- Test: `regroup/functions/src/__tests__/webhooks/subscriptionNotices.test.ts` (new)

**Interfaces:**

- Produces:
  - `LAUNCH_CANCEL_METADATA_KEY = "regroup_launch_cancel"`
  - `isLaunchCancellation(sub: Stripe.Subscription): boolean`: true when that metadata value is `"true"`.
  - `trialEndingNotice(sub: Stripe.Subscription): { title: string; body: string } | null`
    - Returns null without a `trial_end`.
    - The title is `"Your free trial ends soon"`.
    - The body is `Your Regroup free trial ends on ${date}. Your card will be charged then unless you cancel.`
    - `date` uses `toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })`.
  - `PAYMENT_ACTION_NOTICE = { title: "Confirm your payment", body: "Your bank needs you to confirm your Regroup payment. Open billing in Regroup to finish it." }`
- Wiring:
  - `customer.subscription.trial_will_end`: push `trialEndingNotice` to the operator.
  - `invoice.payment_action_required`: push `PAYMENT_ACTION_NOTICE` to the operator, using the invoice's subscription. The status change arrives through `customer.subscription.updated`.
  - `handleSubscriptionDeleted`: still writes `canceled` everywhere, but skips the push when `isLaunchCancellation(subscription)`.

- [ ] **Step 1: Write the failing tests:**
  - `isLaunchCancellation` with metadata `{regroup_launch_cancel:'true'}` → true; `{}` → false.
  - `trialEndingNotice` for `trial_end: 1767225600` → body contains `"January 1"`; no `trial_end` → null.
  - In `stripeWebhook.test.ts`:
    - `trial_will_end` and `payment_action_required` each call `sendFcmToUser` once, with the operator uid and the copy above.
    - A deleted subscription with the marker writes `canceled` and sends no push.
    - One without the marker still pushes.
    - `trial_will_end` and `payment_action_required` for a subscription Regroup has no `subscriptions` doc for → no push and no Stripe read.
- [ ] **Step 2: Run them and see them fail:** `cd regroup/functions && npx jest src/__tests__/webhooks/subscriptionNotices.test.ts src/__tests__/webhooks/stripeWebhook.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass,** then `npx tsc --noEmit && npm test`.
- [ ] **Step 5: In `regroup/functions/CLAUDE.md`, list the events the webhook handles.** Note that the live endpoint's event list must include them (P4b, A7).
- [ ] **Step 6: Commit:** `feat(regroup-functions): handle trial_will_end, payment_action_required and subscription.created; launch cancellations send no push`

### Task 7: The legacy-cancellation script

**Files:**

- Create: `regroup/functions/src/scripts/cancelLegacySubscriptions.ts`, plus `"legacy:cancel"` in `package.json`
- Test: `regroup/functions/src/__tests__/scripts/cancelLegacySubscriptions.test.ts` (new; Stripe is a hand-written fake)

**Interfaces:**

- Consumes: `LAUNCH_CANCEL_METADATA_KEY` (Task 6); `tierForPriceId` (`util/tierPricing.ts`).
- Produces:
  - `listLegacySubscriptions(stripe: Stripe): Promise<LegacyRecord[]>`
    - `LegacyRecord = { id; customer; status; items: { price: string; quantity: number }[]; metadata }`.
    - Includes every subscription in `active`, `trialing`, `past_due` or `unpaid` whose every item's price is in `LEGACY_PRICE_IDS`. That is an explicit list of the live legacy Regroup prices (spec §3.2 item 6: the `plan_HFkfwM5lQ…` Home and `plan_HFkh7QvRn…` Resident prices), read in full from Stripe and written into the script. An explicit list keeps an irreversible step to exactly the prices it means.
  - `listUnmatched(stripe: Stripe): Promise<string[]>`: the IDs of live subscriptions that are neither tier nor legacy. The dry run prints them as "not touched", so the owner sees everything the account holds.
    - Uses Stripe's auto-pagination.
  - `cancelListed(stripe: Stripe, records: LegacyRecord[], ids: string[], recordPath: string): Promise<string[]>`
    - Refuses unless every id is in `records`.
    - Refuses when `recordPath` is inside the git work tree.
    - Writes the chosen records to `recordPath` with mode `0o600` before any Stripe write.
    - Then, for each id: `subscriptions.update(id, { metadata: { [KEY]: "true" } })`, then `subscriptions.cancel(id)`.
    - Returns the canceled ids.
- CLI: `npm run legacy:cancel` lists the subscriptions, a dry run that prints the count and IDs only. `npm run legacy:cancel -- --apply --ids=sub_a,sub_b --record=<path>` cancels the listed ones.
  - The key is read from `STRIPE_SECRET_KEY`. For the live run it is a restricted key (`rk_live_`) with read and write on Subscriptions only, created for this step and revoked after it. The script refuses a full `sk_live_` key unless `--allow-full-key` is passed.
  - It prints `live` or `test` from the key prefix, and refuses to start without a key.

- [ ] **Step 1: Write the failing tests:**
  - **Filtering:** a fake with a tier subscription, a legacy `active` one, a legacy `canceled` one and an `active` one on an unrelated price → only the legacy `active` one is listed, and `listUnmatched` returns only the unrelated one.
  - **Key check:** an `sk_live_` key without `--allow-full-key` makes the CLI exit non-zero before any Stripe call; an `rk_live_` key is accepted.
  - **Unlisted id:** `cancelListed` with an id that isn't listed throws, and nothing is written or canceled.
  - **Path inside the repo:** a `recordPath` inside the repo throws.
  - **Order of operations:**
    - The record file exists with mode `0o600` before the first `update` call.
    - `update` with the marker comes before `cancel` for each id.
  - **Dry run:** the CLI's dry-run path calls no `update` or `cancel`.
- [ ] **Step 2: Run them and see them fail:** `cd regroup/functions && npx jest src/__tests__/scripts/cancelLegacySubscriptions.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and see them pass,** then `npx tsc --noEmit && npm test`.
- [ ] **Step 5: Add the launch-step usage to `regroup/docs/operations/data-recovery.md`, next to the §6.1 cancellation row.**
  - The owner confirms the listed IDs.
  - The record file is written outside the repo.
  - Cancellations run before the backfill.
- [ ] **Step 6: Commit:** `feat(regroup-functions): a dry-run-first script that cancels legacy subscriptions with the launch marker`

### Task 8: Prove it, record it, open the PR

**Files:**

- Modify: `regroup/mobile/docs/e2e/coverage-matrix.md`; `docs/superpowers/plans/2026-11-06-regroup-launch-roadmap.md` (the P4 row notes P4a done and names P4b)

- [ ] **Step 1: Run the server suites.**
  - Functions: `cd regroup/functions && npx tsc --noEmit && npm test`.
  - Rules: `cd regroup/mobile && npm run test:rules`.
  - Gate: `.claude/agent-gates/verify-diff.sh origin/main`.
  - Expected: all pass.
- [ ] **Step 2: Run the payment suite locally:** `cd regroup/e2e && npm run test:payments -- subscription`.
  - Expected: `SUB-003`, `021`, `024`, `030`, `031`, `041`, `042`, `048` and `050` pass.
  - Any other red is a new finding: file it and add it to the matrix.
  - SUB-025 can stall on a test clock (#234). Re-run it alone before calling it red.
  - `SUB-047` stays `missing`. Task 6 covers it with unit tests, and its server e2e test is P6's to write. It is a money row, so it can't be deferred at release: the P4b plan carries it as a reminder.
- [ ] **Step 3: Set those rows to `pass` in the coverage matrix,** then run `node scripts/coverage-matrix-check.js` in `regroup/mobile`. Expected: it exits 0.
- [ ] **Step 4: Have an independent money-path reviewer go over the branch diff.** It reasons from spec §4.1 item 1 and §6.1, not from the tests. Fix the Critical and High findings, each with a test.
- [ ] **Step 5: Ask the owner before writing `config/sales {open: true}` on the staging project, and write it before this code reaches staging.** The P3 round trips and the staging operator automation (`regroup/e2e/src/stagingOperator/run.ts`) subscribe there, and with Task 4 a missing doc means closed. Record the yes and the write in the PR body.
- [ ] **Step 6: Commit the docs, push, and open the PR with the `test-change-approved` label.** The PR body lists:
  - each existing test that changed (Tasks 2, 3 and 4);
  - the suite runs;
  - that nothing was deployed.
