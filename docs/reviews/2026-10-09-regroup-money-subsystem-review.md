# Codebase Review — Regroup Money/Rent Subsystem

**Date:** 2026-10-09
**Scope:** Regroup's money subsystem — 40 hand-written source files, ~11.5K lines
**Stack:** React Native 0.72 (mobile) · Firebase Functions v2 / TypeScript · Angular (web, owns the money path) · Firestore
**Branch reviewed:** `fix/regroup-money-units` (12 commits ahead of `origin/main`)
**Docs reviewed:** 7 (root + regroup CLAUDE.md, 2 prior registers, 2 plans, pathfinder flowchart, e2e guide)

> Written to `docs/reviews/` rather than overwriting `CODEBASE-REVIEW.md`, which remains the
> canonical 2026-05-31 56-finding register.

---

## Executive Summary

One CRITICAL defect was found and fixed: a navigation-reachable profile screen sent the
entire guest document on save, and because `mergeGuestStats` max-merges `rentOwed` as an
accumulator, a stale pre-payment balance beat the real one — re-billing rent a resident had
already paid. It is pre-existing and was untouched by the branch that prompted this review.

The review also **corrected the severity of this session's own earlier work**: the guest
update form whose cents/dollars bug was reported as a "live defect" sits on a screen that is
**not registered in navigation**. A July 2026 plan had already classified it correctly as a
latent risk "if this unreachable screen is ever reconnected".

| Severity | Count | Auto-fixed | Requires Decision |
| -------- | ----- | ---------- | ----------------- |
| CRITICAL | 3     | 1          | 2                 |
| HIGH     | 6     | 0          | 6                 |
| MEDIUM   | 6     | 0          | 6                 |
| Docs gap | 4     | 0          | 4                 |

All four specialist streams have now reported (all late). Their findings are in
*Specialist findings* below and are NOT yet fixed — they are larger than this pass and need
sequencing. Two are CRITICAL and verified first-hand.

---

## CRITICAL

### [C1] Profile save re-bills rent the resident already paid — FIXED

**Domain:** Payments / data integrity · **Confidence:** 95
**File:** `regroup/mobile/src/screens/Profile/EditUserInfoForm.tsx:137`

`updatedGuest: { ...guestArg, ...updates }` sent the whole guest document, not the edited
profile fields. `rentOwed` and `choreFees` rode along at whatever value the screen loaded.
`mergeGuestStats` (`src/services/guest.tsx:158-173`) max-merges both as accumulators
(`Math.max(current, update)`), so a stale higher balance beats the stored one.

Sequence: resident opens Edit Profile → pays rent (`src/services/payments.ts:278`,
`rentOwed: FieldValue.increment(-amountInCents)`) → saves the profile. The max-merge restores
the pre-payment balance; the resident is billed again.

Reachability confirmed: registered at `src/navigation/navigators.tsx:400-401` as
`Routes.EditUserInfo`. The `stats` allowlist (`:18-26`) contains only profile fields, so the
money fields were never intentionally part of this form.

**Fix applied:** send only the changed fields plus the `id` that `updateGuest` requires.
`mergeGuestStats` already backfills unchanged fields from the stored document.
Mutation-checked: restoring the spread fails the new test.

---

## HIGH

### [H1] No reachable path can correct or clear a resident's balance

**Domain:** Product / payments · **Confidence:** 90 · **Requires a decision**

The only client writer of `rentOwed` is `src/services/payments.ts:278`, a Stripe-payment
decrement. Searching every non-test writer turns up no reachable screen that sets an absolute
balance, because the one form that does — `GuestUpdate` — is not registered in navigation and
its only non-test importer (`screens/CreateGuest/CreateGuestForm.tsx`) is unregistered too.

So an operator cannot record a cash payment, apply a write-off, or correct a data-entry error.
For a sober-living product where rent is frequently paid in cash, that is a launch-blocking
product gap rather than a code defect. Decide whether `GuestUpdate` is reconnected (the
cents/dollars handling and authoritative-field work on this branch are prerequisites) or a
purpose-built adjustment flow with an audit trail is built instead.

---

## MEDIUM

