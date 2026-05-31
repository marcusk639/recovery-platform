# Intergroup Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire intergroup accounts to Stripe so intergroup coordinators can subscribe, unlocking the intergroup dashboard features that are already built but currently ungated.

**Architecture:** Two existing Stripe product IDs (`productIdIntergroupA`, `productIdIntergroupB`) are exported from `functions/src/utils/stripe.ts` but have no prices, no callable to create a subscription, and no mobile upgrade CTA. This plan sets a price in the Stripe dashboard (manual step), creates the `createIntergroupSubscription` callable following the same pattern as `createGroupSubscription`, and adds an upgrade banner to `IntergroupDashboardScreen`.

**Tech Stack:** React Native (TypeScript), Firebase Cloud Functions (TypeScript), Stripe SDK, Jest

---

## File Structure

| Action | File                                                           | Responsibility                                                 |
| ------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Modify | `docs/BUSINESS_MODEL.md`                                       | Document intergroup pricing ($99–$199/year)                    |
| Create | `functions/src/callable/createIntergroupSubscription.ts`       | Callable: create Stripe subscription for intergroup            |
| Create | `functions/src/__tests__/createIntergroupSubscription.test.ts` | Unit tests for the callable                                    |
| Modify | `functions/src/index.ts`                                       | Export the new callable                                        |
| Modify | `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx`  | Show upgrade banner when intergroup has no active subscription |

---

### Task 1: Document intergroup pricing

**Files:**

- Modify: `docs/BUSINESS_MODEL.md`

Before writing code, lock in the pricing so Stripe dashboard setup (Task 2) has a clear target.

- [ ] **Step 1: Read the current BUSINESS_MODEL.md pricing section**

```bash
grep -n "intergroup\|Intergroup\|tier\|pricing" docs/BUSINESS_MODEL.md | head -30
```

- [ ] **Step 2: Add intergroup pricing section**

In `docs/BUSINESS_MODEL.md`, add after the existing group pricing section:

```markdown
## Intergroup Pricing

| Tier  | Annual Price | Included                                                         |
| ----- | ------------ | ---------------------------------------------------------------- |
| Basic | $99/year     | Up to 25 affiliated groups, directory listing, monthly reports   |
| Pro   | $199/year    | Unlimited groups, custom branding, data export, priority support |

**Rationale:** Intergroups coordinate 10–200+ homegroups. Even at $99/year the LTV per account is 8× a single group subscription. The Pro tier targets district-level intergroups with reporting needs.

**Stripe product IDs (already created):**

- Basic: `productIdIntergroupA` (env: `STRIPE_PRODUCT_ID_INTERGROUP_A`)
- Pro: `productIdIntergroupB` (env: `STRIPE_PRODUCT_ID_INTERGROUP_B`)

**Required Stripe dashboard action:** Create one annual price for each product before deploying `createIntergroupSubscription`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/BUSINESS_MODEL.md
git commit -m "docs: add intergroup pricing tiers to BUSINESS_MODEL"
```

---

### Task 2: Create Stripe prices (manual Stripe dashboard step)

**Files:** None — this is a Stripe dashboard action.

- [ ] **Step 1: Log in to Stripe dashboard → Products**

Find the product whose ID matches `STRIPE_PRODUCT_ID_INTERGROUP_A` (the value of `productIdIntergroupA` in your `.env`).

- [ ] **Step 2: Add annual price to Basic product**

Click "Add price" → Recurring → Annual → $99.00. Set it as the **default price**.

- [ ] **Step 3: Add annual price to Pro product**

Find the product matching `STRIPE_PRODUCT_ID_INTERGROUP_B`. Click "Add price" → Recurring → Annual → $199.00. Set it as the **default price**.

- [ ] **Step 4: Verify with the existing `getDefaultPriceForProduct` helper**

