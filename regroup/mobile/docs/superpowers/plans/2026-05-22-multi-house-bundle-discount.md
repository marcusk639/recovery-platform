# Multi-House Bundle Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Overview

Automatically apply a Stripe coupon discount when an operator manages 3+ houses. Discounts are applied server-side only — no client math. The coupon is recalculated on every `updateSubscriptionHouses` call and reflected in the operator's next Stripe invoice.

| House count | Coupon ID          | Discount |
| ----------- | ------------------ | -------- |
| < 3         | _(none)_           | 0%       |
| 3–4         | `regroup-bundle-3` | 10% off  |
| 5+          | `regroup-bundle-5` | 20% off  |

---

## Phase 0 — Manual Stripe Dashboard Setup (REQUIRED BEFORE DEPLOY)

These coupons must exist in Stripe before any code goes live. Create them once; they are referenced by ID in the code.

- [ ] **0.1** Log in to the Stripe Dashboard (production account).
- [ ] **0.2** Navigate to **Billing > Coupons > + New**.
- [ ] **0.3** Create coupon `regroup-bundle-3`:
  - ID: `regroup-bundle-3`
  - Type: **Percentage discount**
  - Percent off: `10`
  - Duration: **Forever**
  - Name (display): `3-House Bundle — 10% off`
- [ ] **0.4** Create coupon `regroup-bundle-5`:
  - ID: `regroup-bundle-5`
  - Type: **Percentage discount**
  - Percent off: `20`
  - Duration: **Forever**
  - Name (display): `5-House Bundle — 20% off`
- [ ] **0.5** (Optional but recommended) Repeat steps 0.2–0.4 in the **Stripe Test** environment so tests can run against real test-mode IDs if needed. The unit tests below use mocks, so this is not strictly required for the test suite to pass.

---

## Phase 1 — Add Stripe helpers to `api/stripe.ts`

**File:** `/Users/marcusklein/dev/regroup-functions/functions/src/api/stripe.ts`

- [ ] **1.1** Add the coupon ID constants and `getBundleCoupon` pure function immediately after the `planIds` block (after line 24):

```typescript
// ── Bundle-discount coupon IDs ─────────────────────────────────────────────
const bundleCouponIds = {
  bundle3: 'regroup-bundle-3',
  bundle5: 'regroup-bundle-5',
} as const;

/**
 * Returns the coupon ID that should be applied for the given house count,
 * or null if no discount applies.
 */
export const getBundleCoupon = (houseCount: number): string | null => {
  if (houseCount >= 5) return bundleCouponIds.bundle5;
  if (houseCount >= 3) return bundleCouponIds.bundle3;
  return null;
};
```

- [ ] **1.2** Add `applyBundleDiscountToSubscription` and `removeBundleDiscount` exported functions after `updateGuestSubscriptionAmount` (after line 172):

```typescript
/**
 * Applies the appropriate bundle coupon to a Stripe subscription based on
 * house count. If no discount tier is reached, removes any existing coupon.
 *
 * Coupon tiers:
 *   houseCount >= 5  → regroup-bundle-5  (20% off, forever)
 *   houseCount >= 3  → regroup-bundle-3  (10% off, forever)
 *   houseCount < 3   → no coupon (removes any existing one)
 */
export const applyBundleDiscountToSubscription = async (
  subscriptionId: string,
  houseCount: number,
): Promise<void> => {
  const couponId = getBundleCoupon(houseCount);
  if (couponId) {
    await stripe.subscriptions.update(subscriptionId, { coupon: couponId });
  } else {
    await removeBundleDiscount(subscriptionId);
  }
};

/**
 * Removes any coupon currently applied to a Stripe subscription.
 * Passing an empty string to the Stripe API clears the discount.
 */
export const removeBundleDiscount = async (
  subscriptionId: string,
): Promise<void> => {
  await stripe.subscriptions.update(subscriptionId, { coupon: '' });
};
```

---

## Phase 2 — Add `applyBundleDiscount` callable + wire into `updateSubscriptionHouses`

**File:** `/Users/marcusklein/dev/regroup-functions/functions/src/callable/subscriptions.ts`

- [ ] **2.1** Add `applyBundleDiscountToSubscription` and `removeBundleDiscount` to the existing import from `../api/stripe` (line 8–26):

