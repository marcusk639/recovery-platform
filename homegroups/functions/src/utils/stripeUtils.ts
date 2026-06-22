import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import Stripe from "stripe";
import {
  stripe,
  NonRetriableError,
  TRIAL_PERIOD_DAYS,
  productIdGroup,
  productIdIntergroupA,
  productIdIntergroupB,
} from "./stripe";
import { db, messaging } from "./firebase";
import { APP_BASE_URL } from "./appConfig";

// --- Typed Stripe helpers ---

interface StripeSubscriptionWithPeriod extends Stripe.Subscription {
  current_period_end?: number;
}

// Stripe SDK v20 removed the top-level `subscription` field from Invoice in favour of
// `parent.subscription_details.subscription`. Many webhook payloads still carry the
// legacy field, so we expose a typed accessor instead of casting to `any`.
interface InvoiceWithLegacySubscription extends Stripe.Invoice {
  subscription?: string | Stripe.Subscription | null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as InvoiceWithLegacySubscription).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id ?? null;

  const parentSub = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub === "object") return parentSub.id ?? null;

  return null;
}

function getSubscriptionExpiresAt(
  sub: StripeSubscriptionWithPeriod,
): FirebaseFirestore.Timestamp | null {
  return sub.current_period_end
    ? admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000)
    : null;
}

// --- Stripe Webhook Helper Functions ---

/**
 * Handle checkout.session.completed event
 * This is triggered when a user completes a Stripe Checkout session
 */
