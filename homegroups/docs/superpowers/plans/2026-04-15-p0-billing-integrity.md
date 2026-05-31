# P0 Billing Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four billing integrity gaps that could expose the business to financial or legal risk before launch.

**Architecture:** Three Cloud Function patches (email capture, price-interval assertion, money-back removal) plus one React Native gate that redirects expired admins to the upgrade screen instead of treasury features.

**Tech Stack:** React Native (TypeScript), Firebase Cloud Functions (TypeScript), Stripe SDK, Jest

---

## File Structure

| Action | File                                                            | Responsibility                                                  |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Modify | `mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx` | Remove unimplemented money-back badge                           |
| Modify | `functions/src/callable/createStripeCheckoutSession.ts`         | Add email to Stripe customer creation                           |
| Modify | `functions/src/utils/stripe.ts`                                 | Add `assertGroupPriceIsAnnual()` helper                         |
| Create | `functions/src/__tests__/assertGroupPriceIsAnnual.test.ts`      | Unit test for the assertion                                     |
| Modify | `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`          | Gate treasury/announcement navigation behind subscription check |

---

### Task 1: Remove unimplemented money-back guarantee badge

**Files:**

- Modify: `mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx:216-218`

The screen shows "30-day money-back guarantee" but no refund callable exists anywhere in the codebase. Remove the badge until the refund flow is built.

- [ ] **Step 1: Read the current badge block**

```bash
grep -n "money-back\|guarantee" mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx
```

Expected output: lines 216-218 with the `<View style={styles.guarantee}>` block and `<Text>30-day money-back guarantee</Text>`.

- [ ] **Step 2: Remove the badge**

In `mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx`, delete the guarantee block:

```diff
-          <View style={styles.guarantee}>
-            <Text style={styles.guaranteeText}>30-day money-back guarantee</Text>
-          </View>
```

Also remove the now-unused `guarantee` and `guaranteeText` keys from the `StyleSheet.create({...})` call at the bottom of the file. Search for both:

```bash
grep -n "guarantee" mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx
```

Delete any style definitions that are no longer referenced.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd mobile && npx tsc --noEmit 2>&1 | grep SubscriptionUpgradeScreen
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/subscription/SubscriptionUpgradeScreen.tsx
git commit -m "fix(subscription): remove money-back badge — refund flow not implemented"
```

---

### Task 2: Add email to Stripe customer creation in checkout session

**Files:**

- Modify: `functions/src/callable/createStripeCheckoutSession.ts` (around line 62)

`createGroupSubscription.ts` already passes `email: request.auth?.token.email` when creating a Stripe customer, but `createStripeCheckoutSession.ts` does not. This means customers created through the checkout path have no email in Stripe, which breaks receipt delivery and Stripe's fraud signals.

- [ ] **Step 1: Read the customer creation block**

```bash
grep -n "customers.create\|metadata\|groupData.name" functions/src/callable/createStripeCheckoutSession.ts | head -20
```

You will see something like:

```typescript
const customer = await stripe.customers.create({
  name: groupData.name,
  metadata: { groupId: groupId },
});
```

- [ ] **Step 2: Add email**

Replace the `stripe.customers.create` call to include `email`:

```typescript
const customer = await stripe.customers.create({
  name: groupData.name,
  email: request.auth?.token.email,
  metadata: { groupId: groupId },
});
```

`request.auth?.token.email` is the Firebase Auth token email, same pattern used in `createGroupSubscription.ts`. It is `string | undefined`, which Stripe accepts.

- [ ] **Step 3: Build to confirm no TypeScript errors**

```bash
cd functions && npm run build 2>&1 | grep -i error
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add functions/src/callable/createStripeCheckoutSession.ts
git commit -m "fix(stripe): add customer email to checkout session creation"
```

---

### Task 3: Assert annual price interval at subscription creation

**Files:**

- Modify: `functions/src/utils/stripe.ts`
- Create: `functions/src/__tests__/assertGroupPriceIsAnnual.test.ts`

If the Stripe dashboard is misconfigured and the price attached to `productIdGroup` is monthly, the subscription silently bills $12/month instead of $12/year. This assertion catches that at runtime.

- [ ] **Step 1: Write the failing test first**

Create `functions/src/__tests__/assertGroupPriceIsAnnual.test.ts`:

```typescript
import { assertGroupPriceIsAnnual } from "../utils/stripe";

// Stripe SDK is NOT mocked — we test the pure helper with plain objects
describe("assertGroupPriceIsAnnual", () => {
  it("does not throw when the price interval is year", () => {
    const price = { id: "price_abc", recurring: { interval: "year" } } as any;
    expect(() => assertGroupPriceIsAnnual(price)).not.toThrow();
  });

  it("throws when the price interval is month", () => {
    const price = { id: "price_xyz", recurring: { interval: "month" } } as any;
    expect(() => assertGroupPriceIsAnnual(price)).toThrow(/price_xyz.*annual/i);
  });

  it("throws when recurring is null", () => {
    const price = { id: "price_abc", recurring: null } as any;
    expect(() => assertGroupPriceIsAnnual(price)).toThrow(/annual/i);
  });
});
```

- [ ] **Step 2: Run the test — expect it to FAIL**

```bash
cd functions && npx jest assertGroupPriceIsAnnual --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `assertGroupPriceIsAnnual` is not exported yet.

- [ ] **Step 3: Implement the helper in `functions/src/utils/stripe.ts`**

Add after the existing exports in `stripe.ts` (do not remove anything existing):

```typescript
/**
 * Guard: throws if the Stripe price is not billed annually.
 * Call this after fetching the default price for productIdGroup.
 */
export function assertGroupPriceIsAnnual(price: Stripe.Price): void {
  if (price.recurring?.interval !== "year") {
    throw new Error(
      `Stripe price ${price.id} must be annual (got "${price.recurring?.interval ?? "null"}"). ` +
        `Check the Stripe dashboard — productIdGroup must have a yearly price as its default.`,
    );
  }
}
```

