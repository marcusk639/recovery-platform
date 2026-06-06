> ⚠️ **Legacy document.** Carried over from the standalone `regroup-functions` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `regroup` documentation.

# Payment Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send payment confirmation emails via SendGrid and overdue-rent push notifications via FCM.

**Architecture:** Extract `sendFcmToHouseAdmins` from `stripeWebhook.ts` into `util/notifications.ts`, then add `sendEmail` call inside `handlePaymentIntentSucceeded`, and create a new scheduled CF `overdueRentNotification` that runs daily and notifies admins of guests with `balance > 0` and `dueDate` more than 3 days ago.

**Tech Stack:** Firebase Functions v2 (`onSchedule`, `onCall`), SendGrid (`@sendgrid/mail`), Firebase Admin FCM, Firestore, Zod validation, Jest

---

## File Structure

- **Modify:** `functions/src/util/notifications.ts` — export `sendFcmToHouseAdmins`
- **Modify:** `functions/src/webhooks/stripeWebhook.ts` — extend `GuestDoc`, import `sendFcmToHouseAdmins`, add `sendEmail` call in `handlePaymentIntentSucceeded`
- **Create:** `functions/src/scheduled/overdueRentNotification.ts` — daily 9 AM UTC scheduler
- **Modify:** `functions/src/scheduled/index.ts` — re-export `overdueRentNotification`
- **Create:** `functions/src/__tests__/scheduled/overdueRentNotification.test.ts`
- **Create:** `functions/src/__tests__/webhooks/paymentEmail.test.ts`

---

## Task 1: Extract sendFcmToHouseAdmins to util/notifications.ts

**Files:**

- Modify: `functions/src/util/notifications.ts`
- Modify: `functions/src/webhooks/stripeWebhook.ts`
- Test: `functions/src/__tests__/util/notifications.test.ts` (update existing)

- [ ] **Step 1: Copy `sendFcmToHouseAdmins` signature from stripeWebhook.ts**

  Look at `stripeWebhook.ts:110–160`. The function signature is:

  ```typescript
  async function sendFcmToHouseAdmins(
    houseId: string,
    title: string,
    body: string,
  ): Promise<void>;
  ```

  It queries `users` where `adminHouseIds array-contains houseId`, then calls `admin.messaging(app).sendEachForMulticast`.

- [ ] **Step 2: Write the failing test**

  Create `functions/src/__tests__/util/notifications.test.ts` (or add to existing):

  ```typescript
  import { sendFcmToHouseAdmins } from "../../util/notifications";

  describe("sendFcmToHouseAdmins", () => {
    it("sends FCM to all admins of a house", async () => {
      // mocks already set up in jest.setup.ts
      await expect(
        sendFcmToHouseAdmins("house-1", "Test Title", "Test Body"),
      ).resolves.not.toThrow();
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/util/notifications.test.ts -t "sendFcmToHouseAdmins" --no-coverage`
  Expected: FAIL — `sendFcmToHouseAdmins is not exported`

- [ ] **Step 3: Add export to notifications.ts**

  At the bottom of `functions/src/util/notifications.ts`, add:

  ```typescript
  export async function sendFcmToHouseAdmins(
    houseId: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      const adminQuery = await admin
        .firestore()
        .collection("users")
        .where("adminHouseIds", "array-contains", houseId)
        .get();

      if (adminQuery.empty) {
        logger.info("sendFcmToHouseAdmins: no admins found for house", {
          houseId,
        });
        return;
      }

      const tokens: string[] = [];
      adminQuery.docs.forEach((doc) => {
        const data = doc.data() as { fcmTokens?: string[] };
        if (data.fcmTokens) tokens.push(...data.fcmTokens);
      });

      if (tokens.length === 0) return;

      await admin.messaging(app).sendEachForMulticast({
        tokens,
        data: {
          notifee: JSON.stringify({
            title,
            body,
            android: { channelId: "default" },
          }),
        },
      });
    } catch (error) {
      logger.warn("sendFcmToHouseAdmins error (non-fatal)", { houseId, error });
    }
  }
  ```

  Also add the necessary imports at the top of notifications.ts if not already present:

  ```typescript
  import admin from "firebase-admin";
  import { app } from "../api/firestore";
  ```

- [ ] **Step 4: Update stripeWebhook.ts to import from util/notifications**

  In `stripeWebhook.ts`, find the private `sendFcmToHouseAdmins` function (line ~110) and:
  1. Delete the local copy of `sendFcmToHouseAdmins`
  2. Add to the existing imports at the top:
     ```typescript
     import { sendFcmToHouseAdmins } from "../util/notifications";
     ```

- [ ] **Step 5: Run tests to verify it passes**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/util/notifications.test.ts --no-coverage`
  Expected: PASS

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest --no-coverage`
  Expected: All existing tests still pass (no regression in stripeWebhook tests)

- [ ] **Step 6: Commit**

  ```bash
  git add functions/src/util/notifications.ts functions/src/webhooks/stripeWebhook.ts functions/src/__tests__/util/notifications.test.ts
  git commit -m "refactor(notifications): extract sendFcmToHouseAdmins to util/notifications"
  ```

