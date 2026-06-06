# Regroup Tier-Based Billing Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate RATS operator billing from the legacy per-house + per-resident quantity model to the approved six-tier flat-fee model (Traditional Starter/Professional/Enterprise $69/$129/$249; Oxford Standard/Plus/Network $49/$89/$299), without breaking existing subscribers.

**Architecture:** A feature flag (`TIER_BILLING_ENABLED`) gates a new single-item, flat-fee subscription path that bills the Stripe price resolved from `SUBSCRIPTION_TIERS`. Existing subscribers keep their two-item house+guest subscriptions untouched (grandfathered); only _new_ subscriptions created while the flag is on use the tier model. Per-unit quantity adjustment is replaced by cap _enforcement_ (`maxResidents`/`maxProperties`) for tier subscriptions. Cutover is staged and reversible by flipping the flag.

**Tech Stack:** Firebase Cloud Functions v2 (TypeScript), Stripe Node SDK, **Stripe CLI** (price creation, per-subscription migration, webhook forwarding/triggering — run per-app via `--project-name`, per-mode via `--live`), Zod validation, Jest, Firebase Secret Manager.

**Scope note:** This plan covers ONLY `regroup/functions` (the mobile-side Cloud Functions). The Angular web app's billing callables live in the **separate `regroup-functions` repo** and are out of scope here (tracked in Phase 6 as a cross-repo follow-up). The web _marketing_ pricing page was already updated separately.

---

## Pre-flight: Stripe CLI Prerequisites (do FIRST)

These MUST be done before Phase 2 code can run end-to-end. They create the Stripe Products/Prices and load their IDs into Firebase Secret Manager. **Use the Stripe CLI** — it is scriptable, reviewable, and avoids click-ops drift.

> **Per-app / per-account.** Each recovery-platform app has its OWN Stripe account and keys, so prices must be created **once per app, per mode**:
>
> | App                          | Firebase project         | Stripe profile              | Notes                                                         |
> | ---------------------------- | ------------------------ | --------------------------- | ------------------------------------------------------------- |
> | regroup (RATS)               | `phoenix-cleanhouse`     | `--project-name regroup`    | This plan's primary target.                                   |
> | homegroups (RecoveryConnect) | `recovery-connect-cad4b` | `--project-name homegroups` | Only if you are mirroring tier pricing there — separate plan. |
>
> Authenticate each app's account as a named profile (one-time):
> `stripe login --project-name regroup` (repeat with `--project-name homegroups` for that app).
> Run every command below for **test mode first** (default), verify, then re-run with `--live` for production. Never create live prices before the test-mode dry run passes.

- [ ] **P0.1 — Create the Product + six recurring monthly Prices via the Stripe CLI.** Run from anywhere; substitute `--project-name regroup` (and add `--live` for the production pass). The CLI prints the new `id` for each object — capture it.

```bash
# One product per house-type keeps the dashboard tidy (optional: one shared product).
TRAD_PRODUCT=$(stripe products create --project-name regroup \
  --name "RATS — Traditional Sober Living" --output json | jq -r '.id')
OXFORD_PRODUCT=$(stripe products create --project-name regroup \
  --name "RATS — Oxford Houses" --output json | jq -r '.id')

# Traditional tier prices (USD, cents). `-d "recurring[interval]=month"` makes them subscriptions.
stripe prices create --project-name regroup --product "$TRAD_PRODUCT" \
  --currency usd --unit-amount 6900  -d "recurring[interval]=month" -d "nickname=Traditional Starter"
stripe prices create --project-name regroup --product "$TRAD_PRODUCT" \
  --currency usd --unit-amount 12900 -d "recurring[interval]=month" -d "nickname=Traditional Professional"
stripe prices create --project-name regroup --product "$TRAD_PRODUCT" \
  --currency usd --unit-amount 24900 -d "recurring[interval]=month" -d "nickname=Traditional Enterprise"

# Oxford tier prices
stripe prices create --project-name regroup --product "$OXFORD_PRODUCT" \
  --currency usd --unit-amount 4900  -d "recurring[interval]=month" -d "nickname=Oxford Standard"
stripe prices create --project-name regroup --product "$OXFORD_PRODUCT" \
  --currency usd --unit-amount 8900  -d "recurring[interval]=month" -d "nickname=Oxford Plus"
stripe prices create --project-name regroup --product "$OXFORD_PRODUCT" \
  --currency usd --unit-amount 29900 -d "recurring[interval]=month" -d "nickname=Oxford Network"
```

Expected: six `price_…` IDs, each with `recurring.interval=month` and the amount above. Verify with
`stripe prices list --project-name regroup --limit 10` (add `--live` for the production pass).

- [ ] **P0.2 — Load the price IDs into Firebase Secret Manager** (run from `regroup/functions`). Paste each `price_…` from P0.1 when prompted:

