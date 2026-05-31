import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import { z } from "zod";
import { STRIPE_SECRET_KEY, STRIPE_CLIENT_ID } from "../config";
import { transferStats } from "../util/guest";
import { User } from "../entities/User";
import {
  createStripeClient,
  mapStripeError,
  isAlreadyDeauthorized,
} from "../util/stripe";
import {
  assertHouseAdmin,
  assertHouseMemberFromClaims,
  checkIsMember,
  isHouseAdmin,
  HouseAdminFields,
} from "../util/houseAuth";
import { parseInput } from "../validation";

// ── Schemas ────────────────────────────────────────────────────────────────────
const createPaymentIntentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().optional(),
  guestId: z.string().min(1),
  houseId: z.string().min(1),
  description: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const listPaymentsSchema = z.object({
  guestId: z.string().min(1),
  houseId: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

const listHousePaymentsSchema = z.object({
  houseId: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

const getPaymentMethodSchema = z.object({ customerId: z.string().min(1) });

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

// Allows any URI scheme except javascript: (matches existing URL validation logic)
const safeUrlSchema = z
  .string()
  .refine(
    (u) => !/^javascript:/i.test(u) && /^[a-z][a-z0-9+\-.]*:\/\//i.test(u),
    { message: "Invalid URL scheme" }
  );

const connectStripeAccountSchema = z.object({
  houseId: z.string().min(1),
  returnUrl: safeUrlSchema.optional(),
  refreshUrl: safeUrlSchema.optional(),
});

const houseIdSchema = z.object({ houseId: z.string().min(1) });

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// createPaymentIntent
//
// Creates a Stripe destination charge payment intent for a resident paying
// rent to a house.
//
// Idempotency:
//   The caller may supply an explicit `idempotencyKey`.  If none is provided
//   we generate a deterministic key scoped to the guest and the calendar day
//   (UTC), so duplicate taps within the same day do not create duplicate
//   charges while still allowing a retry the next day.
//
// Stripe error handling:
//   Card errors and rate-limit errors are surfaced with appropriate Firebase
//   HttpsError codes so clients can show meaningful messages.
// ─────────────────────────────────────────────────────────────────────────────
export const createPaymentIntent = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    // ── 1. Auth guard ─────────────────────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    // ── 2. Input validation ───────────────────────────────────────────────────
    const {
      amount,
      currency = "usd",
      guestId,
      houseId,
      description,
      idempotencyKey: clientKey,
    } = parseInput(createPaymentIntentSchema, request.data);

    // ── 3. Fetch and validate house ───────────────────────────────────────────
    const houseSnap = await db.collection("houses").doc(houseId).get();

    if (!houseSnap.exists) {
      throw new HttpsError("not-found", "House not found");
    }

    const house = houseSnap.data() as HouseAdminFields & {
      stripeAccountId?: string;
      stripeStatus?: string;
    };

    if (!house.stripeAccountId || house.stripeStatus !== "active") {
      throw new HttpsError(
        "failed-precondition",
        "House has no active Stripe account"
      );
    }

    // ── 3b. Authorization: caller must be the resident or a house admin ───────
    // Admins are checked directly from house doc fields (already in memory).
    // Non-admins must be paying for themselves — verified via the guest doc.
    if (!isHouseAdmin(request.auth.uid, house)) {
      const guestSnap = await db.collection("guests").doc(guestId).get();
      if (!guestSnap.exists) {
        throw new HttpsError("not-found", "Guest record not found");
      }
      const guestData = guestSnap.data() as { userId?: string };
      if (guestData.userId !== request.auth.uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the resident or a house admin can initiate this payment"
        );
      }
    }

    // ── 4. Build idempotency key ──────────────────────────────────────────────
    const dayKey = new Date().toISOString().slice(0, 10); // e.g. "2026-01-28"
    const idempotencyKey = clientKey ?? `${guestId}-${houseId}-${dayKey}`;

    // ── 5. Create PaymentIntent ───────────────────────────────────────────────
    // amount is already integer cents (validated above).
    const applicationFeeAmount = Math.round(amount * 0.02);

    const stripe = createStripeClient();
    let paymentIntent: Stripe.PaymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount,
          currency,
          description: description || `Rent payment for ${houseId}`,
          metadata: { guestId, houseId },
          transfer_data: { destination: house.stripeAccountId },
          application_fee_amount: applicationFeeAmount,
        },
        { idempotencyKey }
      );
    } catch (err) {
      throw mapStripeError(err);
    }

    return { clientSecret: paymentIntent.client_secret };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// listPayments
