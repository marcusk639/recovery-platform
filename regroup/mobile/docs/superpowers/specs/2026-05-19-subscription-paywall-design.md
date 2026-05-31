# Subscription Paywall Design

**Date:** 2026-05-19  
**Repos affected:** `rats-v2`, `rats-web`, `regroup-functions`  
**Approach:** Approach A — Firestore status gate with AppState foreground refresh  
**Apple compliance:** Subscriptions managed on rats-web (browser), not via in-app purchase

---

## Problem Statement

The app has subscription infrastructure (Stripe, Cloud Functions, webhooks) but no paywall enforcement:

- `user.subscriptionMetadata.status` is written correctly by webhooks but **never read to gate access**
- `House.subscriptionStatus` defaults to `'active'` and is **never updated by webhooks**
- Guests have no way to know their operator's subscription has lapsed
- `useOxfordGate` enforces Oxford features only — no baseline app access gate exists

---

## Constraints

- Subscriptions are purchased and managed on **rats-web** in a browser — not via Apple IAP
- This is the pattern Apple approved for the original RATS distribution
- The mobile app only enforces access; it never collects payment

---

## Scope

### What is blocked without an active subscription

**Operators (admin / superAdmin):** The entire app. A lapsed operator sees `SubscriptionRequiredScreen` instead of `MainNavigator`. They cannot access any house management feature until their subscription is restored on rats-web.

**Guests:** 7-day grace period after their operator's subscription lapses. During the grace window, they see a dismissible banner. After it expires, they see `GraceExpiredScreen` with their house manager's contact info.

**Anonymous users:** Unaffected — the gate only activates for named, fully-onboarded users routed to `MainNavigator` by the navigation service.

**potentialSuperAdmin / setup-incomplete users:** Unaffected — routed to `SetupStack` before the gate runs.

### What is always accessible

- **rats-web `/billing`** — always reachable regardless of subscription status; this is where operators subscribe, reactivate, update payment info, and cancel

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  rats-web (Angular)                                          │
│  /billing  ← always accessible                              │
│  /dashboard, /houses, /settings ← guarded (redirect         │
│             to /billing if status ∉ {active, trialing})     │
└────────────────────────┬─────────────────────────────────────┘
                         │ Cloud Function: createOperatorSubscription
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  regroup-functions                                           │
│  Stripe webhooks:                                            │
│  • invoice.payment_succeeded → user.subscriptionMetadata     │
│    .status = 'active'; House.subscriptionStatus = 'active'  │
│  • customer.subscription.deleted → user.subscriptionMetadata │
│    .status = 'canceled'; House.subscriptionStatus =         │
│    'canceled'; House.guestGraceEndsAt = now + 7 days        │
│  • invoice.payment_failed (3rd attempt) → 'past_due' +      │
│    guestGraceEndsAt = now + 7 days                          │
└────────────────────────┬─────────────────────────────────────┘
                         │ Firestore (one-time + foreground refresh)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  rats-v2 (React Native)                                      │
│                                                              │
│  SubscriptionGate (wraps MainNavigator in App.tsx)           │
│  • Reads user.subscriptionMetadata.status (operator)         │
│  • Reads house.subscriptionStatus + guestGraceEndsAt (guest) │
│  • Invalidates React Query cache on AppState foreground      │
│  • Branches to appropriate screen based on gate result       │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### House entity (`src/entities/House.tsx`)

`subscriptionStatus` already exists (line 77) but must be treated as:

```typescript
subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' = 'active';
guestGraceEndsAt?: string; // ISO 8601, written by webhook on lapse
```

### Firestore writes (regroup-functions webhooks)

All subscription-state webhook handlers must now also update the House document(s) owned by the operator. The query pattern (used in all three handlers):

```typescript
const housesSnap = await db
  .collection('houses')
  .where('adminId', '==', operatorUid)
  .get();

const batch = db.batch();
housesSnap.docs.forEach(doc => {
  batch.update(doc.ref, {
    subscriptionStatus: newStatus,
    ...(guestGraceEndsAt ? { guestGraceEndsAt } : {}),
    updatedAt: new Date().toISOString(),
  });
});
await batch.commit();
```