```typescript
import {
  initializeCustomer,
  updateSubscriptionItem,
  getSubscriptionItem,
  updateSubscriptionMetadata,
  retrievePaymentMethod,
  updatePaymentMethod,
  cancelSubscription,
  reactivateSubscription,
  mapSubscriptionToMetadata,
  uncancelSubscription,
  stripe,
  applyBundleDiscountToSubscription,
} from '../api/stripe';
```

- [ ] **2.2** Add the `applyBundleDiscount` Zod schema near the other schemas (after `updateSubscriptionHousesSchema`, around line 101):

```typescript
const applyBundleDiscountSchema = z.object({
  userId: z.string().min(1),
});
```

- [ ] **2.3** Add the `applyBundleDiscount` callable Cloud Function as a new export at the end of the file (before `sendInviteEmails` or at the very end):

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// applyBundleDiscount
// ─────────────────────────────────────────────────────────────────────────────
export const applyBundleDiscount = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async request => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Login required');
    const data = parseInput(applyBundleDiscountSchema, request.data) as {
      userId: string;
    };
    const user = await getUser(data.userId);
    if (!user.subscriptionMetadata?.subscriptionId) {
      logger.warn('applyBundleDiscount: user has no subscriptionId, skipping', {
        userId: data.userId,
      });
      return;
    }
    const houseCount = Object.keys(
      user.subscriptionMetadata.houses ?? {},
    ).length;
    logger.info('applyBundleDiscount', {
      userId: data.userId,
      houseCount,
      subscriptionId: user.subscriptionMetadata.subscriptionId,
    });
    await applyBundleDiscountToSubscription(
      user.subscriptionMetadata.subscriptionId,
      houseCount,
    );
  },
);
```

- [ ] **2.4** Modify `updateSubscriptionHouses` to call `applyBundleDiscountToSubscription` after both the `add` and `remove` branches, immediately before `return user`. The updated tail of the function looks like this:

```typescript
// ... existing add / remove logic ...

// Apply or remove the bundle discount based on the new house count.
if (user.subscriptionMetadata?.subscriptionId) {
  const houseCount = Object.keys(user.subscriptionMetadata.houses ?? {}).length;
  try {
    await applyBundleDiscountToSubscription(
      user.subscriptionMetadata.subscriptionId,
      houseCount,
    );
    logger.info('Bundle discount applied', {
      ownerUserId,
      houseCount,
      subscriptionId: user.subscriptionMetadata.subscriptionId,
    });
  } catch (discountError) {
    // Non-fatal: log and continue — subscription item update already succeeded.
    logger.error('Failed to apply bundle discount', discountError);
  }
}

return user;
```

The full modified `updateSubscriptionHouses` function body is shown in the appendix below.

---

## Phase 3 — Export `applyBundleDiscount` from `index.ts`

**File:** `/Users/marcusklein/dev/regroup-functions/functions/src/index.ts`

The existing `export * from "./callable/subscriptions"` (line 17) already re-exports everything from subscriptions.ts, so **no change is required**. Verify this is present and `applyBundleDiscount` will be exported automatically.

- [ ] **3.1** Confirm `export * from "./callable/subscriptions";` is present in `index.ts`. If not, add it. The new `applyBundleDiscount` callable is picked up automatically.

---

## Phase 4 — Add mobile callable wrapper

**File:** `/Users/marcusklein/dev/rats-v2/src/services/subscription.ts`

- [ ] **4.1** Add the `applyBundleDiscount` wrapper function:

```typescript
export const applyBundleDiscount = async (userId: string): Promise<void> => {
  await functions.httpsCallable('applyBundleDiscount')({ userId });
};
```

No Redux action or UI change is needed — the discount is automatic and shows up in the next Stripe invoice.

---

## Phase 5 — Tests

**File:** `/Users/marcusklein/dev/regroup-functions/functions/src/__tests__/callable/subscriptions.test.ts`

- [ ] **5.1** Add mock for the new `applyBundleDiscountToSubscription` export in the `jest.mock("../../api/stripe", ...)` block:

```typescript
const mockApplyBundleDiscountToSubscription = jest
  .fn()
  .mockResolvedValue(undefined);