// Returns recent payments for a guest in a house.
// ─────────────────────────────────────────────────────────────────────────────
export const listPayments = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const {
      guestId,
      houseId,
      limit = 20,
    } = parseInput(listPaymentsSchema, request.data);

    // Authorization: caller must be a member (admin or guest) of the house
    assertHouseMemberFromClaims(
      request.auth.token as Record<string, unknown>,
      houseId
    );

    const houseDoc = await db.collection("houses").doc(houseId).get();
    const house = houseDoc.data();
    if (!house?.stripeAccountId) return { payments: [] };

    const stripe = createStripeClient();
    const charges = await stripe.charges.list(
      { limit },
      { stripeAccount: house.stripeAccountId }
    );

    // Filter client-side by guestId metadata
    const filtered = charges.data.filter(
      (c) => c.metadata?.guestId === guestId
    );

    return {
      payments: filtered.map((c) => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        description: c.description,
        createdAt: new Date(c.created * 1000).toISOString(),
        receiptUrl: c.receipt_url,
      })),
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// listHousePayments
// Returns all recent payments across all residents for a house in one call.
// Replaces the N+1 pattern of calling listPayments per guest.
// ─────────────────────────────────────────────────────────────────────────────
export const listHousePayments = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    const { houseId, limit = 100 } = parseInput(
      listHousePaymentsSchema,
      request.data
    );

    assertHouseMemberFromClaims(
      request.auth.token as Record<string, unknown>,
      houseId
    );

    const houseDoc = await db.collection("houses").doc(houseId).get();
    const house = houseDoc.data();
    if (!house?.stripeAccountId) return { payments: [] };

    const stripe = createStripeClient();
    const charges = await stripe.charges.list(
      { limit },
      { stripeAccount: house.stripeAccountId }
    );

    return {
      payments: charges.data.map((c) => ({
        id: c.id,
        amount: c.amount / 100,
        currency: c.currency,
        status: c.status,
        description: c.description,
        createdAt: new Date(c.created * 1000).toISOString(),
        receiptUrl: c.receipt_url,
        guestId: c.metadata?.guestId ?? null,
        houseId: c.metadata?.houseId ?? houseId,
      })),
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// getPaymentMethod
// Retrieves the default payment method for a Stripe customer.
// ─────────────────────────────────────────────────────────────────────────────
export const getPaymentMethod = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(getPaymentMethodSchema, request.data);
    const stripe = createStripeClient();
    try {
      // @ts-ignore — retrieveCustomer may return DeletedCustomer
      const customer: Stripe.Customer = await stripe.customers.retrieve(
        data.customerId
      );
      const paymentMethodId = customer.invoice_settings.default_payment_method;
      return stripe.paymentMethods.retrieve(paymentMethodId as string);
    } catch (error) {
      logger.error("Could not retrieve payment method", error);
    }
    return null;
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// updatePaymentInfo
// ─────────────────────────────────────────────────────────────────────────────
export const updatePaymentInfo = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const parsed = parseInput(
      updatePaymentInfoSchema,
      request.data
    ) as unknown as {
      user: User;
      paymentMethod: string;
      guestId?: string;
    };
    const { user, paymentMethod, guestId } = parsed;
    const stripe = createStripeClient();
    try {
      const payment = await stripe.paymentMethods.attach(paymentMethod, {
        customer: user.subscriptionMetadata.customerId,
      });
      await stripe.customers.update(user.subscriptionMetadata.customerId, {
        invoice_settings: {
          default_payment_method: payment.id,
        },
      });
      if (guestId) {
        await admin.firestore().collection("guests").doc(guestId).update({
          defaultPaymentMethodId: payment.id,
        });
      }
      return;
    } catch (error) {
      logger.error("updatePaymentInfo: failed to attach payment method", {
        error,
      });
      throw new HttpsError("internal", "Failed to save payment method");
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// connectStripeAccount
//
// Creates (or re-uses) a Stripe Express account for a house, then returns
// an account onboarding/update link URL.
//
// Security:
//   - Caller must be authenticated.
//   - Caller must be a superAdmin or adminId on the house document.
//     We verify this from Firestore, not from a client-supplied claim, so a
//     regular resident cannot supply their own houseId and escalate privileges.
//
// Race condition mitigation:
//   - We use a Firestore transaction when writing the new stripeAccountId so
//     that two simultaneous calls cannot both create separate Stripe accounts
//     for the same house.
// ─────────────────────────────────────────────────────────────────────────────
export const connectStripeAccount = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const stripe = createStripeClient();
    const { data, auth } = request;
    // ── 1. Auth guard ─────────────────────────────────────────────────────────
    if (!auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    // ── 2. Input validation ───────────────────────────────────────────────────
    // returnUrl / refreshUrl are optional.  If the client supplies them we
    // validate the scheme to prevent open-redirect attacks; otherwise we
    // fall back to the hosted HTTP endpoints (stripeConnectReturn /
    // stripeConnectReauth) that this same deployment provides.  Defaults
    // are constructed below, after we know the Stripe account ID.
    const { houseId, returnUrl, refreshUrl } = parseInput(
      connectStripeAccountSchema,
      data
    );

    // ── 3. Fetch house & admin check ──────────────────────────────────────────
    const houseRef = admin.firestore().collection("houses").doc(houseId);
    const houseSnap = await houseRef.get();

    if (!houseSnap.exists) {
      throw new HttpsError("not-found", "House not found");
    }

    const house = houseSnap.data() as HouseAdminFields & {
      stripeAccountId?: string;
    };

    assertHouseAdmin(
      auth.uid,
      house,
      "Only house admins can connect a Stripe account"
    );

    // ── 4. Get or create the Stripe Express account ───────────────────────────
    //   We use a transaction so that concurrent calls do not create two accounts.
    let stripeAccountId: string = house.stripeAccountId ?? "";

    if (!stripeAccountId) {
      // Create the account first (outside the transaction) so we have an ID
      // to write.  Stripe account creation is idempotent via metadata — if a
      // second call races here it will create a second account, but the
      // transaction below ensures only one ID is ever persisted.
      let newAccount: Stripe.Account;
      try {
        newAccount = await stripe.accounts.create({
          type: "express",
          metadata: { houseId },
        });
      } catch (err) {
        throw mapStripeError(err);
      }

      // Transactionally write the account ID only if the field is still empty.
      // IMPORTANT: No async Stripe calls are made inside the transaction callback
      // because Firestore transactions can retry on contention, and we must not
      // make external API calls on every retry attempt.
      let existingAccountId: string | null = null;
      try {
        stripeAccountId = await admin.firestore().runTransaction(async (tx) => {
          const snap = await tx.get(houseRef);
          const current = snap.data() as
            | { stripeAccountId?: string }
            | undefined;

          if (current?.stripeAccountId) {
            // Another call already wrote an account ID — record it so we can
            // clean up our newly-created account AFTER the transaction.
            existingAccountId = current.stripeAccountId;
            return current.stripeAccountId;
          }

          tx.update(houseRef, {
            stripeAccountId: newAccount.id,
            stripeStatus: "pending",
          });
          return newAccount.id;
        });
      } catch (err) {
        // If the transaction fails for any reason, clean up the Stripe account.
        await stripe.accounts.del(newAccount.id).catch(() => undefined);
        throw new HttpsError("internal", "Failed to save Stripe account");
      }

      // Post-transaction cleanup: if the transaction found a concurrent account,
      // delete the one we created to prevent orphaned Express accounts.
      if (existingAccountId !== null) {
        await stripe.accounts.del(newAccount.id).catch(() => undefined);
      }
    }

    // ── 5. Resolve return/refresh URLs (client-provided or hosted defaults) ───
    // Defaults point to stripeConnectReturn / stripeConnectReauth, which are
    // HTTP Cloud Functions in this same deployment.  Region defaults to
    // us-central1 (matches the project's setGlobalOptions / deploy default).
    const projectId =
      process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
    const hostedBaseUrl = `https://us-central1-${projectId}.cloudfunctions.net`;
    const resolvedReturnUrl =
      returnUrl ?? `${hostedBaseUrl}/stripeConnectReturn`;
    const resolvedRefreshUrl =
      refreshUrl ??
      `${hostedBaseUrl}/stripeConnectReauth?stripeAccountId=${stripeAccountId}`;

    // ── 6. Create an account link (works for both new and existing accounts) ──
    let accountLink: Stripe.AccountLink;
    try {
      accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: resolvedRefreshUrl,
        return_url: resolvedReturnUrl,
        type: "account_onboarding",
      });
    } catch (err) {
      throw mapStripeError(err);
    }

    return { url: accountLink.url };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// disconnectStripeAccount
//
// Disconnects a Stripe Express account from a house.
//
// Design decisions:
//   - Idempotent: if the house has no stripeAccountId (already disconnected),
//     the function succeeds immediately without calling Stripe.
//   - If Stripe reports the account is not found or already deauthorized we
//     still clear the Firestore fields and return success, because our local
//     state should match the desired "disconnected" outcome regardless.
//   - Caller must be an admin of the house (verified from Firestore).
// ─────────────────────────────────────────────────────────────────────────────
export const disconnectStripeAccount = onCall(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_CLIENT_ID] },
  async (request) => {
    const stripe = createStripeClient();
    const { data, auth } = request;
    // ── 1. Auth guard ─────────────────────────────────────────────────────────
    if (!auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    // ── 2. Input validation ───────────────────────────────────────────────────
    const { houseId } = parseInput(houseIdSchema, data);

    // ── 3. Fetch house & admin check ──────────────────────────────────────────
    const houseRef = admin.firestore().collection("houses").doc(houseId);
    const houseSnap = await houseRef.get();

    if (!houseSnap.exists) {
      throw new HttpsError("not-found", "House not found");
    }

    const house = houseSnap.data() as HouseAdminFields & {
      stripeAccountId?: string;
    };

    assertHouseAdmin(
      auth.uid,
      house,
      "Only house admins can disconnect a Stripe account"
    );

    // ── 4. If there is no account, we are already in the desired state ─────────
    const { stripeAccountId } = house;

    if (stripeAccountId) {
      // ── 5. Attempt Stripe deauthorization ────────────────────────────────────
      //   Errors that indicate the account is already gone are swallowed so that
      //   we can always bring local state in sync.
      try {
        await stripe.oauth.deauthorize({
          client_id: process.env.STRIPE_CLIENT_ID ?? "",
          stripe_user_id: stripeAccountId,
        });
      } catch (err) {
        if (!isAlreadyDeauthorized(err)) {
          // For unexpected Stripe errors, surface to the caller.
          throw mapStripeError(err);
        }
        // Account was already disconnected on Stripe's side — proceed to clear
        // Firestore.
      }
    }

    // ── 6. Clear Stripe fields from the house document ────────────────────────
    await houseRef.update({
      stripeAccountId: admin.firestore.FieldValue.delete(),
      stripeStatus: "disconnected",
      stripeRequirements: admin.firestore.FieldValue.delete(),
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeConnectedAt: admin.firestore.FieldValue.delete(),
      stripeLastSyncAt: admin.firestore.FieldValue.delete(),
      stripeError: admin.firestore.FieldValue.delete(),
    });

    return { success: true };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// getStripeAccountStatus
//
// Retrieves the live Stripe account status for a house, syncs the result to
// Firestore, and returns a structured summary to the caller.
//
// Security:
//   - Caller must be authenticated (any house member may read status).
//   - We read houseId from data and validate the caller is a member by
//     checking that their UID appears in the house document fields.
//     Operators (adminIds/superAdminIds/ownerId) are always considered members.
// ─────────────────────────────────────────────────────────────────────────────

/** Status values that mirror the StripeAccountStatus enum on the client. */
type StripeStatus =
  | "active"
  | "pending"
  | "restricted"
  | "disconnected"
  | "not_connected";

interface AccountStatusResult {
  status: StripeStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: {
    currentlyDue: string[];
    pastDue: string[];
  };
  capabilities: Record<string, string>;
}

export const getStripeAccountStatus = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    const stripe = createStripeClient();
    const { data, auth } = request;
    // ── 1. Auth guard ─────────────────────────────────────────────────────────
    if (!auth) {
      throw new HttpsError("unauthenticated", "Login required");
    }

    // ── 2. Input validation ───────────────────────────────────────────────────
    const { houseId } = parseInput(houseIdSchema, data);

    // ── 3. Fetch house doc ────────────────────────────────────────────────────
    const houseRef = admin.firestore().collection("houses").doc(houseId);
    const houseSnap = await houseRef.get();

    if (!houseSnap.exists) {
      throw new HttpsError("not-found", "House not found");
    }

    const house = houseSnap.data() as HouseAdminFields & {
      stripeAccountId?: string;
    };

    // ── 4. Membership check ───────────────────────────────────────────────────
    const isHouseMember = await checkIsMember(auth.uid, houseId, house);
    if (!isHouseMember) {
      throw new HttpsError("permission-denied", "Not a member of this house");
    }

    // ── 5. Short-circuit if no Stripe account is connected ────────────────────
    if (!house.stripeAccountId) {
      const notConnectedResult: AccountStatusResult = {
        status: "not_connected",
        chargesEnabled: false,
        payoutsEnabled: false,
        requirements: { currentlyDue: [], pastDue: [] },
        capabilities: {},
      };
      return notConnectedResult;
    }

    // ── 6. Retrieve the live account from Stripe ──────────────────────────────
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(house.stripeAccountId);
    } catch (err) {
      if (
        err instanceof Stripe.errors.StripeError &&
        err.type === "StripeInvalidRequestError" &&
        err.message.toLowerCase().includes("no such account")
      ) {
        // The Stripe account no longer exists — treat as not connected and sync.
        await houseRef.update({
          stripeStatus: "disconnected",
          stripeChargesEnabled: false,
          stripePayoutsEnabled: false,
          stripeRequirements: [],
          stripeLastSyncAt: Date.now(),
        });
        const disconnectedResult: AccountStatusResult = {
          status: "disconnected",
          chargesEnabled: false,
          payoutsEnabled: false,
          requirements: { currentlyDue: [], pastDue: [] },
          capabilities: {},
        };
        return disconnectedResult;
      }
      throw mapStripeError(err);
    }

    // ── 7. Map Stripe account to our status model ─────────────────────────────
    const chargesEnabled = account.charges_enabled ?? false;
    const payoutsEnabled = account.payouts_enabled ?? false;

    const currentlyDue: string[] = account.requirements?.currently_due ?? [];
    const pastDue: string[] = account.requirements?.past_due ?? [];
    const eventuallyDue: string[] = account.requirements?.eventually_due ?? [];

    // All requirement items to persist — union of currently_due + past_due
    const requirementsToStore = Array.from(
      new Set([...currentlyDue, ...pastDue, ...eventuallyDue])
    );

    let status: StripeStatus;
    if (chargesEnabled && payoutsEnabled) {
      status = "active";
    } else if (!chargesEnabled && currentlyDue.length > 0) {
      status = "restricted";
    } else {
      status = "pending";
    }

    // Build a simplified capabilities map { capability_name: 'active' | 'inactive' | ... }
    const capabilities: Record<string, string> = {};
    if (account.capabilities) {
      for (const [key, value] of Object.entries(account.capabilities)) {
        if (typeof value === "string") {
          capabilities[key] = value;
        }
      }
    }

    // ── 8. Sync status back to Firestore ─────────────────────────────────────
    await houseRef.update({
      stripeStatus: status,
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: payoutsEnabled,
      stripeRequirements: requirementsToStore,
      stripeLastSyncAt: Date.now(),
      stripeError: admin.firestore.FieldValue.delete(),
    });

    const result: AccountStatusResult = {
      status,
      chargesEnabled,
      payoutsEnabled,
      requirements: { currentlyDue, pastDue },
      capabilities,
    };
    return result;
  }
);