### [M1] The unit brands cannot validate stored data
`regroup/mobile/src/services/crud.tsx:37,56` return `snapshot.data() as T`, so every entity
read is an unchecked cast. `Cents` is asserted, never verified — and
`functions/src/scripts/migrateBalanceToCents.ts` exists precisely because non-cent legacy
values occurred. A validating reader (`Number.isInteger(v) && v >= 0`) at the money read
boundary is the only place a corrupt stored value is catchable; the cost is one comparison
per field per document against a Firestore round-trip.

### [M2] ~12 hand-rolled `/100` formatters remain
`ResidentPayment`, `PaymentDashboard`, `BalanceDashboard`, `Treasury*`, `receiptService`,
`treasuryReport`, `rentPaymentHelpers`; `TreasuryDashboard.tsx:33` declares its own local
`formatCents`. A shared `util/money.ts` now exists but most sites do not use it. Deferred
deliberately — rewriting a dozen money display sites in one pass is how a 100x bug ships —
but it should be sequenced, not left open indefinitely. A previously documented instance
(Balance Aging rounding to whole dollars while the balance above it uses cents) is still open.

---

## Docs ↔ Code

All four require a decision; none were auto-fixed, because each is a judgement about intent
rather than a stale reference.

| Finding | Doc says | Code does | Recommendation |
| ------- | -------- | --------- | -------------- |
| The cents form bug was already known | `docs/plans/2026-07-07-regroup-next-steps.md:121` — "renders cents fields as unlabeled plain numbers (100x-error risk **if this unreachable screen is ever reconnected**)" | Accurate, and the screen is still unreachable | The July classification was right and this session initially overstated it. Keep the doc; it is better calibrated than the later report. |
| Float-dollar balance | `CODEBASE-REVIEW.md:506` (L14) — "Balance stored as float dollars, converted with `Math.round`"; `:564` recommends migrating to integer cents | Done: `rentOwed` is integer cents, `migrateBalanceToCents.ts` ran | Mark L14 resolved so it stops reading as open. |
| "Enforced by the migration" | `PATHFINDER-2026-06-06/01-flowcharts/regroup-finance-ops.md:203` — "Amounts are integer cents (enforced by the migration)" | A one-off script enforces nothing going forward; nothing validates on write or read | Reword: the unit is a convention, now type-asserted but not validated (see M1). |
| Balance Aging precision | `docs/plans/2026-07-07-regroup-next-steps.md:98` — item 18, rounds to whole dollars while the balance above uses cents | Still open | Fold into the M2 consolidation. |

---

## Correction to this session's earlier claims

Recorded because the report that preceded this one is wrong on the public record:

1. The guest-update cents bug was reported as **"a live defect, not a latent one"**. It is
   latent: the screen is unreachable. The fix is still correct as pre-reconnection hardening.
2. "An operator cannot record that a resident paid" was presented as a consequence of the
   max-merge. It is true, but for a different and larger reason — see H1.
3. The lost-update hole introduced and then fixed on this branch (`changedMoneyFields`) was
   also unreachable through that form. The *reachable* instance of the same bug class is C1,
   in a file the branch never touched.

---

## Incomplete coverage

Four specialist streams were dispatched (money correctness, security/rules, Firestore data
layer, architecture). Two went idle without delivering a report and two were still running
when this was written; subagent reports in this session have repeatedly arrived late or not
at all. **This review is therefore not a clean pass.** Specifically unverified here:

- Firestore rules on money collections, and whether deny-case tests exist for them
- Whether the `(autoPayEnabled, rentOwed)` composite index exists in the committed
  `firestore.indexes.json` — a prior session found it was `(autoPayEnabled, balance)`, which
  would make `scheduledRentCollection` throw `FAILED_PRECONDITION` on every run
- Whether the webhook accepts a test-mode signature on a live deployment (`event.livemode` unchecked)
- Idempotency and exactly-once review of the full charge → webhook → ledger chain

---

## Specialist findings (reported after the first draft; none fixed)

Verified first-hand where marked. Not fixed in this pass: each is a money or authz change
with migration or rules implications, and three cycles of fixes on this branch have shown
that rushing them introduces defects.

### [C2] `payments.amount` is dollars from the server and cents from the client — VERIFIED

**Confidence:** 95. The same 100x class this branch set out to fix, in a field the branded
types never covered.