| Webhook event                              | `subscriptionStatus` written | `guestGraceEndsAt` written |
| ------------------------------------------ | ---------------------------- | -------------------------- |
| `invoice.payment_succeeded`                | `'active'`                   | cleared (delete field)     |
| `customer.subscription.updated` (trialing) | `'trialing'`                 | —                          |
| `invoice.payment_failed` (attempt ≥ 3)     | `'past_due'`                 | `now + 7 days`             |
| `customer.subscription.deleted`            | `'canceled'`                 | `now + 7 days`             |

The `operatorUid` is resolved by querying `users` where `subscriptionMetadata.subscriptionId == subscription.id` (one extra Firestore read per webhook event). Alternatively, store `uid` in Stripe subscription metadata at creation time to avoid the query — see Open Question #1.

---

## rats-v2 Changes

### 1. `useSubscriptionGate` hook

**File:** `src/hooks/useSubscriptionGate.ts`

```typescript
type GateResult =
  | { status: 'allowed' }
  | { status: 'subscription_required' }
  | { status: 'grace_period'; endsAt: Date }
  | { status: 'grace_expired' };
```

Logic:

```
user.anonymous === true        → 'allowed' (gate not applicable)
role is potentialSuperAdmin    → 'allowed' (setup flow handles it)

role = admin | superAdmin:
  subscriptionIsActive(user)   → 'allowed'
  else                         → 'subscription_required'

role = guest:
  house.subscriptionStatus ∈ {active, trialing} or undefined
                               → 'allowed'
  house.subscriptionStatus = canceled | past_due:
    guestGraceEndsAt > now     → 'grace_period' (with endsAt)
    guestGraceEndsAt ≤ now
    or guestGraceEndsAt absent → 'grace_expired'
```

Uses existing `subscriptionIsActive()` from `src/util/subscription.ts` (already handles `'active'` and `'trialing'`).

### 2. `SubscriptionGate` component

**File:** `src/components/subscription/SubscriptionGate.tsx`

Wraps `<MainNavigator>` in `App.tsx`. Owns the AppState foreground listener:

```typescript
// On AppState 'active' transition:
queryClient.invalidateQueries(['user', currentUser.id]);
queryClient.invalidateQueries(['house', currentUser.houseId]);
```

Renders based on gate result:

| Gate result             | Renders                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `allowed`               | `<MainNavigator />`                                                    |
| `subscription_required` | `<SubscriptionRequiredScreen />`                                       |
| `grace_period`          | `<MainNavigator />` + dismissible `<GracePeriodBanner endsAt={...} />` |
| `grace_expired`         | `<GraceExpiredScreen />`                                               |

### 3. `SubscriptionRequiredScreen`

**File:** `src/screens/Subscription/SubscriptionRequiredScreen.tsx`

Shown to operators with non-active subscriptions.

```
┌──────────────────────────────────┐
│                                  │
│  [RATS logo]                     │
│                                  │
│  Your subscription has ended     │
│                                  │
│  To continue managing your       │
│  house, renew your subscription  │
│  on the RATS web portal.         │
│                                  │
│  ┌──────────────────────────┐    │
│  │  Manage Subscription  →  │    │  Linking.openURL(RATS_WEB_URL/billing)
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │  I've subscribed         │    │  invalidates RQ cache + re-evaluates gate
│  └──────────────────────────┘    │
│                                  │
│  Sign out                        │
└──────────────────────────────────┘
```

The "I've subscribed" button provides manual refresh for operators who subscribe on the web and return to the app before the foreground AppState event fires.

### 4. `GraceExpiredScreen`

**File:** `src/screens/Subscription/GraceExpiredScreen.tsx`

Shown to guests whose operator's grace period has expired.

```
┌──────────────────────────────────┐
│                                  │
│  [RATS logo]                     │
│                                  │
│  Access temporarily unavailable  │
│                                  │
│  Your house manager's account    │
│  is inactive. Contact them to    │
│  restore access.                 │
│                                  │
│  [house.adminName]               │
│  [house.adminPhone ?? house.adminEmail] │
│                                  │
│  Sign out                        │
└──────────────────────────────────┘
```

### 5. `GracePeriodBanner`

**File:** `src/components/subscription/GracePeriodBanner.tsx`

Inline banner shown at the top of `MainNavigator` during the grace window.

```
┌──────────────────────────────────────────────────────┐
│ ⚠ Your house subscription expires in N days.         │
│   Contact your house manager to avoid losing access. │
└──────────────────────────────────────────────────────┘
```

Dismissible per session (not persisted — re-appears on next app open).

### 6. App.tsx wiring