```bash
firebase functions:secrets:set STRIPE_PRICE_TRAD_STARTER
firebase functions:secrets:set STRIPE_PRICE_TRAD_PROFESSIONAL
firebase functions:secrets:set STRIPE_PRICE_TRAD_ENTERPRISE
firebase functions:secrets:set STRIPE_PRICE_OXFORD_STANDARD
firebase functions:secrets:set STRIPE_PRICE_OXFORD_PLUS
firebase functions:secrets:set STRIPE_PRICE_OXFORD_NETWORK
```

> Use the **test-mode** price IDs for the test/staging deploy and the **live-mode** IDs for production. If you keep separate secret values per environment, set them in the matching Firebase project / config.

- [ ] **P0.3 — Leave legacy secrets in place** (`STRIPE_HOUSE_PRICE_ID`, `STRIPE_GUEST_PRICE_ID`, `STRIPE_OXFORD_PRICE_ID`). They remain the billing source for grandfathered subscribers. Do NOT delete.

- [ ] **P0.4 — Confirm the Stripe CLI is authenticated and the test runner works.**
      Run: `stripe config --list --project-name regroup` → expected: shows the regroup profile.
      Run: `cd regroup/functions && npm test -- --listTests 2>&1 | head` → expected: Jest lists test files under `src/__tests__/`. If the command differs, adapt every `npm test` invocation in this plan accordingly.

---

## Phase 0: Discovery — Lock Down the Contracts

No edits. Read and record the exact current signatures the later phases depend on, so no task relies on an assumption.

### Task 0: Record current billing contracts

**Files (read only):**

- `regroup/functions/src/api/stripe.ts`
- `regroup/functions/src/callable/subscriptions.ts`
- `regroup/functions/src/entities/OperatorSubscription.ts`
- `regroup/functions/src/webhooks/stripeWebhook.ts`
- `regroup/functions/src/config.ts`

- [ ] **Step 1: Record these facts in a scratch note** (paste into the PR description):
  - `createSubscription(customerId, oxfordEnabled=false, userId?)` — currently builds a 2-item sub: `[{plan: oxfordEnabled ? OXFORD_PRICE_ID : planIds.house, quantity: 0}, {plan: planIds.guest, quantity: 0}]`, `trial_period_days: 30`.
  - `initializeCustomer(email, paymentMethod, oxfordEnabled, userId)` — confirm its exact body and that it calls `createSubscription`. Record what it returns (the `OperatorSubscription` metadata shape with `items.houseItemId` / `items.guestItemId`).
  - `OperatorSubscription` entity fields — confirm presence of: `houses` (map), `items.houseItemId`, `items.guestItemId`, `oxfordEnabled`, `customerId`, `subscriptionId`, `status`. Record any field that will hold the new `tier`, `houseType`, `priceId`, and the single `subscriptionItemId`.
  - `stripeWebhook.ts` — record every place it reads `items.houseItemId` / `items.guestItemId` or `planIds`/`OXFORD_PRICE_ID` so Phase 4 can branch on model.
  - `createOperatorSubscription` callable — confirm it already resolves `priceId` (currently `subscriptions.ts:189`) and passes only `oxfordEnabled` into `initializeCustomer`.

- [ ] **Step 2: Commit the note** (docs only):

```bash
git add regroup/docs/superpowers/plans/2026-06-06-regroup-tier-billing-migration.md
git commit -m "docs: record current billing contracts for tier migration"
```

---

## Phase 1: Tier Pricing Metadata + Resolver (pure, no Stripe calls)

Make `SUBSCRIPTION_TIERS` the single source of truth for amounts and add a typed resolver. Pure functions, fully unit-testable, zero billing risk.

### Task 1: Add `amountCents` to every tier + a price-ID resolver

**Files:**

- Modify: `regroup/functions/src/config.ts:37-78` (extend `SUBSCRIPTION_TIERS`)
- Create: `regroup/functions/src/util/tierPricing.ts`
- Test: `regroup/functions/src/__tests__/util/tierPricing.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// regroup/functions/src/__tests__/util/tierPricing.test.ts
import {
  getTier,
  getTierAmountCents,
  resolveTierPriceId,
} from "../../util/tierPricing";

describe("tierPricing", () => {
  it("returns the tier config for a valid houseType + tier", () => {
    const tier = getTier("traditional", "professional");
    expect(tier.label).toBe("Traditional Professional");
    expect(tier.maxResidents).toBe(20);
  });

  it("exposes the strategy amount in cents", () => {
    expect(getTierAmountCents("traditional", "starter")).toBe(6900);
    expect(getTierAmountCents("oxford", "network")).toBe(29900);
  });

  it("throws on an unknown tier", () => {
    expect(() => getTier("traditional", "platinum" as never)).toThrow(
      /Unknown tier/,
    );
  });

  it("resolves the price ID from the environment variable", () => {
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_test_123";
    expect(resolveTierPriceId("traditional", "starter")).toBe("price_test_123");
  });

  it("throws when the price env var is unset", () => {
    delete process.env.STRIPE_PRICE_OXFORD_PLUS;
    expect(() => resolveTierPriceId("oxford", "plus")).toThrow(
      /not configured/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- tierPricing`