```bash
cd functions && node -e "
const Stripe = require('stripe');
const s = new Stripe(process.env.STRIPE_SECRET_KEY);
s.products.retrieve(process.env.STRIPE_PRODUCT_ID_INTERGROUP_A, { expand: ['default_price'] })
  .then(p => console.log('Basic default price:', p.default_price?.id, p.default_price?.recurring?.interval));
"
```

Expected output: `Basic default price: price_xxx year`

---

### Task 3: Implement `createIntergroupSubscription` callable

**Files:**

- Create: `functions/src/callable/createIntergroupSubscription.ts`
- Create: `functions/src/__tests__/createIntergroupSubscription.test.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `functions/src/__tests__/createIntergroupSubscription.test.ts`:

```typescript
import * as admin from "firebase-admin";

const mockSubscriptionsCreate = jest.fn();
const mockCustomersCreate = jest.fn();
const mockProductsRetrieve = jest.fn();
const mockPricesRetrieve = jest.fn();

jest.mock("stripe", () =>
  jest.fn(() => ({
    subscriptions: { create: mockSubscriptionsCreate },
    customers: { create: mockCustomersCreate },
    products: { retrieve: mockProductsRetrieve },
    prices: { retrieve: mockPricesRetrieve },
  })),
);

const mockIntergroupGet = jest.fn();
const mockIntergroupUpdate = jest.fn(() => Promise.resolve());
const mockDoc = jest.fn(() => ({
  get: mockIntergroupGet,
  update: mockIntergroupUpdate,
}));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock("firebase-admin", () => ({
  firestore: jest.fn(() => ({ collection: mockCollection })),
  initializeApp: jest.fn(),
}));