export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subscriptionId = session.subscription;
  const customerId = session.customer;

  // Intergroup tier upgrade (tier_a → tier_b)
  if (
    session.metadata?.upgradeFrom === "tier_a" &&
    session.metadata?.upgradeTo === "tier_b" &&
    session.metadata?.intergroupId
  ) {
    const intergroupId = session.metadata.intergroupId;
    if (session.payment_status !== "paid") {
      logger.info(
        `Intergroup ${intergroupId} tier_b checkout completed but payment_status=${session.payment_status} — skipping upgrade`,
      );
      return;
    }
    const upgradeSubscriptionId = session.subscription as string | null;
    const upgradeSubscription = upgradeSubscriptionId
      ? await stripe.subscriptions.retrieve(upgradeSubscriptionId, {
          expand: ["items"],
        })
      : null;
    const upgradePriceId =
      upgradeSubscription?.items.data[0]?.price?.id ?? null;
    const upgradeItemId = upgradeSubscription?.items.data[0]?.id ?? null;
    const upgradeExpiresAt = upgradeSubscription
      ? getSubscriptionExpiresAt(
          upgradeSubscription as StripeSubscriptionWithPeriod,
        )
      : null;

    const intergroupDoc = await admin
      .firestore()
      .collection("intergroups")
      .doc(intergroupId)
      .get();
    const existingSubscriptionId = intergroupDoc.data()?.stripeSubscriptionId;

    // Write Firestore first so the intergroup is on tier_b even if the old
    // subscription cancel fails — leaves user on a valid plan rather than none.
    await admin
      .firestore()
      .collection("intergroups")
      .doc(intergroupId)
      .update({
        tier: "tier_b",
        subscriptionStatus: "active",
        stripeSubscriptionId: upgradeSubscriptionId ?? null,
        stripeCustomerId: (session.customer as string) ?? null,
        stripePriceIdIntergroup: upgradePriceId,
        stripeSubscriptionItemId: upgradeItemId,
        subscriptionExpiresAt: upgradeExpiresAt,
        pendingUpgradeSessionId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    logger.info(`Intergroup ${intergroupId} upgraded to tier_b via checkout`, {
      intergroupId,
    });

    if (
      existingSubscriptionId &&
      existingSubscriptionId !== upgradeSubscriptionId
    ) {
      await stripe.subscriptions.cancel(existingSubscriptionId).catch((e) => {
        logger.info(`Could not cancel old subscription: ${e.message}`, {
          intergroupId,
        });
      });
    }
    return;
  }

  // V4.4: Handle intergroup checkout sessions
  const intergroupId = session.metadata?.intergroupId;
  if (intergroupId) {
    if (!subscriptionId || !customerId) {
      throw new NonRetriableError(
        `Missing required data in intergroup checkout.session.completed: ` +
          `intergroupId=${intergroupId}, subscriptionId=${subscriptionId}, customerId=${customerId}, sessionId=${session.id}`,
      );
    }
    const subscription = await stripe.subscriptions.retrieve(
      subscriptionId as string,
      { expand: ["items"] },
    );
    // Find the subscription item for intergroup tiers
    const intergroupSubscriptionItemId =
      subscription.items.data.find(
        (item) =>
          item.price.product === productIdIntergroupA ||
          item.price.product === productIdIntergroupB,
      )?.id ?? null;

    const intergroupRef = db.collection("intergroups").doc(intergroupId);
    await intergroupRef.update({
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: subscription.status,
      stripePriceIdIntergroup: subscription.items.data[0]?.price?.id ?? null,
      stripeSubscriptionItemId: intergroupSubscriptionItemId,
      subscriptionExpiresAt: getSubscriptionExpiresAt(
        subscription as StripeSubscriptionWithPeriod,
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`Intergroup subscription activated`, {
      intergroupId,
      status: subscription.status,
    });
    return;
  }

  const groupId = session.metadata?.groupId;

  if (!groupId || !subscriptionId || !customerId) {
    // This is a data issue that won't be fixed by retrying
    throw new NonRetriableError(
      `Missing required data in checkout.session.completed: ` +
        `groupId=${groupId}, subscriptionId=${subscriptionId}, customerId=${customerId}, sessionId=${session.id}`,
    );
  }

  const subscription = await stripe.subscriptions.retrieve(
    subscriptionId as string,
    { expand: ["items"] },
  );

  if (!subscription) {
    throw new NonRetriableError(
      `Subscription ${subscriptionId} not found after checkout session ${session.id}`,
    );
  }

  const groupRef = db.collection("groups").doc(groupId);
  const groupSnap = await groupRef.get();

  if (!groupSnap.exists) {
    throw new NonRetriableError(
      `Group ${groupId} not found for checkout session ${session.id}`,
    );
  }

  const updateData: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: subscription.status,
    stripePriceIdGroup: subscription.items.data[0]?.price?.id || null,
    stripeProductIdGroup: productIdGroup,
    stripeSubscriptionItemId: findSubscriptionItemId(subscription),
    subscriptionExpiresAt: getSubscriptionExpiresAt(
      subscription as StripeSubscriptionWithPeriod,
    ),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  logger.info(`Updating group ${groupId} with Stripe info`, {
    groupId,
    status: subscription.status,
  });
  await groupRef.update(updateData);

  // --- Referral reward hook ---
  // If the group was referred, process the referral conversion after updating the group.
  const referralCode = groupSnap.data()?.referralCode as string | undefined;
  if (referralCode) {
    try {
      await processReferralConversion(referralCode, groupId, subscription);
    } catch (referralError) {
      // Log but don't throw — referral errors must never break checkout processing
      logger.error(`Referral processing failed for group`, {
        groupId,
        error:
          referralError instanceof Error
            ? referralError.message
            : "unknown error",
      });
    }
  }
}

/**
 * Handle customer.subscription.updated event for intergroup subscriptions
 */
export async function handleIntergroupSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const subscriptionId = subscription.id;
  const intergroupQuery = db
    .collection("intergroups")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1);
  const intergroupSnapshot = await intergroupQuery.get();

  if (intergroupSnapshot.empty) {
    logger.warn(`No intergroup found for subscription update`, {
      status: subscription.status,
    });
    return;
  }

  const intergroupDoc = intergroupSnapshot.docs[0];
  await intergroupDoc.ref.update({
    subscriptionStatus: subscription.status,
    subscriptionExpiresAt: getSubscriptionExpiresAt(
      subscription as StripeSubscriptionWithPeriod,
    ),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`Intergroup subscription updated`, {
    intergroupId: intergroupDoc.id,
    status: subscription.status,
  });
}

/**
 * Handle customer.subscription.deleted event for intergroup subscriptions
 */
export async function handleIntergroupSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const subscriptionId = subscription.id;
  const intergroupQuery = db
    .collection("intergroups")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1);
  const intergroupSnapshot = await intergroupQuery.get();

  if (intergroupSnapshot.empty) {
    logger.warn(`No intergroup found for deleted subscription`);
    return;
  }

  const intergroupDoc = intergroupSnapshot.docs[0];
  await intergroupDoc.ref.update({
    subscriptionStatus: "canceled",
    stripeSubscriptionId: null,
    stripeSubscriptionItemId: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`Intergroup subscription canceled`, {
    intergroupId: intergroupDoc.id,
  });
}

/**
 * Handle invoice.payment_succeeded event
 * This is triggered when an invoice payment succeeds (subscription renewal)
 */
export async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer?.id ?? null);

  if (!subscriptionId || !customerId) {
    // This might be a one-time invoice, not a subscription - just log and acknowledge
    logger.info(
      `Invoice has no subscription ID - likely a one-time payment, skipping`,
    );
    return;
  }

  const groupQuery = db
    .collection("groups")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1);
  const groupSnapshot = await groupQuery.get();

  if (groupSnapshot.empty) {
    // This could happen for a new subscription before checkout.session.completed processes
    // Log but don't throw - the checkout handler will set things up
    logger.warn(
      `No group found for subscription in invoice.payment_succeeded. ` +
        `This may resolve when checkout.session.completed is processed.`,
    );
    return;
  }

  const groupDoc = groupSnapshot.docs[0];
  const groupId = groupDoc.id;

  await groupDoc.ref.update({
    subscriptionStatus: "active",
    lastPaymentDate: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`Subscription status set to active after payment`, {
    groupId,
    status: "active",
  });
}

