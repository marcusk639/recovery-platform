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
| CRITICAL | 1     | 1          | 0                 |
| HIGH     | 1     | 0          | 1                 |
| MEDIUM   | 2     | 0          | 2                 |
| Docs gap | 4     | 0          | 4                 |

Two of four specialist streams had not reported when this was written — see *Incomplete
coverage*.

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

## Actions Taken

- [x] Fixed C1: `EditUserInfoForm` sends only changed fields — `EditUserInfoForm.tsx:137`
- [x] Added a mutation-checked regression test — `__tests__/EditUserInfoForm.test.tsx`
- [x] Verified `GuestUpdate` / `CreateGuest` unreachability against `navigators.tsx`
- [ ] Decide H1: reconnect `GuestUpdate` vs build an adjustment flow
- [ ] Decide M1: validating reader at the money read boundary
- [ ] Sequence M2: formatter consolidation
- [ ] Re-run the four specialist streams for a clean pass

## Recommended Next Steps

1. **H1** — no way to record a cash payment is the launch blocker here, bigger than any single defect.
2. **Re-run the specialist streams**, especially rules and the index check: a missing composite
   index means auto-pay has never run at all.
3. **M1** — add the validating read boundary; the brands cannot do this job.
4. **M2** — consolidate the formatters, one site per commit.