```typescript
// Before (approximately):
{
  navigationState === 'Main' && <MainNavigator />;
}

// After:
{
  navigationState === 'Main' && (
    <SubscriptionGate>
      <MainNavigator />
    </SubscriptionGate>
  );
}
```

---

## rats-web Changes

### Route guard

An Angular route guard (`SubscriptionGuard`) is added to all routes except `/billing`, `/login`, `/signup`, `/reset`, `/pricing`.

```typescript
canActivate(): boolean {
  const status = this.authService.currentUser?.subscriptionMetadata?.status;
  const active = status === 'active' || status === 'trialing';
  if (!active) {
    this.router.navigate(['/billing']);
    return false;
  }
  return true;
}
```

### Billing page adaptive UI

The existing `billing-info` component already handles subscription creation. It should adapt its primary CTA and messaging based on current subscription status:

| Status          | Primary CTA             | Supporting text                                |
| --------------- | ----------------------- | ---------------------------------------------- |
| No subscription | Subscribe               | Start your 30-day trial                        |
| `trialing`      | Update payment method   | Trial ends [date]                              |
| `past_due`      | Update payment method   | Payment failed — update card to restore access |
| `canceled`      | Reactivate subscription | Your data is preserved                         |
| `active`        | (Manage / Cancel)       | Next billing date [date]                       |

---

## Error Handling

| Scenario                                                       | Behavior                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Firestore unavailable on foreground refresh                    | Show stale data; gate uses last known status (fail open for UX)                                               |
| Webhook fails to update House doc                              | House retains old `subscriptionStatus`; operators get FCM notification; guests unaffected until next app open |
| `guestGraceEndsAt` not set but `subscriptionStatus = canceled` | Treat as `grace_expired` (conservative — locks guest out rather than granting indefinite access)              |
| `subscriptionMetadata` undefined on user                       | Treat as `subscription_required` (conservative)                                                               |
| AppState listener fires before React Query resolves            | Gate renders current (stale) result; re-renders automatically when fresh data lands                           |

---

## Testing

### Unit tests

- `useSubscriptionGate` — one test per gate branch (allowed, sub_required, grace_period, grace_expired, anonymous bypass, setup bypass)
- `subscriptionIsActive` — already tested in `src/util/__tests__/subscription.test.ts`
- `GracePeriodBanner` — renders with correct days-remaining count

### Integration tests (Firebase emulator)

- Webhook `customer.subscription.deleted` → House doc updated with `subscriptionStatus: 'canceled'` and `guestGraceEndsAt` set
- Webhook `invoice.payment_succeeded` → House doc updated with `subscriptionStatus: 'active'`, `guestGraceEndsAt` cleared
- Multi-house operator: all owned houses updated in batch

### E2E (Detox, emulator only)

- Operator with `subscriptionMetadata.status = 'canceled'` → sees `SubscriptionRequiredScreen`
- Operator taps "I've subscribed" → data refreshes → `MainNavigator` renders
- Guest with `house.subscriptionStatus = 'canceled'` + `guestGraceEndsAt > now` → sees `MainNavigator` with banner
- Guest with `house.subscriptionStatus = 'canceled'` + `guestGraceEndsAt < now` → sees `GraceExpiredScreen`

---

## Implementation Order

1. **regroup-functions** — webhook House doc updates (unblocks everything downstream)
2. **rats-v2** — `useSubscriptionGate` hook + tests
3. **rats-v2** — `SubscriptionGate` component + AppState invalidation
4. **rats-v2** — `SubscriptionRequiredScreen` + `GraceExpiredScreen` + `GracePeriodBanner`
5. **rats-v2** — Wire into App.tsx
6. **rats-web** — `SubscriptionGuard` route guard
7. **rats-web** — Billing page adaptive UI by status

---

## Open Questions

1. **`operatorUid` in webhook context** — The `subscriptions/{id}` Firestore doc needs to store the operator's Firebase Auth UID so the webhook can query houses by `adminId`. Verify `createOperatorSubscription` callable stores `uid` in the subscription doc or in Stripe subscription metadata.
2. **Hardcoded Stripe plan IDs** — `plan_HFkfwM5lQx6oud` / `plan_HFkh7QvRnNjMy8` are legacy Plan IDs. Confirm they are still active in the Stripe dashboard before implementation; if not, new Price IDs need to be created.
3. **rats-web `/billing` URL** — The `RATS_WEB_URL` used in `Linking.openURL` must be an environment variable in the mobile app, not hardcoded.