/**
 * Handle invoice.payment_failed event
 * This is triggered when an invoice payment fails
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) return;

  const groupQuery = db
    .collection("groups")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1);
  const groupSnapshot = await groupQuery.get();

  if (groupSnapshot.empty) {
    logger.warn(`No group found for failed subscription payment`);
    return;
  }

  const groupDoc = groupSnapshot.docs[0];
  const groupData = groupDoc.data();

  await groupDoc.ref.update({
    subscriptionStatus: "past_due",
    lastPaymentFailureDate: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.warn(`Subscription status set to past_due after payment failure`, {
    groupId: groupDoc.id,
    status: "past_due",
  });

  // Notify group admins about the payment failure
  await notifyAdminsOfPaymentFailure(
    groupDoc.id,
    groupData.name,
    groupData.admins || [],
  );
}

/**
 * Handle customer.subscription.updated event
 *
 * @param subscription - The updated Stripe subscription object
 * @param previousAttributes - Optional previous attribute values from the webhook event.
 *   When provided and previousAttributes.status === 'trialing' and the new status is
 *   'active', a referral reward is applied to the referrer group (if applicable).
 *   This handles the case where a group transitions from trial to paid and the referral
 *   conversion was not already applied via checkout.session.completed (e.g., when the
 *   trial period expires and the first payment succeeds without a new checkout session).
 */
export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  previousAttributes?: Record<string, any>,
): Promise<void> {
  const subscriptionId = subscription.id;
  const groupQuery = db
    .collection("groups")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1);
  const groupSnapshot = await groupQuery.get();

  if (groupSnapshot.empty) {
    logger.warn(`No group found for subscription update`, {
      status: subscription.status,
    });
    return;
  }

  const groupDoc = groupSnapshot.docs[0];
  const groupData = groupDoc.data();

  await groupDoc.ref.update({
    subscriptionStatus: subscription.status,
    subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end,
    subscriptionExpiresAt: getSubscriptionExpiresAt(
      subscription as StripeSubscriptionWithPeriod,
    ),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(
    `Subscription status updated` +
      (subscription.cancel_at_period_end ? " (will cancel at period end)" : ""),
    {
      groupId: groupDoc.id,
      status: subscription.status,
    },
  );

  // Referral reward: when a group transitions from trialing to active, check if there
  // is an unconverted pending referral to process. This is a secondary safeguard —
  // the primary conversion path is handleCheckoutSessionCompleted. We guard against
  // double-rewards by checking the referral status before acting.
  const transitionedToActive =
    subscription.status === "active" &&
    previousAttributes?.status === "trialing";

  if (transitionedToActive) {
    const referralCode = groupData?.referralCode as string | undefined;
    if (referralCode) {
      logger.info(
        `Group transitioned trialing→active with referral; ` +
          `checking for unconverted referral reward`,
        { groupId: groupDoc.id },
      );
      try {
        await processReferralConversion(
          referralCode,
          groupDoc.id,
          subscription,
        );
      } catch (referralError) {
        // Log but don't throw — referral errors must never break subscription processing
        logger.error(`Referral processing failed on trialing→active`, {
          groupId: groupDoc.id,
          error:
            referralError instanceof Error
              ? referralError.message
              : "unknown error",
        });
      }
    }
  }
}

/**
 * Handle customer.subscription.deleted event
 */
export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const subscriptionId = subscription.id;
  const groupQuery = db
    .collection("groups")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1);
  const groupSnapshot = await groupQuery.get();

  if (groupSnapshot.empty) {
    logger.warn(`No group found for deleted subscription`);
    return;
  }

  const groupDoc = groupSnapshot.docs[0];
  const groupData = groupDoc.data();

  await groupDoc.ref.update({
    subscriptionStatus: "canceled",
    stripeSubscriptionId: null,
    stripeSubscriptionItemId: null,
    subscriptionCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`Subscription cancelled`, {
    groupId: groupDoc.id,
    status: "canceled",
  });

  // Notify admins
  await notifyAdminsOfSubscriptionCancellation(
    groupDoc.id,
    groupData.name,
    groupData.admins || [],
  );
}

