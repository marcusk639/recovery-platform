import { onCall, HttpsError } from "firebase-functions/v2/https";
import { isPrimaryOwner } from "../util/houseRoles";
import { isSalesOpen } from "../util/salesSwitch";
import { logger } from "firebase-functions";
import * as admin from "firebase-admin";
import isNil from "lodash/isNil";
import { z } from "zod";
import {
  STRIPE_SECRET_KEY,
  SENDGRID_API_KEY,
  SUBSCRIPTION_TIERS,
  HouseType,
  TierKey,
  isTierBillingEnabled,
} from "../config";
import { User } from "../entities/User";
import OperatorSubscription from "../entities/OperatorSubscription";
import { EmailConfirmationPayload } from "../entities/Email";
import { sendEmail, regroupEmail } from "../util/email";
import {
  initializeCustomer,
  initializeTierCustomer,
  updateSubscriptionItem,
  getSubscriptionItem,
  retrievePaymentMethod,
  updatePaymentMethod,
  cancelSubscription,
  reactivateSubscription,
  uncancelSubscription,
  applyBundleDiscountToSubscription,
  failedBeforeSubscription,
  findLiveSubscriptionForUser,
  findLiveSubscriptionsForUser,
  isUnrecordedReplacement,
  replacementMetadataFrom,
} from "../api/stripe";
import {
  createStripeClient,
  isResourceMissing,
  mapStripeError,
} from "../util/stripe";
import {
  withinResidentCap,
  totalResidents,
} from "../util/tierCaps";
import {
  isTierAvailableForSale,
  resolveTierPriceId,
  storedBillingInterval,
} from "../util/tierPricing";
import {
  addHousesToSubscription,
  removeHouseFromSubscription,
} from "../util/subscriptionHouses";
import { grantPotentialSuperAdminClaim } from "../util/superAdminClaim";
import {
  changeSubscriptionHouses,
  setSubscriptionStatus,
  writeOperatorSubscription,
  writeReplacementSubscription,
} from "../util/operatorSubscriptionWrite";
import {
  assertCheckoutHeld,
  claimCheckout,
  claimReactivation,
  releaseCheckout,
  restoreReversedCheckout,
  storedTierOnSale,
  CHECKOUT_REFUSAL_MESSAGES,
  type CheckoutClaim,
} from "../util/checkoutGuard";
import {
  getHouse,
  getUser,
  upsertSubscriptionDoc,
  type SubscriptionDoc,
} from "../api/firestore";
import { closeOperatorBilling, subscriptionEnded } from "../api/stripeDeletion";
import { operatorStatusFromStripe } from "../webhooks/subscriptionState";
import { parseInput, safeReturnUrlSchema } from "../validation";

// ── Schemas ────────────────────────────────────────────────────────────────────
const safeUrlSchema = z
  .string()
  .min(1)
  .refine(
    (url) =>
      !/^javascript:/i.test(url) && /^[a-z][a-z0-9+\-.]*:\/\//i.test(url),
    { message: "URL scheme not allowed" },
  );

const subscriptionMetadataMinSchema = z.object({
  status: z.string(),
  subscriptionId: z.string().optional(),
  customerId: z.string().optional(),
});

const userMinSchema = z.object({
  id: z.string().min(1),
  email: z.string().optional(),
  subscriptionMetadata: subscriptionMetadataMinSchema,
});

const createOperatorSubscriptionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email().optional(),
    subscriptionMetadata: subscriptionMetadataMinSchema,
  }),
  paymentMethod: z.string().min(1),
  houseType: z.enum(["traditional", "oxford"] as const),
  tier: z.string().min(1),
  // Monthly (default) or annual billing. Annual resolves a separate Stripe
  // price per tier (~17% off, P-4). Legacy callers omit this and get monthly.
  billingInterval: z.enum(["month", "year"] as const).optional(),
});

const reactivateOperatorSubscriptionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    subscriptionMetadata: z.object({
      status: z.string(),
      subscriptionId: z.string().min(1),
      customerId: z.string().min(1),
    }),
  }),
});

const cancelUserSubscriptionSchema = z.object({
  user: userMinSchema,
  subscriptionId: z.string().min(1),
});

const actionEnum = z.enum(["add", "remove"]);

const updateSubscriptionGuestsSchema = z.object({
  ownerUserId: z.string().min(1),
  houseIds: z.array(z.string().min(1)),
  action: actionEnum,
});

const updateSubscriptionHousesSchema = z.object({
  ownerUserId: z.string().min(1),
  action: actionEnum,
  houseIds: z.array(z.string().min(1)),
  amountToAdjust: z.number().int().min(1).max(100).optional(),
});

