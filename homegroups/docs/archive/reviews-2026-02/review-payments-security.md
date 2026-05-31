# Security & Payments Audit Report — RecoveryConnect (Homegroups)

**Audit Date:** 2026-02-22
**Auditor:** Security Audit Agent
**Scope:** Stripe payments integration, Firestore security rules, subscription lifecycle
**Classification:** Internal — Confidential

---

## Executive Summary

This audit reviewed the Stripe payments integration and Firestore security rules for the
Homegroups mobile application. The review covered 11 Cloud Function files, the Firestore
security rules file, and associated mobile client code.

**Overall Assessment: MODERATE RISK — Actionable issues identified**

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 5     |
| Medium   | 8     |
| Low      | 5     |

Key areas of concern:
- Duplicate Firestore rule blocks creating conflicting permissions
- Open redirect vulnerability in checkout session creation
- Race condition window in subscription creation (no transactional guard)
- Missing Firestore rules for collections written by Cloud Functions
- Donation records updatable by donors without field restrictions
- Business meeting decisions readable by unauthenticated users

---

## Finding 1: Duplicate `recurring_transactions` Rule Blocks with Conflicting Permissions

**File:** `/Users/marcusklein/dev/RecoveryConnect/firestore.rules`
**Lines:** 376-395 (first block) and 687-695 (second block)
**Severity:** CRITICAL

### Description

The `recurring_transactions` collection has TWO separate `match` blocks in the rules file.
Firestore security rules are OR-based — if either rule grants access, access is granted.

**First block (lines 376-395):** Allows admins OR treasurers (`isGroupAdminOrTreasurer`) to
create, update, and delete. Includes field validation on create (required keys, amount > 0,
type validation, createdBy == caller).

**Second block (lines 687-695):** Allows only admins (`isGroupAdmin`) to create, update, and
delete. No field validation on create.

Because rules are OR-ed, the combined effective permissions are:
- **Create:** Any admin can create WITHOUT field validation (second block has no validation).
  This completely bypasses the field validation in the first block.
- **Delete:** Treasurers can delete (first block) even though the second block intended
  admin-only.

The second block's lack of validation on create means an admin can create a
`recurring_transaction` document missing required fields (`frequency`, `nextDate`, `isActive`,
etc.), with `amount <= 0`, with a fraudulent `createdBy`, or with an invalid `type`. The
first block's careful validation is rendered useless.

### Proposed Fix

Remove the second `recurring_transactions` block entirely (lines 687-695). The first block
(lines 376-395) is the more complete and correct rule set. If the intent was admin-only for
delete, adjust the first block's delete rule accordingly.

---

## Finding 2: Open Redirect in `createStripeCheckoutSession` — Client-Supplied URLs

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createStripeCheckoutSession.ts`
**Lines:** 10-11, 81-82
**Severity:** CRITICAL

### Description

The `successUrl` and `cancelUrl` parameters are accepted directly from the client with no
validation and passed to `stripe.checkout.sessions.create()`:

```typescript
// Line 16
const { groupId, successUrl, cancelUrl } = request.data;
// ...
// Lines 81-82
success_url: successUrl,
cancel_url: cancelUrl,
```

An attacker who is a group admin could supply a malicious URL as the `successUrl`. After a
user completes checkout on the legitimate Stripe page, Stripe would redirect them to the
attacker-controlled URL. The Stripe checkout session ID is appended to this URL by default,
potentially leaking session information.

### Proposed Fix

Validate that `successUrl` and `cancelUrl` match an allowlist of known domains, or hardcode
the URLs server-side:

```typescript
const ALLOWED_DOMAINS = ['homegroups-app.com', 'localhost:3000'];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

if (!isAllowedUrl(successUrl) || !isAllowedUrl(cancelUrl)) {
  throw new HttpsError("invalid-argument", "Invalid redirect URL.");
}
```

---

## Finding 3: Race Condition — Duplicate Subscriptions for Same Group

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupSubscription.ts`
**Lines:** 66-75
**Severity:** HIGH

### Description

The duplicate subscription check reads the group document and checks
`subscriptionStatus === "active"`, but this is not wrapped in a Firestore transaction.
Two concurrent calls could both read the group as not having an active subscription,
then both proceed to create Stripe subscriptions.

The same issue exists in `reactivateGroupSubscription.ts` (lines 96-137).

This could result in a group being billed twice for the same service. The second
subscription's webhook would overwrite the first subscription's ID in Firestore, leaving
an orphaned active subscription in Stripe that would continue billing.

### Proposed Fix

Use a Firestore transaction to read the group document and conditionally update it
atomically. Set a lock field during the transaction:

```typescript
await db.runTransaction(async (transaction) => {
  const groupSnap = await transaction.get(groupRef);
  const data = groupSnap.data()!;
  if (data.stripeSubscriptionId && data.subscriptionStatus === "active") {
    throw new HttpsError("failed-precondition", "Group already has an active subscription.");
  }
  transaction.update(groupRef, { subscriptionCreationInProgress: true });
});
```

---

## Finding 4: Missing Firestore Rules for `stripe_disputes` and `processed_stripe_events`

