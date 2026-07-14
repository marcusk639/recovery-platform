import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { db } from "../utils/firebase";
import {
  stripe,
  productIdGroup,
  getDefaultPriceForProduct,
  TRIAL_PERIOD_DAYS,
} from "../utils/stripe";

interface RequestAdminAccessWithSubscriptionData {
  groupId: string;
  message?: string;
  paymentMethodId?: string; // For in-app payment (Android). Required at runtime
  // when creating a new subscription (i.e. when subscriptionId is not
  // already supplied) — see the guard in the handler body.
  subscriptionId?: string; // For web-based payment (iOS) - subscription already created
  userId?: string;
  email?: string; // Optional email from web flow
  name?: string; // Optional name from web flow
}

export const requestAdminAccessWithSubscription = onCall(
  async (request: CallableRequest<RequestAdminAccessWithSubscriptionData>) => {
    const { groupId, message, paymentMethodId, subscriptionId, email, name } =
      request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Group ID is required.");
    }
    if (!productIdGroup) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe product ID for groups is not configured.",
      );
    }

    const groupRef = db.collection("groups").doc(groupId);

    // Ensures the member document reflects isAdmin = true — consistent with
    // group.admins — and builds the success response, from a single place.
    // Web-claim users (signed up on the web without ever using the mobile
    // app) have no member doc yet — create it so admin privileges actually
    // take effect. The onMemberWrite trigger syncs custom JWT claims FROM
    // this member document, not from group.admins directly, so every
    // success-return path (the normal happy path AND the ack-ambiguity
    // recovery path below) MUST go through this helper — skipping it leaves
    // a user listed as an admin in Firestore but with claims never synced.
    async function grantMemberAdminAndBuildResponse(
      currentStripeSubscriptionId: string | undefined,
      currentSubscriptionStatus: string | undefined,
    ): Promise<{
      success: true;
      groupId: string;
      subscriptionId: string | undefined;
      subscriptionStatus: string | undefined;
      group: FirebaseFirestore.DocumentData | undefined;
    }> {
      const memberRef = db.collection("members").doc(`${groupId}_${userId}`);
      const memberSnap = await memberRef.get();

      if (memberSnap.exists) {
        await memberRef.update({
          isAdmin: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(
          `Updated member document ${groupId}_${userId} to set isAdmin = true`,
        );
      } else {
        // Fetch user profile data to populate the new member doc.
        const userSnap = await db.collection("users").doc(userId).get();
        const userData = userSnap.data() || {};
        const displayName =
          userData.displayName || request.auth?.token?.name || name || "Member";

        await memberRef.set({
          id: `${groupId}_${userId}`,
          userId,
          groupId,
          displayName,
          isAdmin: true,
          // Privacy defaults match UserModel (opt-in sharing).
          showSobrietyDate: false,
          showPhoneNumber: false,
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(
          `Created member document ${groupId}_${userId} with isAdmin = true for web-claim user`,
        );
      }

      // Fetch the updated group data to return
      const updatedGroupSnap = await groupRef.get();

      return {
        success: true,
        groupId,
        subscriptionId: currentStripeSubscriptionId,
        subscriptionStatus: currentSubscriptionStatus,
        group: updatedGroupSnap.data(),
      };
    }

    try {
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Group not found.");
      }

      const groupData = groupSnap.data()!;
      const memberCount = groupData.memberCount || 0;

      // Check if the user is already an admin or has a pending request
      if (groupData.admins?.includes(userId)) {
        throw new HttpsError(
          "already-exists",
          "User is already an admin of this group.",
        );
      }
      // Guard against double-claim race: a concurrent claimer succeeded while
      // this request was in flight. Reject before any Stripe customer or
      // subscription work happens so the user's card is not attached to the
      // existing admin's customer record.
      if (groupData.isClaimed === true) {
        throw new HttpsError(
          "failed-precondition",
          "This group has already been claimed by another admin.",
        );
      }
      if (
        groupData.pendingAdminRequests?.some((req: any) => req.uid === userId)
      ) {
        throw new HttpsError(
          "already-exists",
          "User already has a pending admin request for this group.",
        );
      }

      let stripeCustomerId: string | undefined = groupData.stripeCustomerId;
      let stripeSubscriptionId: string | undefined =
        groupData.stripeSubscriptionId;
      let subscriptionStatus: string | undefined = groupData.subscriptionStatus;
      // These three are only ever assigned when this call actually creates or
      // verifies a subscription (see the branches below). Kept in scope here
      // so the claimStripeFields assembly (right before the transaction) can
      // see whichever branch actually ran, without re-deriving them.
      let stripeSubscriptionItemId: string | undefined;
      let stripePriceIdGroup: string | undefined;
      let stripeProductIdGroup: string | undefined;
      // Fed into the subscription's idempotency key below. Only incremented
      // by the compensation/revert block after a real cancellation — a
      // plain client-side retry of an unanswered call (no compensation yet)
      // must keep hitting the SAME idempotency key so Stripe still dedupes
      // it; only a retry that follows an actual cancellation should mint a
      // fresh key so Stripe creates a genuinely new subscription instead of
      // replaying the canceled one's cached response.
      const subscriptionAttempt: number =
        groupData.stripeSubscriptionAttempt || 0;
      // Tracks whether THIS call created a fresh Stripe subscription. If the
      // downstream Firestore transaction loses a race (another caller claimed
      // the group first), we must cancel that subscription so the losing
      // claimant isn't billed. Pre-existing subscriptions (from a prior call
      // or the web-payment verify branch) are NOT rolled back.
      let subscriptionCreatedThisCall = false;

      // Distinguishes which branch below actually ran. Used immediately
      // before the grant guard to decide whether a fresh live re-check of
      // subscriptionStatus is needed (create-new path) or would be a
      // pure-waste duplicate Stripe call (web-checkout path, which just
      // did its own fresh retrieve() above).
      const usedWebCheckoutVerify = Boolean(subscriptionId);

      // If subscriptionId is provided (from web payment), verify and use it
      if (subscriptionId) {
        logger.info(
          `Subscription provided from web payment, verifying for group ${groupId}`,
        );
        try {
          const existingSubscription =
            await stripe.subscriptions.retrieve(subscriptionId);

          // Verify the subscription belongs to this group to prevent cross-group hijacking
          if (existingSubscription.metadata?.groupId !== groupId) {
            throw new HttpsError(
              "permission-denied",
              "Subscription does not belong to this group.",
            );
          }

          if (
            existingSubscription.status === "active" ||
            existingSubscription.status === "trialing"
          ) {
            stripeSubscriptionId = subscriptionId;
            stripeCustomerId =
              typeof existingSubscription.customer === "string"
                ? existingSubscription.customer
                : existingSubscription.customer.id;
            subscriptionStatus = existingSubscription.status;
            stripeSubscriptionItemId = existingSubscription.items.data[0]?.id;

            logger.info(`Verified subscription for group ${groupId}`);
          } else {
            throw new HttpsError(
              "failed-precondition",
              `Subscription is not active. Status: ${existingSubscription.status}`,
            );
          }
        } catch (err: any) {
          logger.error(
            `Error verifying subscription for group ${groupId}:`,
            err,
          );
          if (err instanceof HttpsError) throw err;
          throw new HttpsError(
            "invalid-argument",
            "Invalid or inactive subscription ID provided.",
          );
        }
      } else {
        // Original flow: Create customer and subscription

        // 1. Create or retrieve Stripe Customer for the user (if not already done)
        if (!stripeCustomerId) {
          const userRef = db.collection("users").doc(userId);
          const userSnap = await userRef.get();
          const userData = userSnap.data();

          // Prefer the authenticated email from the Firebase Auth token over
          // client-supplied `email` to prevent spoofed billing records. Fall
          // back to the users/{uid} doc, then finally to the client value.
          const userEmail =
            request.auth?.token?.email || userData?.email || email;

          if (!userEmail) {
            throw new HttpsError(
              "failed-precondition",
              "User email is required to create a Stripe customer.",
            );
          }

          const customer = await stripe.customers.create(
            {
              email: userEmail,
              name: userData?.displayName || name,
              metadata: { userId, groupId },
              payment_method: paymentMethodId, // Attach payment method if provided
              invoice_settings: {
                default_payment_method: paymentMethodId,
              },
            },
            { idempotencyKey: `req-admin-${userId}-${groupId}-customer` },
          );
          stripeCustomerId = customer.id;
          logger.info(
            `Stripe customer ${stripeCustomerId} created for user ${userId} and group ${groupId}`,
          );
        } else if (paymentMethodId) {
          // If customer exists but new payment method is provided, attach it and set as default
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: stripeCustomerId,
          });
          await stripe.customers.update(stripeCustomerId, {
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          });
          logger.info(
            `Attached new payment method ${paymentMethodId} to customer ${stripeCustomerId}`,
          );
        }

        // 2. Create a new Stripe Subscription if one doesn't exist (flat rate)
        if (
          !stripeSubscriptionId ||
          subscriptionStatus === "canceled" ||
          subscriptionStatus === "incomplete" ||
          subscriptionStatus === "past_due"
        ) {
          if (!paymentMethodId) {
            throw new HttpsError(
              "invalid-argument",
              "A payment method is required to request admin access for this group.",
            );
          }

          // Get the default price for the group product
          const groupPriceId = await getDefaultPriceForProduct(productIdGroup);
          logger.info(
            `Using group price ${groupPriceId} from product ${productIdGroup}`,
          );

          const subscription = await stripe.subscriptions.create(
            {
              customer: stripeCustomerId,
              items: [
                {
                  price: groupPriceId,
                  quantity: 1, // Flat rate subscription (no per-member pricing)
                },
              ],
              expand: ["latest_invoice.payment_intent"], // To get client_secret if needed for payment setup
              trial_period_days: TRIAL_PERIOD_DAYS,
              metadata: { groupId, userId },
              default_payment_method: paymentMethodId, // Set default payment method for the subscription
            },
            {
              idempotencyKey: `req-admin-${userId}-${groupId}-subscription-${subscriptionAttempt}`,
            },
          );
          stripeSubscriptionId = subscription.id;
          subscriptionStatus = subscription.status;
          subscriptionCreatedThisCall = true;
          stripeSubscriptionItemId = subscription.items.data[0].id;
          stripePriceIdGroup = groupPriceId;
          stripeProductIdGroup = productIdGroup;
          logger.info(
            `Stripe subscription ${stripeSubscriptionId} created for group ${groupId} with status ${subscriptionStatus}`,
          );
        }
      }

      // Final live-status re-check: the subscriptionStatus in scope here may
      // be a stale idempotent replay of an earlier create() call (its cached
      // response predates a later cancellation) for the create-new-subscription
      // path. Re-derive from a live Stripe call immediately before the guard
      // so a stale/replayed value can never grant admin. Skipped for the
      // web-checkout path — it already did its own fresh retrieve() moments
      // earlier at verify time with no Stripe calls in between, so a second
      // one here would be a pure-waste extra round-trip.
      if (!usedWebCheckoutVerify && stripeSubscriptionId) {
        subscriptionStatus = (
          await stripe.subscriptions.retrieve(stripeSubscriptionId)
        ).status;
      }

      // Guard: only grant admin if subscription is active or trialing
      if (
        subscriptionStatus !== "active" &&
        subscriptionStatus !== "trialing"
      ) {
        throw new HttpsError(
          "failed-precondition",
          `Cannot grant admin access: subscription status is '${subscriptionStatus}'. A valid subscription is required.`,
        );
      }

      // Assemble exactly once, from whichever branch above actually ran.
      // Firestore rejects literal `undefined` — omit absent fields rather than
      // setting them to undefined.
      const claimStripeFields: Record<string, unknown> = { stripeCustomerId };
      if (stripeSubscriptionId !== undefined) {
        claimStripeFields.stripeSubscriptionId = stripeSubscriptionId;
      }
      if (subscriptionStatus !== undefined) {
        claimStripeFields.subscriptionStatus = subscriptionStatus;
      }
      if (stripeSubscriptionItemId !== undefined) {
        claimStripeFields.stripeSubscriptionItemId = stripeSubscriptionItemId;
      }
      if (stripePriceIdGroup !== undefined) {
        claimStripeFields.stripePriceIdGroup = stripePriceIdGroup;
      }
      if (stripeProductIdGroup !== undefined) {
        claimStripeFields.stripeProductIdGroup = stripeProductIdGroup;
      }

      // 3. Atomically claim the group + grant admin via a Firestore transaction
      // so two concurrent callers can't both pass the pre-Stripe `isClaimed`
      // check and both end up in `admins`. Stripe ops happen OUTSIDE the
      // transaction (external calls + transactions must be fast), so on
      // contention failure we roll back any subscription created in THIS call.
      // Stripe fields are only ever written here, inside the same atomic
      // tx.update() that grants the claim — a losing caller's Stripe
      // identifiers are never written anywhere, so there is nothing to
      // corrupt and nothing to revert on failure.
      try {
        await db.runTransaction(async (tx) => {
          const txGroupSnap = await tx.get(groupRef);
          const txGroupData = txGroupSnap.data();
          if (txGroupData?.isClaimed === true) {
            throw new HttpsError(
              "failed-precondition",
              "This group has already been claimed by another admin.",
            );
          }
          tx.update(groupRef, {
            isClaimed: true,
            admins: admin.firestore.FieldValue.arrayUnion(userId),
            pendingAdminRequests:
              admin.firestore.FieldValue.arrayRemove(userId),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...claimStripeFields,
          });
        });
      } catch (txError: any) {
        const isRaceLoss =
          txError instanceof HttpsError &&
          txError.code === "failed-precondition";

        let postTxData: any;
        let postTxReadFailed = false;
        try {
          postTxData = (await groupRef.get()).data();
        } catch (postTxReadError) {
          postTxReadFailed = true;
          logger.error(
            `Error re-reading group ${groupId} after transaction failure:`,
            postTxReadError,
          );
        }

        // Ack-ambiguity recovery: did THIS call's own transaction actually
        // commit, despite the client observing an error? Relies on this
        // callable's subscription idempotency key being scoped to `userId`
        // — that's what makes this single check sufficient even for a
        // same-user concurrent double-request sharing one Stripe
        // subscription object; see the design spec for the full argument.
        // No separate "does someone else own this subscription" check is
        // needed.
        if (postTxData?.admins?.includes(userId)) {
          return await grantMemberAdminAndBuildResponse(
            stripeSubscriptionId,
            subscriptionStatus,
          );
        }

        if (
          subscriptionCreatedThisCall &&
          stripeSubscriptionId &&
          !postTxReadFailed
        ) {
          let cancelConfirmed = false;
          try {
            await stripe.subscriptions.cancel(stripeSubscriptionId);
          } catch (stripeCancelError) {
            logger.error(
              `Error canceling Stripe subscription ${stripeSubscriptionId} in compensation:`,
              stripeCancelError,
            );
          }
          try {
            const currentState =
              await stripe.subscriptions.retrieve(stripeSubscriptionId);
            cancelConfirmed = currentState.status === "canceled";
          } catch (retrieveError) {
            logger.error(
              `Error verifying cancellation state for ${stripeSubscriptionId}:`,
              retrieveError,
            );
          }
          if (cancelConfirmed) {
            await groupRef.update({
              stripeSubscriptionAttempt:
                admin.firestore.FieldValue.increment(1),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          logger.warn(
            `Compensating: Canceled Stripe subscription ${stripeSubscriptionId} after claim transaction ${
              isRaceLoss ? "lost the claim race" : "failed unexpectedly"
            } for group ${groupId} by user ${userId}. Confirmed canceled: ${cancelConfirmed}.`,
          );
        } else if (postTxReadFailed && subscriptionCreatedThisCall) {
          // Conservative default when we can't confirm the ack-ambiguity
          // state: an orphaned live subscription (caught later by the
          // reconciler/audit query) is a much smaller harm than canceling a
          // subscription that this same user's other concurrent request now
          // depends on. Do not cancel when uncertain.
          logger.warn(
            `Skipping compensation for subscription ${stripeSubscriptionId}: could not confirm ack-ambiguity state after a failed re-read — erring toward not canceling.`,
          );
        }

        if (isRaceLoss) {
          throw txError;
        }
        logger.error(
          `Unexpected error in claim transaction for group ${groupId} by user ${userId}:`,
          txError,
        );
        throw new HttpsError(
          "internal",
          "Failed to process admin access request due to an unexpected error. Please try again.",
        );
      }

      // 4. Update or create the member document so isAdmin is consistent with
      // group.admins and the onMemberWrite trigger can sync custom JWT claims,
      // then build the response.
      return await grantMemberAdminAndBuildResponse(
        stripeSubscriptionId,
        subscriptionStatus,
      );
    } catch (error: any) {
      logger.error(
        `Error requesting admin access with subscription for group ${groupId} by user ${userId}:`,
        error,
      );
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "internal",
        "Failed to process admin access request with subscription.",
      );
    }
  },
);