- Webhook writes DOLLARS: `functions/src/webhooks/stripeWebhook.ts:356` (`amount: amountDollars`,
  from `paymentIntent.amount / 100` at `:319`).
- `recordManualPayment` writes CENTS: `mobile/src/services/payments.ts:263` (`amount: amountInCents`).
- `functions/src/callable/analytics.ts:41` declares the field DOLLARS and multiplies by 100
  at `:172`.

A $500 cash payment stored as `50000` is reported by `rentRoiMetrics` as **$50,000**.
Conversely Stripe-originated rows read as cents are 100x low. Fix: settle on cents in a new
`amountCents` field, change webhook + analytics + mobile together, migrate existing docs.
Do not rename in place — both unit conventions exist in live data.

### [C3] The webhook marks an event processed before handling it, then swallows the error — VERIFIED

**Confidence:** 92. `functions/src/webhooks/stripeWebhook.ts` — `checkAndMarkEventProcessed`
at `:1146`, handler at `:1174`, `catch` at `:1241` logs only, `res.status(200)` at `:1253`.

If `handlePaymentIntentSucceeded` throws, the event is already marked done, so Stripe never
retries: the charge succeeded, `rentOwed` is never decremented, and no payment doc is written.
The in-code comment justifies this as "Stripe best practices", which misapplies the rule —
200 is correct for an event successfully processed or deliberately ignored, not one whose
handler threw. The per-payment transaction at `:409` already makes re-delivery safe, so the
retry is free. Fix: mark processed only after success (or delete the marker in the `catch`)
and return non-2xx on a thrown handler. Related: `:328-336` treats a failed guest read as
non-fatal and then logs "guest not found", a misleading message for a read error.

### Security — `cr-sec`

- **[HIGH 90] `listHousePayments` leaks every resident's payment history.**
  `functions/src/callable/payments.ts:272`, authz at `:284`. `assertHouseMemberFromClaims`
  accepts a `guest` **or** `admin` claim, so any resident receives every charge on the house's
  connected account including `receipt_url` (`:300-310`) — unauthenticated Stripe links showing
  payer name and card last-4. This contradicts the committed ruleset, which restricts guests to
  their own payment docs (`firestore.rules:298`). The house doc is already loaded at `:289`;
  use `assertHouseAdmin`.
- **[HIGH 90] `listPayments` `guestId` IDOR.** `payments.ts:219`, authz `:233`. Membership is
  checked on `houseId`; `guestId` is then only a metadata filter (`:249`), so a resident can
  read a housemate's history. `createPaymentIntent:135-157` already has the correct pattern.
- **[HIGH 80] `guests` create rule allows injecting a phantom resident into any house.**
  `firestore.rules:140` — the self branch constrains only `userId`, not `houseId`. `onGuestWrite`
  (`functions/src/triggers/firestore/index.ts:261`, EES block `:295-336`) then runs under the
  Admin SDK, bypassing the admin-only `ees-records` write rule, recounts active residents and
  rewrites `amount`/`residentCount` on every unpaid EES doc — lowering every real resident's
  Equal Expense Share, repeatably. No claim escalation. Fix: require `isGuest([houseId])` on
  the self branch, pin `rentOwed == 0`, prefer routing creation through `redeemInvitation`.
- **[MEDIUM 90] The `payments` guest-self-read guard is dead.** `firestore.rules:299` keys on
  `resource.data.guestUserId`, which no writer sets — the webhook and `recordManualPayment`
  write `guestId`. It fails closed, which is why the app leans on the over-broad callable above.
- **[MEDIUM 85] `guest-weeks` / `guest-reports` update rules are unconstrained.**
  `firestore.rules:173,177` — `write` with no `request.resource` constraint on update, so the
  owner can re-parent the doc into another house. `guest-weeks` appears dead today.

### Data layer — `cr-data`

- **[HIGH 85] `payments.createdAt` has two types** — `serverTimestamp()` from the webhook, ISO
  strings from mobile (`payments.ts:162,267`). Firestore sorts by type first, so
  `getPaymentHistory`'s `orderBy("createdAt","desc")` is wrong across the mix, and
  `paymentQueries.ts:191`'s `new Date(p.createdAt)` yields Invalid Date for Timestamps — the
  pending-staleness filter silently never matches.