**File:** `/Users/marcusklein/dev/RecoveryConnect/firestore.rules`
**Severity:** HIGH

### Description

Cloud Functions write to two collections that have no explicit rules:
- `stripe_disputes` (written in `stripeUtils.ts`, line 416)
- `processed_stripe_events` (written in `stripeUtils.ts`, lines 599-614)

While the catch-all deny rule at line 701 blocks client access, explicit deny rules
provide defense-in-depth and allow super-admin read access for operational debugging.

### Proposed Fix

```
match /stripe_disputes/{disputeId} {
  allow read: if isSuperAdmin();
  allow create, update, delete: if false;
}

match /processed_stripe_events/{eventId} {
  allow read: if isSuperAdmin();
  allow create, update, delete: if false;
}
```

---

## Finding 5: Donation Records Updatable by Donor Without Field Restrictions

**File:** `/Users/marcusklein/dev/RecoveryConnect/firestore.rules`
**Lines:** 232-235
**Severity:** HIGH

### Description

The donations subcollection allows donors to update their own donation documents with no
field restrictions. A donor could update the `status` field to `"completed"` without
actually paying, or the `amount` field to any value.

### Proposed Fix

Restrict the fields a donor can update, or remove donor update access entirely since the
webhook handles completion:

```
allow update: if isSignedIn() && (
  (resource.data.userId == request.auth.uid
    && request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['cancelledAt'])
  ) ||
  isGroupAdminOrTreasurer(groupId)
);
```

---

## Finding 6: `createGroupSubscription` Does Not Check for `trialing` Status

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupSubscription.ts`
**Lines:** 67-70
**Severity:** HIGH

### Description

The duplicate subscription guard only checks for `subscriptionStatus === "active"`, not
`"trialing"`, `"past_due"`, or `"incomplete"`. A group with a trialing subscription could
call `createGroupSubscription` again and create a second Stripe subscription.

### Proposed Fix

```typescript
const activeStatuses = ['active', 'trialing', 'past_due', 'incomplete'];
if (
  groupData.stripeSubscriptionId &&
  activeStatuses.includes(groupData.subscriptionStatus)
) {
  throw new HttpsError("failed-precondition", "Group already has an existing subscription.");
}
```

---

## Finding 7: Checkout Session Uses `priceIdMember` Instead of Group Product Price

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createStripeCheckoutSession.ts`
**Lines:** 5, 25, 75
**Severity:** HIGH

### Description

`createStripeCheckoutSession` uses `priceIdMember` for checkout line items, while all other
subscription creation paths use `getDefaultPriceForProduct(productIdGroup)`. If these are
different Stripe prices, checkout sessions would create subscriptions at the wrong price.

### Proposed Fix

```typescript
import { stripe, productIdGroup, getDefaultPriceForProduct } from "../utils/stripe";
// ...
const groupPriceId = await getDefaultPriceForProduct(productIdGroup);
// ...
price: groupPriceId,
```

---

## Finding 8: Business Meeting Decisions Readable by Unauthenticated Users

**File:** `/Users/marcusklein/dev/RecoveryConnect/firestore.rules`
**Lines:** 522-523
**Severity:** MEDIUM

### Description

The decisions subcollection under `business_meetings` has `allow read: if true`, exposing
potentially sensitive group decisions to unauthenticated users.

### Proposed Fix

```
allow read: if isGroupMember(
  get(/databases/$(database)/documents/business_meetings/$(meetingId)).data.groupId
);
```

---

## Finding 9: HTML Injection in Email Notifications

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/stripeUtils.ts`
**Lines:** 837, 909
**Severity:** MEDIUM

### Description

Group names are interpolated directly into HTML email templates without sanitization. A
group admin could set the group name to contain HTML/JavaScript, enabling phishing links
or misleading content in notification emails.

### Proposed Fix

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const safeGroupName = escapeHtml(groupName);
```

---

## Finding 10: `handleSubscriptionDeleted` Clears `stripeSubscriptionId` Losing Audit Trail

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/stripeUtils.ts`
**Lines:** 235-241
**Severity:** MEDIUM

Setting `stripeSubscriptionId: null` on deletion loses historical subscription data.
Consider storing in `previousStripeSubscriptionId` for audit purposes.

---

## Finding 11: No `customer.subscription.created` Webhook Handler

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/http/stripeWebhook.ts`
**Lines:** 169-250
**Severity:** MEDIUM

If `checkout.session.completed` is lost or fails, a subscription exists in Stripe but not
Firestore. A `customer.subscription.created` handler would provide redundancy.

---

## Finding 12: `createGroupWithSubscription` Creates Subscription Before Group Document

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupWithSubscription.ts`
**Lines:** 194-256
**Severity:** MEDIUM

The Stripe subscription is created before the group document exists, so the subscription
metadata initially lacks `groupId`. Compensation logic exists but the metadata update gap
creates a window where webhooks fire without groupId context.

---

## Finding 13: `createGroupSubscription` Uses `payment_behavior: "default_incomplete"` With Trial

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createGroupSubscription.ts`
**Lines:** 107-125
**Severity:** MEDIUM