const applyBundleDiscountSchema = z.object({
  userId: z.string().min(1),
});

const createBillingPortalSessionSchema = z.object({
  returnUrl: safeReturnUrlSchema,
});

const sendConfirmationEmailSchema = z.object({
  email: z.string().email(),
  dynamicLink: safeUrlSchema,
  name: z.string().min(1),
});

// Grants the potentialSuperAdmin claim (idempotent, never throws) and shapes
// the checkout response. Shared by the tier and legacy billing paths, which
// otherwise duplicated this tail identically.
// Returns the caller's user shape plus `claimGranted`, which is NOT a field on
// User: the web client reads it to show a "finishing setup" state when the
// subscription succeeded but the custom claim did not land. Declaring it here
// keeps the response contract visible rather than hiding it behind a cast.
async function finishCheckout<U extends { id: string }, M>(
  user: U,
  subscriptionMetadata: M,
): Promise<User & { claimGranted: boolean }> {
  const claimGranted = await grantPotentialSuperAdminClaim(user.id);
  return { ...user, subscriptionMetadata, claimGranted } as unknown as User & {
    claimGranted: boolean;
  };
}

const BILLING_OFF_MESSAGE = "New subscriptions are not available right now";
const SALES_CLOSED_MESSAGE = "Subscriptions open when the new Regroup app is released";
const CHECKOUT_REVERSED_MESSAGE =
  "We couldn't finish setting up your subscription, so we cancelled it. You have not been charged. Please try again.";
const REACTIVATE_UNFINISHED_MESSAGE =
  "Your plan restarted, but we couldn't finish setting up your account. Please try Reactivate again in a few minutes.";
const CHECKOUT_ORPHANED_MESSAGE =
  "We couldn't finish setting up your subscription. Please contact support before trying again, so you aren't billed twice.";

/**
 * Stripe created the subscription but the records that tie it to the operator
 * weren't all written. The web deletes a new account on any error, so leaving
 * the subscription would bill, after the trial, an account that no longer
 * exists (or, for an existing account, one the webhooks can't find it through).
 * Cancel it now through closeOperatorBilling, which acts only on a subscription
 * Stripe ties to this uid, then put back the user record the checkout replaced
 * so the retry the message asks for isn't refused as plan-exists. If
 * closeOperatorBilling fails, the subscription may still be live: log its ids
 * at ERROR for support, say so, and leave the record and lock showing it.
 */
async function reverseUnrecordedCheckout(
  userId: string,
  subscriptionId: string,
  customerId: string,
  writeError: unknown,
  claim: CheckoutClaim,
): Promise<never> {
  logger.error("Checkout records not written after Stripe; cancelling the subscription", {
    userId,
    subscriptionId,
    error: writeError instanceof Error ? writeError.message : String(writeError),
  });
  try {
    await closeOperatorBilling(userId, subscriptionId, customerId);
  } catch (cancelError) {
    const error = cancelError instanceof Error ? cancelError.message : String(cancelError);
    // closeOperatorBilling cancels, then deletes the customer: if only the
    // delete failed (or the cancel's response was lost), nothing bills.
    if (!(await endedInStripe(subscriptionId))) {
      logger.error("Checkout subscription left live with no records: cancel it by hand", {
        userId,
        subscriptionId,
        customerId,
        error,
      });
      throw new HttpsError("internal", CHECKOUT_ORPHANED_MESSAGE);
    }
    // Nothing bills, but the customer (with the card) may be left in Stripe,
    // and the restored record no longer names it.
    logger.error("Checkout subscription cancelled, but its customer may remain: delete it by hand", {
      userId,
      subscriptionId,
      customerId,
      error,
    });
  }
  // Cancelled, so nothing bills: the operator may retry at once, as the
  // message says. (A live orphan above keeps the lock until it expires.)
  await restoreReversedCheckout(claim, subscriptionId);
  throw new HttpsError("internal", CHECKOUT_REVERSED_MESSAGE);
}

/**
 * Why a new replacement can't be created now, or null. It needs tier billing
 * on, and a legacy (tier-less) plan isn't recreated: the operator picks a plan.
 * A tier no longer for sale (Oxford Network) is refused as at checkout, which
 * is where the operator then picks a plan (checkoutGuard allows it).
 */