- **[HIGH 80] `getPaymentHistory` has no composite index** — `payments where guestId == x
  orderBy createdAt desc` (`payments.ts:190`), and no `payments` index exists in
  `firestore.indexes.json`.
- **[HIGH 75] Manual payment docs omit `guestUserId`**, compounding the dead rule above.
- **[MEDIUM 85] ANSWERS AN OPEN QUESTION: the `(autoPayEnabled, rentOwed)` index IS correct in
  the committed `firestore.indexes.json`.** The prior session's `(autoPayEnabled, balance)`
  finding is stale. The remaining risk is purely deployment: nothing deploys regroup's indexes,
  so the live index may still be the old one and `scheduledRentCollection.ts:78` would throw
  `FAILED_PRECONDITION` on first run. Run `firebase deploy --only firestore:indexes` and verify.
- **[MEDIUM 80] Unbounded reads / unthrottled fan-out** — `scheduledRentCollection.ts:78` has no
  `.limit()`; `Promise.allSettled(due.map(...))` makes one Stripe call per guest with no cap;
  `overdueRentNotification.ts:29` scans every guest with `rentOwed > 0` across all houses;
  `api/firestore.ts:277,334` read whole collections and filter in memory.
- **[MEDIUM 70] Client-clock audit timestamps** — `rentAttempts.ts:153,211,243`,
  `guest.tsx:108,312`, `payments.ts:162,267,293`, `guestImport.ts:112`.

### Architecture — `cr-arch`

- **[HIGH 75] `rentOwed` has no single writer.** Server writers: webhook,
  `scheduledRentCollection`, `rentAttempts`, `payments.ts`. Client writer: `mergeGuestStats`
  max-merge. C1 above is the reachable instance. Fix direction: stop client writes to ledger
  fields entirely — make adjustment a server callable and block the fields in rules.
- **[MEDIUM 85] `rentPaymentHelpers.ts:2-9` applies `Math.abs`,** silently hiding negative
  balances (credits/overpayments), while `money.ts` `formatCents` does not. The two disagree on
  sign. Pick the behaviour deliberately before consolidating.
- **[MEDIUM 80] `stripeWebhook.ts` seams** — rent handlers `:295-670`, subscription `:671-952`,
  Connect `:953-1042`, shared helpers `:72-294`, dispatcher `:1068-1255`. Split alongside C3,
  which lands in the dispatcher.
- **[MEDIUM 70] Keep the `money.ts` duplication** per-codebase for now, but add a CI check that
  diffs the two copies with comments stripped — turning silent divergence into a failed build.

---

## Actions Taken

- [x] Fixed C1: `EditUserInfoForm` sends only changed fields — `EditUserInfoForm.tsx:137`
- [x] Added a mutation-checked regression test — `__tests__/EditUserInfoForm.test.tsx`
- [x] Verified `GuestUpdate` / `CreateGuest` unreachability against `navigators.tsx`
- [ ] Decide H1: reconnect `GuestUpdate` vs build an adjustment flow
- [ ] Decide M1: validating reader at the money read boundary
- [ ] Sequence M2: formatter consolidation
- [x] All four specialist streams reported; C2 and C3 verified first-hand
- [ ] Decide C2: `payments.amount` unit migration (both conventions exist in live data)
- [ ] Decide C3: webhook idempotency ordering + return code
- [ ] Decide the three HIGH authz findings (two callables, one rules create branch)
- [ ] Deploy regroup's Firestore indexes and verify the live `guests` index

## Recommended Next Steps

1. **C3** — webhook idempotency ordering. A thrown handler silently loses a real payment
   forever, and the fix is small because the per-payment transaction already makes retry safe.
2. **C2** — `payments.amount` unit split. Reporting is already wrong by 100x in both
   directions. Needs a new field plus a migration, not a rename.
3. **The three HIGH authz findings** — two are a resident reading other residents' payment
   history (one with Stripe receipt links carrying payer name and card last-4); the third
   lets any signed-in user alter every resident's Equal Expense Share.
4. **Deploy the indexes.** The committed `guests` index is correct; the live one may not be.
   Until then auto-pay may throw on every run.
5. **H1** — no reachable way to record a cash payment.
6. **M1/M2** — validating read boundary, then formatter consolidation one site per commit.