Expected: FAIL — `Cannot find module '../../util/tierPricing'`.

- [ ] **Step 3: Add `amountCents` to each tier in `config.ts`**

In `SUBSCRIPTION_TIERS`, add `amountCents` to every tier object (keep existing fields):

```typescript
    starter: {
      priceEnvVar: "STRIPE_PRICE_TRAD_STARTER",
      amountCents: 6900,
      maxResidents: 10,
      maxProperties: 1,
      label: "Traditional Starter",
    },
    professional: {
      priceEnvVar: "STRIPE_PRICE_TRAD_PROFESSIONAL",
      amountCents: 12900,
      maxResidents: 20,
      maxProperties: 3,
      label: "Traditional Professional",
    },
    enterprise: {
      priceEnvVar: "STRIPE_PRICE_TRAD_ENTERPRISE",
      amountCents: 24900,
      maxResidents: null,
      maxProperties: null,
      label: "Traditional Enterprise",
    },
```

```typescript
    standard: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_STANDARD",
      amountCents: 4900,
      maxResidents: 15,
      maxProperties: 1,
      label: "Oxford Standard",
    },
    plus: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_PLUS",
      amountCents: 8900,
      maxResidents: 25,
      maxProperties: 1,
      label: "Oxford Plus",
    },
    network: {
      priceEnvVar: "STRIPE_PRICE_OXFORD_NETWORK",
      amountCents: 29900,
      maxResidents: null,
      maxProperties: null,
      label: "Oxford Network",
    },
```

- [ ] **Step 4: Create the resolver**

```typescript
// regroup/functions/src/util/tierPricing.ts
import { SUBSCRIPTION_TIERS, HouseType, TierKey } from "../config";

interface TierConfig {
  priceEnvVar: string;
  amountCents: number;
  maxResidents: number | null;
  maxProperties: number | null;
  label: string;
}

export const getTier = (houseType: HouseType, tier: TierKey): TierConfig => {
  const map = SUBSCRIPTION_TIERS[houseType] as unknown as Record<
    string,
    TierConfig
  >;
  const config = map?.[tier];
  if (!config) {
    throw new Error(`Unknown tier "${tier}" for houseType "${houseType}"`);
  }
  return config;
};

export const getTierAmountCents = (
  houseType: HouseType,
  tier: TierKey,
): number => getTier(houseType, tier).amountCents;

export const resolveTierPriceId = (
  houseType: HouseType,
  tier: TierKey,
): string => {
  const { priceEnvVar } = getTier(houseType, tier);
  const priceId = process.env[priceEnvVar];
  if (!priceId) {
    throw new Error(`Price ID not configured for env var: ${priceEnvVar}`);
  }
  return priceId;
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- tierPricing`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add regroup/functions/src/config.ts regroup/functions/src/util/tierPricing.ts regroup/functions/src/__tests__/util/tierPricing.test.ts
git commit -m "feat(billing): add tier amounts and price-id resolver"
```

---

## Phase 2: Feature Flag + Single-Item Subscription Creation

Add the flag, then a NEW creation path that builds a one-item flat-fee subscription. The legacy `createSubscription` stays intact for grandfathered flows and as the flag-off default.

### Task 2: Add the `TIER_BILLING_ENABLED` flag

**Files:**

- Modify: `regroup/functions/src/config.ts` (append flag accessor)
- Test: `regroup/functions/src/__tests__/util/tierPricing.test.ts` (extend) or new `config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// regroup/functions/src/__tests__/config.test.ts
import { isTierBillingEnabled } from "../config";