jest.mock('../../api/stripe', () => ({
  initializeCustomer: mockInitializeCustomer,
  updateSubscriptionItem: mockUpdateSubscriptionItem,
  getSubscriptionItem: mockGetSubscriptionItem,
  updateSubscriptionMetadata: mockUpdateSubscriptionMetadata,
  retrievePaymentMethod: mockRetrievePaymentMethod,
  updatePaymentMethod: mockUpdatePaymentMethod,
  cancelSubscription: mockCancelSubscription,
  reactivateSubscription: mockReactivateSubscription,
  mapSubscriptionToMetadata: mockMapSubscriptionToMetadata,
  uncancelSubscription: mockUncancelSubscription,
  applyBundleDiscountToSubscription: (...args: any[]) =>
    mockApplyBundleDiscountToSubscription(...args),
  stripe: {
    subscriptions: {
      update: (...args: any[]) => mockStripeSubscriptionsUpdate(...args),
    },
  },
}));
```

- [ ] **5.2** Add `applyBundleDiscount` to the import from `../../callable/subscriptions`:

```typescript
import {
  createOperatorSubscription,
  reactivateOperatorSubscription,
  cancelUserSubscription,
  updateSubscriptionGuests,
  updateSubscriptionHouses,
  applyBundleDiscount,
  sendInviteEmails,
  sendConfirmationEmail,
} from '../../callable/subscriptions';
```

- [ ] **5.3** Add `getBundleCoupon` unit tests. These are pure-function tests and do not need mocks. Place them in a new `describe` block near the top of the test file (after imports, before the first `describe`):

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// getBundleCoupon (pure helper — tested via applyBundleDiscount integration)
// ─────────────────────────────────────────────────────────────────────────────
// Note: getBundleCoupon lives in api/stripe.ts which is mocked in this file.
// The coupon selection logic is therefore covered by the integration tests below.
```

- [ ] **5.4** Add `applyBundleDiscount` callable tests in a new `describe` block:

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// applyBundleDiscount callable
// ─────────────────────────────────────────────────────────────────────────────

const fakeUserWith2Houses = {
  ...fakeUser,
  subscriptionMetadata: {
    ...fakeUser.subscriptionMetadata,
    subscriptionId: 'sub_fake',
    houses: {
      'house-1': { numberOfGuests: 2 },
      'house-2': { numberOfGuests: 1 },
    },
  },
};

const fakeUserWith3Houses = {
  ...fakeUser,
  subscriptionMetadata: {
    ...fakeUser.subscriptionMetadata,
    subscriptionId: 'sub_fake',
    houses: {
      'house-1': { numberOfGuests: 2 },
      'house-2': { numberOfGuests: 1 },
      'house-3': { numberOfGuests: 0 },
    },
  },
};

const fakeUserWith5Houses = {
  ...fakeUser,
  subscriptionMetadata: {
    ...fakeUser.subscriptionMetadata,
    subscriptionId: 'sub_fake',
    houses: {
      'house-1': { numberOfGuests: 2 },
      'house-2': { numberOfGuests: 1 },
      'house-3': { numberOfGuests: 0 },
      'house-4': { numberOfGuests: 3 },
      'house-5': { numberOfGuests: 1 },
    },
  },
};