jest.mock("firebase-functions", () => ({
  https: {
    onCall: jest.fn((fn) => fn),
    HttpsError: class HttpsError extends Error {
      constructor(
        public code: string,
        message: string,
      ) {
        super(message);
      }
    },
  },
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { createIntergroupSubscription } from "../callable/createIntergroupSubscription";

const makeRequest = (overrides = {}) => ({
  auth: { uid: "user1", token: { email: "coord@example.com" } },
  data: { intergroupId: "ig1", tier: "basic" },
  ...overrides,
});

describe("createIntergroupSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIntergroupGet.mockResolvedValue({
      exists: true,
      data: () => ({ name: "District 7", coordinators: ["user1"] }),
    });
    mockCustomersCreate.mockResolvedValue({ id: "cus_abc" });
    mockProductsRetrieve.mockResolvedValue({
      default_price: { id: "price_basic", recurring: { interval: "year" } },
    });
    mockSubscriptionsCreate.mockResolvedValue({
      id: "sub_abc",
      status: "trialing",
      current_period_end: Math.floor(Date.now() / 1000) + 7 * 86400,
      items: { data: [{ price: { id: "price_basic" } }] },
    });
  });

  it("throws unauthenticated if no auth", async () => {
    await expect(
      createIntergroupSubscription({ ...makeRequest(), auth: null } as any),
    ).rejects.toThrow(/unauthenticated/i);
  });

  it("throws not-found if intergroup does not exist", async () => {
    mockIntergroupGet.mockResolvedValue({ exists: false });
    await expect(
      createIntergroupSubscription(makeRequest() as any),
    ).rejects.toThrow(/not found/i);
  });

  it("throws permission-denied if caller is not a coordinator", async () => {
    mockIntergroupGet.mockResolvedValue({
      exists: true,
      data: () => ({ name: "District 7", coordinators: ["other-user"] }),
    });
    await expect(
      createIntergroupSubscription(makeRequest() as any),
    ).rejects.toThrow(/permission/i);
  });

  it("creates Stripe customer with email and creates subscription", async () => {
    await createIntergroupSubscription(makeRequest() as any);
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "coord@example.com" }),
    );
    expect(mockSubscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_abc" }),
    );
  });

  it("writes subscription fields to Firestore intergroup document", async () => {
    await createIntergroupSubscription(makeRequest() as any);
    expect(mockIntergroupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_abc",
        stripeSubscriptionId: "sub_abc",
        subscriptionStatus: "trialing",
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd functions && npx jest createIntergroupSubscription --no-coverage 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `createIntergroupSubscription.ts`**

Create `functions/src/callable/createIntergroupSubscription.ts`:

```typescript
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  getStripe,
  productIdIntergroupA,
  productIdIntergroupB,
  getDefaultPriceForProduct,
  assertGroupPriceIsAnnual,
  TRIAL_PERIOD_DAYS,
} from "../utils/stripe";

type Tier = "basic" | "pro";

interface CreateIntergroupSubscriptionData {
  intergroupId: string;
  tier: Tier;
}

export const createIntergroupSubscription = functions.https.onCall(
  async (
    request: functions.https.CallableRequest<CreateIntergroupSubscriptionData>,
  ) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Must be signed in.",
      );
    }

    const { intergroupId, tier } = request.data;
    const userId = request.auth.uid;
    const db = admin.firestore();

    const intergroupSnap = await db
      .collection("intergroups")
      .doc(intergroupId)
      .get();
    if (!intergroupSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        `Intergroup ${intergroupId} not found.`,
      );
    }

    const intergroupData = intergroupSnap.data()!;
    const coordinators: string[] = intergroupData.coordinators ?? [];
    if (!coordinators.includes(userId)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only intergroup coordinators can manage subscriptions.",
      );
    }

    const productId =
      tier === "pro" ? productIdIntergroupB : productIdIntergroupA;
    const stripe = getStripe();

    const price = await getDefaultPriceForProduct(productId);
    assertGroupPriceIsAnnual(price); // reuse existing guard

    const customer = await stripe.customers.create({
      name: intergroupData.name,
      email: request.auth.token.email,
      metadata: { intergroupId },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }],
      trial_period_days: TRIAL_PERIOD_DAYS,
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });

    await db
      .collection("intergroups")
      .doc(intergroupId)
      .update({
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionTier: tier,
        stripePriceId: price.id,
        stripeProductId: productId,
        subscriptionExpiresAt: subscription.current_period_end * 1000,
      });

    functions.logger.info(
      `Intergroup subscription created: ${intergroupId} tier=${tier}`,
    );

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret:
        (subscription.latest_invoice as any)?.payment_intent?.client_secret ??
        null,
    };
  },
);
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd functions && npx jest createIntergroupSubscription --no-coverage 2>&1 | tail -10
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Export from `functions/src/index.ts`**

Add alongside other callable exports:

```typescript
export { createIntergroupSubscription } from "./callable/createIntergroupSubscription";
```

- [ ] **Step 6: Build**

```bash
cd functions && npm run build 2>&1 | grep -i error
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add functions/src/callable/createIntergroupSubscription.ts \
        functions/src/__tests__/createIntergroupSubscription.test.ts \
        functions/src/index.ts
git commit -m "feat(functions): createIntergroupSubscription callable with tier support"
```

---

### Task 4: Add upgrade banner to `IntergroupDashboardScreen`

**Files:**

- Modify: `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx`

Without a CTA, coordinators have no way to subscribe. This task adds a banner at the top of the screen when the intergroup has no active or trialing subscription.

- [ ] **Step 1: Read the current screen structure**

```bash
grep -n "subscriptionStatus\|coordinator\|return\|ScrollView\|View" \
  mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx | head -40
```

Identify: where the JSX root opens, what subscription fields (if any) come from Redux state, and whether `useNavigation` is already imported.

- [ ] **Step 2: Add subscription status selector**

In the component body, after existing `useSelector` calls, add:

```typescript
const subscriptionStatus: string | undefined = useSelector(
  (state: RootState) =>
    selectIntergroupById(state, intergroupId)?.subscriptionStatus,
);
const isPremium =
  subscriptionStatus === "active" || subscriptionStatus === "trialing";
```

If `selectIntergroupById` does not exist, use the raw Firestore field from the intergroup document already in Redux state — check what selector the screen already uses and access `.subscriptionStatus` from there.

- [ ] **Step 3: Add the upgrade banner JSX**

At the top of the JSX return, inside the outermost `<View>` or `<ScrollView>`, add:

```tsx
{
  !isPremium && (
    <TouchableOpacity
      style={styles.upgradeBanner}
      onPress={() =>
        navigation.navigate("IntergroupUpgrade", {
          intergroupId,
          tier: "basic",
        })
      }
      testID="intergroup-upgrade-banner"
    >
      <Text style={styles.upgradeBannerText}>
        Unlock full intergroup features — subscribe from $99/year
      </Text>
    </TouchableOpacity>
  );
}
```

Add banner styles to `StyleSheet.create`:

```typescript
upgradeBanner: {
  backgroundColor: "#1a73e8",
  padding: 14,
  marginHorizontal: 16,
  marginTop: 12,
  borderRadius: 8,
},
upgradeBannerText: {
  color: "#fff",
  fontSize: 14,
  fontWeight: "600",
  textAlign: "center",
},
```

- [ ] **Step 4: Write a smoke test**

In `mobile/src/__tests__/IntergroupDashboardScreen.test.tsx`:

```typescript
import React from "react";
import { render } from "@testing-library/react-native";
import IntergroupDashboardScreen from "../screens/intergroup/IntergroupDashboardScreen";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useRoute: () => ({ params: { intergroupId: "ig1" } }),
}));