Ensure `Stripe` is imported at the top of the file (it already is via `import Stripe from "stripe"`).

- [ ] **Step 4: Run the test — expect it to PASS**

```bash
cd functions && npx jest assertGroupPriceIsAnnual --no-coverage 2>&1 | tail -10
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Call the assertion in `createGroupSubscription.ts`**

In `functions/src/callable/createGroupSubscription.ts`, find the call to `getDefaultPriceForProduct` and add the assertion immediately after:

```typescript
import {
  productIdGroup,
  getDefaultPriceForProduct,
  assertGroupPriceIsAnnual,
} from "../utils/stripe";

// Inside the function body, after fetching the price:
const price = await getDefaultPriceForProduct(productIdGroup);
assertGroupPriceIsAnnual(price); // ← add this line
```

- [ ] **Step 6: Build**

```bash
cd functions && npm run build 2>&1 | grep -i error
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add functions/src/utils/stripe.ts \
        functions/src/__tests__/assertGroupPriceIsAnnual.test.ts \
        functions/src/callable/createGroupSubscription.ts
git commit -m "feat(stripe): assert annual price interval at subscription creation"
```

---

### Task 4: Gate treasury and announcement navigation behind subscription status

**Files:**

- Modify: `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`

Firestore security rules check admin role only, not subscription status. An expired admin can still tap Treasury and Announcements in the app. This task makes the navigation functions redirect expired admins to the upgrade screen.

The `useTrialStatus` hook (at line 174) already returns `{ isInTrial, isActive }`. Use those to derive `isPremium`.

- [ ] **Step 1: Write the failing test**

In `mobile/src/__tests__/GroupOverviewScreen.test.tsx` (create if it doesn't exist, or add to the existing file):

```typescript
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import GroupOverviewScreen from "../screens/homegroup/GroupOverviewScreen";

// Mock hooks
jest.mock("../hooks/useTrialStatus", () => ({
  useTrialStatus: () => ({ isInTrial: false, isActive: false, daysRemaining: 0, isExpired: true }),
}));

// Mock navigation
const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { groupId: "g1", groupName: "Test Group" } }),
}));

// Stub Redux selectors to return a group where current user is admin
jest.mock("../store/selectors", () => ({
  selectGroupById: () => ({ id: "g1", admins: ["user1"], name: "Test Group" }),
  selectCurrentUserId: () => "user1",
}));

describe("GroupOverviewScreen subscription gate", () => {
  it("redirects expired admin to SubscriptionUpgrade when tapping Treasury", () => {
    const { getByTestId } = render(<GroupOverviewScreen />);
    fireEvent.press(getByTestId("treasury-nav-button"));
    expect(mockNavigate).toHaveBeenCalledWith("SubscriptionUpgrade", expect.objectContaining({ groupId: "g1" }));
  });
});
```

- [ ] **Step 2: Run the test — expect it to FAIL**

```bash
cd mobile && npx jest GroupOverviewScreen --no-coverage 2>&1 | tail -20
```

Expected: FAIL — button testID doesn't exist yet or navigation goes to GroupTreasury instead.

- [ ] **Step 3: Add `isPremium` and gate the navigation functions**

In `mobile/src/screens/homegroup/GroupOverviewScreen.tsx`:

After line 174 where `trialStatus` is declared:

```typescript
const trialStatus = useTrialStatus(groupId);
const isPremium = trialStatus.isInTrial || trialStatus.isActive; // ← add this line
```

Replace the `navigateToGroupTreasury` function body (currently lines 273-278, approximately):

```typescript
const navigateToGroupTreasury = useCallback(() => {
  if (!isPremium && isCurrentUserAdmin()) {
    navigation.navigate("SubscriptionUpgrade", { groupId, groupName });
    return;
  }
  navigation.navigate("GroupTreasury", { groupId, groupName });
}, [isPremium, groupId, groupName, navigation, isCurrentUserAdmin]);
```

Replace the `navigateToGroupAnnouncements` function body similarly:

```typescript
const navigateToGroupAnnouncements = useCallback(() => {
  if (!isPremium && isCurrentUserAdmin()) {
    navigation.navigate("SubscriptionUpgrade", { groupId, groupName });
    return;
  }
  navigation.navigate("GroupAnnouncements", { groupId, groupName });
}, [isPremium, groupId, groupName, navigation, isCurrentUserAdmin]);
```

Add `testID="treasury-nav-button"` to the Treasury touchable in the JSX so the test can find it.

- [ ] **Step 4: Run the test — expect it to PASS**

```bash
cd mobile && npx jest GroupOverviewScreen --no-coverage 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run the full mobile test suite**

```bash
cd mobile && npm test 2>&1 | tail -20
```

Expected: all tests pass (357+ suites).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/homegroup/GroupOverviewScreen.tsx \
        mobile/src/__tests__/GroupOverviewScreen.test.tsx
git commit -m "feat(subscription): gate treasury/announcements nav behind subscription status"
```

---

## Self-Review

**Spec coverage:**

- ✓ Task 1 — removes false money-back claim
- ✓ Task 2 — email captured in Stripe customer for checkout path
- ✓ Task 3 — annual interval asserted + tested at subscription creation
- ✓ Task 4 — expired admins redirected to upgrade screen

**Placeholder scan:** No TBD/TODO in code blocks. All paths are exact.

**Type consistency:** `assertGroupPriceIsAnnual(price: Stripe.Price)` is used consistently in Task 3 step 3 and step 5. `isPremium` is `boolean` derived from `useTrialStatus` return type throughout Task 4.
