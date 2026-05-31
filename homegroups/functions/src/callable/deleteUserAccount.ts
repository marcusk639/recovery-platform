import {
  onCall,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db, auth } from "../utils/firebase";
import { stripe } from "../utils/stripe";
import * as admin from "firebase-admin";

interface DeleteAccountRequest {
  confirmEmail: string; // User must confirm their email to delete
}

interface DeleteAccountResponse {
  success: boolean;
  message: string;
  deletedData?: {
    userDocument: boolean;
    memberDocuments: number;
    messages: number;
    reports: number;
    sponsorships: number;
    authAccount: boolean;
  };
}

/**
 * Callable function to delete a user's account and all associated data.
 * This is required for iOS App Store compliance (Guideline 5.1.1).
 *
 * The function will:
 * 1. Verify the user is authenticated and email matches
 * 2. Delete all user data from Firestore collections
 * 3. Delete the Firebase Auth account
 *
 * Note: Some data may be anonymized rather than deleted to preserve
 * group history integrity (e.g., treasury transactions).
 */
export const deleteUserAccount = onCall(
  async (
    request: CallableRequest<DeleteAccountRequest>,
  ): Promise<DeleteAccountResponse> => {
    // Verify authentication
    const userId = request.auth?.uid;
    const userEmail = request.auth?.token.email;
    const data = request.data;

    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to delete your account.",
      );
    }

    // Verify email confirmation matches
    if (
      !data.confirmEmail ||
      data.confirmEmail.toLowerCase() !== userEmail?.toLowerCase()
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Email confirmation does not match your account email.",
      );
    }

    logger.info(`Starting account deletion for user: ${userId}`);

    const deletedData = {
      userDocument: false,
      memberDocuments: 0,
      messages: 0,
      reports: 0,
      sponsorships: 0,
      authAccount: false,
    };

    try {
      // Use a batch for atomic operations where possible
      const batch = db.batch();

      // 1. Delete user document
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        batch.delete(userRef);
        deletedData.userDocument = true;
        logger.info(`Queued user document deletion: ${userId}`);
      }

      // 2. Delete all member documents (removes user from all groups)
      const membersSnapshot = await db
        .collection("members")
        .where("userId", "==", userId)
        .get();

      for (const memberDoc of membersSnapshot.docs) {
        batch.delete(memberDoc.ref);
        deletedData.memberDocuments++;

        // Decrement the group's memberCount
        const memberData = memberDoc.data();
        if (memberData.groupId) {
          const groupRef = db.collection("groups").doc(memberData.groupId);
          batch.update(groupRef, {
            memberCount: admin.firestore.FieldValue.increment(-1),
          });
        }
      }
      logger.info(
        `Queued ${deletedData.memberDocuments} member document deletions`,
      );

      // Commit the main batch
      await batch.commit();

      // 3. Delete direct message threads where user is a participant
      const dmThreadsSnapshot = await db
        .collection("direct_message_threads")
        .where("participants", "array-contains", userId)
        .get();

      for (const threadDoc of dmThreadsSnapshot.docs) {
        // Delete all messages in the thread
        const messagesSnapshot = await threadDoc.ref
          .collection("messages")
          .get();
        const messageBatch = db.batch();
        messagesSnapshot.docs.forEach((msgDoc) => {
          messageBatch.delete(msgDoc.ref);
          deletedData.messages++;
        });
        await messageBatch.commit();

        // Delete the thread itself
        await threadDoc.ref.delete();
      }
      logger.info(`Deleted ${deletedData.messages} direct messages`);

      // 4. Anonymize group chat messages (preserve history but remove identity)
      const groupChatsQuery = await db
        .collectionGroup("messages")
        .where("senderId", "==", userId)
        .get();

      let anonymizeBatch = db.batch();
      let anonymizeCount = 0;
      for (const msgDoc of groupChatsQuery.docs) {
        // Anonymize rather than delete to preserve group history
        anonymizeBatch.update(msgDoc.ref, {
          senderId: "deleted_user",
          senderName: "Deleted User",
          senderPhotoUrl: null,
        });
        anonymizeCount++;

        // Commit in batches of 400 to stay under Firestore limits
        if (anonymizeCount % 400 === 0) {
          await anonymizeBatch.commit();
          anonymizeBatch = db.batch();
        }
      }
      if (anonymizeCount % 400 !== 0) {
        await anonymizeBatch.commit();
      }
      logger.info(`Anonymized ${anonymizeCount} group chat messages`);

      // 5. Delete sponsorship relationships
      const sponsorshipsAsSponsee = await db
        .collection("sponsorships")
        .where("sponseeId", "==", userId)
        .get();

      const sponsorshipsAsSponsor = await db
        .collection("sponsorships")
        .where("sponsorId", "==", userId)
        .get();

      const sponsorshipBatch = db.batch();
      [...sponsorshipsAsSponsee.docs, ...sponsorshipsAsSponsor.docs].forEach(
        (doc) => {
          sponsorshipBatch.update(doc.ref, {
            status: "terminated",
            terminatedAt: admin.firestore.FieldValue.serverTimestamp(),
            terminationReason: "account_deleted",
          });
          deletedData.sponsorships++;
        },
      );
      await sponsorshipBatch.commit();
      logger.info(`Terminated ${deletedData.sponsorships} sponsorships`);

      // 6. Anonymize reports (preserve for moderation history)
      const reportsAsReporter = await db
        .collection("reports")
        .where("reporterId", "==", userId)
        .get();

      const reportsAsReported = await db
        .collection("reports")
        .where("reportedUserId", "==", userId)
        .get();

      const reportsBatch = db.batch();
      reportsAsReporter.docs.forEach((doc) => {
        reportsBatch.update(doc.ref, {
          reporterId: "deleted_user",
          reporterName: "Deleted User",
        });
        deletedData.reports++;
      });
      reportsAsReported.docs.forEach((doc) => {
        reportsBatch.update(doc.ref, {
          reportedUserId: "deleted_user",
          reportedUserName: "Deleted User",
        });
        deletedData.reports++;
      });
      await reportsBatch.commit();
      logger.info(`Anonymized ${deletedData.reports} reports`);

      // 7. Anonymize treasury transactions (preserve financial records)
      const transactionsSnapshot = await db
        .collectionGroup("transactions")
        .where("createdBy", "==", userId)
        .get();

      const txBatch = db.batch();
      transactionsSnapshot.docs.forEach((doc) => {
        txBatch.update(doc.ref, {
          createdBy: "deleted_user",
          createdByName: "Deleted User",
        });
      });
      await txBatch.commit();
      logger.info(
        `Anonymized ${transactionsSnapshot.size} treasury transactions`,
      );

      // 8. Delete announcement reactions/interactions
      // (These are typically embedded, so handled by anonymization)

      // 9. Delete FCM tokens and notification preferences
      // (These are in the user document, already deleted)

      // 10. Remove from admin/treasurer arrays in groups
      const adminGroupsQuery = await db
        .collection("groups")
        .where("admins", "array-contains", userId)
        .get();

      // Cancel Stripe subscriptions for groups where user is sole admin.
      // Re-fetch each group doc to avoid stale query snapshot data (race condition).
      for (const groupDoc of adminGroupsQuery.docs) {
        const freshSnap = await groupDoc.ref.get();
        const freshData = freshSnap.data();
        if (!freshData) continue;

        const freshAdmins: string[] = freshData.admins ?? [];
        const subscriptionId: string | null =
          freshData.stripeSubscriptionId ?? null;
        const subStatus: string = freshData.subscriptionStatus ?? "";

        if (
          freshAdmins.length === 1 &&
          subscriptionId &&
          (subStatus === "active" || subStatus === "trialing")
        ) {
          try {
            await stripe.subscriptions.cancel(subscriptionId);
            logger.info(
              `Cancelled Stripe subscription ${subscriptionId} for sole-admin group ${groupDoc.id}`,
            );
          } catch (stripeError: any) {
            logger.warn(
              `Could not cancel Stripe subscription ${subscriptionId} for group ${groupDoc.id}: ${stripeError.message}`,
            );
          }
        }
      }

      for (const groupDoc of adminGroupsQuery.docs) {
        await groupDoc.ref.update({
          admins: admin.firestore.FieldValue.arrayRemove(userId),
        });
      }

      const treasurerGroupsQuery = await db
        .collection("groups")
        .where("treasurers", "array-contains", userId)
        .get();

      for (const groupDoc of treasurerGroupsQuery.docs) {
        await groupDoc.ref.update({
          treasurers: admin.firestore.FieldValue.arrayRemove(userId),
        });
      }

      logger.info(
        `Removed user from ${adminGroupsQuery.size} admin roles and ${treasurerGroupsQuery.size} treasurer roles`,
      );

      // 11. Finally, delete the Firebase Auth account
      try {
        await auth.deleteUser(userId);
        deletedData.authAccount = true;
        logger.info(`Deleted Firebase Auth account: ${userId}`);
      } catch (authError: any) {
        // Log but don't fail - user might have already been deleted
        logger.warn(`Could not delete Auth account: ${authError.message}`);
      }

      logger.info(`Account deletion complete for user: ${userId}`, deletedData);

      return {
        success: true,
        message:
          "Your account and data have been successfully deleted. Some data may have been anonymized to preserve group history.",
        deletedData,
      };
    } catch (error: any) {
      if (error instanceof HttpsError) {
        throw error;
      }
      logger.error(`Account deletion failed for ${userId}:`, error);
      throw new HttpsError("internal", "Failed to delete account. Please try again or contact support.");
    }
  },
);