// Stub Redux with NO subscription
jest.mock("react-redux", () => ({
  useSelector: (fn: any) => fn({
    intergroups: { entities: { ig1: { id: "ig1", name: "District 7", coordinators: ["u1"] } } },
    auth: { currentUser: { uid: "u1" } },
  }),
  useDispatch: () => jest.fn(),
}));

describe("IntergroupDashboardScreen upgrade banner", () => {
  it("shows upgrade banner when intergroup has no subscription", () => {
    const { getByTestId } = render(<IntergroupDashboardScreen />);
    expect(getByTestId("intergroup-upgrade-banner")).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run test**

```bash
cd mobile && npx jest IntergroupDashboardScreen --no-coverage 2>&1 | tail -10
```

Expected: PASS (or identify mock gaps and fix them — the screen may need additional Redux shape adjustments).

- [ ] **Step 6: Run full mobile test suite**

```bash
cd mobile && npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx \
        mobile/src/__tests__/IntergroupDashboardScreen.test.tsx
git commit -m "feat(intergroup): add subscription upgrade banner to dashboard screen"
```

---

## Self-Review

**Spec coverage:**

- ✓ Task 1 — pricing documented in BUSINESS_MODEL.md with Stripe product IDs mapped
- ✓ Task 2 — Stripe dashboard manual setup step with verification command
- ✓ Task 3 — `createIntergroupSubscription` callable: auth, permission, annual price assertion, customer email, subscription creation, Firestore write
- ✓ Task 4 — upgrade banner visible to coordinators without active subscription

**Placeholder scan:** No TBD/TODO in any code block. `IntergroupUpgrade` route name in Task 4 step 3 is a dependency — if that screen does not yet exist, stub it or substitute `SubscriptionUpgrade` with an `intergroupId` param as a temporary target.

**Type consistency:** `subscriptionStatus: string | undefined` used throughout Task 4. `Tier = "basic" | "pro"` defined in Task 3 and used consistently. `assertGroupPriceIsAnnual` imported from `../utils/stripe` — defined in the P0 plan (must be completed first).

**Dependency:** This plan depends on `assertGroupPriceIsAnnual` being exported from `functions/src/utils/stripe.ts`. Complete `2026-04-15-p0-billing-integrity.md` Task 3 before deploying this plan.