---

## Task 2: Add payment confirmation email to handlePaymentIntentSucceeded

**Files:**

- Modify: `functions/src/webhooks/stripeWebhook.ts`
- Test: `functions/src/__tests__/webhooks/paymentEmail.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `functions/src/__tests__/webhooks/paymentEmail.test.ts`:

  ```typescript
  import { sendEmail } from "../../util/email";

  jest.mock("../../util/email");

  describe("handlePaymentIntentSucceeded — email", () => {
    it("calls sendEmail with guest receipt after successful payment", async () => {
      // This test verifies the webhook triggers an email.
      // Full integration test of the webhook handler is out of scope here;
      // we verify the email utility is called with correct args.
      const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
      mockSendEmail.mockResolvedValue();

      // Import and invoke the exported handler via Stripe event dispatch
      // (see existing stripeWebhook.test.ts for the pattern)
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining("Payment Received"),
          to: expect.any(String),
        }),
      );
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/webhooks/paymentEmail.test.ts --no-coverage`
  Expected: FAIL

- [ ] **Step 2: Extend GuestDoc to include email**

  In `stripeWebhook.ts`, find the `GuestDoc` interface (line ~28) and add `email`:

  ```typescript
  interface GuestDoc {
    houseId: string;
    userId: string;
    firstName: string;
    lastName: string;
    balance?: number;
    email?: string; // add this line
  }
  ```

- [ ] **Step 3: Add sendEmail import**

  In `stripeWebhook.ts`, add to the existing imports:

  ```typescript
  import { sendEmail } from "../util/email";
  ```

- [ ] **Step 4: Add email call inside handlePaymentIntentSucceeded**

  In `handlePaymentIntentSucceeded` (line ~391), after the `sendFcmToHouseAdmins` call, add:

  ```typescript
  // 5. Send email receipt to guest (non-fatal if missing email)
  if (guestData.email) {
    await sendEmail({
      to: guestData.email,
      subject: "Payment Received — Regroup",
      text: `Hi ${guestData.firstName},\n\nYour rent payment of $${amountDollars.toFixed(2)} has been received.\n\nThank you,\nRegroup`,
      html: `<p>Hi ${guestData.firstName},</p><p>Your rent payment of <strong>$${amountDollars.toFixed(2)}</strong> has been received.</p><p>Thank you,<br>Regroup</p>`,
    });
  }
  ```

- [ ] **Step 5: Ensure SENDGRID_API_KEY secret is declared**

  In `stripeWebhook.ts`, find the `onRequest` export and verify `secrets` includes `SENDGRID_API_KEY`. Look at the existing `secrets` array — if missing, add it:

  ```typescript
  export const stripeWebhook = onRequest(
    { secrets: [STRIPE_SECRET_KEY, SENDGRID_API_KEY] },
    ...
  ```

  At the top of the file, find secret declarations (e.g. `const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");`) and add if missing:

  ```typescript
  const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
  ```

- [ ] **Step 6: Run test suite**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest --no-coverage`
  Expected: All tests pass

- [ ] **Step 7: Commit**

  ```bash
  git add functions/src/webhooks/stripeWebhook.ts
  git commit -m "feat(payments): send email receipt on payment_intent.succeeded"
  ```

---

## Task 3: Create overdueRentNotification scheduled CF

**Files:**

- Create: `functions/src/scheduled/overdueRentNotification.ts`
- Modify: `functions/src/scheduled/index.ts`
- Create: `functions/src/__tests__/scheduled/overdueRentNotification.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `functions/src/__tests__/scheduled/overdueRentNotification.test.ts`:

  ```typescript
  import { runOverdueRentCheck } from "../../scheduled/overdueRentNotification";
  import { sendFcmToHouseAdmins } from "../../util/notifications";

  jest.mock("../../util/notifications");
  jest.mock("../../api/firestore");

  describe("runOverdueRentCheck", () => {
    it("notifies admins for each house with overdue guests", async () => {
      const mockSendFcm = sendFcmToHouseAdmins as jest.MockedFunction<
        typeof sendFcmToHouseAdmins
      >;
      mockSendFcm.mockResolvedValue();

      // mockGuestCollection returns guests with balance > 0 and dueDate 4 days ago
      await runOverdueRentCheck();

      expect(mockSendFcm).toHaveBeenCalledWith(
        expect.any(String), // houseId
        "Rent Overdue",
        expect.stringContaining("overdue"),
      );
    });

    it("does not notify when no guests are overdue", async () => {
      const mockSendFcm = sendFcmToHouseAdmins as jest.MockedFunction<
        typeof sendFcmToHouseAdmins
      >;
      mockSendFcm.mockResolvedValue();

      // mockGuestCollection returns guests with balance = 0
      await runOverdueRentCheck();

      expect(mockSendFcm).not.toHaveBeenCalled();
    });
  });
  ```

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/scheduled/overdueRentNotification.test.ts --no-coverage`
  Expected: FAIL — `Cannot find module '../../scheduled/overdueRentNotification'`

- [ ] **Step 2: Create overdueRentNotification.ts**

  Create `functions/src/scheduled/overdueRentNotification.ts`:

  ```typescript
  import { onSchedule } from "firebase-functions/v2/scheduler";
  import { logger } from "firebase-functions";
  import admin from "firebase-admin";
  import { guestCollection } from "../api/firestore";
  import { sendFcmToHouseAdmins } from "../util/notifications";

  const OVERDUE_DAYS_THRESHOLD = 3;

  /**
   * Exported for unit testing. Queries guests with positive balance and
   * rentDueDate more than OVERDUE_DAYS_THRESHOLD days ago, then notifies
   * each house's admins.
   */
  export async function runOverdueRentCheck(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - OVERDUE_DAYS_THRESHOLD);
    const cutoffISO = cutoff.toISOString().split("T")[0]; // YYYY-MM-DD

    const overdueSnapshot = await guestCollection
      .where("balance", ">", 0)
      .where("rentDueDate", "<=", cutoffISO)
      .get();

    if (overdueSnapshot.empty) {
      logger.info("overdueRentCheck: no overdue guests");
      return;
    }

    // Group overdue guests by houseId
    const byHouse: Record<string, { name: string; balance: number }[]> = {};
    overdueSnapshot.docs.forEach((doc) => {
      const data = doc.data() as {
        houseId: string;
        firstName: string;
        lastName: string;
        balance: number;
      };
      if (!byHouse[data.houseId]) byHouse[data.houseId] = [];
      byHouse[data.houseId].push({
        name: `${data.firstName} ${data.lastName}`,
        balance: data.balance,
      });
    });

    // Notify each house
    const notifyPromises = Object.entries(byHouse).map(([houseId, guests]) => {
      const count = guests.length;
      const body =
        count === 1
          ? `${guests[0].name} is overdue by $${guests[0].balance.toFixed(2)}`
          : `${count} residents have overdue rent`;
      return sendFcmToHouseAdmins(houseId, "Rent Overdue", body);
    });

    await Promise.allSettled(notifyPromises);
    logger.info("overdueRentCheck: notified houses", {
      houseCount: Object.keys(byHouse).length,
      guestCount: overdueSnapshot.size,
    });
  }

  export const overdueRentNotification = onSchedule(
    { schedule: "0 9 * * *", timeZone: "UTC" },
    async (_event) => {
      logger.info("overdueRentNotification: starting daily check");
      await runOverdueRentCheck();
    },
  );
  ```

- [ ] **Step 3: Re-export from scheduled/index.ts**

  Add to the bottom of `functions/src/scheduled/index.ts`:

  ```typescript
  export * from "./overdueRentNotification";
  ```

- [ ] **Step 4: Run tests**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest __tests__/scheduled/overdueRentNotification.test.ts --no-coverage`
  Expected: PASS (both tests)

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx jest --no-coverage`
  Expected: All tests pass

- [ ] **Step 5: Verify the new function appears in build output**

  Run: `cd /Users/marcuspersonal/dev/regroup-functions/functions && npx tsc --noEmit`
  Expected: No type errors

- [ ] **Step 6: Commit**

  ```bash
  git add functions/src/scheduled/overdueRentNotification.ts functions/src/scheduled/index.ts functions/src/__tests__/scheduled/overdueRentNotification.test.ts
  git commit -m "feat(scheduled): add overdueRentNotification daily CF"
  ```

---

## Task 4: Ensure SENDGRID_API_KEY secret is set in production

- [ ] **Step 1: Verify secret exists**

  Run (in regroup-functions root, logged into Firebase):

  ```bash
  firebase functions:secrets:access SENDGRID_API_KEY
  ```

  Expected: Returns the key value (not an error)

  If error: Set the secret:

  ```bash
  firebase functions:secrets:set SENDGRID_API_KEY
  ```

  Paste the SendGrid API key when prompted.

- [ ] **Step 2: Deploy**

  Run:

  ```bash
  firebase deploy --only functions:stripeWebhook,functions:overdueRentNotification
  ```

  Expected: Deploy succeeds, both functions appear in Firebase console

- [ ] **Step 3: Smoke test via Stripe CLI**

  ```bash
  stripe trigger payment_intent.succeeded
  ```

  Verify in Firebase logs that `sendEmail` was called (look for "There was an error" only if the key is not set).

---

## Self-Review

**Spec coverage:**

- P1.6 (payment confirmation email): Covered by Task 2 ✅
- P1.7 (manager overdue-rent push notification): Covered by Task 3 ✅

**Type consistency:**

- `sendFcmToHouseAdmins(houseId: string, title: string, body: string)` used identically in Task 1, 2, and 3 ✅
- `sendEmail({ to, subject, text, html })` matches `util/email.ts` `Email` type ✅

**Security note:** `SENDGRID_API_KEY` must be set as a Firebase secret, not in `.env`. The `sendEmail` utility already reads `process.env.SENDGRID_API_KEY` — this is correct for Cloud Functions v2 secrets.
