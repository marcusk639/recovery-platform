# Intergroup Subscription Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the two "Upgrade to Unlimited" buttons in `IntergroupDashboardScreen` to an actual Stripe checkout session, replacing the "Coming Soon" alerts.

**Architecture:** A new `upgradeIntergroupTier` callable creates a Stripe checkout session for the tier_b product (unlimited groups) and returns a `checkoutUrl`. The mobile app opens that URL with `Linking.openURL`. The existing Stripe webhook at `stripeWebhook.ts → handleCheckoutSessionCompleted` is extended to detect intergroup upgrade sessions and update `intergroups/{id}.tier` to `"tier_b"`.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript), Stripe Checkout Sessions, React Native `Linking` API, Jest.

**Prerequisites:** The Stripe products `productIdIntergroupA` and `productIdIntergroupB` must have prices configured in the Stripe dashboard before deploying. The plan assumes they exist and are annual prices.

---

## File Structure

| File                                                          | Action | Responsibility                                                                       |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `functions/src/callable/upgradeIntergroupTier.ts`             | Create | Validates ownership, creates Stripe checkout session for tier_b, returns checkoutUrl |
| `functions/src/utils/stripeUtils.ts`                          | Modify | Handle `intergroup_upgrade` checkout sessions in `handleCheckoutSessionCompleted`    |
| `functions/src/index.ts`                                      | Modify | Export new callable                                                                  |
| `functions/src/tests/upgradeIntergroupTier.test.ts`           | Create | Unit tests                                                                           |
| `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx` | Modify | Replace Alert.alert stubs with real callable + Linking.openURL                       |

---

### Task 1: Write failing tests for the callable

**Files:**

- Create: `functions/src/tests/upgradeIntergroupTier.test.ts`

- [ ] **Step 1: Create test file**

```typescript
// functions/src/tests/upgradeIntergroupTier.test.ts
const mockStripeCheckoutCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDocGet = jest.fn();

jest.mock("firebase-admin", () => ({
  apps: [{ name: "[DEFAULT]" }],
  initializeApp: jest.fn(),
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({ get: mockDocGet, update: mockUpdate })),
      })),
    })),
    {
      FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TS") },
    },
  ),
}));

jest.mock("firebase-functions", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
  https: { onCall: jest.fn() },
}));

jest.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: any, handler: any) => handler,
}));

jest.mock("firebase-functions/v1/https", () => ({
  HttpsError: class HttpsError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

jest.mock("../utils/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
  },
  productIdIntergroupB: "prod_tier_b",
  getDefaultPriceForProduct: jest.fn().mockResolvedValue("price_tier_b"),
}));

import { upgradeIntergroupTierHandler } from "../callable/upgradeIntergroupTier";

const makeRequest = (overrides: any = {}) => ({
  auth: { uid: "owner-1" },
  data: { intergroupId: "intergroup-1" },
  ...overrides,
});

describe("upgradeIntergroupTierHandler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("throws unauthenticated when no auth", async () => {
    const req = makeRequest({ auth: null });
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws invalid-argument when intergroupId is missing", async () => {
    const req = makeRequest({ data: {} });
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("throws not-found when intergroup doc does not exist", async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false });
    const req = makeRequest();
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("throws permission-denied when caller is not owner", async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerUid: "someone-else", tier: "tier_a" }),
    });
    const req = makeRequest();
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("throws failed-precondition when already on tier_b", async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ ownerUid: "owner-1", tier: "tier_b" }),
    });
    const req = makeRequest();
    await expect(upgradeIntergroupTierHandler(req)).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });

  it("returns checkoutUrl when valid tier_a owner upgrades", async () => {
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        ownerUid: "owner-1",
        tier: "tier_a",
        stripeCustomerId: "cus_abc",
      }),
    });
    mockStripeCheckoutCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/pay/cs_test_abc",
    });
    const req = makeRequest();
    const result = await upgradeIntergroupTierHandler(req);
    expect(result).toEqual({
      checkoutUrl: "https://checkout.stripe.com/pay/cs_test_abc",
    });
    expect(mockStripeCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_abc",
        metadata: expect.objectContaining({
          intergroupId: "intergroup-1",
          upgradeFrom: "tier_a",
          upgradeTo: "tier_b",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd functions && npx jest src/tests/upgradeIntergroupTier.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../callable/upgradeIntergroupTier'`