async function reactivationClosed(stored: OperatorSubscription): Promise<HttpsError | null> {
  if (!isTierBillingEnabled()) return new HttpsError("failed-precondition", BILLING_OFF_MESSAGE);
  if (!storedTierOnSale(stored.houseType, stored.tier)) {
    return new HttpsError(
      "failed-precondition",
      "This plan is no longer offered. Choose a plan to subscribe again.",
    );
  }
  if (!(await isSalesOpen())) return new HttpsError("failed-precondition", SALES_CLOSED_MESSAGE);
  return null;
}

/** setSubscriptionStatus, logging when the record no longer names the subscription. */
async function writeStatusOf(
  uid: string,
  subscriptionId: string,
  status: string,
): Promise<OperatorSubscription> {
  const { written, subscriptionMetadata } = await setSubscriptionStatus(uid, subscriptionId, status);
  if (!written) {
    const reason = subscriptionMetadata.subscriptionId
      ? "the record names another subscription"
      : "the record has no subscription";
    logger.warn(`Subscription status not written: ${reason}`, {
      userId: uid,
      subscriptionId,
      status,
    });
  }
  return subscriptionMetadata as OperatorSubscription;
}

/**
 * Records Reactivate's replacement, which Stripe has already created and, with
 * no trial, charged for: the subscriptions doc first (the webhooks find a
 * subscription only through it, and its first events can arrive before the
 * record points at it), then the record and the house statuses in one
 * transaction. The webhooks don't write the record or houses for a
 * subscription the record doesn't name, so a failure leaves the record as it
 * was and the operator's next Reactivate adopts the replacement left live
 * (isUnrecordedReplacement). The new ids are logged at ERROR in case that
 * retry never comes.
 */
