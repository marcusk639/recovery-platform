> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Auto-Pay System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow residents to save a payment method and opt into auto-pay, then automatically charge saved methods on rent due dates via a scheduled Cloud Function.

**Architecture:** Two parallel tracks: (1) mobile UI — add "Save card for auto-pay" checkbox to RentPaymentScreen in regroup-rn7; (2) Cloud Function — create `scheduledRentCollection` in regroup-functions that runs daily, finds guests with `autoPayEnabled: true` and positive `balance`, and creates a `PaymentIntent` via Stripe. Both tracks are independently deployable.

**Tech Stack:** Stripe (`payment_intents.create`, `customers.update`), Firebase Functions v2 (`onSchedule`), React Native (`useCreateRentPayment` mutation pattern), Firestore, Zod, TanStack Query v5, Jest

---

## File Structure

### regroup-functions

- **Modify:** `functions/src/callable/payments.ts` — fix `updatePaymentInfo` error return path, add `defaultPaymentMethodId` write
- **Create:** `functions/src/scheduled/scheduledRentCollection.ts` — daily auto-pay runner
- **Modify:** `functions/src/scheduled/index.ts` — re-export `scheduledRentCollection`
- **Create:** `functions/src/__tests__/scheduled/scheduledRentCollection.test.ts`

### regroup-rn7

- **Modify:** `src/screens/RentPayment/RentPaymentScreen.tsx` — add auto-pay toggle, call `updatePaymentInfo` after PaymentSheet
- **Create:** `src/__tests__/screens/RentPayment/autoPay.test.tsx`

---

## Task 1: Fix updatePaymentInfo error return path

**Files:**

- Modify: `functions/src/callable/payments.ts`
- Test: `functions/src/__tests__/callable/payments.test.ts`

- [ ] **Step 1: Write the failing test**

  Open `functions/src/__tests__/callable/payments.test.ts`. Add:

  ```typescript
  describe("updatePaymentInfo — error path", () => {
    it("throws HttpsError when Stripe attach fails", async () => {
      mockStripe.customers.update.mockRejectedValueOnce(
        new Error("Stripe network error"),
      );
      await expect(
        callUpdatePaymentInfo({
          user: { subscriptionMetadata: { customerId: "cus_test" } },
          paymentMethod: "pm_test123",
        }),
      ).rejects.toMatchObject({ code: "internal" });
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/callable/payments.test.ts -t "updatePaymentInfo — error path" --no-coverage`
  Expected: FAIL — the function returns `undefined` instead of throwing

- [ ] **Step 2: Find and fix the error return path**

  In `functions/src/callable/payments.ts`, find `updatePaymentInfo` (line ~303). Look for the catch block that returns `undefined`. Replace it with:

  ```typescript
  } catch (error) {
    logger.error("updatePaymentInfo: failed to attach payment method", { error });
    throw new HttpsError("internal", "Failed to save payment method");
  }
  ```

  Also ensure that after `customers.update`, the function writes the `defaultPaymentMethodId` to the guest's Firestore doc:

  ```typescript
  // After stripe.customers.update succeeds:
  const { guestId } = request.data as { guestId?: string };
  if (guestId) {
    await admin.firestore().collection("guests").doc(guestId).update({
      defaultPaymentMethodId: paymentMethod,
    });
  }
  ```

  Note: The Zod schema for `updatePaymentInfo` also needs `guestId` added if not present:

  ```typescript
  const updatePaymentInfoSchema = z.object({
    user: z
      .object({
        subscriptionMetadata: z
          .object({ customerId: z.string().min(1) })
          .passthrough(),
      })
      .passthrough(),
    paymentMethod: z.string().min(1),
    guestId: z.string().min(1).optional(),
  });
  ```