---

### Task 2: Implement the callable

**Files:**

- Create: `functions/src/callable/upgradeIntergroupTier.ts`

- [ ] **Step 3: Create the callable**

```typescript
// functions/src/callable/upgradeIntergroupTier.ts
import * as functions from "firebase-functions";
import { HttpsError } from "firebase-functions/v1/https";
import { CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import {
  stripe,
  productIdIntergroupB,
  getDefaultPriceForProduct,
} from "../utils/stripe";

interface UpgradeIntergroupTierData {
  intergroupId: string;
}

export async function upgradeIntergroupTierHandler(
  request: CallableRequest<UpgradeIntergroupTierData>,
): Promise<{ checkoutUrl: string }> {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { intergroupId } = request.data ?? {};
  if (!intergroupId || typeof intergroupId !== "string") {
    throw new HttpsError("invalid-argument", "intergroupId is required.");
  }
  if (!productIdIntergroupB) {
    throw new HttpsError(
      "failed-precondition",
      "Intergroup tier_b product is not configured.",
    );
  }

  const db = admin.firestore();
  const docSnap = await db.collection("intergroups").doc(intergroupId).get();

  if (!docSnap.exists) {
    throw new HttpsError("not-found", "Intergroup not found.");
  }

  const data = docSnap.data()!;

  if (data.ownerUid !== userId) {
    throw new HttpsError(
      "permission-denied",
      "Only the intergroup owner can upgrade the subscription.",
    );
  }
  if (data.tier === "tier_b") {
    throw new HttpsError(
      "failed-precondition",
      "This intergroup is already on the unlimited tier.",
    );
  }

  const priceId = await getDefaultPriceForProduct(productIdIntergroupB);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: data.stripeCustomerId ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `https://homegroups-app.com/intergroup-success?intergroupId=${intergroupId}`,
    cancel_url: `https://homegroups-app.com/intergroup-cancel`,
    metadata: {
      intergroupId,
      upgradeFrom: "tier_a",
      upgradeTo: "tier_b",
    },
  });

  functions.logger.info(
    `upgradeIntergroupTier: checkout session created for intergroup ${intergroupId}`,
  );

  return { checkoutUrl: session.url! };
}