describe("isTierBillingEnabled", () => {
  it("is false when unset", () => {
    delete process.env.TIER_BILLING_ENABLED;
    expect(isTierBillingEnabled()).toBe(false);
  });
  it("is true only for the exact string 'true'", () => {
    process.env.TIER_BILLING_ENABLED = "true";
    expect(isTierBillingEnabled()).toBe(true);
    process.env.TIER_BILLING_ENABLED = "1";
    expect(isTierBillingEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- config`
Expected: FAIL — `isTierBillingEnabled is not a function`.

- [ ] **Step 3: Add the accessor to `config.ts`** (after the `SUBSCRIPTION_TIERS` block):

```typescript
// Gate for the tier-based flat-fee billing model. New subscriptions use the
// tier model only when this is exactly "true". Legacy subscribers are unaffected.
export const isTierBillingEnabled = (): boolean =>
  process.env.TIER_BILLING_ENABLED === "true";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/config.ts regroup/functions/src/__tests__/config.test.ts
git commit -m "feat(billing): add TIER_BILLING_ENABLED feature flag"
```

### Task 3: Add `createTierSubscription` to the Stripe API layer

**Files:**

- Modify: `regroup/functions/src/api/stripe.ts:82-105` (add new fn beside `createSubscription`; do NOT alter `createSubscription`)
- Test: `regroup/functions/src/__tests__/api/createTierSubscription.test.ts`

- [ ] **Step 1: Write the failing test** (mock the Stripe client)

```typescript
// regroup/functions/src/__tests__/api/createTierSubscription.test.ts
jest.mock("../../util/stripe");
import { createTierSubscription } from "../../api/stripe";
import { stripe } from "../../api/stripe";

describe("createTierSubscription", () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    (stripe.subscriptions as any).create = jest
      .fn()
      .mockResolvedValue({ id: "sub_1", items: { data: [{ id: "si_1" }] } });
  });

  it("creates a single-item subscription using the resolved tier price", async () => {
    await createTierSubscription("cus_1", "traditional", "starter", "uid_1");
    expect((stripe.subscriptions as any).create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        items: [{ price: "price_starter", quantity: 1 }],
        trial_period_days: 30,
        metadata: {
          userId: "uid_1",
          houseType: "traditional",
          tier: "starter",
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- createTierSubscription`
Expected: FAIL — `createTierSubscription is not exported`.

- [ ] **Step 3: Implement `createTierSubscription`** (add after `createSubscription`, importing the resolver):

```typescript
// add to imports at top of api/stripe.ts
import { resolveTierPriceId } from "../util/tierPricing";
import { HouseType, TierKey } from "../config";

export const createTierSubscription = async (
  customerId: string,
  houseType: HouseType,
  tier: TierKey,
  userId?: string,
) => {
  const price = resolveTierPriceId(houseType, tier);
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price, quantity: 1 }],
    trial_period_days: 30,
    metadata: {
      ...(userId ? { userId } : {}),
      houseType,
      tier,
    },
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- createTierSubscription`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/api/stripe.ts regroup/functions/src/__tests__/api/createTierSubscription.test.ts
git commit -m "feat(billing): add single-item createTierSubscription path"
```

### Task 4: Branch `createOperatorSubscription` on the flag

**Files:**

- Modify: `regroup/functions/src/callable/subscriptions.ts:151-243`
- Test: `regroup/functions/src/__tests__/callable/subscriptions.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test** (flag on → tier path; flag off → legacy path)

```typescript
// add to regroup/functions/src/__tests__/callable/subscriptions.test.ts
import * as stripeApi from "../../api/stripe";

describe("createOperatorSubscription tier branch", () => {
  it("uses createTierSubscription when the flag is on", async () => {
    process.env.TIER_BILLING_ENABLED = "true";
    process.env.STRIPE_PRICE_TRAD_STARTER = "price_starter";
    const spy = jest
      .spyOn(stripeApi, "initializeTierCustomer")
      .mockResolvedValue({
        status: "trialing",
        subscriptionId: "sub_1",
        customerId: "cus_1",
        subscriptionItemId: "si_1",
        houseType: "traditional",
        tier: "starter",
      } as any);
    // ...invoke the callable with houseType:"traditional", tier:"starter", a valid auth uid...
    expect(spy).toHaveBeenCalled();
  });

  it("uses the legacy initializeCustomer when the flag is off", async () => {
    process.env.TIER_BILLING_ENABLED = "false";
    const legacy = jest.spyOn(stripeApi, "initializeCustomer");
    // ...invoke the callable...
    expect(legacy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- subscriptions`
Expected: FAIL — `initializeTierCustomer` does not exist / branch not implemented.

- [ ] **Step 3: Add `initializeTierCustomer` to `api/stripe.ts`** (mirrors `initializeCustomer` but calls `createTierSubscription` and records a single `subscriptionItemId`):

```typescript
export const initializeTierCustomer = async (
  email: string,
  paymentMethod: string,
  houseType: HouseType,
  tier: TierKey,
  userId: string,
) => {
  const customer = await createCustomer(email, paymentMethod);
  const subscription = await createTierSubscription(
    customer.id,
    houseType,
    tier,
    userId,
  );
  return {
    customerId: customer.id,
    subscriptionId: subscription.id,
    subscriptionItemId: subscription.items.data[0].id,
    status: subscription.status,
    houseType,
    tier,
  };
};
```

- [ ] **Step 4: Branch the callable.** Replace the `initializeCustomer` call block (`subscriptions.ts:203-234`) with a flag branch. Flag ON uses the tier path; flag OFF keeps the exact existing legacy block:

```typescript
import { isTierBillingEnabled, HouseType, TierKey } from "../config";
import { initializeTierCustomer } from "../api/stripe";

// ...inside createOperatorSubscription, after tierConfig/priceId validation...
const firestoreUser = await getUser(data.user.id);

if (isTierBillingEnabled()) {
  const metadata = await initializeTierCustomer(
    data.user.email,
    data.paymentMethod,
    data.houseType as HouseType,
    data.tier as TierKey,
    data.user.id,
  );
  await updateUser(data.user.id!, {
    subscriptionMetadata: {
      ...metadata,
      status: metadata.status || "pending",
      lastUpdatedAt: new Date().toISOString(),
      maxResidents: tierConfig.maxResidents,
      maxProperties: tierConfig.maxProperties,
    },
  });
  await sendEmail({
    to: "admin@regroup-app.com",
    from: regroupEmail,
    text: `New tier subscription: ${data.houseType}/${data.tier} (user ${data.user.id})`,
    subject: "New user subscription",
  });
  return { ...data.user, subscriptionMetadata: metadata } as User;
}

// LEGACY PATH (unchanged) — grandfathered when flag is off
const oxfordEnabled =
  firestoreUser?.subscriptionMetadata?.oxfordEnabled ?? false;
const metadata = await initializeCustomer(
  data.user.email,
  data.paymentMethod,
  oxfordEnabled,
  data.user.id,
);
// ...rest of existing legacy block unchanged...
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- subscriptions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add regroup/functions/src/api/stripe.ts regroup/functions/src/callable/subscriptions.ts regroup/functions/src/__tests__/callable/subscriptions.test.ts
git commit -m "feat(billing): branch operator subscription creation on tier flag"
```

---

## Phase 3: Cap Enforcement (replaces per-unit quantity adjustment)

For tier subscriptions there is no per-resident/per-house quantity to bump. Instead, adding a house/resident must be _allowed or blocked_ against the tier caps. Legacy subscriptions keep the existing quantity behavior.

### Task 5: Add a cap-check helper

**Files:**

- Create: `regroup/functions/src/util/tierCaps.ts`
- Test: `regroup/functions/src/__tests__/util/tierCaps.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// regroup/functions/src/__tests__/util/tierCaps.test.ts
import { withinResidentCap, withinPropertyCap } from "../../util/tierCaps";

describe("tierCaps", () => {
  it("allows when under the cap", () => {
    expect(withinResidentCap(9, 10)).toBe(true);
  });
  it("blocks when at/over the cap", () => {
    expect(withinResidentCap(10, 10)).toBe(false);
  });
  it("treats null cap as unlimited", () => {
    expect(withinResidentCap(9999, null)).toBe(true);
    expect(withinPropertyCap(50, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- tierCaps`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// regroup/functions/src/util/tierCaps.ts
// `current` is the count BEFORE adding one more. Returns whether adding one stays within cap.
export const withinResidentCap = (
  current: number,
  cap: number | null,
): boolean => cap === null || current < cap;

export const withinPropertyCap = (
  current: number,
  cap: number | null,
): boolean => cap === null || current < cap;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- tierCaps`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/util/tierCaps.ts regroup/functions/src/__tests__/util/tierCaps.test.ts
git commit -m "feat(billing): add tier cap-check helpers"
```

### Task 6: Short-circuit quantity mutation for tier subscriptions

**Files:**

- Modify: `regroup/functions/src/callable/subscriptions.ts:326-410` (`updateSubscriptionGuests`)
- Modify: `regroup/functions/src/callable/subscriptions.ts:415-526` (`updateSubscriptionHouses`)
- Test: `regroup/functions/src/__tests__/callable/subscriptions.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
describe("tier subscriptions skip Stripe quantity updates", () => {
  it("does not call updateSubscriptionItem for a tier subscription, but enforces the resident cap", async () => {
    // user.subscriptionMetadata.tier = "starter", maxResidents = 10, current residents = 10
    const itemSpy = jest.spyOn(stripeApi, "updateSubscriptionItem");
    // invoke updateSubscriptionGuests action:"add"
    // Expect: throws "Resident limit reached for your plan", itemSpy NOT called
    expect(itemSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- subscriptions`
Expected: FAIL — current code calls `updateSubscriptionItem` regardless of model.

- [ ] **Step 3: Implement the guard.** At the top of both `updateSubscriptionGuests` and `updateSubscriptionHouses`, after loading `user`, branch when the subscription is a tier subscription (detected by `user.subscriptionMetadata?.tier` being set):

```typescript
import { withinResidentCap, withinPropertyCap } from "../util/tierCaps";

// after `const user = await getUser(...)` and the existing metadata guard:
const meta = user.subscriptionMetadata;
if (meta?.tier) {
  // Tier model: flat fee, no per-unit Stripe quantity. Enforce caps instead.
  if (action === "add") {
    if (/* guests */ false /* set true in updateSubscriptionGuests */) {
      const current = totalResidents(meta); // helper over meta.houses
      if (!withinResidentCap(current, meta.maxResidents ?? null)) {
        throw new HttpsError(
          "failed-precondition",
          "Resident limit reached for your plan",
        );
      }
    } else {
      const currentHouses = Object.keys(meta.houses ?? {}).length;
      if (!withinPropertyCap(currentHouses, meta.maxProperties ?? null)) {
        throw new HttpsError(
          "failed-precondition",
          "Property limit reached for your plan",
        );
      }
    }
  }
  // Persist occupancy metadata WITHOUT touching Stripe items.
  await updateUser(user.id!, {
    subscriptionMetadata: updateSubscriptionMetadata(
      user,
      houseIds[0],
      action,
      null as unknown as string[],
    ),
  });
  return;
}
// ...existing legacy quantity-adjustment code continues unchanged below...
```

Add the small `totalResidents` helper in `util/tierCaps.ts` and import it. (Define it concretely against the `houses` map shape recorded in Task 0.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- subscriptions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/callable/subscriptions.ts regroup/functions/src/util/tierCaps.ts regroup/functions/src/__tests__/callable/subscriptions.test.ts
git commit -m "feat(billing): enforce caps instead of quantity for tier subscriptions"
```

---

## Phase 4: Webhook + Reactivation Reconciliation

The webhook and `reactivateSubscription` read `items.houseItemId`/`items.guestItemId`. Tier subscriptions have a single `subscriptionItemId`. Make both model-aware.

### Task 7: Make reactivation model-aware

**Files:**

- Modify: `regroup/functions/src/api/stripe.ts:131-156` (`reactivateSubscription`) and `:107-129` (`createItemsFromMetadata`)
- Test: `regroup/functions/src/__tests__/api/reactivate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// regroup/functions/src/__tests__/api/reactivate.test.ts
jest.mock("../../util/stripe");
import { reactivateSubscription } from "../../api/stripe";
import { stripe } from "../../api/stripe";

it("recreates a single-item subscription for a tier subscription", async () => {
  process.env.STRIPE_PRICE_OXFORD_STANDARD = "price_oxford_std";
  (stripe.subscriptions as any).create = jest.fn().mockResolvedValue({
    id: "sub_2",
    items: { data: [{ id: "si_2", plan: { id: "price_oxford_std" } }] },
  });
  const meta: any = {
    tier: "standard",
    houseType: "oxford",
    customerId: "cus_2",
    houses: {},
  };
  const fresh = await reactivateSubscription("cus_2", meta, "uid_2");
  expect((stripe.subscriptions as any).create).toHaveBeenCalledWith(
    expect.objectContaining({
      items: [{ price: "price_oxford_std", quantity: 1 }],
    }),
  );
  expect(fresh.subscriptionItemId).toBe("si_2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- reactivate`
Expected: FAIL — reactivation always builds the 2-item array.

- [ ] **Step 3: Implement the branch** in `reactivateSubscription`: if `subscriptionMetadata.tier` is set, build `items: [{ price: resolveTierPriceId(houseType, tier), quantity: 1 }]` and record `freshMetadata.subscriptionItemId = subscription.items.data[0].id`; otherwise use the existing `createItemsFromMetadata` path unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- reactivate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/api/stripe.ts regroup/functions/src/__tests__/api/reactivate.test.ts
git commit -m "feat(billing): model-aware subscription reactivation"
```

### Task 8: Make the webhook tolerate single-item tier subscriptions

**Files:**

- Modify: `regroup/functions/src/webhooks/stripeWebhook.ts` (branches recorded in Task 0)
- Test: `regroup/functions/src/__tests__/webhooks/stripeWebhook.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — feed a `customer.subscription.updated` event whose subscription has ONE item with a tier `price`. Assert the handler persists `status`/`subscriptionItemId` and does NOT throw on missing `houseItemId`/`guestItemId`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- stripeWebhook`
Expected: FAIL — handler assumes two items / reads `guestItemId`.

- [ ] **Step 3: Implement** — where the handler maps subscription items to metadata, branch: if the stored metadata has `tier` (or the event subscription has a single item whose price matches a known tier env var), update `status` + `subscriptionItemId` only; otherwise run the existing two-item mapping.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- stripeWebhook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/webhooks/stripeWebhook.ts regroup/functions/src/__tests__/webhooks/stripeWebhook.test.ts
git commit -m "feat(billing): webhook handles single-item tier subscriptions"
```

---

## Phase 5: Bundle Coupon Decision

The 3/5-house bundle coupons (`regroup-bundle-3`, `regroup-bundle-5`, applied in `updateSubscriptionHouses` and `applyBundleDiscount`) are a per-house concept. In the flat-tier model, multi-property is expressed by tier (Professional/Enterprise/Network), so per-house bundle discounts do not apply.

### Task 9: Skip bundle discounts for tier subscriptions

**Files:**

- Modify: `regroup/functions/src/callable/subscriptions.ts:503-522` and `:531-561` (`applyBundleDiscount`)
- Test: `regroup/functions/src/__tests__/callable/subscriptions.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

```typescript
it("does not apply a bundle coupon to a tier subscription", async () => {
  const spy = jest.spyOn(stripeApi, "applyBundleDiscountToSubscription");
  // user.subscriptionMetadata.tier = "professional"
  // invoke applyBundleDiscount
  expect(spy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd regroup/functions && npm test -- subscriptions`
Expected: FAIL — coupon applied regardless of model.

- [ ] **Step 3: Implement** — guard both call sites: `if (user.subscriptionMetadata?.tier) { logger.info("Tier subscription — bundle discounts not applicable"); return; }` before any `applyBundleDiscountToSubscription` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd regroup/functions && npm test -- subscriptions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/callable/subscriptions.ts regroup/functions/src/__tests__/callable/subscriptions.test.ts
git commit -m "feat(billing): exclude tier subscriptions from per-house bundle discounts"
```

---

## Phase 6: Client Plumbing Verification (cross-surface)

The callable schema already requires `houseType` + `tier`. Confirm every client sends them and renders tier choices. This phase is verification + a cross-repo ticket; no live-billing risk.

### Task 10: Verify the mobile client sends `houseType` + `tier`

**Files (read; edit only if a gap is found):**

- `regroup/mobile/src/services/subscription.ts`
- `regroup/mobile/src/screens/Subscription*`, `regroup/mobile/src/screens/SubscriptionUpdateModal`

- [ ] **Step 1:** Grep the mobile client for the `createOperatorSubscription` call and confirm the payload includes `houseType` and `tier`. Run:
      `grep -rn "createOperatorSubscription" regroup/mobile/src`
      Expected: the call passes `{ user, paymentMethod, houseType, tier }`. If `tier` is hard-coded or missing, add a tier-selection step to the subscription screen (separate task; mirror the six tiers from `SUBSCRIPTION_TIERS`).

- [ ] **Step 2:** If a UI gap exists, write the screen change behind the same conceptual flag (only show tier picker when tier billing is the active model). Commit separately.

- [ ] **Step 3 (cross-repo ticket — no code here):** File an issue in the **`regroup-functions`** repo: "Mirror tier-based `createOperatorSubscription` for the Angular web app." The web app's billing callables live there, not in this tree (`regroup/web/CLAUDE.md`). Web pricing display is already updated; web _checkout_ must be migrated in that repo before web operators can subscribe on tiers.

---

## Phase 7: Existing-Subscriber Strategy

Default stance: **grandfather**. Existing two-item subscribers keep their current plan and pricing indefinitely; the flag only affects _new_ subscriptions. No data migration is required for grandfathering.

### Task 11: Document and (optionally) tag legacy subscribers

**Files:**

- Modify/Create: `regroup/functions/src/scripts/tagLegacySubscribers.ts` (one-off, opt-in)
- Reference: `regroup/functions/src/scripts/migrateHouseSubscriptionStatus.ts` (existing script pattern to copy)

- [ ] **Step 1:** Decide policy with the business owner: (a) grandfather forever, or (b) migrate legacy subscribers to the nearest tier at renewal. Record the decision in this plan. Default = (a).

- [ ] **Step 2 (only if (b) chosen):** Write a dry-run script (copy the structure of `migrateHouseSubscriptionStatus.ts`) that, for each active legacy subscriber, computes the nearest tier from current house/resident counts and **prints** the proposed change (`subscriptionId`, current items, target tier price ID). Do NOT mutate in the first run.

- [ ] **Step 3 — migrate via the Stripe CLI (per subscription, after approval).** For each approved subscription, swap the two legacy items for the single tier price using the CLI. This is reviewable and avoids a risky bulk-write script touching live revenue. For subscription `sub_X` whose legacy house item is `si_house` and guest item is `si_guest`, moving to e.g. `STRIPE_PRICE_TRAD_PROFESSIONAL`:

```bash
# Delete the per-guest item, repoint the house item to the flat tier price, qty 1.
# `proration_behavior=create_prorations` (default) credits/charges the difference.
stripe subscriptions update sub_X --project-name regroup \
  -d "items[0][id]=si_house" -d "items[0][price]=$STRIPE_PRICE_TRAD_PROFESSIONAL" -d "items[0][quantity]=1" \
  -d "items[1][id]=si_guest"  -d "items[1][deleted]=true"
```

After each CLI update, run the existing webhook (now single-item-aware from Task 8) which reconciles Firestore metadata; or set `tier`/`subscriptionItemId` directly via the dry-run script's `--commit` mode. Migrate in small batches, verify with `stripe subscriptions retrieve sub_X --project-name regroup`, and keep a rollback list of the original item/price IDs. Migration is a separate, explicitly-approved step — never bundled into deploy.

- [ ] **Step 4: Commit the script (dry-run default)**

```bash
git add regroup/functions/src/scripts/tagLegacySubscribers.ts
git commit -m "chore(billing): add dry-run legacy-subscriber tagging script"
```

---

## Phase 8: Staged Rollout + Rollback

### Task 12: Deploy dark, then enable

- [ ] **Step 1:** Ensure all new functions declare the new price secrets. Add the six `STRIPE_PRICE_*` secrets (and read of `TIER_BILLING_ENABLED`) to the `secrets`/options of `createOperatorSubscription`, `updateSubscriptionGuests`, `updateSubscriptionHouses`, `applyBundleDiscount`, `reactivateOperatorSubscription`, and the webhook, per the v2 pattern in `config.ts:12-13`.

- [ ] **Step 2:** Run the full suite. Run: `cd regroup/functions && npm test`. Expected: all green.

- [ ] **Step 3:** Deploy with the flag OFF (dark). Run: `cd regroup/functions && npm run deploy`. The tier code is live but inert (`TIER_BILLING_ENABLED` unset → legacy path).

- [ ] **Step 4: Smoke test in Stripe test mode using the Stripe CLI.** With the functions emulator running (`firebase emulators:start`), forward Stripe events to the local webhook and exercise the flow:

```bash
# Terminal 1 — forward test-mode events to the local webhook function.
stripe listen --project-name regroup \
  --forward-to "http://localhost:5001/phoenix-cleanhouse/us-central1/stripeWebhook"

# Terminal 2 — set the flag for the emulator/test deploy, then create one sub per tier via the app
# (or drive the callable). Verify each is a SINGLE line item at the right amount + 30-day trial:
stripe subscriptions list --project-name regroup --limit 6
stripe trigger customer.subscription.updated --project-name regroup   # confirm single-item webhook path
```

Expected: each subscription has exactly one item at the tier amount (`6900`/`12900`/`24900`/`4900`/`8900`/`29900`), `status=trialing`, and the webhook reconciles `status`/`subscriptionItemId` without throwing on missing `houseItemId`/`guestItemId`.

- [ ] **Step 5:** Enable in production: `firebase functions:secrets:set TIER_BILLING_ENABLED` → `true`, redeploy. Confirm the **live-mode** price secrets from P0.2 are set. Monitor `functions_get_logs` and `stripe subscriptions list --live --project-name regroup` for the first real tier subscriptions.

- [ ] **Step 6 (rollback):** If anything misbehaves, set `TIER_BILLING_ENABLED` → `false` and redeploy. New subscriptions revert to the legacy path instantly; tier subscriptions already created continue billing normally (single flat item).

---

## Self-Review Checklist (completed by plan author)

- **Spec coverage:** Stripe prices (P0), secrets (P0), amounts+resolver (P1), flag (P2), single-item creation (P2), cap enforcement (P3), reactivation (P4), webhook (P4), bundle coupons (P5), client plumbing + cross-repo (P6), grandfathering/migration (P7), rollout+rollback (P8). All items from the prior analysis are mapped.
- **Open items requiring confirmation during execution (Task 0):** exact bodies of `initializeCustomer`, the `OperatorSubscription` entity field set, and the webhook's item-reading branches. Tasks 3, 4, 6, 8 depend on the shapes recorded in Task 0 — verify before implementing those steps.
- **Type consistency:** `houseType: HouseType`, `tier: TierKey`, `amountCents`, `resolveTierPriceId`, `initializeTierCustomer`, `createTierSubscription`, `subscriptionItemId`, `isTierBillingEnabled` used consistently across tasks.
- **Risk posture:** every billing-mutating change is flag-gated and reversible; legacy path is never modified, only branched around.
- **Stripe CLI usage:** prices created via `stripe prices create` (P0), per-subscriber migration via `stripe subscriptions update` (P7), and test-mode verification via `stripe listen`/`stripe trigger` (P8). All CLI commands run per-app with `--project-name` and per-mode with `--live` (test first, then live). Bulk mutation of live subscriptions still goes through approved, batched CLI calls with a recorded rollback list — never an unattended script.

```

```