/**
 * Handle customer.subscription.trial_will_end event
 * Sent 3 days before the trial ends
 */
export async function handleTrialWillEnd(
  subscription: Stripe.Subscription,
): Promise<void> {
  const subscriptionId = subscription.id;
  const groupQuery = db
    .collection("groups")
    .where("stripeSubscriptionId", "==", subscriptionId)
    .limit(1);
  const groupSnapshot = await groupQuery.get();

  if (groupSnapshot.empty) {
    logger.warn(`No group found for trial ending subscription`);
    return;
  }

  const groupDoc = groupSnapshot.docs[0];
  const groupData = groupDoc.data();
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  logger.info(`Trial will end for group`, {
    groupId: groupDoc.id,
    trialEnd: trialEnd?.toISOString() ?? null,
  });

  // Notify admins about trial ending
  await notifyAdminsOfTrialEnding(
    groupDoc.id,
    groupData.name,
    groupData.admins || [],
    trialEnd,
  );
}

/**
 * Handle payment_intent.succeeded event for donations
 */
export async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  connectedAccountId?: string,
): Promise<void> {
  const { groupId, type, userId } = paymentIntent.metadata || {};

  logger.info(`PaymentIntent succeeded`, {
    type,
    groupId,
    hasConnectedAccount: !!connectedAccountId,
  });

  // Handle donation payments
  if (type === "group_donation" && groupId) {
    const donationsRef = db
      .collection("groups")
      .doc(groupId)
      .collection("donations");
    const donationQuery = await donationsRef
      .where("transactionId", "==", paymentIntent.id)
      .limit(1)
      .get();

    if (!donationQuery.empty) {
      const donationDoc = donationQuery.docs[0];
      await donationDoc.ref.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        stripeChargeId: paymentIntent.latest_charge,
      });

      logger.info(`Donation marked as completed`, {
        donationId: donationDoc.id,
        groupId,
        status: "completed",
      });

      // Optionally add to group's transaction history
      await db
        .collection("groups")
        .doc(groupId)
        .collection("transactions")
        .add({
          type: "income",
          category: "donation",
          amount: paymentIntent.amount / 100, // Convert from cents to dollars
          description: `Donation from member`,
          userId: userId,
          paymentIntentId: paymentIntent.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          source: "stripe",
        });
    } else {
      logger.warn(`No donation record found for PaymentIntent`, { groupId });
    }
  }
}

/**
 * Handle payment_intent.payment_failed event for donations
 */
export async function handlePaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent,
  connectedAccountId?: string,
): Promise<void> {
  const { groupId, type, userId } = paymentIntent.metadata || {};
  const errorMessage =
    paymentIntent.last_payment_error?.message || "Unknown error";

  logger.warn(`PaymentIntent failed`, {
    type,
    groupId,
    error: errorMessage,
    hasConnectedAccount: !!connectedAccountId,
  });

  // Handle donation payment failures
  if (type === "group_donation" && groupId) {
    const donationsRef = db
      .collection("groups")
      .doc(groupId)
      .collection("donations");
    const donationQuery = await donationsRef
      .where("transactionId", "==", paymentIntent.id)
      .limit(1)
      .get();

    if (!donationQuery.empty) {
      const donationDoc = donationQuery.docs[0];
      await donationDoc.ref.update({
        status: "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        failureReason: errorMessage,
      });

      logger.info(`Donation marked as failed`, {
        donationId: donationDoc.id,
        groupId,
        status: "failed",
        error: errorMessage,
      });
    }
  }
}

