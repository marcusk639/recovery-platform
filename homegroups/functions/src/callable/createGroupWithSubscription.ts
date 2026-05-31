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
import { HomeGroup } from "../entities/Group";
import { MeetingDocument as Meeting } from "../entities/Meeting";

interface CreateGroupWithSubscriptionData {
  groupData: Partial<HomeGroup>;
  meetings: Meeting[];
  paymentMethodId?: string;
}

export const createGroupWithSubscription = onCall(
  {
    cpu: 0.5,
    memory: "512MiB",
    timeoutSeconds: 120,
    region: "us-central1",
  },
  async (request: CallableRequest<CreateGroupWithSubscriptionData>) => {
    const { groupData, meetings, paymentMethodId } = request.data;
    const userId = request.auth?.uid;

    if (!userId) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }
    if (!groupData.name) {
      throw new HttpsError("invalid-argument", "Group name is required.");
    }
    if (!meetings || meetings.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "At least one meeting is required.",
      );
    }
    if (!paymentMethodId) {
      throw new HttpsError(
        "invalid-argument",
        "Payment method ID is required.",
      );
    }
    if (!productIdGroup) {
      throw new HttpsError(
        "failed-precondition",
        "Stripe product ID for groups is not configured.",
      );
    }

    let stripeSubscriptionId: string | undefined;

    // Pre-generate the group document ID so we can use it as a stable
    // idempotency key for Stripe customer/subscription creation and embed
    // it in customer metadata up-front (no "pending" placeholder needed).
    const groupRef = db.collection("groups").doc();
    const groupId = groupRef.id;

    try {
      // 1. Create or retrieve Stripe Customer for the user
      let stripeCustomerId: string | undefined;

      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data();
      const userEmail = userData?.email;

      if (!userEmail) {
        throw new HttpsError(
          "failed-precondition",
          "User email is required to create a Stripe customer.",
        );
      }

      logger.info(`Finding Stripe customer for user ${userId}`);

      // Always create a new group-scoped Stripe customer (matching createGroupSubscription pattern)
      logger.info(`Creating new Stripe customer for group by user ${userId}`);
      try {
        const customer = await stripe.customers.create(
          {
            name: groupData.name,
            email: userEmail,
            metadata: { groupId, userId },
            payment_method: paymentMethodId,
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          },
          { idempotencyKey: `grp-${groupId}-customer` },
        );
        stripeCustomerId = customer.id;
        logger.info(
          `Stripe customer ${stripeCustomerId} created for user ${userId}`,
        );
      } catch (customerError: any) {
        logger.error(`Failed to create Stripe customer:`, customerError);
        if (
          customerError.code === "resource_missing" &&
          customerError.message.includes("PaymentMethod")
        ) {
          throw new HttpsError(
            "invalid-argument",
            "The provided payment method is invalid or has been deleted. Please add a new payment method and try again.",
          );
        }
        throw new HttpsError(
          "internal",
          `Failed to create Stripe customer: ${customerError.message}`,
        );
      }

      // 2. Create Stripe Subscription FIRST (flat rate - quantity is always 1)
      const memberCount = Math.max(1, groupData.memberCount || 1); // Default to 1 if not provided

      // Get the default price for the group product
      const groupPriceId = await getDefaultPriceForProduct(productIdGroup);
      logger.info(
        `Using group price ${groupPriceId} from product ${productIdGroup}`,
      );

      logger.info(
        `Creating Stripe subscription for user ${userId} (flat rate)`,
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
        { idempotencyKey: `grp-${groupId}-subscription` },
      );

      logger.info(
        `Stripe subscription ${subscription.id} created with status ${subscription.status}`,
      );
      stripeSubscriptionId = subscription.id;
      const subscriptionStatus = subscription.status;
      const subscriptionItemId = subscription.items.data[0].id;

      logger.info(
        `Stripe subscription ${stripeSubscriptionId} created with status ${subscriptionStatus} for user ${userId}`,
      );

      // 3. Prepare Group Document and Meetings in a single Firestore batch
      logger.info(`Preparing Firestore batch for group ${groupData.name}`);
      const firestoreBatch = db.batch();
      // groupRef was pre-generated above so its ID could seed Stripe idempotency keys.
      const newGroup: Partial<HomeGroup> = {
        ...groupData,
        id: groupRef.id, // Assign the auto-generated ID
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        admins: [userId], // Creator is the first admin
        memberCount: memberCount, // Initial member count (subscription is flat rate, not per-member)
        stripeCustomerId: stripeCustomerId, // Link Stripe Customer ID
        stripeSubscriptionId: stripeSubscriptionId, // Link Stripe Subscription ID
        subscriptionStatus: subscriptionStatus, // Link Stripe Subscription Status
        stripeSubscriptionItemId: subscriptionItemId, // Link Stripe Subscription Item ID
        stripePriceIdGroup: groupPriceId, // Link Group Price ID
        stripeProductIdGroup: productIdGroup, // Link Group Product ID
      };

      logger.info(`Adding group ${groupRef.id} to Firestore batch`);
      firestoreBatch.set(groupRef, newGroup); // Add group creation to batch

      // Add member document for the group creator so JWT claims are synced
      // via the onMemberWrite trigger (members/{groupId}_{userId}).
      const memberDocId = `${groupRef.id}_${userId}`;
      const memberRef = db.collection("members").doc(memberDocId);
      const memberDoc = {
        userId: userId,
        groupId: groupRef.id,
        displayName: userData?.displayName || "Unknown User",
        email: userData?.email || null,
        photoURL: userData?.photoURL || null,
        isAdmin: true,
        isTreasurer: false,
        roles: ["admin"],
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        sobrietyDate: userData?.sobrietyStartDate || null,
        showSobrietyDate: userData?.showSobrietyDate ?? false,
        showPhoneNumber: userData?.showPhoneNumber ?? false,
      };
      logger.info(
        `Adding creator member document ${memberDocId} to Firestore batch`,
      );
      firestoreBatch.set(memberRef, memberDoc);

      for (const meeting of meetings) {
        const meetingId = meeting.id || db.collection("meetings").doc().id; // Ensure meeting has an ID
        logger.info(`Adding meeting ${meetingId} to Firestore batch`);
        firestoreBatch.set(db.collection("meetings").doc(meetingId), {
          ...meeting,
          id: meetingId,
          groupId: groupRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Commit the Firestore batch (group + meetings)
      await firestoreBatch.commit();
      logger.info(
        `Group ${groupRef.id} and ${meetings.length} meetings created successfully in a single batch.`,
      );

      // 3.5. Create predefined service positions (Treasurer and Secretary)
      const servicePositionsBatch = db.batch();
      const now = admin.firestore.Timestamp.now();

      const predefinedPositions = [
        {
          name: "Treasurer",
          description: "Manages the group's finances and treasury",
        },
        {
          name: "Secretary",
          description: "Handles group records and communications",
        },
      ];

      for (const position of predefinedPositions) {
        const positionRef = groupRef.collection("servicePositions").doc();
        servicePositionsBatch.set(positionRef, {
          groupId: groupRef.id,
          name: position.name,
          description: position.description,
          commitmentLength: null,
          currentHolderId: null,
          currentHolderName: null,
          termStartDate: null,
          termEndDate: null,
          createdAt: now,
          updatedAt: now,
        });
        logger.info(
          `Added ${position.name} service position to batch for group ${groupRef.id}`,
        );
      }

      await servicePositionsBatch.commit();
      logger.info(
        `Created ${predefinedPositions.length} predefined service positions for group ${groupRef.id}`,
      );

      // 4. Stripe customer + subscription metadata were seeded with the
      //    pre-generated groupId at creation time, so no follow-up
      //    metadata update is required here.

      // Fetch the full updated group data to return
      const updatedGroupSnap = await groupRef.get();

      return {
        success: true,
        groupId: groupRef.id,
        subscriptionId: stripeSubscriptionId,
        subscriptionStatus: subscriptionStatus,
        group: updatedGroupSnap.data() as HomeGroup,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error(
        `Error creating group with subscription for user ${userId}:`,
        error,
      );

      // Attempt to delete the Stripe subscription if Firestore creation failed
      if (stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(stripeSubscriptionId); // Corrected to cancel
          logger.warn(
            `Compensating: Canceled Stripe subscription ${stripeSubscriptionId} due to Firestore error.`,
          );
        } catch (stripeDelError) {
          logger.error(
            `Error canceling Stripe subscription ${stripeSubscriptionId} in compensation:`,
            stripeDelError,
          );
        }
      }

      throw new HttpsError(
        "internal",
        "Failed to create group and subscription.",
      );
    }
  },
);