export const upgradeIntergroupTier = functions.https.onCall(
  {
    cpu: 0.5,
    memory: "256MiB",
    timeoutSeconds: 60,
    region: "us-central1",
  },
  upgradeIntergroupTierHandler,
);
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd functions && npx jest src/tests/upgradeIntergroupTier.test.ts --no-coverage
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add functions/src/callable/upgradeIntergroupTier.ts functions/src/tests/upgradeIntergroupTier.test.ts
git commit -m "feat: add upgradeIntergroupTier callable for tier_a → tier_b Stripe checkout"
```

---

### Task 3: Handle the upgrade in the Stripe webhook

**Files:**

- Modify: `functions/src/utils/stripeUtils.ts`

- [ ] **Step 6: Read the existing `handleCheckoutSessionCompleted` function**

Open `functions/src/utils/stripeUtils.ts`. Find `handleCheckoutSessionCompleted`. Locate the section that reads `session.metadata` and dispatches different handling paths.

- [ ] **Step 7: Add the intergroup upgrade branch**

Inside `handleCheckoutSessionCompleted`, after any existing metadata-based dispatch, add:

```typescript
// Intergroup tier upgrade (tier_a → tier_b)
if (
  session.metadata?.upgradeFrom === "tier_a" &&
  session.metadata?.upgradeTo === "tier_b" &&
  session.metadata?.intergroupId
) {
  const intergroupId = session.metadata.intergroupId;
  await admin
    .firestore()
    .collection("intergroups")
    .doc(intergroupId)
    .update({
      tier: "tier_b",
      subscriptionStatus: "active",
      stripeSubscriptionId: (session.subscription as string) ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  functions.logger.info(
    `Intergroup ${intergroupId} upgraded to tier_b via checkout ${session.id}`,
  );
  return;
}
```

- [ ] **Step 8: Build to verify no type errors**

```bash
cd functions && npm run build
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add functions/src/utils/stripeUtils.ts
git commit -m "feat: handle intergroup tier upgrade in Stripe webhook"
```

---

### Task 4: Export the callable

**Files:**

- Modify: `functions/src/index.ts`

- [ ] **Step 10: Add export**

Find the V4.4 section near line 143:

```typescript
export { createIntergroup } from "./callable/createIntergroup";
```

Add below it:

```typescript
export { upgradeIntergroupTier } from "./callable/upgradeIntergroupTier";
```

- [ ] **Step 11: Build**

```bash
cd functions && npm run build
```

Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add functions/src/index.ts
git commit -m "feat: export upgradeIntergroupTier"
```

---

### Task 5: Wire upgrade buttons in mobile

**Files:**

- Modify: `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx`

- [ ] **Step 13: Read the current file imports**

Open `mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx`. Note the existing imports at the top of the file.

- [ ] **Step 14: Add Linking and functions imports**

Find the existing imports. Add `Linking` to the react-native import, and add the firebase functions import if not already present:

```typescript
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking, // add this
} from "react-native";
import functions from "@react-native-firebase/functions"; // add if not present
```

- [ ] **Step 15: Add the upgrade handler function**

After the component's existing state declarations (before the `return` statement), add:

```typescript
const handleUpgrade = async () => {
  try {
    const callable = functions().httpsCallable("upgradeIntergroupTier");
    const result = await callable({ intergroupId });
    const { checkoutUrl } = result.data as { checkoutUrl: string };
    await Linking.openURL(checkoutUrl);
  } catch (err: any) {
    Alert.alert(
      "Upgrade Failed",
      err?.message ?? "Could not start the upgrade. Please try again.",
    );
  }
};
```

- [ ] **Step 16: Replace the two Alert.alert stubs with handleUpgrade**

There are two `Alert.alert('Coming Soon', 'Intergroup upgrade is not yet available.')` calls. Replace both `onPress` handlers with `onPress={handleUpgrade}`.

First occurrence (line ~146, inside "Affiliated Groups" section):

```typescript
// BEFORE:
onPress={() =>
  Alert.alert(
    'Coming Soon',
    'Intergroup upgrade is not yet available.',
  )
}

// AFTER:
onPress={handleUpgrade}
```

Second occurrence (line ~206, inside "Subscription" section) — same replacement:

```typescript
onPress = { handleUpgrade };
```

- [ ] **Step 17: Run mobile tests**

```bash
cd mobile && npm test -- --no-coverage
```

Expected: all tests pass (the dashboard screen has no unit tests — this is acceptable).

- [ ] **Step 18: Commit**

```bash
git add mobile/src/screens/intergroup/IntergroupDashboardScreen.tsx
git commit -m "feat: wire intergroup upgrade buttons to Stripe checkout via upgradeIntergroupTier callable"
```

---

## Acceptance Criteria

- [ ] Tapping "Upgrade to Unlimited" on tier_a intergroup dashboard opens Stripe checkout in browser
- [ ] Stripe webhook updates `intergroups/{id}.tier` to `"tier_b"` on successful payment
- [ ] Already on tier_b: callable returns `failed-precondition` error
- [ ] Non-owner: callable returns `permission-denied` error
- [ ] 6 unit tests for callable pass
- [ ] `npm run build` clean