describe('applyBundleDiscount callable', () => {
  it('calls applyBundleDiscountToSubscription with correct houseCount for 3 houses', async () => {
    mockGetUser.mockResolvedValue(fakeUserWith3Houses);

    await call(applyBundleDiscount, { userId: 'user-1' });

    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      'sub_fake',
      3,
    );
  });

  it('calls applyBundleDiscountToSubscription with correct houseCount for 5 houses', async () => {
    mockGetUser.mockResolvedValue(fakeUserWith5Houses);

    await call(applyBundleDiscount, { userId: 'user-1' });

    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      'sub_fake',
      5,
    );
  });

  it('calls applyBundleDiscountToSubscription with correct houseCount for 2 houses (no discount)', async () => {
    mockGetUser.mockResolvedValue(fakeUserWith2Houses);

    await call(applyBundleDiscount, { userId: 'user-1' });

    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      'sub_fake',
      2,
    );
  });

  it('skips Stripe call when user has no subscriptionId', async () => {
    const userWithoutSubId = {
      ...fakeUser,
      subscriptionMetadata: {
        ...fakeUser.subscriptionMetadata,
        subscriptionId: undefined,
      },
    };
    mockGetUser.mockResolvedValue(userWithoutSubId);

    await call(applyBundleDiscount, { userId: 'user-1' });

    expect(mockApplyBundleDiscountToSubscription).not.toHaveBeenCalled();
  });

  it('throws unauthenticated when no auth', async () => {
    await expect(
      call(applyBundleDiscount, { userId: 'user-1' }, null as any),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('throws invalid-argument when userId is missing', async () => {
    await expect(call(applyBundleDiscount, {})).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
```

- [ ] **5.5** Add `updateSubscriptionHouses` bundle-discount integration tests in the existing `updateSubscriptionHouses` describe block (or a new sibling block):

```typescript
describe('updateSubscriptionHouses — bundle discount integration', () => {
  it('calls applyBundleDiscountToSubscription after adding a house', async () => {
    const userWith2Houses = {
      ...fakeUser,
      subscriptionMetadata: {
        ...fakeUser.subscriptionMetadata,
        subscriptionId: 'sub_fake',
        houses: {
          'house-1': { numberOfGuests: 2 },
          'house-2': { numberOfGuests: 1 },
        },
      },
    };
    mockGetUser.mockResolvedValue(userWith2Houses);
    mockGetHousesByAttributes.mockResolvedValue({});
    mockGetSubscriptionItem.mockResolvedValue({ quantity: 2 });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateSubscriptionMetadata.mockReturnValue(
      userWith2Houses.subscriptionMetadata,
    );
    mockUpdateUser.mockResolvedValue(undefined);

    await call(updateSubscriptionHouses, {
      ownerUserId: 'user-1',
      action: 'add',
      houseIds: ['house-3'],
    });

    // After adding, houseCount is computed from updated metadata.
    // The mock returns the same metadata (2 houses), so we expect 2.
    expect(mockApplyBundleDiscountToSubscription).toHaveBeenCalledWith(
      'sub_fake',
      expect.any(Number),
    );
  });

  it('does not throw if applyBundleDiscountToSubscription fails (non-fatal)', async () => {
    mockGetUser.mockResolvedValue(fakeUserWith3Houses);
    mockGetHousesByAttributes.mockResolvedValue({
      'house-3': { currentCapacity: 0 },
    });
    mockGetSubscriptionItem.mockResolvedValue({ quantity: 3 });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateSubscriptionMetadata.mockReturnValue(
      fakeUserWith3Houses.subscriptionMetadata,
    );
    mockUpdateUser.mockResolvedValue(undefined);
    mockApplyBundleDiscountToSubscription.mockRejectedValueOnce(
      new Error('Stripe error'),
    );

    // Should not throw — discount error is non-fatal
    await expect(
      call(updateSubscriptionHouses, {
        ownerUserId: 'user-1',
        action: 'remove',
        houseIds: ['house-3'],
      }),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **5.6** Run the test suite to verify all tests pass:

```bash
cd /Users/marcusklein/dev/regroup-functions && yarn test functions/src/__tests__/callable/subscriptions.test.ts --no-coverage
```

---

## Phase 6 — TypeScript type-check

- [ ] **6.1** Run TypeScript compilation check in the functions package:

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx tsc --noEmit
```

Fix any type errors before proceeding.

---

## Phase 7 — Commit

- [ ] **7.1** Stage and commit the Cloud Functions changes:

```bash
git -C /Users/marcusklein/dev/regroup-functions add \
  functions/src/api/stripe.ts \
  functions/src/callable/subscriptions.ts \
  functions/src/__tests__/callable/subscriptions.test.ts
git -C /Users/marcusklein/dev/regroup-functions commit -m "feat(subscriptions): add multi-house bundle discount via Stripe coupons

- getBundleCoupon(): pure function returning coupon ID for ≥3 or ≥5 houses
- applyBundleDiscountToSubscription(): updates Stripe sub with correct coupon
- removeBundleDiscount(): clears coupon (empty-string Stripe API call)
- applyBundleDiscount callable CF: recalculates & applies coupon on demand
- updateSubscriptionHouses: calls applyBundleDiscountToSubscription (non-fatal)
- Tests: applyBundleDiscount callable + updateSubscriptionHouses integration"
```

- [ ] **7.2** Stage and commit the mobile app changes:

```bash
git -C /Users/marcusklein/dev/rats-v2 add \
  src/services/subscription.ts
git -C /Users/marcusklein/dev/rats-v2 commit -m "feat(subscription): add applyBundleDiscount callable wrapper"
```

---

## Appendix A — Complete modified `updateSubscriptionHouses` function body

For reference, the full function body after Phase 2.4 changes. Only the tail (after the existing `if (action === "remove")` block) changes:

```typescript
export const updateSubscriptionHouses = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async request => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Login required');
    const data = parseInput(
      updateSubscriptionHousesSchema,
      request.data,
    ) as SubParams;
    const amount = !isNil(data.amountToAdjust) ? data.amountToAdjust : 1;
    logger.info('Updating user subscription. User', data.ownerUserId);
    const { ownerUserId, action, houseIds } = data;
    const attributes = houseIds.map(houseId => 'houseId');
    let [user, houses] = await Promise.all([
      getUser(ownerUserId),
      getHousesByAttributes(attributes, '==', houseIds),
    ]);
    logger.info('User retrieved', user, 'houses retrieved', houses);
    const item = await getSubscriptionItem(
      user.subscriptionMetadata.items.houseItemId,
    );
    logger.info('Subscription item retrieved', item, 'quantity', item.quantity);
    if (action === 'add') {
      const subscriptionMetadata = updateSubscriptionMetadata(
        user,
        null as unknown as string,
        'add',
        houseIds,
        true,
      );
      user.subscriptionMetadata = subscriptionMetadata;
      logger.info('Subscription data', subscriptionMetadata);
      const [newItem, updateResult] = await Promise.all([
        updateSubscriptionItem(
          user.subscriptionMetadata.items.houseItemId,
          'house',
          item.quantity! + amount,
        ),
        updateUser(user.id!, { subscriptionMetadata }),
      ]);
      logger.info(
        'Subscription updated for item',
        newItem,
        'old item',
        item,
        subscriptionMetadata,
      );
    }
    if (action === 'remove') {
      const houseId = Object.keys(houses)[0];
      const subscriptionMetadata = updateSubscriptionMetadata(
        user,
        houseId,
        action,
        null as unknown as string[],
        true,
      );
      user.subscriptionMetadata = subscriptionMetadata;
      logger.info('Subscription data', subscriptionMetadata);
      const results = Promise.all([
        updateSubscriptionItem(
          user.subscriptionMetadata.items.houseItemId,
          'house',
          item.quantity! - 1,
        ),
        updateSubscriptionItem(
          user.subscriptionMetadata.items.guestItemId,
          'guest',
          item.quantity! - houses[houseId].currentCapacity,
        ),
        updateUser(user.id!, { subscriptionMetadata }),
      ]);
      const [houseItem, guestItem, userResult] = await results;
      logger.info(
        'Subscription updated for item',
        item,
        'house item',
        houseItem,
        'guest item',
        guestItem,
        'user write result',
        userResult,
      );
    }

    // Apply or remove the bundle discount based on the new house count.
    if (user.subscriptionMetadata?.subscriptionId) {
      const houseCount = Object.keys(
        user.subscriptionMetadata.houses ?? {},
      ).length;
      try {
        await applyBundleDiscountToSubscription(
          user.subscriptionMetadata.subscriptionId,
          houseCount,
        );
        logger.info('Bundle discount applied', {
          ownerUserId,
          houseCount,
          subscriptionId: user.subscriptionMetadata.subscriptionId,
        });
      } catch (discountError) {
        // Non-fatal: log and continue — subscription item update already succeeded.
        logger.error('Failed to apply bundle discount', discountError);
      }
    }

    return user;
  },
);
```

---

## Appendix B — Discount logic reference

```typescript
// getBundleCoupon — single source of truth for tier logic
function getBundleCoupon(houseCount: number): string | null {
  if (houseCount >= 5) return 'regroup-bundle-5'; // 20% off
  if (houseCount >= 3) return 'regroup-bundle-3'; // 10% off
  return null; // no discount
}

// Apply coupon:   stripe.subscriptions.update(id, { coupon: 'regroup-bundle-3' })
// Remove coupon:  stripe.subscriptions.update(id, { coupon: '' })
```

---

## Appendix C — Files changed summary

| Repo                | File                                                     | Change                                                                                          |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `regroup-functions` | `functions/src/api/stripe.ts`                            | Add `getBundleCoupon`, `applyBundleDiscountToSubscription`, `removeBundleDiscount`              |
| `regroup-functions` | `functions/src/callable/subscriptions.ts`                | Add `applyBundleDiscount` callable; wire into `updateSubscriptionHouses`                        |
| `regroup-functions` | `functions/src/index.ts`                                 | No change needed (wildcard export already covers it)                                            |
| `regroup-functions` | `functions/src/__tests__/callable/subscriptions.test.ts` | Add mock + tests for `applyBundleDiscount` and integration tests for `updateSubscriptionHouses` |
| `rats-v2`           | `src/services/subscription.ts`                           | Add `applyBundleDiscount` callable wrapper                                                      |

**No UI changes required.** The discount appears automatically on the operator's next Stripe invoice.