async function recordReplacement(
  uid: string,
  replacement: OperatorSubscription,
  planId: string,
): Promise<OperatorSubscription> {
  try {
    await upsertSubscriptionDoc({
      houseId: "",
      stripeCustomerId: replacement.customerId,
      stripeSubscriptionId: replacement.subscriptionId,
      status: replacement.status as SubscriptionDoc["status"],
      currentPeriodEnd: replacement.currentPeriodEnd
        ? new Date(replacement.currentPeriodEnd).toISOString()
        : "",
      planId,
      guestCount: 0,
      userId: uid,
    });
    return await writeReplacementSubscription(uid, replacement);
  } catch (error) {
    logger.error("Reactivate's replacement is live in Stripe but its records aren't all written: finish them by hand", {
      userId: uid,
      subscriptionId: replacement.subscriptionId,
      customerId: replacement.customerId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError("internal", REACTIVATE_UNFINISHED_MESSAGE);
  }
}

/** Whether Stripe shows the subscription ended; false when it can't be read. */
async function endedInStripe(subscriptionId: string): Promise<boolean> {
  try {
    return await subscriptionEnded(subscriptionId);
  } catch {
    return false;
  }
}

/**
 * The stored record is the first check (claimCheckout). This is the second: a
 * subscription Stripe holds for this operator that the record doesn't show (a
 * checkout whose record write failed and whose cancel failed too). Refused, so
 * a retry, another plan or the next day's idempotency key can't add a second.
 */
async function refuseUnrecordedSubscription(claim: CheckoutClaim, email: string): Promise<void> {
  const live = await lookUpUnrecorded(claim, () => findLiveSubscriptionForUser(claim.uid, email));
  if (live) await refuseUnrecorded(claim, [live]);
}

/** A Stripe lookup under the lock: a failure frees the lock and is `unavailable`. */
async function lookUpUnrecorded<T>(claim: CheckoutClaim, lookup: () => Promise<T>): Promise<T> {
  try {
    return await lookup();
  } catch (error) {
    await releaseCheckout(claim);
    logger.error("Checkout could not check Stripe for an existing subscription", {
      userId: claim.uid,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new HttpsError("unavailable", "We couldn't start checkout. Please try again in a minute.");
  }
}

async function refuseUnrecorded(
  claim: CheckoutClaim,
  live: Array<{ id: string }>,
): Promise<never> {
  await releaseCheckout(claim);
  logger.error("Checkout refused: Stripe has a live subscription the record doesn't show", {
    userId: claim.uid,
    subscriptionId: live[0]?.id,
    subscriptionIds: live.map((sub) => sub.id),
  });
  throw new HttpsError(
    "failed-precondition",
    CHECKOUT_REFUSAL_MESSAGES["unrecorded-subscription"],
    { reason: "unrecorded-subscription" },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// createOperatorSubscription
// ─────────────────────────────────────────────────────────────────────────────
// The new-subscriber notice (util/email) reads SENDGRID_API_KEY from
// process.env, which a v2 function gets only for a secret it binds.
export const createOperatorSubscription = onCall(
  { secrets: [STRIPE_SECRET_KEY, SENDGRID_API_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(createOperatorSubscriptionSchema, request.data);
    if (data.user.id !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");
    if (!data.user.email) {
      throw new HttpsError(
        "invalid-argument",
        "An email address is required to start a subscription",
      );
    }
    // No silent fallback to the legacy two-item shape (SUB-003). The legacy
    // path below stays until post-launch cleanup, unreachable from here.
    if (!isTierBillingEnabled()) {
      throw new HttpsError("failed-precondition", BILLING_OFF_MESSAGE);
    }
    // Web checkout stays closed until the new app is released (spec §4.1 item 8).
    if (!(await isSalesOpen())) {
      throw new HttpsError("failed-precondition", SALES_CLOSED_MESSAGE);
    }

    // Resolve the tier config from SUBSCRIPTION_TIERS.
    const tierMap = SUBSCRIPTION_TIERS[data.houseType as HouseType];
    const tierConfig = (
      tierMap as unknown as Record<
        string,
        {
          priceEnvVar: string;
          maxResidents: number | null;
          maxProperties: number | null;
          label: string;
        }
      >
    )[data.tier];

    if (!tierConfig) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown tier "${data.tier}" for houseType "${data.houseType}"`,
      );
    }

    // P-8: block checkout for tiers held back until a chapter signs (Oxford
    // Network). The tier stays defined so existing subs are unaffected.
    if (
      !isTierAvailableForSale(data.houseType, data.tier as TierKey)
    ) {
      throw new HttpsError(
        "failed-precondition",
        `The "${tierConfig.label}" plan is not currently available for new subscriptions`,
      );
    }

    // The price of the interval chosen: an annual plan's subscriptions doc
    // names the annual price, and a missing one is refused before Stripe.
    const billingInterval = data.billingInterval ?? "month";
    let priceId: string;
    try {
      priceId = resolveTierPriceId(data.houseType, data.tier as TierKey, billingInterval);
    } catch (error) {
      logger.error("Checkout price not configured", {
        houseType: data.houseType,
        tier: data.tier,
        billingInterval,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpsError("internal", "This plan isn't available right now. Please try again later.");
    }

    // From the stored record, never the client's subscriptionMetadata: refuses
    // an account with a live or restartable plan (a second subscription would
    // bill twice), and locks out a concurrent checkout. See util/checkoutGuard.
    const claim = await claimCheckout(data.user.id);
    await refuseUnrecordedSubscription(claim, data.user.email);

    logger.info("Creating subscription for user", {
      userId: data.user.id,
      houseType: data.houseType,
      tier: data.tier,
      priceEnvVar: tierConfig.priceEnvVar,
    });
    // Tier-billing path (flag-gated). Builds a single-item flat-fee subscription
    // from the resolved tier price. Legacy two-item subscribers are unaffected:
    // the flag defaults off, so the existing block below runs unchanged.
    if (isTierBillingEnabled()) {
      let tierMetadata: Awaited<ReturnType<typeof initializeTierCustomer>>;
      try {
        tierMetadata = await initializeTierCustomer(
          data.user.email,
          data.paymentMethod,
          data.houseType,
          data.tier as TierKey,
          data.user.id,
          billingInterval,
          { key: String(claim.startedAt), beforeCreate: () => assertCheckoutHeld(claim) },
        );
      } catch (stripeError) {
        // Before any subscription could exist (a declined card, say), free the
        // lock so the operator can retry at once. After the create call an
        // error is ambiguous (a timeout can follow a subscription Stripe made),
        // so the lock stays until it expires, and the Stripe search above
        // refuses the next checkout if that subscription is live.
        if (failedBeforeSubscription(stripeError)) await releaseCheckout(claim);
        throw stripeError;
      }
      logger.info("Tier subscription created", {
        subscriptionId: tierMetadata.subscriptionId,
      });
      const tierResolvedStatus = tierMetadata.status || "pending";
      const persistedTierMetadata = {
        ...tierMetadata,
        status: tierResolvedStatus,
        lastUpdatedAt: new Date().toISOString(),
        maxResidents: tierConfig.maxResidents,
        maxProperties: tierConfig.maxProperties,
      };
      // The single subscriptionItemId is the billing handle; legacy-only fields
      // (items/plan) are intentionally absent, but oxfordEnabled is included so
      // mobile Oxford gating keeps working. The stored houses map is kept: it is
      // the property-cap count (see writeOperatorSubscription).
      let writtenTierMetadata: Awaited<ReturnType<typeof writeOperatorSubscription>>;
      try {
        writtenTierMetadata = await writeOperatorSubscription(
          data.user.id,
          persistedTierMetadata,
        );
        await upsertSubscriptionDoc({
          houseId: "",
          stripeCustomerId: tierMetadata.customerId,
          stripeSubscriptionId: tierMetadata.subscriptionId,
          status: tierResolvedStatus as SubscriptionDoc["status"],
          // Never throw here: the Stripe subscription already exists.
          currentPeriodEnd: tierMetadata.currentPeriodEnd
            ? new Date(tierMetadata.currentPeriodEnd).toISOString()
            : "",
          planId: priceId,
          guestCount: 0,
          userId: data.user.id,
        });
      } catch (writeError) {
        return reverseUnrecordedCheckout(
          data.user.id,
          tierMetadata.subscriptionId,
          tierMetadata.customerId,
          writeError,
          claim,
        );
      }
      await sendEmail({
        to: "admin@regroup-app.com",
        from: regroupEmail,
        text: `A new user has subscribed to Regroup: Sober Living App\nUser ID: ${data.user.id}\nUser email: ${data.user.email}`,
        subject: "New user subscription",
      });
      return finishCheckout(data.user, writtenTierMetadata);
    }

    const firestoreUser = await getUser(data.user.id);
    const oxfordEnabled =
      firestoreUser?.subscriptionMetadata?.oxfordEnabled ?? false;
    // W12: userId is embedded in the Stripe subscription metadata at creation
    // time (inside createSubscription) so webhook handlers can resolve the
    // operator without an extra Firestore query. A follow-up update call would
    // risk a Stripe/Firestore desync if it failed after the subscription was live.
    const metadata = await initializeCustomer(
      data.user.email,
      data.paymentMethod,
      oxfordEnabled,
      data.user.id,
    );
    logger.info("Subscription created", {
      subscriptionId: metadata.subscriptionId,
    });

    // B9: Use the status returned by Stripe (e.g. 'trialing') rather than
    // hard-coding 'active'. Fall back to 'pending' only if no status came back.
    // W11: Always include lastUpdatedAt.
    const resolvedStatus = metadata.status || "pending";
    await writeOperatorSubscription(data.user.id, {
      ...metadata,
      status: resolvedStatus,
      lastUpdatedAt: new Date().toISOString(),
      houseType: data.houseType,
      tier: data.tier,
      maxResidents: tierConfig.maxResidents,
      maxProperties: tierConfig.maxProperties,
    });

    // Seed the `subscriptions` collection so the Stripe webhook handlers
    // (customer.subscription.updated/deleted, invoice.*) can resolve this sub by
    // stripeSubscriptionId. Without this the collection has no writer and those
    // handlers early-return. houseId/guestCount aren't known at operator-subscribe
    // time, so they're seeded empty/zero and filled in as houses are provisioned.
    await upsertSubscriptionDoc({
      houseId: "",
      stripeCustomerId: metadata.customerId,
      stripeSubscriptionId: metadata.subscriptionId,
      status: resolvedStatus as SubscriptionDoc["status"],
      currentPeriodEnd: metadata.currentPeriodEnd
        ? new Date(metadata.currentPeriodEnd).toISOString()
        : "",
      planId: priceId,
      guestCount: 0,
      userId: data.user.id,
    });
    await sendEmail({
      to: "admin@regroup-app.com",
      from: regroupEmail,
      text: `A new user has subscribed to Regroup: Sober Living App\nUser ID: ${data.user.id}\nUser email: ${data.user.email}`,
      subject: "New user subscription",
    });
    return finishCheckout(data.user, metadata);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// reactivateOperatorSubscription
// ─────────────────────────────────────────────────────────────────────────────
export const reactivateOperatorSubscription = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(
      reactivateOperatorSubscriptionSchema,
      request.data,
    ) as unknown as { user: User };
    if (data.user.id !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");
    logger.info("Reactivating subscription for user", { userId: data.user.id });
    const firestoreUser = await getUser(data.user.id);
    if (!firestoreUser?.subscriptionMetadata) {
      throw new HttpsError("not-found", "User subscription record not found");
    }
    const storedMetadata = firestoreUser.subscriptionMetadata;
    const status = storedMetadata.status as SubscriptionDoc["status"];

    if (status === "active" || status === "trialing") {
      // Already live. Creating another Stripe subscription here would bill the
      // operator twice over and orphan the original, which would keep charging
      // with nothing in Firestore pointing at it. Nothing to write: the record
      // and its houses' statuses were written together (recordReplacement).
      return { ...data.user, subscriptionMetadata: storedMetadata };
    }

    let subscriptionMetadata: typeof storedMetadata;
    let replacement = false;
    if (status === "cancelling") {
      // Set to cancel at period end but still live — resume in place, with the
      // status Stripe has (a resumed trial is still trialing).
      const resumed = await uncancelSubscription(storedMetadata.subscriptionId);
      subscriptionMetadata = { ...storedMetadata, status: operatorStatusFromStripe(resumed) };
    } else if (status === "canceled") {
      // Terminal in Stripe: a canceled subscription cannot be resumed, so a
      // replacement is the only route back. The sole branch allowed to create.
      // The stored email, which the Stripe customer was created with; the
      // lookup below lists that customer's subscriptions.
      const email = firestoreUser.email || request.auth.token.email;
      if (!email) {
        throw new HttpsError(
          "failed-precondition",
          "An email address is required to restart a subscription",
        );
      }
      // The checkout lock, then Stripe: no second subscription from a
      // concurrent checkout or Reactivate, or one a failed record write left.
      const claim = await claimReactivation(data.user.id);
      const unrecorded = await lookUpUnrecorded(claim, () =>
        findLiveSubscriptionsForUser(claim.uid, email, storedMetadata.customerId),
      );
      let freshMetadata: Awaited<ReturnType<typeof reactivateSubscription>>;
      if (unrecorded.length === 1 && isUnrecordedReplacement(unrecorded[0], storedMetadata)) {
        // An earlier Reactivate's replacement, live in Stripe and paid for, whose
        // records failed: recorded now instead of refused or created again,
        // whatever the gates below say, since the operator has already paid.
        logger.warn("Reactivate recording the replacement an earlier attempt left unrecorded", {
          userId: data.user.id,
          subscriptionId: unrecorded[0].id,
        });
        freshMetadata = replacementMetadataFrom(unrecorded[0], storedMetadata, storedMetadata.customerId);
      } else {
        if (unrecorded.length > 0) await refuseUnrecorded(claim, unrecorded);
        const closed = await reactivationClosed(storedMetadata);
        if (closed) {
          await releaseCheckout(claim);
          throw closed;
        }
        try {
          freshMetadata = await reactivateSubscription(
            storedMetadata.customerId,
            storedMetadata,
            data.user.id,
            { key: String(claim.startedAt), beforeCreate: () => assertCheckoutHeld(claim) },
          );
        } catch (stripeError) {
          // As at checkout: free the lock only when no subscription can exist.
          if (failedBeforeSubscription(stripeError)) await releaseCheckout(claim);
          throw stripeError;
        }
      }
      subscriptionMetadata = { ...freshMetadata, status: freshMetadata.status || "pending" };
      replacement = true;
    } else {
      // past_due, unpaid, or unrecognized. The Stripe subscription still exists
      // in these states, so creating a second one would double-bill.
      throw new HttpsError(
        "failed-precondition",
        "This subscription cannot be reactivated from its current state. Please update your payment method in the billing portal.",
      );
    }
    logger.info("Subscription reactivated");
    // Not storedMetadata, read before Stripe: writing it back would put back
    // fields changed meanwhile.
    subscriptionMetadata = replacement
      ? await recordReplacement(
          data.user.id,
          subscriptionMetadata,
          // The replacement is created on the stored plan.
          resolveTierPriceId(
            storedMetadata.houseType as HouseType,
            storedMetadata.tier as TierKey,
            storedBillingInterval(storedMetadata.billingInterval),
          ),
        )
      : await writeStatusOf(
          data.user.id,
          storedMetadata.subscriptionId,
          subscriptionMetadata.status,
        );
    return { ...data.user, subscriptionMetadata };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// cancelUserSubscription
// ─────────────────────────────────────────────────────────────────────────────
export const cancelUserSubscription = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(
      cancelUserSubscriptionSchema,
      request.data,
    ) as unknown as { user: User; subscriptionId: string };
    if (data.user.id !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");
    const firestoreUser = await getUser(request.auth.uid);
    if (
      !firestoreUser?.subscriptionMetadata?.subscriptionId ||
      firestoreUser.subscriptionMetadata.subscriptionId !== data.subscriptionId
    )
      throw new HttpsError(
        "permission-denied",
        "Subscription does not belong to caller",
      );
    // The status Stripe has: a past_due plan set to cancel is still past_due.
    const cancelled = await cancelSubscription(data.subscriptionId);
    const subscriptionMetadata = await writeStatusOf(
      request.auth.uid,
      data.subscriptionId,
      operatorStatusFromStripe(cancelled),
    );
    return { ...data.user, subscriptionMetadata };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// updateSubscriptionGuests
// ─────────────────────────────────────────────────────────────────────────────
interface SubParams {
  ownerUserId: string;
  houseIds: string[];
  action: "add" | "remove";
  amountToAdjust?: number;
}

export const updateSubscriptionGuests = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(
      updateSubscriptionGuestsSchema,
      request.data,
    ) as SubParams;
    if (data.ownerUserId !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");
    logger.info("Updating user subscription. User", data.ownerUserId);
    const { ownerUserId, action, houseIds } = data;
    const user = await getUser(ownerUserId);
    logger.info("User retrieved", { userId: ownerUserId });

    // Tier model: flat fee, no per-resident Stripe quantity. Enforce the
    // resident cap and persist occupancy instead of touching Stripe items.
    const guestMeta = user.subscriptionMetadata;
    if (guestMeta?.tier) {
      const houseId = houseIds[0];
      // Checked and counted on the stored record, in its transaction, so a
      // resident counted meanwhile is neither lost nor let past the cap.
      await changeSubscriptionHouses(user.id!, (stored, storedMeta) => {
        // The guests endpoint only mutates occupancy of houses already on the
        // subscription. It must not implicitly create a house — that would
        // bypass the property cap enforced by createHouses and
        // updateSubscriptionHouses.
        if (!(houseId in stored)) {
          throw new HttpsError(
            "failed-precondition",
            "House is not part of your subscription",
          );
        }
        const meta = { ...guestMeta, ...storedMeta, houses: stored };
        if (
          action === "add" &&
          !withinResidentCap(totalResidents(meta), meta.maxResidents ?? null)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Resident limit reached for your plan",
          );
        }
        const current = stored[houseId]?.numberOfGuests ?? 0;
        const next = action === "add" ? current + 1 : Math.max(0, current - 1);
        return { ...stored, [houseId]: { numberOfGuests: next } };
      });
      logger.info("Tier subscription resident occupancy updated", {
        ownerUserId,
        action,
      });
      return;
    }

    // Only tier subscriptions exist — the legacy per-house/per-guest Stripe
    // quantity model was removed. Reaching here means the subscription is in an
    // unexpected shape, which is worth surfacing rather than silently ignoring.
    throw new HttpsError(
      "failed-precondition",
      "Subscription is not on a tier plan",
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// updateSubscriptionHouses
// ─────────────────────────────────────────────────────────────────────────────
export const updateSubscriptionHouses = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput<SubParams>(
      updateSubscriptionHousesSchema,
      request.data,
    );
    if (data.ownerUserId !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");
    const amount = !isNil(data.amountToAdjust) ? data.amountToAdjust : 1;
    logger.info("Updating user subscription. User", data.ownerUserId);
    const { ownerUserId, action, houseIds } = data;
    if (action === "remove" && (houseIds ?? []).length === 0) {
      throw new HttpsError("invalid-argument", "houseIds must not be empty");
    }
    const user = await getUser(ownerUserId);
    logger.info("User retrieved", { userId: user.id });

    // Tier model: flat fee, no per-house Stripe quantity and no per-house bundle
    // discounts (multi-property is expressed by tier). Enforce the property cap
    // and persist the houses map instead of touching Stripe items.
    const houseMeta = user.subscriptionMetadata;
    if (houseMeta?.tier) {
      if (action === "add") {
        // The subscription houses map is what createHouses accepts as proof of
        // ownership on retry, so only a house this caller owns may enter it.
        // Ownership is the server-only primary owner record (util/houseRoles),
        // never houses.ownerId (a superAdmin could rewrite it before the
        // rules deploy). ownerUserId is request.auth.uid (checked above).
        const owned = await Promise.all(
          (houseIds ?? []).map((id) => isPrimaryOwner(id, ownerUserId)),
        );
        if (owned.some((o) => !o)) {
          throw new HttpsError(
            "permission-denied",
            "You can only add houses you own",
          );
        }
      }
      if (action === "remove") {
        // The map is the property-cap count createHouses enforces. Freeing a
        // slot for a house that still exists would let an operator exceed the
        // plan by repeating remove + create. Refused whatever the ownerId:
        // a superAdmin can rewrite ownerId on their own house. A deleted house
        // leaves the map through the onHouseDeleted trigger, or through this
        // remove once its doc is gone.
        if (await getHouse(houseIds[0])) {
          throw new HttpsError(
            "failed-precondition",
            "Delete the house before removing it from your plan",
          );
        }
      }
      // Changed from the stored map, so the property cap counts houses
      // createHouses added meanwhile, and none of them is dropped.
      const written = await changeSubscriptionHouses(user.id!, (stored, storedMeta) => {
        // The stored plan's caps too: a downgrade meanwhile applies.
        const meta = { ...houseMeta, ...storedMeta, houses: stored };
        return (
          action === "add"
            ? addHousesToSubscription(meta, houseIds ?? [])
            : removeHouseFromSubscription(meta, houseIds[0])
        ).houses;
      });
      // The record as stored, not the read above.
      const updatedMeta = written as OperatorSubscription;
      logger.info("Tier subscription house occupancy updated", {
        ownerUserId,
        action,
      });
      // The legacy branch returned the user and callers (the mobile setup
      // wizard) read subscriptionMetadata off the result. The tier branch
      // returned undefined, which crashed them; return the user here too.
      return { ...user, subscriptionMetadata: updatedMeta };
    }

    // Only tier subscriptions exist — the legacy per-house/per-guest Stripe
    // quantity model was removed. Reaching here means the subscription is in an
    // unexpected shape, which is worth surfacing rather than silently ignoring.
    throw new HttpsError(
      "failed-precondition",
      "Subscription is not on a tier plan",
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// applyBundleDiscount
// ─────────────────────────────────────────────────────────────────────────────
export const applyBundleDiscount = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput<{
      userId: string;
    }>(applyBundleDiscountSchema, request.data);
    if (data.userId !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");
    const user = await getUser(data.userId);
    if (!user.subscriptionMetadata?.subscriptionId) {
      logger.warn("applyBundleDiscount: user has no subscriptionId, skipping", {
        userId: data.userId,
      });
      return;
    }
    // Tier subscriptions express multi-property via tier (Professional/Enterprise/
    // Network), not per-house quantity, so per-house bundle coupons do not apply.
    if (user.subscriptionMetadata?.tier) {
      logger.info(
        "applyBundleDiscount: tier subscription — bundle discounts not applicable",
        { userId: data.userId },
      );
      return;
    }
    const houseCount = Object.keys(
      user.subscriptionMetadata.houses ?? {},
    ).length;
    logger.info("applyBundleDiscount", {
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

// ─────────────────────────────────────────────────────────────────────────────
// createBillingPortalSession
// ─────────────────────────────────────────────────────────────────────────────
export const createBillingPortalSession = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");

    const { returnUrl } = parseInput<{ returnUrl: string }>(
      createBillingPortalSessionSchema,
      request.data,
    );

    const user = await getUser(request.auth.uid);
    const customerId = user?.subscriptionMetadata?.customerId;
    if (!customerId) {
      throw new HttpsError(
        "not-found",
        "No billing account found for this user",
      );
    }

    const stripe = createStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// sendConfirmationEmail
// ─────────────────────────────────────────────────────────────────────────────
export const sendConfirmationEmail = onCall(
  { secrets: [SENDGRID_API_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput<EmailConfirmationPayload>(
      sendConfirmationEmailSchema,
      request.data,
    );
    const { email, dynamicLink, name } = data;
    // Confirmation emails may only be sent to the caller's own address —
    // prevents abusing the SendGrid sender to email arbitrary recipients.
    const callerEmail = (request.auth.token as Record<string, unknown>)
      .email as string | undefined;
    if (!callerEmail || callerEmail.toLowerCase() !== email.toLowerCase()) {
      throw new HttpsError(
        "permission-denied",
        "Confirmation emails can only be sent to your own address",
      );
    }
    const html = [
      '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">',
      '<h2 style="color: #333; text-align: center;">Confirm Your Email</h2>',
      '<p style="font-size: 16px; line-height: 1.5; color: #555;">',
      `Hi ${name}, please confirm your email address to get started with Regroup.`,
      "</p>",
      '<div style="text-align: center; margin: 30px 0;">',
      `<a href="${dynamicLink}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">`,
      "Confirm Email",
      "</a>",
      "</div>",
      '<p style="font-size: 14px; color: #666; text-align: center;">',
      "If the button doesn't work, copy and paste this link into your browser:<br>",
      `<a href="${dynamicLink}" style="color: #007bff; word-break: break-all;">${dynamicLink}</a>`,
      "</p>",
      '<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">',
      '<p style="font-size: 12px; color: #999; text-align: center;">',
      "This email was sent by Regroup: Sober Living App",
      "</p>",
      "</div>",
    ].join("");

    await sendEmail({
      to: email,
      from: regroupEmail,
      subject: "Confirm your Regroup email",
      text: `Hi ${name}, confirm your email by visiting: ${dynamicLink}`,
      html,
    });
  },
);
