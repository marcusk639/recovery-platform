# Sprint 5 — Oxford Customer Acquisition Design

**Date:** February 23, 2026
**Goal:** Make it possible to sign up an Oxford House operator, have them pay for the Oxford plan, and immediately access all Oxford features — with EES calculated automatically from day one.
**Status:** Approved

---

## Overview

Every Oxford House feature is already built (EES tracker, officer management, voting, business meetings, paywall UI). The blockers to actually acquiring Oxford customers are:

1. `oxfordEnabled` flag has no write path — paying customers always see the upgrade prompt
2. Dead/wrong code paths in payment services need cleanup
3. Stripe webhook and deployment status unverified
4. EES calculation is manual — the Treasurer does it by hand every week

This sprint fixes all four. After it, an Oxford House operator can sign up, pay, unlock features, collect EES automatically, and refer other houses.

---

## Part 1: Correctness Cleanup

**Effort:** ~1-2 hours

### Tasks

**1. Delete `src/services/payment.ts`**
- This file calls `createRentPaymentIntent` — a Cloud Function name that does not exist
- The correct service is `src/services/payments.ts` which calls `createPaymentIntent`
- Before deleting: grep all imports of `payment.ts` (not `payments.ts`) and update any callers to use `payments.ts`
- Delete the file after confirming zero remaining imports

**2. Remove `src/services/debug-deep-links.ts`**
- Dead debugging utilities that should not be in production code
- Before deleting: confirm no production code imports it
- Delete the file

---

## Part 2: Oxford Paywall Write Path

**Effort:** ~half day

### Problem

`OxfordDashboard.tsx` checks `state.userRTK.user?.subscriptionMetadata.oxfordEnabled`. No Cloud Function writes this flag when an operator upgrades to the Oxford plan. Paying customers permanently see the upgrade prompt.

### Solution

Write an HTTP-callable Cloud Function `setOxfordEnabled`:

**Function signature:**
```typescript
// functions/src/oxford/setOxfordEnabled.ts
export const setOxfordEnabled = functions.https.onCall(
  async (data: { userId: string; houseId: string }, context) => {
    // 1. Verify caller is authenticated
    // 2. Verify caller is superAdmin or admin for houseId
    // 3. Write subscriptionMetadata.oxfordEnabled = true to user document
    // 4. Return success
  }
);
```

**App-side integration:**
- `OxfordDashboard.tsx` upgrade button calls `setOxfordEnabled({ userId, houseId })` after successful subscription
- On success, refresh user state from Firestore so the paywall clears immediately

**Why HTTP-callable (not Stripe webhook):**
The Stripe webhook approach is the correct long-term pattern (subscription event → verify Oxford plan → set flag). However, the webhook registration status is being verified in Part 3. HTTP-callable works immediately without that dependency. Both approaches can coexist — the webhook can be layered in once verified.

**Security:**
- Function verifies `context.auth` is present
- Function verifies caller has `admin` or `superAdmin` role for the given `houseId`
- No unauthenticated calls can set the flag

**Deploy:**
```bash
firebase deploy --only functions:setOxfordEnabled
```

---

## Part 3: Stripe Verification

**Effort:** ~half day (investigation-first; could be 30 min if already deployed)

### Tasks

**1. Verify `createPaymentIntent` is deployed**
- Check Firebase Functions console: confirm `createPaymentIntent` appears in the deployed functions list
- If not deployed: `firebase deploy --only functions:createPaymentIntent`

**2. Verify Stripe webhook endpoint is registered**
- Check Stripe dashboard → Developers → Webhooks
- Confirm an endpoint pointing to the `stripeWebhook` Cloud Function URL exists
- Confirm it is subscribed to at minimum: `payment_intent.succeeded`, `payment_intent.payment_failed`
- If not registered: add the endpoint with the Firebase Function URL
- Without this, payment status never updates after money moves — the app shows pending forever

**3. Fix `@ts-nocheck` on `StripeSettingsScreen.tsx`**
- Remove `// @ts-nocheck` from line 1
- Resolve all TypeScript errors that surface
- This is a financial flow — suppressed type errors here represent real risk

---

## Part 4: EES Auto-Calculation

**Effort:** ~1.5-2 days

### Problem

`EESTracker.tsx` displays EES records but calculation is manual. The Treasurer calculates `total house expenses ÷ active resident count` by hand each week. Automating this makes the Oxford plan indispensable.

