import { onCall, HttpsError } from "firebase-functions/v2/https";
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
import {
  InviteEmailPayload,
  EmailConfirmationPayload,
} from "../entities/Email";
import { sendEmail, regroupEmail } from "../util/email";
import { sendOneInviteEmail } from "../util/inviteEmails";
import { notifyAdminsIfTheyExist } from "../util/invite";
import {
  initializeCustomer,
  initializeTierCustomer,
  updateSubscriptionItem,
  getSubscriptionItem,
  updateSubscriptionMetadata,
  retrievePaymentMethod,
  updatePaymentMethod,
  cancelSubscription,
  reactivateSubscription,
  uncancelSubscription,
  applyBundleDiscountToSubscription,
} from "../api/stripe";
import { createStripeClient } from "../util/stripe";
import {
  withinResidentCap,
  withinPropertyCap,
  totalResidents,
} from "../util/tierCaps";
import {
  getUser,
  updateUser,
  upsertSubscriptionDoc,
  type SubscriptionDoc,
} from "../api/firestore";
import { parseInput } from "../validation";

// ── Schemas ────────────────────────────────────────────────────────────────────
const safeUrlSchema = z
  .string()
  .min(1)
  .refine(
    (url) =>
      !/^javascript:/i.test(url) && /^[a-z][a-z0-9+\-.]*:\/\//i.test(url),
    { message: "URL scheme not allowed" },
  );

const ALLOWED_PORTAL_RETURN_ORIGINS = [
  "https://regroup-app.com",
  "https://phoenix-cleanhouse.web.app",
  "https://phoenix-cleanhouse.firebaseapp.com",
  "http://localhost:4200",
];

const safeReturnUrlSchema = z
  .string()
  .min(1)
  .refine(
    (url) => {
      try {
        return ALLOWED_PORTAL_RETURN_ORIGINS.includes(new URL(url).origin);
      } catch {
        return false;
      }
    },
    { message: "returnUrl must use an allowed origin" },
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
    email: z.string().email(),
    subscriptionMetadata: subscriptionMetadataMinSchema,
  }),
  paymentMethod: z.string().min(1),
  houseType: z.enum(["traditional", "oxford"] as const),
  tier: z.string().min(1),
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

const inviteEmailSchema = z.array(
  z.object({
    email: z.object({
      to: z.string().email(),
      from: z.string(),
      subject: z.string(),
      text: z.string(),
    }),
    dynamicLink: safeUrlSchema,
    type: z.enum(["guest", "admin", "superAdmin", "supporter"]),
  }),
);

const sendConfirmationEmailSchema = z.object({
  email: z.string().email(),
  dynamicLink: safeUrlSchema,
  name: z.string().min(1),
});