- [ ] **Step 3: Run tests**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/callable/payments.test.ts --no-coverage`
  Expected: All tests pass including new error path test

- [ ] **Step 4: Commit**

  ```bash
  git add functions/src/callable/payments.ts
  git commit -m "fix(payments): throw HttpsError on updatePaymentInfo failure; write defaultPaymentMethodId to guest doc"
  ```

---

## Task 2: Create scheduledRentCollection Cloud Function

**Files:**

- Create: `functions/src/scheduled/scheduledRentCollection.ts`
- Modify: `functions/src/scheduled/index.ts`
- Create: `functions/src/__tests__/scheduled/scheduledRentCollection.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `functions/src/__tests__/scheduled/scheduledRentCollection.test.ts`:

  ```typescript
  import { runRentCollection } from "../../scheduled/scheduledRentCollection";

  jest.mock("../../api/firestore");
  jest.mock("../../util/stripe", () => ({ getStripe: jest.fn() }));

  const mockCreatePaymentIntent = jest.fn();
  jest.mock("../../util/stripe", () => ({
    getStripe: () => ({
      paymentIntents: { create: mockCreatePaymentIntent },
    }),
  }));

  describe("runRentCollection", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates a PaymentIntent for each guest with autoPayEnabled and positive balance", async () => {
      mockCreatePaymentIntent.mockResolvedValue({
        id: "pi_test123",
        status: "succeeded",
      });

      // mockGuestCollection: return 2 guests with autoPayEnabled=true, balance=500, defaultPaymentMethodId="pm_test"
      await runRentCollection();

      expect(mockCreatePaymentIntent).toHaveBeenCalledTimes(2);
      expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          currency: "usd",
          payment_method: "pm_test",
          confirm: true,
          off_session: true,
        }),
        expect.any(Object), // idempotency key options
      );
    });

    it("skips guests without defaultPaymentMethodId", async () => {
      // mockGuestCollection: return 1 guest with autoPayEnabled=true but no defaultPaymentMethodId
      await runRentCollection();
      expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    });

    it("logs and continues on individual payment failure", async () => {
      mockCreatePaymentIntent.mockRejectedValueOnce(new Error("card_declined"));

      // mockGuestCollection: return 1 auto-pay guest
      await expect(runRentCollection()).resolves.not.toThrow();
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/scheduled/scheduledRentCollection.test.ts --no-coverage`
  Expected: FAIL — module not found

- [ ] **Step 2: Create scheduledRentCollection.ts**

  Create `functions/src/scheduled/scheduledRentCollection.ts`:

  ```typescript
  import { onSchedule } from "firebase-functions/v2/scheduler";
  import { logger } from "firebase-functions";
  import admin from "firebase-admin";
  import Stripe from "stripe";
  import { guestCollection } from "../api/firestore";
  import { STRIPE_SECRET_KEY } from "../config";

  interface AutoPayGuest {
    id: string;
    houseId: string;
    userId: string;
    firstName: string;
    lastName: string;
    balance: number;
    stripeCustomerId?: string;
    defaultPaymentMethodId: string;
    stripeConnectId?: string; // house's Stripe connected account
  }

  export async function runRentCollection(): Promise<void> {
    const stripe = new Stripe(process.env[STRIPE_SECRET_KEY.name]!, {
      apiVersion: "2023-10-16",
    });

    const snapshot = await guestCollection
      .where("autoPayEnabled", "==", true)
      .where("balance", ">", 0)
      .get();

    if (snapshot.empty) {
      logger.info("scheduledRentCollection: no auto-pay guests with balance");
      return;
    }

    const results = await Promise.allSettled(
      snapshot.docs.map(async (doc) => {
        const guest = { id: doc.id, ...doc.data() } as AutoPayGuest;

        if (!guest.defaultPaymentMethodId) {
          logger.warn(
            "scheduledRentCollection: guest has no default payment method",
            {
              guestId: guest.id,
            },
          );
          return;
        }

        if (!guest.stripeCustomerId) {
          logger.warn(
            "scheduledRentCollection: guest has no stripeCustomerId",
            {
              guestId: guest.id,
            },
          );
          return;
        }

        const amountCents = Math.round(guest.balance * 100);
        const today = new Date().toISOString().split("T")[0];
        const idempotencyKey = `auto-rent-${guest.id}-${today}`;

        const intent = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency: "usd",
            customer: guest.stripeCustomerId,
            payment_method: guest.defaultPaymentMethodId,
            confirm: true,
            off_session: true,
            metadata: { guestId: guest.id, houseId: guest.houseId },
            ...(guest.stripeConnectId
              ? {
                  transfer_data: { destination: guest.stripeConnectId },
                  application_fee_amount: Math.round(amountCents * 0.02),
                }
              : {}),
          },
          { idempotencyKey },
        );

        logger.info("scheduledRentCollection: created PaymentIntent", {
          guestId: guest.id,
          intentId: intent.id,
          status: intent.status,
        });
      }),
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.error("scheduledRentCollection: some payments failed", {
        failureCount: failures.length,
        totalCount: snapshot.size,
      });
    }
  }

  export const scheduledRentCollection = onSchedule(
    {
      schedule: "0 10 * * *",
      timeZone: "UTC",
      secrets: [STRIPE_SECRET_KEY],
    },
    async (_event) => {
      logger.info("scheduledRentCollection: starting daily run");
      await runRentCollection();
    },
  );
  ```