### Two Triggers

**Trigger A: Weekly scheduled function**
- Runs Monday morning (or configurable billing day)
- Calculates EES for all Oxford houses
- Creates `EESTransaction` records for each active resident
- Sends push notification: *"Your EES for this week is $X"*

**Trigger B: Resident move-in/move-out**
- Firestore trigger on guest document `status` field changes (active ↔ inactive)
- Recalculates EES for the house immediately
- Prevents the Treasurer from having to manually re-run calculations on every roster change

### `calculateEES` Cloud Function

**Location:** `functions/src/oxford/calculateEES.ts`

**Algorithm:**
```
1. Get all active guests for houseId
2. Get pending house expenses from `financial_records` collection for current billing period
3. EES per person = totalExpenses / activeResidentCount
4. For each active resident:
   a. Create EESTransaction record in `ees_transactions` collection
   b. Mark as auto-calculated (vs. manual)
5. Send push notification to all active residents with new EES amount
6. Return { eesAmount, residentCount, totalExpenses }
```

**EESTransaction record shape:**
```typescript
{
  id: string;
  houseId: string;
  guestId: string;
  amount: number;
  billingPeriodStart: string; // ISO date
  billingPeriodEnd: string;   // ISO date
  calculatedAt: Date;
  calculationMethod: 'auto' | 'manual';
  totalHouseExpenses: number;
  residentCountAtCalculation: number;
}
```

**Scheduled export in `index.ts`:**
```typescript
export const weeklyEESCalculation = functions.pubsub
  .schedule('every monday 08:00')
  .timeZone('America/New_York')
  .onRun(async () => {
    // Get all Oxford houses
    // Call calculateEES for each
  });
```

**Firestore trigger:**
```typescript
export const onGuestStatusChange = functions.firestore
  .document('guests/{guestId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status !== after.status && after.houseType === 'oxford') {
      await calculateEES(after.houseId);
    }
  });
```

### `EESTracker.tsx` Updates

- Display auto-calculated upcoming EES amount prominently
- Show next billing date and projected amount
- Visually distinguish auto-calculated records from historical manual records (chip/badge)
- No breaking changes to existing manual entry flow — manual entry remains available for edge cases

### Out of Scope (future sprints)

- Bill payment integration (paying utilities directly from house funds)
- Democratic expense approval votes before calculation runs
- Financial forecasting / budget vs. actual
- EES payment collection via Stripe (residents pay EES through app)

---

## Testing Strategy

Each part has a clear verification step:

| Part | Verification |
|---|---|
| Part 1 | Zero imports of `payment.ts`; `debug-deep-links.ts` not in codebase |
| Part 2 | Oxford operator upgrades in test → `oxfordEnabled` flag appears in Firestore → paywall clears |
| Part 3 | Stripe dashboard shows webhook registered; StripeSettingsScreen has zero `@ts-nocheck` |
| Part 4 | Run `calculateEES` manually for a test house → EES records created → push notification fires |

Unit tests required for:
- `setOxfordEnabled` function (auth check, role check, write path)
- `calculateEES` function (correct math, edge cases: 0 residents, no expenses)
- `EESTracker.tsx` (displays auto-calculated amount, badge distinguishes manual vs. auto)

---

## Files Touched

**New files:**
- `functions/src/oxford/setOxfordEnabled.ts`
- `functions/src/oxford/calculateEES.ts`
- `functions/src/oxford/__tests__/setOxfordEnabled.test.ts`
- `functions/src/oxford/__tests__/calculateEES.test.ts`

**Modified files:**
- `functions/src/index.ts` — export new functions
- `src/screens/Oxford/OxfordDashboard.tsx` — call `setOxfordEnabled` on upgrade
- `src/screens/Oxford/EESTracker.tsx` — display auto-calculated EES, add badge
- `src/screens/HouseSettings/StripeSettingsScreen.tsx` — remove `@ts-nocheck`

**Deleted files:**
- `src/services/payment.ts`
- `src/services/debug-deep-links.ts`

---

## Commit Strategy

Each part is a separate commit:
1. `fix: delete wrong payment service and debug-deep-links`
2. `feat(oxford): add setOxfordEnabled Cloud Function and wire upgrade button`
3. `fix(stripe): verify deployment and remove @ts-nocheck from StripeSettingsScreen`
4. `feat(oxford): automate weekly EES calculation with scheduled and trigger-based functions`