/**
 * Handle charge.dispute.created event
 */
export async function handleDisputeCreated(
  dispute: Stripe.Dispute,
): Promise<void> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;

  logger.error(`CHARGEBACK ALERT: Dispute created`, {
    amount: dispute.amount,
    reason: dispute.reason,
    status: dispute.status,
  });

  // Store the dispute for tracking
  await db.collection("stripe_disputes").doc(dispute.id).set({
    disputeId: dispute.id,
    chargeId: chargeId,
    paymentIntentId: paymentIntentId,
    amount: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // TODO: Send alert to super admins via email/Slack
}

// --- Referral Reward Logic ---

/**
 * Process referral conversion when a referred group subscribes.
 * Marks the referral as converted and extends the referrer's subscription by 1 month.
 */
async function processReferralConversion(
  referralCode: string,
  referredGroupId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  // Find the referral document for this code + group
  const referralQuery = await db
    .collection("referrals")
    .where("code", "==", referralCode)
    .where("referredGroupId", "==", referredGroupId)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (referralQuery.empty) {
    logger.info(`No pending referral found for code/group`, {
      referredGroupId,
    });
    return;
  }

  const referralDoc = referralQuery.docs[0];
  const referralData = referralDoc.data();
  const referrerId = referralData.referrerId as string;

  // Find the referrer's active group subscription to extend
  const referrerGroupsQuery = await db
    .collection("groups")
    .where("admins", "array-contains", referrerId)
    .where("subscriptionStatus", "in", ["active", "trialing"])
    .limit(1)
    .get();

  let rewardApplied = false;

  if (!referrerGroupsQuery.empty) {
    const referrerGroup = referrerGroupsQuery.docs[0].data();
    const referrerSubscriptionId = referrerGroup.stripeSubscriptionId as
      | string
      | undefined;

    if (referrerSubscriptionId) {
      try {
        // Retrieve the referrer's subscription to get current period end
        const referrerSub = await stripe.subscriptions.retrieve(
          referrerSubscriptionId,
        );
        const currentPeriodEnd = (referrerSub as StripeSubscriptionWithPeriod)
          .current_period_end;

        if (currentPeriodEnd) {
          // Extend by 1 month (approximately 30 days)
          const newPeriodEnd = currentPeriodEnd + 30 * 24 * 60 * 60;
          await stripe.subscriptions.update(referrerSubscriptionId, {
            trial_end: newPeriodEnd,
            proration_behavior: "none",
          });
          rewardApplied = true;
          logger.info(`Extended subscription for referrer by 1 month`, {
            referrerId,
          });
        }
      } catch (stripeError) {
        logger.error(`Failed to extend subscription for referrer`, {
          referrerId,
          error:
            stripeError instanceof Error
              ? stripeError.message
              : "unknown error",
        });
        // Continue — we still want to mark conversion even if extension fails
      }
    }
  }

  // Mark referral as converted
  await referralDoc.ref.update({
    status: "converted",
    rewardApplied,
    convertedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`Referral converted`, {
    referralId: referralDoc.id,
    rewardApplied,
  });

  // Send FCM notification to referrer
  await notifyReferrerOfConversion(referrerId, rewardApplied);
}

/**
 * Send FCM notification to the referrer about their successful referral.
 */
async function notifyReferrerOfConversion(
  referrerId: string,
  rewardApplied: boolean,
): Promise<void> {
  try {
    const tokens = await getAdminFcmTokens([referrerId]);
    if (tokens.length === 0) return;

    const body = rewardApplied
      ? "Your referral was successful! 1 month has been added to your subscription."
      : "Your referral was successful! Thank you for spreading the word.";

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "Referral Converted!",
        body,
      },
      data: {
        type: "referral_converted",
        rewardApplied: String(rewardApplied),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "subscription_alerts",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    logger.info(`Sent referral conversion notification to referrer`, {
      referrerId,
    });
  } catch (error) {
    logger.error(`Error sending referral conversion notification`, {
      referrerId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

// --- Helper Functions ---

export function findSubscriptionItemId(
  subscription: Stripe.Subscription,
  targetProductId?: string,
): string | null {
  if (!subscription.items?.data) return null;
  const productId = targetProductId ?? productIdGroup;
  const subscriptionItem = subscription.items.data.find(
    (item) => (item.price.product as string) === productId,
  );
  return subscriptionItem?.id || subscription.items.data[0]?.id || null;
}

/**
 * Get current subscription cost (flat rate)
 */
export async function getSubscriptionCost(groupId: string): Promise<number> {
  // Flat rate: $12/year ($1/month equivalent)
  return 12;
}

/**
 * Check if a webhook event has already been processed (idempotency)
 */
export async function isEventProcessed(eventId: string): Promise<boolean> {
  const processedRef = db.collection("processed_stripe_events").doc(eventId);
  const processedDoc = await processedRef.get();
  return processedDoc.exists;
}

/**
 * Mark a webhook event as processed
 */
export async function markEventProcessed(
  eventId: string,
  eventType: string,
): Promise<void> {
  await db.collection("processed_stripe_events").doc(eventId).set({
    eventType,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// --- Notification Helpers ---

async function notifyAdminsOfPaymentFailure(
  groupId: string,
  groupName: string,
  adminIds: string[],
): Promise<void> {
  if (adminIds.length === 0) return;

  const billingUrl = `${APP_BASE_URL}/billing?groupId=${groupId}`;

  try {
    // Send push notifications
    const tokens = await getAdminFcmTokens(adminIds);
    if (tokens.length > 0) {
      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "⚠️ Payment Failed",
          body: `The subscription payment for ${groupName} failed. Please update your payment method.`,
        },
        data: {
          type: "payment_failed",
          groupId: groupId,
          groupName: groupName,
          billingUrl: billingUrl,
        },
        android: {
          priority: "high",
          notification: {
            channelId: "payment_alerts",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1,
            },
          },
        },
      });

      logger.info(`Sent payment failure push notification`, {
        groupId,
        adminCount: tokens.length,
      });
    }

    // Send email notifications
    await sendPaymentFailureEmails(adminIds, groupId, groupName, billingUrl);
  } catch (error) {
    logger.error(`Error sending payment failure notification`, {
      groupId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

async function notifyAdminsOfSubscriptionCancellation(
  groupId: string,
  groupName: string,
  adminIds: string[],
): Promise<void> {
  if (adminIds.length === 0) return;

  try {
    const tokens = await getAdminFcmTokens(adminIds);
    if (tokens.length === 0) return;

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "Subscription Cancelled",
        body: `The subscription for ${groupName} has been cancelled.`,
      },
      data: {
        type: "subscription_cancelled",
        groupId: groupId,
        groupName: groupName,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "subscription_alerts",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
    });

    logger.info(`Sent subscription cancellation notification`, { groupId });
  } catch (error) {
    logger.error(`Error sending subscription cancellation notification`, {
      groupId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

async function notifyAdminsOfTrialEnding(
  groupId: string,
  groupName: string,
  adminIds: string[],
  trialEndDate: Date | null,
): Promise<void> {
  if (adminIds.length === 0) return;

  const billingUrl = `${APP_BASE_URL}/billing?groupId=${groupId}`;

  try {
    // Send push notifications
    const tokens = await getAdminFcmTokens(adminIds);
    if (tokens.length > 0) {
      const dateStr = trialEndDate
        ? trialEndDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })
        : "soon";

      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "Trial Ending Soon",
          body: `Your free trial for ${groupName} ends ${dateStr}. Add a payment method to continue.`,
        },
        data: {
          type: "trial_ending",
          groupId: groupId,
          groupName: groupName,
          trialEndDate: trialEndDate?.toISOString() || "",
          billingUrl: billingUrl,
        },
        android: {
          priority: "high",
          notification: {
            channelId: "subscription_alerts",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      });

      logger.info(`Sent trial ending push notification`, { groupId });
    }

    // Send email notifications
    await sendTrialEndingEmails(
      adminIds,
      groupId,
      groupName,
      billingUrl,
      trialEndDate,
    );
  } catch (error) {
    logger.error(`Error sending trial ending notification`, {
      groupId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
}

async function getAdminFcmTokens(adminIds: string[]): Promise<string[]> {
  const tokens: string[] = [];

  const adminPromises = adminIds.map((id) =>
    db.collection("users").doc(id).get(),
  );
  const adminDocs = await Promise.all(adminPromises);

  for (const adminDoc of adminDocs) {
    if (!adminDoc.exists) continue;
    const adminData = adminDoc.data();
    const pushEnabled =
      adminData?.notificationSettings?.allowPushNotifications !== false;
    if (pushEnabled && adminData?.fcmTokens?.length) {
      tokens.push(...adminData.fcmTokens);
    }
  }

  return tokens;
}

// --- Email Notification Helpers ---

async function sendPaymentFailureEmails(
  adminIds: string[],
  groupId: string,
  groupName: string,
  billingUrl: string,
): Promise<void> {
  const emails = await getAdminEmails(adminIds);
  if (emails.length === 0) return;

  const { sendEmail } = await import("./email");

  for (const email of emails) {
    try {
      await sendEmail({
        to: email,
        subject: `⚠️ Payment Failed - ${groupName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">🏠</span>
              </div>
              <h1 style="color: #1a202c; font-size: 24px; margin: 0;">Payment Failed</h1>
            </div>
            
            <div style="background: #fed7d7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #c53030; margin: 0; font-weight: 600;">
                Your subscription payment for <strong>${groupName}</strong> could not be processed.
              </p>
            </div>
            
            <p style="color: #4a5568; line-height: 1.6;">
              To avoid interruption to your group's admin features, please update your payment method.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${billingUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Update Payment Method
              </a>
            </div>
            
            <p style="color: #718096; font-size: 14px; text-align: center;">
              Or copy this link: <a href="${billingUrl}" style="color: #667eea;">${billingUrl}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
            
            <p style="color: #a0aec0; font-size: 12px; text-align: center;">
              This email was sent by Homegroups. You're receiving this because you're an admin of ${groupName}.
            </p>
          </div>
        `,
      });
    } catch (error) {
      logger.error(`Failed to send payment failure email`, {
        groupId,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  logger.info(`Sent payment failure emails`, {
    groupId,
    adminCount: emails.length,
  });
}

async function sendTrialEndingEmails(
  adminIds: string[],
  groupId: string,
  groupName: string,
  billingUrl: string,
  trialEndDate: Date | null,
): Promise<void> {
  const emails = await getAdminEmails(adminIds);
  if (emails.length === 0) return;

  const { sendEmail } = await import("./email");

  const dateStr = trialEndDate
    ? trialEndDate.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "soon";

  for (const email of emails) {
    try {
      await sendEmail({
        to: email,
        subject: `⏰ Trial Ending Soon - ${groupName}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">🏠</span>
              </div>
              <h1 style="color: #1a202c; font-size: 24px; margin: 0;">Your Trial is Ending</h1>
            </div>
            
            <div style="background: #bee3f8; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #2c5282; margin: 0;">
                Your free trial for <strong>${groupName}</strong> ends on <strong>${dateStr}</strong>.
              </p>
            </div>
            
            <p style="color: #4a5568; line-height: 1.6;">
              To continue using admin features after your trial ends, please add a payment method. 
              Your group subscription is just <strong>$12/year</strong>.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${billingUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Add Payment Method
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
            
            <p style="color: #a0aec0; font-size: 12px; text-align: center;">
              This email was sent by Homegroups. You're receiving this because you're an admin of ${groupName}.
            </p>
          </div>
        `,
      });
    } catch (error) {
      logger.error(`Failed to send trial ending email`, {
        groupId,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  logger.info(`Sent trial ending emails`, {
    groupId,
    adminCount: emails.length,
  });
}

async function getAdminEmails(adminIds: string[]): Promise<string[]> {
  const emails: string[] = [];

  const adminPromises = adminIds.map((id) =>
    db.collection("users").doc(id).get(),
  );
  const adminDocs = await Promise.all(adminPromises);

  for (const adminDoc of adminDocs) {
    if (!adminDoc.exists) continue;
    const adminData = adminDoc.data();
    // Check if email notifications are enabled (default to true)
    const emailEnabled =
      adminData?.notificationSettings?.allowEmailNotifications !== false;
    if (emailEnabled && adminData?.email) {
      emails.push(adminData.email);
    }
  }

  return emails;
}