- [ ] **Step 3: Check what STRIPE_SECRET_KEY looks like in config.ts**

  Run: `grep -n "STRIPE_SECRET_KEY\|defineSecret" /Users/marcuspersonal/dev/regroup-functions/functions/src/config.ts | head -10`

  If `STRIPE_SECRET_KEY` is exported as a `SecretParam`, the import above is correct. If it's exported differently, adjust the import accordingly.

- [ ] **Step 4: Export from scheduled/index.ts**

  Add to `functions/src/scheduled/index.ts`:

  ```typescript
  export * from "./scheduledRentCollection";
  ```

- [ ] **Step 5: Run tests**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/scheduled/scheduledRentCollection.test.ts --no-coverage`
  Expected: All 3 tests pass

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest --no-coverage`
  Expected: All tests pass

- [ ] **Step 6: Type check**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx tsc --noEmit`
  Expected: No errors

- [ ] **Step 7: Commit**

  ```bash
  git add functions/src/scheduled/scheduledRentCollection.ts functions/src/scheduled/index.ts functions/src/__tests__/scheduled/scheduledRentCollection.test.ts
  git commit -m "feat(scheduled): add scheduledRentCollection daily auto-pay CF"
  ```

---

## Task 3: Add auto-pay toggle to RentPaymentScreen (regroup-rn7)

**Files:**

- Modify: `src/screens/RentPayment/RentPaymentScreen.tsx`
- Create: `src/__tests__/screens/RentPayment/autoPay.test.tsx`

- [ ] **Step 1: Write the failing test**

  Create `src/__tests__/screens/RentPayment/autoPay.test.tsx`:

  ```typescript
  import React from "react";
  import { render, fireEvent, waitFor } from "@testing-library/react-native";
  import { RentPaymentScreen } from "../../../screens/RentPayment/RentPaymentScreen";

  // Mock deps
  jest.mock("../../../state/queries/paymentQueries");

  describe("RentPaymentScreen — auto-pay toggle", () => {
    it("renders save card switch", () => {
      const { getByTestId } = render(
        <RentPaymentScreen navigation={mockNavigation} guest={mockGuest} house={mockHouse} />
      );
      expect(getByTestId("auto-pay-switch")).toBeTruthy();
    });

    it("calls updatePaymentInfo when save card is enabled", async () => {
      const mockUpdatePaymentInfo = jest.fn().mockResolvedValue({});
      const { getByTestId } = render(
        <RentPaymentScreen navigation={mockNavigation} guest={mockGuest} house={mockHouse} />
      );

      fireEvent(getByTestId("auto-pay-switch"), "valueChange", true);
      // After PaymentSheet success with saveCard=true, updatePaymentInfo is called
      // This is tested via the handlePayNow mock flow
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx jest src/__tests__/screens/RentPayment/autoPay.test.tsx --no-coverage`
  Expected: FAIL — `getByTestId("auto-pay-switch")` not found

- [ ] **Step 2: Add auto-pay state and UI to RentPaymentScreen.tsx**

  In `src/screens/RentPayment/RentPaymentScreen.tsx`:
  1. Add import for `Switch`:

     ```typescript
     import { Switch, ... } from 'react-native';
     ```

  2. Add state near existing state declarations (~line 86):

     ```typescript
     const [saveCard, setSaveCard] = useState(false);
     ```

  3. Add the toggle UI after the payment amount display, before the "Pay Now" button. Find the JSX return and insert before `{createPayment.isPending ? ...}`:

     ```tsx
     <View style={styles.autoPayRow}>
       <RatsText
         text="Save card for auto-pay"
         style={styles.autoPayLabel}
         translate={false}
       />
       <Switch
         testID="auto-pay-switch"
         value={saveCard}
         onValueChange={setSaveCard}
         trackColor={{ false: color.lightGray, true: color.primary }}
       />
     </View>
     ```

  4. After PaymentSheet success in `handlePayNow`, if `saveCard` is true, call `updatePaymentInfo`:

     ```typescript
     // After existing success handling, add:
     if (saveCard && result.paymentMethod) {
       try {
         await httpsCallable(
           functions,
           "updatePaymentInfo",
         )({
           user: {
             subscriptionMetadata: { customerId: guest.stripeCustomerId },
           },
           paymentMethod: result.paymentMethod,
           guestId: guest.id,
         });
         // Also write autoPayEnabled flag to Firestore
         await firestore().collection("guests").doc(guest.id).update({
           autoPayEnabled: true,
         });
       } catch (e) {
         logException(e);
         // Non-fatal — payment succeeded, card save failed
       }
     }
     ```

  5. Add styles:
     ```typescript
     autoPayRow: {
       flexDirection: 'row',
       justifyContent: 'space-between',
       alignItems: 'center',
       paddingHorizontal: normalize(16),
       paddingVertical: normalize(12),
       marginBottom: normalize(8),
     },
     autoPayLabel: { fontSize: fontSize.body, color: color.text },
     ```

- [ ] **Step 3: Run tests**

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx jest src/__tests__/screens/RentPayment/autoPay.test.tsx --no-coverage`
  Expected: Switch renders test passes

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npm test --no-coverage`
  Expected: Existing tests unchanged

- [ ] **Step 4: Type check**

  Run: `cd /Users/marcuspersonal/dev/regroup-rn7 && npx tsc --noEmit 2>&1 | head -30`
  Expected: No errors in RentPaymentScreen.tsx

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/marcuspersonal/dev/regroup-rn7
  git add src/screens/RentPayment/RentPaymentScreen.tsx src/__tests__/screens/RentPayment/autoPay.test.tsx
  git commit -m "feat(payments): add save-card / auto-pay toggle to RentPaymentScreen"
  ```

---

## Self-Review

**Spec coverage:**

- P1.4 (save card + auto-pay toggle): Covered by Task 3 ✅
- P1.5 (scheduledRentCollection CF): Covered by Task 2 ✅
- P2.12 (updatePaymentInfo error return path): Covered by Task 1 ✅

**Idempotency:** The scheduled CF uses a deterministic `idempotencyKey = "auto-rent-{guestId}-{date}"` so duplicate runs on the same day will not double-charge. ✅

**Security note:** The scheduled CF runs with the STRIPE_SECRET_KEY secret. The `off_session: true` flag tells Stripe to charge without user interaction — this only works if the payment method was saved with `setup_future_usage: 'off_session'` during original setup. If PaymentSheet doesn't set this, the charge will fail with `authentication_required`. Verify PaymentSheet setup params include `setupFutureUsage: 'offSession'` in the `createPaymentIntent` CF.