Using `payment_behavior: "default_incomplete"` with `trial_period_days` may result in
`"incomplete"` status rather than `"trialing"` if there is any payment setup issue.
Use `"allow_incomplete"` for trial subscriptions.

---

## Finding 14: Webhook Returns 200 When Secret Is Not Configured

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/http/stripeWebhook.ts`
**Lines:** 67-80
**Severity:** MEDIUM

When the webhook secret is not configured, the handler returns HTTP 200, silently
acknowledging events that are NOT processed. Return 503 instead so Stripe retries.

---

## Finding 15: `reactivateGroupSubscription` Does Not Verify Payment Method Ownership

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/reactivateGroupSubscription.ts`
**Lines:** 167-181
**Severity:** LOW

A provided `paymentMethodId` is attached without verifying it belongs to the calling user's
customer. Low practical risk as Stripe prevents attaching payment methods from other customers.

---

## Finding 16: `notSpamming()` Function Is a No-Op

**File:** `/Users/marcusklein/dev/RecoveryConnect/firestore.rules`
**Lines:** 98-100
**Severity:** LOW

The `notSpamming()` function always returns `true`, providing no actual rate limiting
while creating a false sense of security. Remove the call or implement real rate limiting.

---

## Finding 17: Checkout Session Price Mismatch (Related to Finding 7)

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createStripeCheckoutSession.ts`
**Lines:** 25-29
**Severity:** LOW (subsumed by Finding 7)

The function checks if `priceIdMember` is configured (wrong env var) while the group
product ID (`STRIPE_PRODUCT_ID_GROUP`) might be properly configured.

---

## Finding 18: Admin Check Uses `admins` Array Instead of `members` Collection

**Files:** Multiple callable functions
**Severity:** LOW

All callable functions check `groupData.admins.includes(userId)` instead of verifying
against the `members` collection (source of truth for JWT claims). A group admin could
manipulate the `admins` array field directly.

---

## Finding 19: `createStripeCheckoutSession` Missing v2 Function Configuration

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/callable/createStripeCheckoutSession.ts`
**Line:** 14
**Severity:** LOW

Uses bare `functions.https.onCall()` without CPU/memory/timeout/region configuration,
unlike all other callable functions.

---

## Finding 20: Referral Reward Uses `trial_end` Manipulation

**File:** `/Users/marcusklein/dev/RecoveryConnect/functions/src/utils/stripeUtils.ts`
**Lines:** 488-494
**Severity:** LOW (design concern)

Setting `trial_end` on an active subscription returns it to `"trialing"` status, which
could break logic checking `status === "active"` and trigger unexpected trial-end notifications.

---

## Positive Findings

The following security practices are well-implemented:

1. **Webhook signature verification** — All events verified with `stripe.webhooks.constructEvent()`
2. **Idempotency handling** — `isEventProcessed`/`markEventProcessed` prevents duplicate processing
3. **NonRetriableError pattern** — Distinguishes retriable from non-retriable errors
4. **Firestore catch-all deny rule** — Defense-in-depth at line 701
5. **JWT claims with fallback** — Dual-layer approach balances performance with correctness
6. **Claims byte limit handling** — `onMemberWrite` properly truncates memberGroups
7. **Compensation logic** — `createGroupWithSubscription` cancels Stripe subscription on Firestore failure
8. **Authorization on all callables** — Every function checks auth before proceeding
9. **Member creation privilege lock** — Prevents self-granting admin/treasurer roles
10. **Transaction immutability** — Audit fields (createdBy, createdAt, groupId) protected on update

---

## Remediation Priority Matrix

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P0 | #1 Duplicate recurring_transactions rules | Low | Eliminates validation bypass |
| P0 | #2 Open redirect in checkout URLs | Low | Prevents phishing |
| P0 | #7 Wrong price ID in checkout | Low | Prevents billing errors |
| P1 | #3 Race condition on subscription creation | Medium | Prevents duplicate billing |
| P1 | #5 Unrestricted donation updates | Low | Prevents fraud |
| P1 | #6 Missing trialing/past_due check | Low | Prevents duplicate subscriptions |
| P1 | #4 Missing rules for Stripe collections | Low | Defense-in-depth |
| P2 | #8 Public business meeting decisions | Low | Data privacy |
| P2 | #9 HTML injection in emails | Low | Prevents phishing |
| P2 | #11 Missing subscription.created handler | Medium | Redundancy |
| P2 | #13 payment_behavior mismatch | Low | Correct trial flow |
| P2 | #14 Webhook 200 on missing secret | Low | Operational visibility |
| P3 | #10 Cleared subscription ID history | Low | Audit trail |
| P3 | #12 Subscription before group doc | Medium | Already has compensation |
| P3 | #15 Payment method ownership | Low | Low practical risk |
| P3 | #16 notSpamming no-op | Low | Documentation |
| P3 | #18 Admin check inconsistency | Medium | Consistency |
| P3 | #19 Missing function config | Low | Consistency |
| P3 | #20 trial_end for referral reward | Medium | Design concern |