// ─────────────────────────────────────────────────────────────────────────────
// createOperatorSubscription
// ─────────────────────────────────────────────────────────────────────────────
export const createOperatorSubscription = onCall(
  { secrets: [STRIPE_SECRET_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    const data = parseInput(
      createOperatorSubscriptionSchema,
      request.data,
    ) as unknown as {
      user: User;
      paymentMethod: string;
      houseType: string;
      tier: string;
    };
    if (data.user.id !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");

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

    const priceId = process.env[tierConfig.priceEnvVar];
    if (!priceId) {
      throw new HttpsError(
        "internal",
        `Price ID not configured for env var: ${tierConfig.priceEnvVar}`,
      );
    }

    logger.info("Creating subscription for user", {
      userId: data.user.id,
      houseType: data.houseType,
      tier: data.tier,
      priceEnvVar: tierConfig.priceEnvVar,
    });
    const firestoreUser = await getUser(data.user.id);

    // Tier-billing path (flag-gated). Builds a single-item flat-fee subscription
    // from the resolved tier price. Legacy two-item subscribers are unaffected:
    // the flag defaults off, so the existing block below runs unchanged.
    if (isTierBillingEnabled()) {
      const tierMetadata = await initializeTierCustomer(
        data.user.email,
        data.paymentMethod,
        data.houseType as HouseType,
        data.tier as TierKey,
        data.user.id,
      );
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
      await updateUser(data.user.id!, {
        // Tier subscriptions have no house/guest items or houses map; the single
        // subscriptionItemId is the billing handle. Cast to the entity type —
        // legacy-only fields (items/houses/plan/oxfordEnabled) are intentionally absent.
        subscriptionMetadata:
          persistedTierMetadata as unknown as OperatorSubscription,
      });
      await upsertSubscriptionDoc({
        houseId: "",
        stripeCustomerId: tierMetadata.customerId,
        stripeSubscriptionId: tierMetadata.subscriptionId,
        status: tierResolvedStatus as SubscriptionDoc["status"],
        currentPeriodEnd: "",
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
      return {
        ...data.user,
        subscriptionMetadata: persistedTierMetadata,
      } as unknown as User;
    }

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
    await updateUser(data.user.id!, {
      subscriptionMetadata: {
        ...metadata,
        status: resolvedStatus,
        lastUpdatedAt: new Date().toISOString(),
        houseType: data.houseType,
        tier: data.tier,
        maxResidents: tierConfig.maxResidents,
        maxProperties: tierConfig.maxProperties,
      },
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
    return { ...data.user, subscriptionMetadata: metadata } as User;
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
    let subscriptionMetadata: typeof storedMetadata;
    if (storedMetadata.status === "cancelling") {
      await uncancelSubscription(storedMetadata.subscriptionId);
      subscriptionMetadata = { ...storedMetadata, status: "active" };
    } else {
      const freshMetadata = await reactivateSubscription(
        storedMetadata.customerId,
        storedMetadata,
        data.user.id,
      );
      subscriptionMetadata = { ...freshMetadata, status: "active" };
    }
    logger.info("Subscription reactivated");
    await updateUser(data.user.id!, { subscriptionMetadata });
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
    await cancelSubscription(data.subscriptionId);
    const subscriptionMetadata = {
      ...firestoreUser.subscriptionMetadata,
      status: "cancelling",
    };
    await updateUser(request.auth.uid, { subscriptionMetadata });
    return { ...data.user, subscriptionMetadata } as User;
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
      const houses = guestMeta.houses ?? {};
      const houseId = houseIds[0];
      // The guests endpoint only mutates occupancy of houses already on the
      // subscription. It must not implicitly create a house — that would
      // bypass the property cap enforced by updateSubscriptionHouses.
      if (!(houseId in houses)) {
        throw new HttpsError(
          "failed-precondition",
          "House is not part of your subscription",
        );
      }
      if (action === "add") {
        if (
          !withinResidentCap(
            totalResidents(guestMeta),
            guestMeta.maxResidents ?? null,
          )
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Resident limit reached for your plan",
          );
        }
      }
      const currentGuests = houses[houseId]?.numberOfGuests ?? 0;
      const newGuests =
        action === "add" ? currentGuests + 1 : Math.max(0, currentGuests - 1);
      await updateUser(user.id!, {
        subscriptionMetadata: {
          ...guestMeta,
          houses: { ...houses, [houseId]: { numberOfGuests: newGuests } },
          lastUpdatedAt: new Date().toISOString(),
        } as unknown as OperatorSubscription,
      });
      logger.info("Tier subscription resident occupancy updated", {
        ownerUserId,
        action,
      });
      return;
    }

    // Check if user has subscription metadata
    if (!user.subscriptionMetadata || !user.subscriptionMetadata.items) {
      logger.warn(
        "User has no subscription metadata, skipping subscription update",
      );
      return;
    }

    try {
      let item = await getSubscriptionItem(
        user.subscriptionMetadata.items.guestItemId,
      );
      logger.info(
        "Subscription item retrieved",
        item,
        "quantity",
        item.quantity,
        "house id",
        houseIds,
      );
      const newQuantity =
        action === "add" ? item.quantity! + 1 : item.quantity! - 1;
      if (newQuantity < 0) {
        throw new HttpsError(
          "invalid-argument",
          "Cannot remove guest: quantity would go below zero",
        );
      }
      // Update Stripe first — if it fails, Firestore is not touched.
      await updateSubscriptionItem(
        user.subscriptionMetadata.items.guestItemId,
        "guest",
        newQuantity,
      );
      await updateUser(user.id!, {
        subscriptionMetadata: updateSubscriptionMetadata(
          user,
          houseIds[0],
          action,
          null as unknown as string[],
        ),
      });
      logger.info("Subscription updated", item.quantity);
      return;
    } catch (error) {
      // Re-throw validation errors — the Stripe fallback path must not swallow
      // HttpsErrors thrown by guards (e.g. negative quantity check above).
      if (error instanceof HttpsError) throw error;
      logger.error("Error updating subscription:", error);
      // If subscription doesn't exist in Stripe, just update the user metadata
      // This handles cases where the subscription was deleted in Stripe but metadata still exists
      try {
        await updateUser(user.id!, {
          subscriptionMetadata: updateSubscriptionMetadata(
            user,
            houseIds[0],
            action,
            null as unknown as string[],
          ),
        });
        logger.info("Updated user metadata without Stripe subscription");
        return;
      } catch (metadataError) {
        logger.error("Error updating user metadata:", metadataError);
        throw new Error("Failed to update subscription and metadata");
      }
    }
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
    const data = parseInput(
      updateSubscriptionHousesSchema,
      request.data,
    ) as SubParams;
    if (data.ownerUserId !== request.auth.uid)
      throw new HttpsError("permission-denied", "User ID mismatch");
    const amount = !isNil(data.amountToAdjust) ? data.amountToAdjust : 1;
    logger.info("Updating user subscription. User", data.ownerUserId);
    const { ownerUserId, action, houseIds } = data;
    const user = await getUser(ownerUserId);
    logger.info("User retrieved", { userId: user.id });

    // Tier model: flat fee, no per-house Stripe quantity and no per-house bundle
    // discounts (multi-property is expressed by tier). Enforce the property cap
    // and persist the houses map instead of touching Stripe items.
    const houseMeta = user.subscriptionMetadata;
    if (houseMeta?.tier) {
      const houses = houseMeta.houses ?? {};
      if (action === "add") {
        // Check the cap per newly-added house so a multi-id batch cannot exceed
        // the property cap in a single call (each new id must fit under the cap).
        const added = { ...houses };
        for (const id of houseIds ?? []) {
          if (id in added) continue;
          if (
            !withinPropertyCap(
              Object.keys(added).length,
              houseMeta.maxProperties ?? null,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Property limit reached for your plan",
            );
          }
          added[id] = { numberOfGuests: 0 };
        }
        await updateUser(user.id!, {
          subscriptionMetadata: {
            ...houseMeta,
            houses: added,
            lastUpdatedAt: new Date().toISOString(),
          } as unknown as OperatorSubscription,
        });
      } else {
        const { [houseIds[0]]: _removed, ...remaining } = houses;
        await updateUser(user.id!, {
          subscriptionMetadata: {
            ...houseMeta,
            houses: remaining,
            lastUpdatedAt: new Date().toISOString(),
          } as unknown as OperatorSubscription,
        });
      }
      logger.info("Tier subscription house occupancy updated", {
        ownerUserId,
        action,
      });
      return;
    }

    if (!user.subscriptionMetadata || !user.subscriptionMetadata.items) {
      logger.warn(
        "User has no subscription metadata, skipping subscription update",
      );
      return;
    }

    if (action === "add") {
      const houseItem = await getSubscriptionItem(
        user.subscriptionMetadata.items.houseItemId,
      );
      logger.info("House item quantity", houseItem.quantity);
      const subscriptionMetadata = updateSubscriptionMetadata(
        user,
        null as unknown as string,
        "add",
        houseIds,
        true,
      );
      // Stripe first — Firestore only written on success.
      await updateSubscriptionItem(
        user.subscriptionMetadata.items.houseItemId,
        "house",
        houseItem.quantity! + amount,
      );
      await updateUser(user.id!, { subscriptionMetadata });
      logger.info("House added to subscription", { houseIds });
    }

    if (action === "remove") {
      // Fetch both items so guest quantity comes from the guest item, not the
      // house item — using the wrong item caused the guest quantity to be set
      // to (houseCount - currentCapacity) instead of (guestCount - currentCapacity).
      const [houseItem, guestItem] = await Promise.all([
        getSubscriptionItem(user.subscriptionMetadata.items.houseItemId),
        getSubscriptionItem(user.subscriptionMetadata.items.guestItemId),
      ]);
      // houseIds[0] is the house being removed. numberOfGuests is the tracked
      // occupancy stored in subscriptionMetadata — authoritative for billing.
      const houseId = houseIds[0];
      const capacity =
        user.subscriptionMetadata.houses[houseId]?.numberOfGuests ?? 0;
      const newGuestQty = Math.max(0, guestItem.quantity! - capacity);
      const subscriptionMetadata = updateSubscriptionMetadata(
        user,
        houseId,
        action,
        null as unknown as string[],
        true,
      );
      // Run both Stripe updates first, then commit to Firestore.
      const [newHouseItem, newGuestItem] = await Promise.all([
        updateSubscriptionItem(
          user.subscriptionMetadata.items.houseItemId,
          "house",
          Math.max(0, houseItem.quantity! - 1),
        ),
        updateSubscriptionItem(
          user.subscriptionMetadata.items.guestItemId,
          "guest",
          newGuestQty,
        ),
      ]);
      await updateUser(user.id!, { subscriptionMetadata });
      logger.info("House removed from subscription", {
        houseId,
        newHouseQty: newHouseItem.quantity,
        newGuestQty: newGuestItem.quantity,
      });
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
        logger.info("Bundle discount applied", {
          ownerUserId,
          houseCount,
          subscriptionId: user.subscriptionMetadata.subscriptionId,
        });
      } catch (discountError) {
        // Non-fatal: log and continue — subscription item update already succeeded.
        logger.error("Failed to apply bundle discount", discountError);
      }
    }

    return user;
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
    const data = parseInput(applyBundleDiscountSchema, request.data) as {
      userId: string;
    };
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

    const { returnUrl } = parseInput(
      createBillingPortalSessionSchema,
      request.data,
    ) as { returnUrl: string };

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
// sendInviteEmails
// ─────────────────────────────────────────────────────────────────────────────
export const sendInviteEmails = onCall(
  { secrets: [SENDGRID_API_KEY] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Login required");
    // Only house operators (admin/superAdmin of at least one house) may send
    // invites — prevents any authenticated user from abusing the SendGrid
    // sender to email arbitrary addresses.
    const token = (request.auth.token ?? {}) as Record<string, unknown>;
    const isOperator =
      (token.admin && Object.keys(token.admin as object).length > 0) ||
      (token.superAdmin && Object.keys(token.superAdmin as object).length > 0);
    if (!isOperator) {
      throw new HttpsError(
        "permission-denied",
        "Only house administrators can send invitations",
      );
    }
    const data = parseInput(
      inviteEmailSchema,
      request.data,
    ) as InviteEmailPayload[];
    const ALLOWED_LINK_PREFIXES = [
      "regroup-app://",
      "com.rats.dev://",
      "https://regroup-app.com/",
      "https://regroup-app.page.link/",
    ];
    const isAllowedLink = (url: string) =>
      ALLOWED_LINK_PREFIXES.some((prefix) => url.startsWith(prefix));
    if (data.some((d) => !isAllowedLink(d.dynamicLink))) {
      throw new HttpsError("invalid-argument", "Disallowed link domain");
    }
    const adminEmails = data
      .filter((emailPayload) => emailPayload.type === "admin")
      .map((adminEmailPayload) => adminEmailPayload.email.to);
    const promises = [];
    logger.info("Notifying previously existing admins of the invitation...");
    promises.push(notifyAdminsIfTheyExist(adminEmails, data));
    logger.info("Sending invite email...");
    data.forEach((emailPayload) => {
      promises.push(
        sendOneInviteEmail({
          toEmail: emailPayload.email.to,
          inviteLink: emailPayload.dynamicLink,
          role: emailPayload.type,
        }),
      );
    });
    // Use allSettled so one failed recipient doesn't hide the others, and so
    // the caller is told when delivery failed instead of seeing a false success.
    const results = await Promise.allSettled(promises);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      // Sanitized: never echo the raw SendGrid error (can contain recipient PII).
      logger.error("sendInviteEmails: email delivery failed", {
        failedCount: failed.length,
        totalCount: results.length,
      });
      throw new HttpsError(
        "unavailable",
        `${failed.length} of ${results.length} invite emails failed to send`,
      );
    }
    logger.info("Invite emails sent!");
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
    const data = parseInput(
      sendConfirmationEmailSchema,
      request.data,
    ) as EmailConfirmationPayload;
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
